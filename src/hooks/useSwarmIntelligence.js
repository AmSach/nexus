/**
 * useSwarmIntelligence — Swarm deliberation from GraphRAG archetypes
 *
 * This is the core of what MiroFish does:
 *   - Takes archetypes (generated from the entity graph) and a specific question
 *   - Each archetype's agents deliberate with UNIQUE personality parameters
 *   - Agents influence each other through social network dynamics
 *   - A "Summarizer Agent" (Groq) reads the final vote distribution and produces
 *     a natural-language intelligence summary
 *
 * This is NOT a LLM forecaster — the LLM only summarizes what the mathematical
 * agent society decided. The forecast IS the swarm's vote distribution.
 *
 * Rate-limit strategy:
 *   - Mathematical simulation: free, instant (runs in JS)
 *   - LLM summarizer: 1 Groq call per question, ~500 tokens, uses fast model
 *   - Summary cached 15 min per question
 */

import { useState, useCallback, useRef } from 'react'
import { useStore } from '../store'

const GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions'
const FAST_MODEL  = 'llama-3.1-8b-instant'
const CACHE_KEY   = 'nexus-swarm-v2'
const CACHE_TTL   = 15 * 60 * 1000

function cacheRead(key) {
  try { const r = localStorage.getItem(key); if (!r) return {}; return JSON.parse(r) } catch { return {} }
}
function cacheWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}

// ── Deterministic PRNG (same agent pool across renders) ──────────────────────
function makePrng(seed) {
  let s = seed >>> 0
  return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >> 7)) >>> 0; s = (s ^ (s << 17)) >>> 0; return (s >>> 0) / 0xFFFFFFFF }
}
function normalSample(rng, mu, sigma) {
  const u1 = rng() + 1e-10, u2 = rng()
  return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
const clamp01 = v => Math.max(0, Math.min(1, isNaN(v) ? 0.5 : v))

// ── Build agent pool from archetypes ─────────────────────────────────────────
// Each archetype spawns N_SIM simulated agents with UNIQUE parameters drawn
// from distributions centered on the archetype's traits.
function buildSwarmPool(archetypes, nPerArchetype = 60) {
  const pool = []
  archetypes.forEach((arch, ai) => {
    const rng = makePrng(0xDEADBEEF + ai * 0x9E3779B9)
    const b = arch.baseBeliefs || {}
    const n = Math.min(nPerArchetype, Math.round((arch.count || 5000) / 2000) + 10)

    for (let i = 0; i < Math.max(n, 8); i++) {
      pool.push({
        archetypeIdx:   ai,
        archetype:      arch.id || `arch_${ai}`,
        tier:           arch.tier || 'civilian',
        influence:      arch.influence || 1.0,
        prior:          clamp01(arch.priorProbability ?? 0.5),
        riskAversion:   clamp01(normalSample(rng, b.riskTolerance ?? 0.5, 0.12)),
        infoAccess:     clamp01(normalSample(rng, b.informationAccess ?? 0.5, 0.10)),
        anchoringBias:  clamp01(normalSample(rng, b.anchoring ?? 0.4, 0.12)),
        confirmBias:    clamp01(normalSample(rng, b.confirmationBias ?? 0.35, 0.10)),
        recencyBias:    rng() * 0.6,
        optimismBias:   clamp01(normalSample(rng, b.optimism ?? 0.0, 0.04)) - 0.02,
        geoProximity:   rng(),
        // Each agent gets a unique private belief drawn from prior + noise
        privateBelief:  clamp01(normalSample(rng, arch.priorProbability ?? 0.5, 0.15)),
      })
    }
  })
  return pool
}

// ── Core deliberation math ────────────────────────────────────────────────────
// Given a pool of agents with unique beliefs, run social simulation
// Each agent: perceives private signal → influences and is influenced by peers →
// updates belief iteratively → final vote distribution
function runSwarmDeliberation(pool, marketPrice, relSignal, nRounds = 4) {
  if (!pool.length) return null

  // Initialize beliefs from private belief + market anchor
  const beliefs = pool.map(ag =>
    clamp01(ag.privateBelief * 0.7 + marketPrice * 0.2 + (relSignal ?? 0.5) * 0.1)
  )

  // Build influence pool: high-influence agents affect more of the network
  const influencePool = pool.map((ag, i) => ({ i, ag }))
    .filter(({ ag }) => ['power', 'shadow', 'specialist'].includes(ag.tier))

  // Social simulation rounds
  for (let round = 0; round < nRounds; round++) {
    pool.forEach((ag, i) => {
      const myBelief = beliefs[i]

      // Sample 6 peers (biased toward influence tier)
      const peers = []
      for (let p = 0; p < 6; p++) {
        const src = (Math.random() < 0.6 && influencePool.length > 0)
          ? influencePool[Math.floor(Math.random() * influencePool.length)]
          : { i: Math.floor(Math.random() * pool.length), ag: pool[Math.floor(Math.random() * pool.length)] }
        if (src.i !== i) peers.push(src)
      }

      // Bayesian update on signal: learning rate scaled by anchoring
      const lr = 0.30 * (1 - ag.anchoringBias * 0.5)
      let updated = myBelief * (1 - lr) + ag.privateBelief * lr

      // Social influence with confirmation bias
      let socialSum = 0, socialWt = 0
      peers.forEach(({ i: pi, ag: peer }) => {
        const peerBelief = beliefs[pi]
        const agreement  = 1 - Math.abs(myBelief - peerBelief)
        const confW      = 1 + ag.confirmBias * agreement * 1.5
        const inflW      = peer.influence * confW
        socialSum += peerBelief * inflW
        socialWt  += inflW
      })

      if (socialWt > 0) {
        const socialSig = socialSum / socialWt
        const pull = 0.10 * ag.recencyBias * (1 - ag.infoAccess * 0.4)
        updated = updated * (1 - pull) + socialSig * pull
      }

      // Market anchor: agents with high info access track market closely
      const mktPull = ag.infoAccess * 0.06
      updated = updated * (1 - mktPull) + marketPrice * mktPull

      // Risk aversion: threat questions biased upward for risk-averse agents
      updated += ag.riskAversion * 0.03 - 0.015

      beliefs[i] = clamp01(updated + ag.optimismBias * 0.08)
    })
  }

  // Aggregate: influence-weighted
  let wSum = 0, wTot = 0
  const allVotes = []
  pool.forEach((ag, i) => {
    const v = beliefs[i]
    const w = ag.influence
    wSum += v * w
    wTot += w
    allVotes.push({ vote: v, tier: ag.tier, archetype: ag.archetype, influence: w })
  })

  allVotes.sort((a, b) => a.vote - b.vote)
  const mean = wTot > 0 ? wSum / wTot : 0.5
  const variance = allVotes.reduce((s, { vote }) => s + (vote - mean) ** 2, 0) / allVotes.length
  const std = Math.sqrt(variance)
  const yesVotes = allVotes.filter(v => v.vote > 0.5)
  const noVotes  = allVotes.filter(v => v.vote <= 0.5)

  // Bimodality: two-peak distribution = split society
  const bins = new Array(10).fill(0)
  allVotes.forEach(({ vote }) => bins[Math.min(9, Math.floor(vote * 10))]++)
  const smoothed = bins.map((b, i) => (bins[i-1]||0)*0.25 + b*0.5 + (bins[i+1]||0)*0.25)
  let peaks = 0
  for (let i = 1; i < 9; i++) {
    if (smoothed[i] > smoothed[i-1] && smoothed[i] > smoothed[i+1] && smoothed[i] > allVotes.length * 0.05) peaks++
  }

  // Archetype breakdown: how each archetype's agents voted on average
  const archetypeBreakdown = {}
  allVotes.forEach(({ vote, archetype }) => {
    if (!archetypeBreakdown[archetype]) archetypeBreakdown[archetype] = { sum: 0, n: 0 }
    archetypeBreakdown[archetype].sum += vote
    archetypeBreakdown[archetype].n++
  })
  const archetypeVotes = Object.entries(archetypeBreakdown).map(([id, { sum, n }]) => ({
    id, mean: +(sum / n).toFixed(3), n
  }))

  // Uncertainty-adjusted: high std → compress toward market
  const compress = Math.min(1, std * 4)
  const adjustedMean = mean * (1 - compress * 0.35) + marketPrice * compress * 0.35

  return {
    rawMean:     +mean.toFixed(4),
    adjustedMean: +adjustedMean.toFixed(4),
    std:         +std.toFixed(4),
    yesCount:    yesVotes.length,
    noCount:     noVotes.length,
    totalAgents: allVotes.length,
    bimodal:     peaks >= 2,
    polarised:   std > 0.22,
    consensus:   std < 0.10,
    p25:         +allVotes[Math.floor(allVotes.length * 0.25)]?.vote.toFixed(3),
    p75:         +allVotes[Math.floor(allVotes.length * 0.75)]?.vote.toFixed(3),
    archetypeVotes,
    bins,
  }
}

// ── LLM Summarizer (the ONLY LLM call — reads swarm results, summarizes) ─────
const SUMMARIZER_PROMPT = (question, swarmResult, archetypes, graphEvents) => `
You are an intelligence analyst summarizing a SWARM simulation result. DO NOT make up probabilities.
Report what the math produced. Be precise and brief.

QUESTION: ${question}
SWARM RESULT (${swarmResult.totalAgents} agents, ${archetypes?.length || 0} archetypes):
  - Weighted mean YES probability: ${(swarmResult.adjustedMean * 100).toFixed(1)}%
  - Belief std deviation: ${(swarmResult.std * 100).toFixed(1)}% (${swarmResult.consensus ? 'CONSENSUS' : swarmResult.polarised ? 'POLARISED' : 'DIVIDED'})
  - YES votes: ${swarmResult.yesCount} | NO votes: ${swarmResult.noCount}
  - Distribution: ${swarmResult.bimodal ? 'BIMODAL (two camps)' : 'UNIMODAL'}

ARCHETYPE VOTES:
${(swarmResult.archetypeVotes || []).map(av => {
  const arch = archetypes?.find(a => a.id === av.id)
  return `  - ${arch?.name || av.id}: ${(av.mean * 100).toFixed(0)}% YES (${av.n} agents) — ${arch?.reasoning?.slice(0,100) || ''}`
}).join('\n')}

RECENT GRAPH EVENTS:
${(graphEvents || []).slice(0, 5).map(ev => `  - [${ev.type}] ${ev.description}`).join('\n')}

Write a 3-4 sentence intelligence summary:
1. What the swarm collectively believes and why there is/isn't consensus
2. Which archetypes drive the forecast and their reasoning
3. Key uncertainties or polarization factors
4. One actionable intelligence takeaway

Be direct. No hedging. Reference specific archetypes by name.`

// ── MAIN HOOK ─────────────────────────────────────────────────────────────────

export function useSwarmIntelligence() {
  const { keys } = useStore()
  const [swarmResults, setSwarmResults] = useState({})   // questionId → result
  const [summaries, setSummaries]       = useState({})   // questionId → text
  const [running, setRunning]           = useState(false)
  const poolRef = useRef({})  // archetypeHash → pool (avoid rebuilding same pool)

  const runSwarm = useCallback(async ({
    question,
    questionId,
    archetypes,
    graphEvents,
    marketPrice = 0.5,
    relSignal   = null,
  }) => {
    if (!archetypes?.length || !question) return null
    const groqKey = keys?.groq

    // Check summary cache
    const cache = cacheRead(CACHE_KEY)
    const cacheEntry = cache[questionId]
    if (cacheEntry && Date.now() - cacheEntry.ts < CACHE_TTL) {
      setSwarmResults(prev => ({ ...prev, [questionId]: cacheEntry.swarm }))
      setSummaries(prev => ({ ...prev, [questionId]: cacheEntry.summary }))
      return cacheEntry
    }

    setRunning(true)
    try {
      // ── Build agent pool (reuse if same archetypes) ─────────────────────────
      const archHash = archetypes.map(a => a.id + a.priorProbability).join('|')
      if (!poolRef.current[archHash]) {
        poolRef.current[archHash] = buildSwarmPool(archetypes, 55)
      }
      const pool = poolRef.current[archHash]

      // ── Run mathematical swarm simulation (no LLM needed) ──────────────────
      const swarm = runSwarmDeliberation(pool, marketPrice, relSignal, 4)
      if (!swarm) return null

      setSwarmResults(prev => ({ ...prev, [questionId]: swarm }))

      // ── LLM Summarizer: 1 call, reads swarm output, writes summary ──────────
      let summary = null
      if (groqKey) {
        try {
          const r = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
            body: JSON.stringify({
              model: FAST_MODEL,
              messages: [
                { role: 'system', content: 'You are an intelligence analyst. Be precise, brief, and reference the swarm data directly. 3-4 sentences max.' },
                { role: 'user', content: SUMMARIZER_PROMPT(question, swarm, archetypes, graphEvents) },
              ],
              max_tokens: 280,
              temperature: 0.2,
              stream: false,
            }),
          })
          if (r.ok) {
            const d = await r.json()
            summary = d.choices?.[0]?.message?.content?.trim() || null
          }
        } catch {}
      }

      if (!summary) {
        // Fallback: template-based summary from swarm data
        const dominant = swarm.archetypeVotes.sort((a, b) => b.mean - a.mean)[0]
        const dissenting = swarm.archetypeVotes.sort((a, b) => a.mean - b.mean)[0]
        const dominantArch = archetypes.find(a => a.id === dominant?.id)
        const dissentArch  = archetypes.find(a => a.id === dissenting?.id)
        summary = `Swarm of ${swarm.totalAgents} agents (${archetypes.length} archetypes) assigns ${(swarm.adjustedMean * 100).toFixed(0)}% to YES. ` +
          (swarm.bimodal ? `Society is SPLIT — two distinct belief clusters detected. ` : swarm.consensus ? `Near-consensus: agents strongly agree. ` : `Agents divided with no clear consensus. `) +
          (dominantArch ? `${dominantArch.name} leads YES case at ${(dominant.mean*100).toFixed(0)}%. ` : '') +
          (dissentArch && dissentArch !== dominantArch ? `${dissentArch.name} most skeptical at ${(dissenting.mean*100).toFixed(0)}%. ` : '') +
          `Belief std dev ${(swarm.std*100).toFixed(0)}% — ${swarm.polarised ? 'high uncertainty warrants caution' : 'moderate confidence'}.`
      }

      setSummaries(prev => ({ ...prev, [questionId]: summary }))

      // Cache result
      const newCache = { ...cacheRead(CACHE_KEY), [questionId]: { ts: Date.now(), swarm, summary } }
      cacheWrite(CACHE_KEY, newCache)

      return { swarm, summary }
    } finally {
      setRunning(false)
    }
  }, [keys])

  return { swarmResults, summaries, running, runSwarm }
}
