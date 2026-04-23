/**
 * Edge Function: vox-engine
 * Runs every 10 minutes.
 * Loads active markets + recent signals from DB.
 * Runs core VOX ensemble (models 1-6, skipping LLM which stays client-side BYOK).
 * Stores scores + updates calibration.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const clamp01 = (x: number) => Math.max(0.001, Math.min(0.999, x))
const logit   = (p: number) => Math.log(clamp01(p)/(1-clamp01(p)))
const sigmoid  = (x: number) => 1/(1+Math.exp(-x))
const mean     = (arr: number[]) => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0.5

// ── M1: Market prior (Kalshi/Polymarket probability) ──────────────────────────
function m1(market: any): number {
  return clamp01(market.probability ?? 0.5)
}

// ── M2: OSINT signal score — count relevant signals, weight by severity ───────
function m2(market: any, signals: any[]): number {
  const title = (market.title || '').toLowerCase()
  const keywords = title.split(/\W+/).filter((w: string) => w.length > 4)
  if (!keywords.length) return 0.5

  let score = 0, count = 0
  for (const sig of signals) {
    const text = ((sig.name||'') + ' ' + (sig.desc||'')).toLowerCase()
    const hits = keywords.filter((k: string) => text.includes(k)).length
    if (!hits) continue
    const sevW = {critical:1,high:0.7,medium:0.4,low:0.15}[sig.severity as string] ?? 0.2
    const recency = Math.exp(-Math.max(0, Date.now()-new Date(sig.fetched_at).getTime()) / (3600_000*6))
    score += hits * sevW * recency
    count++
  }
  if (!count) return 0.5
  // Normalize: 3+ relevant signals at full severity = 0.85 prior
  return clamp01(0.35 + Math.min(score / 3, 0.5))
}

// ── M3: Temporal base rate — how often do events like this resolve YES ─────────
function m3(market: any): number {
  const title = (market.title || '').toLowerCase()
  // Base rates derived from superforecaster calibration data
  if (/ceasefire|peace deal/.test(title)) return 0.18
  if (/regime.*(fall|collapse)|coup/.test(title)) return 0.06
  if (/nuclear.*(use|attack|test)/.test(title)) return 0.02
  if (/military.*(enter|invade|strike)/.test(title)) return 0.22
  if (/election.*(win|victory)/.test(title)) return 0.48
  if (/rate.*(cut|hike|increase|decrease)/.test(title)) return 0.45
  if (/recession/.test(title)) return 0.28
  if (/bitcoin|btc/.test(title)) return 0.42
  return 0.35  // generic base rate
}

// ── M4: Market volume momentum — high volume = market is right ───────────────
function m4(market: any): number {
  const vol = market.volume || market.volumeNum || 0
  if (!vol) return 0.5
  // High volume = trust market more (shrink toward market price)
  const trust = Math.min(vol / 500_000, 0.8)
  return clamp01(m1(market) * trust + 0.5 * (1-trust))
}

// ── M5: Conflict signal convergence ───────────────────────────────────────────
function m5(market: any, signals: any[]): number {
  const title = (market.title||'').toLowerCase()
  const isConflict = /war|conflict|military|attack|strike|invasion/.test(title)
  if (!isConflict) return 0.5

  const conflictSigs = signals.filter(s =>
    ['conflict','milaircraft','warship','notam'].includes(s.type) &&
    ['critical','high'].includes(s.severity)
  )
  if (!conflictSigs.length) return 0.3
  // More high-severity conflict signals = higher probability of conflict events resolving YES
  return clamp01(0.3 + Math.min(conflictSigs.length / 20, 0.45))
}

// ── M6: Bayesian update from article volume ───────────────────────────────────
function m6(market: any, articles: any[]): number {
  const title = (market.title||'').toLowerCase()
  const keywords = title.split(/\W+/).filter((w: string) => w.length > 4)
  const hits = articles.filter(a => {
    const t = (a.title||'').toLowerCase()
    return keywords.some((k: string) => t.includes(k))
  }).length
  // Bayesian update: more articles = more attention = event more likely
  const prior = m3(market)
  const likelihood = Math.min(1, hits / 10)
  return clamp01(prior + likelihood * (1-prior) * 0.4)
}

// ── Log-odds ensemble ─────────────────────────────────────────────────────────
function ensemble(probs: number[], weights: number[]): number {
  const totalW = weights.reduce((s,w)=>s+w,0)
  const logOdds = probs.reduce((s,p,i) => s + (weights[i]/totalW) * logit(p), 0)
  return clamp01(sigmoid(logOdds))
}

// ── Platt scaling calibration ─────────────────────────────────────────────────
function plattScale(p: number, a: number, b: number): number {
  return clamp01(sigmoid(a * logit(p) + b))
}

serve(async () => {
  const t0 = Date.now()

  // Load data from DB
  const [marketsRes, signalsRes, articlesRes, calRes] = await Promise.all([
    sb.from('markets').select('*').gt('probability', 0).lt('probability', 1).limit(500),
    sb.from('signals').select('*').gte('fetched_at', new Date(Date.now()-3600_000*6).toISOString()).limit(2000),
    sb.from('articles').select('*').gte('fetched_at', new Date(Date.now()-3600_000*12).toISOString()).limit(1000),
    sb.from('vox_calibration').select('*').eq('id',1).limit(1),
  ])

  const markets   = marketsRes.data  || []
  const signals   = signalsRes.data  || []
  const articles  = articlesRes.data || []
  const cal       = calRes.data || { platt_a: 1.0, platt_b: 0.0, stack_weights: {}, round_count: 0 }

  const defaultWeights = [0.28, 0.22, 0.12, 0.15, 0.13, 0.10]  // m1-m6

  const predictions: any[] = []

  for (const market of markets) {
    const probs = [
      m1(market),
      m2(market, signals),
      m3(market),
      m4(market),
      m5(market, signals),
      m6(market, articles),
    ]

    // Stacking weights from calibration (or defaults)
    const sw = cal.stack_weights as any
    const weights = [
      sw.m1 ?? defaultWeights[0], sw.m2 ?? defaultWeights[1],
      sw.m3 ?? defaultWeights[2], sw.m4 ?? defaultWeights[3],
      sw.m5 ?? defaultWeights[4], sw.m6 ?? defaultWeights[5],
    ]

    const raw = ensemble(probs, weights)
    const calibrated = plattScale(raw, (calRes.data?.[0]?.platt_a ?? 1.0), (calRes.data?.[0]?.platt_b ?? 0.0))

    predictions.push({
      market_id: market.id,
      probability: calibrated,
      predicted_at: new Date().toISOString(),
    })

    // Update market with VOX probability
    await sb.from('markets').update({
      meta: { ...market.meta, vox_prob: calibrated, vox_models: probs, vox_raw: raw },
      updated_at: new Date().toISOString(),
    }).eq('id', market.id)
  }

  // Store prediction snapshots for calibration feedback
  if (predictions.length > 0) {
    await sb.from('vox_predictions').insert(
      predictions.map(p => ({ market_id: p.market_id, probability: p.probability }))
    )
  }

  // Update calibration round count
  await sb.from('vox_calibration').upsert({
    id: 1,
    platt_a: (calRes.data?.[0]?.platt_a ?? 1.0),
    platt_b: (calRes.data?.[0]?.platt_b ?? 0.0),
    stack_weights: cal.stack_weights,
    round_count: (cal.round_count || 0) + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  return new Response(JSON.stringify({
    ok: true, duration_ms: Date.now()-t0,
    marketsScored: predictions.length,
    round: (cal.round_count||0)+1,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
