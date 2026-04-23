/**
 * Edge Function: acpl-engine
 * Runs every 5 minutes. Pulls replay buffer from DB,
 * runs SGD on CE weights, writes updated weights back.
 * Also handles outcome feedback when client reports a resolution.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const LAMBDA = 0.02, BETA = 0.35, GAMMA = 0.95, LR = 0.01

function sigmoid(x: number) { return 1/(1+Math.exp(-Math.max(-500,Math.min(500,x)))) }
function relu(x: number) { return Math.max(0,x) }

function ceFeatures(s: any, action: number): number[] {
  return [
    ({ critical:1, high:0.67, medium:0.33, low:0 } as any)[s.severity] ?? 0.33,
    Math.min((s.sourceCount||1)/10, 1), s.convergenceScore||0,
    Math.min((s.ageMinutes||0)/120, 1), s.noisySource?1:0, action/3,
  ]
}

function ceForward(ce: any, f: number[]): { out: number; h1: number[]; h2: number[] } {
  const h1 = ce.w1.map((row: number[], i: number) =>
    relu(row.reduce((s: number,w: number,j: number) => s+w*f[j], ce.b1[i])))
  const h2 = ce.w2.map((row: number[], i: number) =>
    relu(row.reduce((s: number,w: number,j: number) => s+w*h1[j], ce.b2[i])))
  const out = sigmoid(ce.w3[0].reduce((s: number,w: number,j: number) => s+w*h2[j], ce.b3[0]))
  return { out, h1, h2 }
}

function ceUpdate(ce: any, f: number[], target: number, lr = 0.005): any {
  const { out, h1, h2 } = ceForward(ce, f)
  const updated = JSON.parse(JSON.stringify(ce))
  const dOut = (out - target) * out * (1 - out)
  updated.w3[0] = ce.w3[0].map((w: number, j: number) => w - lr * dOut * h2[j])
  updated.b3[0] -= lr * dOut
  const dH2 = ce.w3[0].map((w: number) => dOut * w)
  for (let i = 0; i < 4; i++) {
    if (h2[i] <= 0) continue
    updated.w2[i] = ce.w2[i].map((w: number, j: number) => w - lr * dH2[i] * h1[j])
    updated.b2[i] -= lr * dH2[i]
  }
  const dH1 = ce.w2.map((row: number[], i: number) =>
    dH2.reduce((s: number,d: number,j: number) => s+d*row[j], 0))
  for (let i = 0; i < 8; i++) {
    if (h1[i] <= 0) continue
    updated.w1[i] = ce.w1[i].map((w: number, j: number) => w - lr * dH1[i] * f[j])
    updated.b1[i] -= lr * dH1[i]
  }
  return updated
}

function qUpdate(q: number[], action: number, reward: number, ce: any, signal: any): number[] {
  const tau = [0,45,20,10][action] ?? 30
  const f = ceFeatures(signal, action)
  const { out: ceScore } = ceForward(ce, f)
  const rw = ceScore * Math.exp(-LAMBDA * tau)
  const target = reward + GAMMA * Math.max(...q) - BETA * rw
  const newQ = [...q]
  newQ[action] = q[action] + LR * (target - q[action])
  return newQ
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  const mode = body.mode || 'replay'

  // ── Mode: outcome — client reports a signal was right/wrong ──────────────
  if (mode === 'outcome') {
    const { signalSnap, action, reward, wasNegative, delayMin } = body
    if (!signalSnap || action == null) {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400 })
    }
    // Store in replay buffer
    await sb.from('acpl_replay').insert({
      signal_snap: signalSnap, action, reward: reward ?? (wasNegative ? -0.5 : 1.0),
      was_negative: wasNegative ?? false, delay_min: delayMin ?? 0,
    })

    // Immediate Q-table update for this signal
    const stateKey = `${({critical:3,high:2,medium:1,low:0} as any)[signalSnap.severity]??1}_` +
      `${Math.min(Math.floor((signalSnap.sourceCount||1)/2),4)}_` +
      `${Math.min(Math.floor((signalSnap.convergenceScore||0)*5),4)}_` +
      `${Math.min(Math.floor((signalSnap.ageMinutes||0)/30),4)}_${signalSnap.noisySource?1:0}`

    const { data: qRow } = await sb.from('acpl_qtable').select('*').eq('state_key', stateKey).single()
    const q = qRow ? [qRow.q_suppress, qRow.q_low, qRow.q_high, qRow.q_escalate] : [0.3, 0.5, 0.4, 0.2]
    const { data: ceRow } = await sb.from('acpl_ce_weights').select('weights').eq('id',1).limit(1)
    const ce = ceRow?.[0]?.weights

    if (ce) {
      const newQ = qUpdate(q, action, reward ?? (wasNegative ? -0.5 : 1.0), ce, signalSnap)
      await sb.from('acpl_qtable').upsert({
        state_key: stateKey,
        q_suppress: newQ[0], q_low: newQ[1], q_high: newQ[2], q_escalate: newQ[3],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'state_key' })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  // ── Mode: replay — batch SGD on recent experience buffer ─────────────────
  const { data: replayRows } = await sb
    .from('acpl_replay')
    .select('*')
    .order('ts', { ascending: false })
    .limit(200)

  if (!replayRows?.length) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_replay_data' }), { status: 200 })
  }

  const { data: ceRow } = await sb.from('acpl_ce_weights').select('*').eq('id',1).limit(1)
  let ce = ceRow?.[0]?.weights
  if (!ce) {
    ce = {
      w1: Array.from({length:8},()=>Array.from({length:6},()=>(Math.random()-0.5)*0.1)),
      b1: Array(8).fill(0),
      w2: Array.from({length:4},()=>Array.from({length:8},()=>(Math.random()-0.5)*0.1)),
      b2: Array(4).fill(0),
      w3: [Array.from({length:4},()=>(Math.random()-0.5)*0.1)],
      b3: [0],
    }
  }

  // SGD on random sample of 32 from buffer
  const sample = [...replayRows].sort(() => Math.random()-0.5).slice(0, 32)
  for (const exp of sample) {
    const f = ceFeatures(exp.signal_snap, exp.action)
    ce = ceUpdate(ce, f, exp.was_negative ? 1.0 : 0.0)
  }

  const replayCount = (ceRow?.[0]?.replay_count || 0) + 1
  await sb.from('acpl_ce_weights').upsert({
    id: 1, weights: ce, replay_count: replayCount, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  return new Response(JSON.stringify({ ok: true, samplesProcessed: sample.length, replayCount }), { status: 200 })
})
