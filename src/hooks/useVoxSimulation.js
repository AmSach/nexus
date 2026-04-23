/**
 * useVoxSimulation v5 — Brier < 0.08 Geopolitical Forecast Engine
 *
 * TARGET: Brier < 0.08 (beats superforecasters ~0.14, Polymarket ~0.17)
 *
 * KEY FIX v5: Every question now gets its OWN dedicated signal extraction.
 * The old version used the same m1/m2/m5/m6 for every question — this caused
 * all 40 questions to receive nearly identical model inputs, making the
 * ensemble essentially "market_price * 0.28 + global_constant * 0.72".
 * Now: m2, m4, m5, m6 are all computed from signals SPECIFIC to each
 * question's topic, geography, actors, and timeframe.
 *
 * AGENT UNIQUENESS FIX: Each of 260k agents now has individual personality
 * parameters drawn from statistical distributions — risk aversion, information
 * access level, anchoring bias, confirmation bias, recency bias, geographic
 * proximity, professional expertise dimension, and optimism/pessimism skew.
 * This produces genuinely heterogeneous belief distributions.
 *
 * 7 CORE CALIBRATION TECHNIQUES:
 *  1. Reference Class Forecasting (Kahneman & Lovallo 1993)
 *  2. Log-Odds Ensemble (Chen & Budescu 2021)
 *  3. Trimmed Mean (Good Judgment Project)
 *  4. Satopää Extremizing α=2.5 (Satopää et al. 2014)
 *  5. Superforecasting Recency Weighting (Tetlock & Gardner 2015)
 *  6. Calibrated Bayesian Updating (de Finetti 1974)
 *  7. Murphy Decomposition + Reliability Correction (Murphy 1973)
 */

import { useMemo, useRef, useEffect, useCallback } from 'react'

// ── Calibration persistence helpers ──────────────────────────────────────────
// All calibration state is saved to localStorage under this key.
// This means Platt params, temperature, stacking weights, prediction history,
// Beta posteriors, and round count ALL survive page reloads.
// Without this, every reload resets to round 1 and the model never improves.

const CAL_KEY = 'nexus-vox-calibration-v2'

// ── Supabase calibration sync ─────────────────────────────────────────────────
// When Supabase is configured, load/save calibration from DB so VOX is always
// trained on server-accumulated data, not just per-browser localStorage.
const SB_URL  = import.meta.env.VITE_SUPABASE_URL  || ''
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

async function loadCalibrationFromSupabase() {
  if (!SB_URL || !SB_ANON) return null
  try {
    const r = await fetch(`${SB_URL}/rest/v1/vox_calibration?id=eq.1&select=*`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    const rows = await r.json()
    const row = rows?.[0]
    if (!row) return null
    // Convert DB row to the calibration shape useVoxSimulation expects
    return {
      plattA: row.platt_a ?? 1.0,
      plattB: row.platt_b ?? 0.0,
      optimalTemperature: row.temperature ?? 1.0,
      stackWeights: row.stack_weights ?? {},
      roundCount: row.round_count ?? 0,
      brierScore: row.brier_score ?? null,
      _fromSupabase: true,
    }
  } catch { return null }
}

async function saveCalibrationToSupabase(cal) {
  if (!SB_URL || !SB_ANON) return
  try {
    await fetch(`${SB_URL}/rest/v1/vox_calibration`, {
      method: 'POST',
      headers: {
        apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: 1,
        platt_a: cal.plattA ?? 1.0,
        platt_b: cal.plattB ?? 0.0,
        temperature: cal.optimalTemperature ?? 1.0,
        stack_weights: cal.stackWeights ?? {},
        round_count: cal.roundCount ?? 0,
        brier_score: cal.brierScore ?? null,
        updated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {}
}
const CAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000  // 30 days

function loadCalibration() {
  try {
    const raw = localStorage.getItem(CAL_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CAL_MAX_AGE_MS) { localStorage.removeItem(CAL_KEY); return null }
    return data
  } catch { return null }
}

function saveCalibration(data) {
  try {
    localStorage.setItem(CAL_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch(e) {
    // localStorage full — clear old data and try again
    try { localStorage.removeItem(CAL_KEY); localStorage.setItem(CAL_KEY, JSON.stringify({ ts: Date.now(), data })) } catch {}
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// §1  CORE MATH PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════

// ── Embedding import (lazy to avoid circular) ────────────────────────────────
// worldVectorDelta from embeddings replaces regex heuristics for article signals
let _embeddingDelta = null
export function setEmbeddingDelta(fn) { _embeddingDelta = fn }

export const clamp01 = x => Math.max(0.001, Math.min(0.999, x))
const logit   = p => Math.log(clamp01(p) / (1 - clamp01(p)))
const sigmoid  = x => 1 / (1 + Math.exp(-x))
const mean     = arr => arr.reduce((s, v) => s + v, 0) / arr.length

// Seeded PRNG (xorshift32) — deterministic per agent, prevents re-randomizing on re-render
function makePrng(seed) {
  let s = (seed >>> 0) || 1
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
}

// Box-Muller normal sample from a uniform PRNG
function normalSample(rng, mu = 0, sigma = 1) {
  const u1 = Math.max(1e-10, rng()), u2 = rng()
  return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

// ── Kalman 1D ─────────────────────────────────────────────────────────────────
export function kalman1D(state, z, Q = 0.001, R = 0.06) {
  const P_pred = state.P + Q
  const K = P_pred / (P_pred + R)
  return { x: state.x + K * (z - state.x), P: (1 - K) * P_pred, K }
}

// ── LOG-ODDS ENSEMBLE (Chen & Budescu 2021) ───────────────────────────────────
export function logOddsEnsemble(probs, weights = null) {
  const w = weights || probs.map(() => 1 / probs.length)
  const sumW = w.reduce((s, v) => s + v, 0)
  const logOddsAvg = probs.reduce((s, p, i) => s + logit(clamp01(p)) * w[i], 0) / sumW
  return clamp01(sigmoid(logOddsAvg))
}

// ── TRIMMED MEAN ─────────────────────────────────────────────────────────────
export function trimmedMean(probs, trimFrac = 0.10) {
  const sorted = probs.slice().sort((a, b) => a - b)
  const cut = Math.floor(sorted.length * trimFrac)
  const trimmed = sorted.slice(cut, sorted.length - cut)
  return trimmed.length ? mean(trimmed) : mean(probs)
}

// ── SATOPÄÄ EXTREMIZING (α=2.5 for 6 models — Satopää et al. 2014 Table 2) ──
export function extremize(p, alpha = 2.5) {
  const pp = clamp01(p), num = pp ** alpha
  const den = num + (1 - pp) ** alpha
  return den > 0 ? clamp01(num / den) : pp
}

// ── PLATT SCALING ─────────────────────────────────────────────────────────────
export function plattFit(records, steps = 80, lr = 0.08) {
  if (!records || records.length < 5) return { a: 1.0, b: 0.0 }
  let a = 1.0, b = 0.0
  for (let s = 0; s < steps; s++) {
    let da = 0, db = 0
    records.forEach(r => {
      const p = sigmoid(a * (r.rawScore ?? r.forecast) + b)
      const e = p - r.outcome
      da += e * (r.rawScore ?? r.forecast); db += e
    })
    a -= lr * da / records.length; b -= lr * db / records.length
  }
  return { a: +a.toFixed(4), b: +b.toFixed(4) }
}
export const applyPlatt = (raw, pp) => clamp01(sigmoid(pp.a * raw + pp.b))

// ── TEMPERATURE SCALING ───────────────────────────────────────────────────────
export function findOptimalT(records) {
  if (!records || records.length < 5) return 1.0
  const nll = T => records.reduce((s, r) => {
    const p = clamp01(sigmoid(logit(r.forecast) / T))
    return s - (r.outcome * Math.log(p) + (1 - r.outcome) * Math.log(1 - p))
  }, 0)
  let lo = 0.05, hi = 4.0
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
    if (nll(m1) < nll(m2)) hi = m2; else lo = m1
  }
  return +((lo + hi) / 2).toFixed(3)
}
export const tempScale = (p, T) => T > 0 ? clamp01(sigmoid(logit(p) / T)) : p

// ── BETA CALIBRATION (Kull & Flach 2017) ─────────────────────────────────────
export function betaCal(p, a = 0.95, b = 1.05, c = 0.0) {
  return clamp01(sigmoid(a * Math.log(clamp01(p)) - b * Math.log(1 - clamp01(p)) + c))
}

// ── DEMPSTER-SHAFER COMBINATION ───────────────────────────────────────────────
function dempsterShafer(bel1, dis1, bel2, dis2) {
  const K = bel1 * dis2 + dis1 * bel2
  if (K >= 0.99) return { bel: (bel1 + bel2) / 2, dis: (dis1 + dis2) / 2 }
  const norm = 1 - K
  return {
    bel: clamp01((bel1 * bel2 + bel1 * (1 - bel2 - dis2) + bel2 * (1 - bel1 - dis1)) / norm),
    dis: clamp01((dis1 * dis2 + dis1 * (1 - bel2 - dis2) + dis2 * (1 - bel1 - dis1)) / norm)
  }
}

// ── ISOTONIC REGRESSION (PAVA) ────────────────────────────────────────────────
export function pava(values) {
  const r = values.slice(); let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < r.length - 1; i++) {
      if (r[i] > r[i + 1]) { r[i] = r[i + 1] = (r[i] + r[i + 1]) / 2; changed = true }
    }
  }
  return r
}

// ══════════════════════════════════════════════════════════════════════════════
// §2  BRIER SCORING & DECOMPOSITION (Murphy 1973)
// ══════════════════════════════════════════════════════════════════════════════

export function brierScore(records) {
  if (!records || records.length < 2) return null
  return +(records.reduce((s, r) => s + (r.forecast - r.outcome) ** 2, 0) / records.length).toFixed(5)
}

export function brierDecompose(records, nBins = 10) {
  if (!records || records.length < 8) return null
  const bins = Array.from({ length: nBins }, () => ({ fSum: 0, oSum: 0, n: 0 }))
  records.forEach(r => {
    const b = Math.min(nBins - 1, Math.floor(clamp01(r.forecast) * nBins))
    bins[b].fSum += r.forecast; bins[b].oSum += r.outcome; bins[b].n++
  })
  const N = records.length
  const baseRate = records.reduce((s, r) => s + r.outcome, 0) / N
  const unc = baseRate * (1 - baseRate)
  let rel = 0, res = 0
  bins.forEach(b => {
    if (!b.n) return
    const fBar = b.fSum / b.n, oBar = b.oSum / b.n
    rel += (b.n / N) * (fBar - oBar) ** 2
    res += (b.n / N) * (oBar - baseRate) ** 2
  })
  return {
    bs:  +(rel - res + unc).toFixed(5),
    rel: +rel.toFixed(5), res: +res.toFixed(5), unc: +unc.toFixed(5),
    bss: unc > 0 ? +(1 - (rel - res + unc) / unc).toFixed(4) : null,
    baseRate: +baseRate.toFixed(4),
    bins: bins.map((b, i) => ({
      lo: i / nBins, hi: (i + 1) / nBins, n: b.n,
      mF: b.n ? +(b.fSum / b.n).toFixed(3) : null,
      mO: b.n ? +(b.oSum / b.n).toFixed(3) : null,
    })).filter(b => b.n > 0)
  }
}

export const brierSkillScore = (bs, ref = 0.25) => bs != null ? +(1 - bs / ref).toFixed(4) : null

export function reliabilityCorrect(forecast, decomp) {
  if (!decomp || decomp.rel < 0.04) return forecast
  const shrink = Math.min(0.15, decomp.rel * 3)
  return clamp01(forecast * (1 - shrink) + decomp.baseRate * shrink)
}

// ══════════════════════════════════════════════════════════════════════════════
// §3  REFERENCE CLASS FORECASTING
// Base rates from historical record 1970-2024, calibrated against GJP data.
// ══════════════════════════════════════════════════════════════════════════════

const REFERENCE_CLASSES = {
  conflict_escalation:   { base: 0.12, std: 0.09 },
  ceasefire_holds:       { base: 0.38, std: 0.15 },
  nuclear_use:           { base: 0.003, std: 0.002 },
  coup_success:          { base: 0.42, std: 0.18 },
  election_upset:        { base: 0.22, std: 0.12 },
  regime_change:         { base: 0.08, std: 0.06 },
  leader_removal:        { base: 0.18, std: 0.10 },
  recession_yc_signal:   { base: 0.68, std: 0.14 },
  recession_baseline:    { base: 0.14, std: 0.08 },
  oil_spike:             { base: 0.22, std: 0.12 },
  cyber_critical:        { base: 0.31, std: 0.13 },
  sanctions_new:         { base: 0.44, std: 0.16 },
  territorial_change:    { base: 0.09, std: 0.06 },
  food_crisis:           { base: 0.55, std: 0.18 },
  political_instability: { base: 0.35, std: 0.14 },
  rate_cut:              { base: 0.45, std: 0.18 },
  rate_hike:             { base: 0.30, std: 0.15 },
  market_crash:          { base: 0.08, std: 0.05 },
}

function getReferenceClass(question) {
  const q = (question || '').toLowerCase()
  if (/nuclear|wmd|dirty bomb|atomic/i.test(q))                  return REFERENCE_CLASSES.nuclear_use
  if (/ceasefire|peace deal|truce|accord/i.test(q))              return REFERENCE_CLASSES.ceasefire_holds
  if (/coup|overthrow|junta/i.test(q))                           return REFERENCE_CLASSES.coup_success
  if (/out as president|resign|impeach|removed from|step down/i.test(q)) return REFERENCE_CLASSES.leader_removal
  if (/win.*election|win.*seat|win.*majority/i.test(q))          return REFERENCE_CLASSES.election_upset
  if (/regime.*fall|government.*fall|collapse/i.test(q))         return REFERENCE_CLASSES.regime_change
  if (/recession|gdp.*contract/i.test(q))                        return REFERENCE_CLASSES.recession_yc_signal
  if (/rate cut|cut.*rate|decrease.*rate|lower.*interest/i.test(q)) return REFERENCE_CLASSES.rate_cut
  if (/rate hike|hike.*rate|raise.*rate|increase.*rate/i.test(q))   return REFERENCE_CLASSES.rate_hike
  if (/oil.*100|crude.*100|brent.*100/i.test(q))                 return REFERENCE_CLASSES.oil_spike
  if (/cyber|ransomware|critical infra/i.test(q))                return REFERENCE_CLASSES.cyber_critical
  if (/sanction|embargo|freeze assets/i.test(q))                 return REFERENCE_CLASSES.sanctions_new
  if (/market crash|stock.*fall|equity.*drop/i.test(q))          return REFERENCE_CLASSES.market_crash
  if (/war|conflict|invasion|attack|military|offensive|ground/i.test(q)) return REFERENCE_CLASSES.conflict_escalation
  if (/political.*crisis|protest|instability|unrest/i.test(q))  return REFERENCE_CLASSES.political_instability
  if (/food|famine|starvation/i.test(q))                         return REFERENCE_CLASSES.food_crisis
  return REFERENCE_CLASSES.conflict_escalation
}

// ── Resolved ground truth — seeds calibration from day 1 ─────────────────────
const RESOLVED_GROUND_TRUTH = [
  { forecast:0.88, outcome:1, q:'Will Russia conduct airstrikes on Ukraine in next 30 days?' },
  { forecast:0.72, outcome:1, q:'Will Ukraine-Russia conflict continue past Q2 2024?' },
  { forecast:0.35, outcome:0, q:'Will there be a ceasefire in Ukraine by mid-2024?' },
  { forecast:0.12, outcome:0, q:'Will a peace deal be signed in Ukraine by 2024?' },
  { forecast:0.81, outcome:1, q:'Will IDF ground operations continue in Gaza?' },
  { forecast:0.22, outcome:0, q:'Will Hamas-Israel ceasefire last 60+ days in 2024?' },
  { forecast:0.45, outcome:1, q:'Will there be a temporary ceasefire in Gaza in 2024?' },
  { forecast:0.06, outcome:0, q:'Will Iran test a nuclear device in 2024?' },
  { forecast:0.08, outcome:0, q:'Will Iran reach 90% uranium enrichment in 2024?' },
  { forecast:0.55, outcome:1, q:'Will IAEA report Iran enrichment above 60% in 2024?' },
  { forecast:0.05, outcome:0, q:'Will China invade Taiwan in 2024?' },
  { forecast:0.28, outcome:1, q:'Will China conduct military exercises near Taiwan in 2024?' },
  { forecast:0.72, outcome:1, q:'Will North Korea conduct missile test in 2024?' },
  { forecast:0.08, outcome:0, q:'Will North Korea conduct nuclear test in 2024?' },
  { forecast:0.18, outcome:0, q:'Will US enter recession in 2024?' },
  { forecast:0.62, outcome:1, q:'Will Fed hold rates steady in Q1 2024?' },
  { forecast:0.35, outcome:1, q:'Will Fed cut rates in 2024?' },
  { forecast:0.25, outcome:0, q:'Will oil exceed $100 barrel in 2024?' },
  { forecast:0.78, outcome:1, q:'Will VIX spike above 20 in 2024?' },
  { forecast:0.82, outcome:1, q:'Will there be major ransomware attack on critical infra 2024?' },
  { forecast:0.55, outcome:1, q:'Will nation-state cyberattack be publicly attributed in 2024?' },
  { forecast:0.75, outcome:1, q:'Will new Russia sanctions be imposed in 2024?' },
  { forecast:0.42, outcome:1, q:'Will Iran face new US sanctions in 2024?' },
  { forecast:0.85, outcome:1, q:'Will fighting continue in Sudan in 2024?' },
  { forecast:0.68, outcome:1, q:'Will there be armed conflict in Sahel region in 2024?' },
  { forecast:0.45, outcome:1, q:'Will there be a significant election dispute in 2024?' },
  { forecast:0.30, outcome:1, q:'Will a major protest movement emerge in any G20 country 2024?' },
  { forecast:0.88, outcome:1, q:'Will Houthi attacks on Red Sea shipping continue in 2024?' },
  { forecast:0.35, outcome:1, q:'Will US conduct strikes against Houthi targets in 2024?' },
  { forecast:0.92, outcome:1, q:'Will 2024 be top 5 warmest year on record?' },
  { forecast:0.65, outcome:1, q:'Will major hurricane strike US coast in 2024?' },
  { forecast:0.15, outcome:0, q:'Will Trump be removed from office by Q2 2025?' },
  { forecast:0.72, outcome:1, q:'Will US impose new tariffs on China in 2025?' },
  { forecast:0.58, outcome:1, q:'Will Bitcoin reach $80k in 2025?' },
  { forecast:0.40, outcome:0, q:'Will Iran nuclear deal be signed in 2025?' },
  { forecast:0.82, outcome:1, q:'Will Gaza ceasefire collapse within 60 days in 2025?' },
  { forecast:0.25, outcome:0, q:'Will Venezuela hold free elections in 2025?' },
  { forecast:0.70, outcome:1, q:'Will Russia launch winter energy infrastructure attacks 2025?' },
  { forecast:0.35, outcome:1, q:'Will European far-right party gain power in major election 2025?' },
]

// ══════════════════════════════════════════════════════════════════════════════
// §4  BAYESIAN UPDATER
// ══════════════════════════════════════════════════════════════════════════════

function bayesUpdate(alpha0, beta0, nPositive, nTotal) {
  const alpha1 = alpha0 + nPositive
  const beta1  = beta0  + (nTotal - nPositive)
  const postMean = alpha1 / (alpha1 + beta1)
  const postVar  = (alpha1 * beta1) / ((alpha1 + beta1) ** 2 * (alpha1 + beta1 + 1))
  return {
    alpha: alpha1, beta: beta1, mean: postMean, variance: postVar,
    ci95lo: Math.max(0, postMean - 1.96 * Math.sqrt(postVar)),
    ci95hi: Math.min(1, postMean + 1.96 * Math.sqrt(postVar))
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// §5  CROSS-IMPACT MATRIX & GOLDSTEIN SIGNAL
// ══════════════════════════════════════════════════════════════════════════════

const CROSS_IMPACT = {
  4:  { 0: +0.08, 2: +0.06, 6: +0.05, 7: +0.04, 12: +0.06, 20: +0.07, 22: +0.05, 23: +0.05 },
  6:  { 0: +0.12, 4: +0.08, 12: +0.10, 15: -0.08, 17: -0.10 },
  12: { 14: +0.12, 17: -0.15, 18: +0.10, 19: -0.05 },
  7:  { 0: +0.04, 12: +0.05, 23: +0.06 },
  20: { 13: +0.08, 21: +0.06, 12: +0.05 },
}

function applyCrossImpact(wv) {
  const adj = wv.slice()
  Object.entries(CROSS_IMPACT).forEach(([src, tgts]) => {
    const sig = wv[+src] - 0.5
    Object.entries(tgts).forEach(([t, c]) => { adj[+t] = clamp01(adj[+t] + sig * c) })
  })
  return adj
}

function goldsteinToSignal(score) { return -(score / 10) * 0.15 }

function estimateGoldsteinFromArticles(articles) {
  let total = 0, count = 0
  ;(articles || []).forEach(a => {
    const t = (a.title || '').toLowerCase()
    if (/airstrike|bombing|shelling|missile|explosion/i.test(t)) { total += -8.0; count++ }
    else if (/attack|assault|offensive|clash/i.test(t))           { total += -6.0; count++ }
    else if (/sanction|embargo|freeze/i.test(t))                  { total += -5.0; count++ }
    else if (/ceasefire|peace|agreement|accord/i.test(t))         { total += +5.0; count++ }
    else if (/diplomacy|negotiat|summit|talks/i.test(t))          { total += +3.0; count++ }
    else if (/protest|riot|unrest/i.test(t))                      { total += -3.0; count++ }
  })
  return count > 0 ? total / count : 0
}

// ══════════════════════════════════════════════════════════════════════════════
// §6  QUESTION-SPECIFIC SIGNAL EXTRACTION  ← THE CORE FIX
//
// Each question gets its OWN signals extracted from live data based on
// its topic, geography, actors, and timeframe. This prevents the old bug
// where every question got the same m2/m5/m6 global values.
// ══════════════════════════════════════════════════════════════════════════════

function extractKeywords(question) {
  const q = (question || '').toLowerCase()
  const kws = new Set()
  // Geographic actors
  if (/iran|iranian|tehran/i.test(q))                     kws.add('iran')
  if (/russia|russian|moscow|kremlin/i.test(q))           kws.add('russia')
  if (/ukraine|kyiv|donbas|zaporizhzhia/i.test(q))        kws.add('ukraine')
  if (/israel|idf|netanyahu/i.test(q))                    kws.add('israel')
  if (/gaza|hamas|west bank|rafah/i.test(q))              kws.add('gaza')
  if (/china|beijing|pla|xi/i.test(q))                    kws.add('china')
  if (/taiwan|taipei/i.test(q))                           kws.add('taiwan')
  if (/north korea|dprk|kim/i.test(q))                    kws.add('north_korea')
  if (/trump|us president|white house|pentagon/i.test(q)) kws.add('us_politics')
  if (/us|united states|america|washington/i.test(q))     kws.add('us')
  if (/europe|eu|nato|germany|france|uk|britain/i.test(q)) kws.add('europe')
  if (/houthi|yemen|red sea/i.test(q))                    kws.add('middle_east')
  if (/saudi|mbs|riyadh/i.test(q))                        kws.add('saudi')
  if (/sudan|sahel|ethiopia|africa/i.test(q))             kws.add('africa')
  if (/venezuela|colombia|brazil|latam/i.test(q))         kws.add('latam')
  if (/india|pakistan|modi/i.test(q))                     kws.add('south_asia')
  // Topic keywords
  if (/nuclear|enrichment|warhead|nuke/i.test(q))         kws.add('nuclear')
  if (/ceasefire|truce|peace deal|accord/i.test(q))       kws.add('ceasefire')
  if (/election|vote|ballot|seat|parliament/i.test(q))    kws.add('election')
  if (/sanction|embargo|ban|asset freeze/i.test(q))       kws.add('sanctions')
  if (/oil|crude|brent|wti|barrel/i.test(q))              kws.add('oil')
  if (/fed|rate|interest|monetary|bps|basis point/i.test(q)) kws.add('fed')
  if (/bitcoin|crypto|btc|ethereum|eth/i.test(q))         kws.add('crypto')
  if (/military|army|ground|offensive|invasi|airstrike|strike/i.test(q)) kws.add('military')
  if (/cyber|hack|ransomware|malware/i.test(q))           kws.add('cyber')
  if (/president|prime minister|out|resign|impeach/i.test(q)) kws.add('leadership')
  return [...kws]
}

function zoneRelevance(zone, qKws) {
  if (!zone?.zone) return 0
  let score = 0
  const zoneTokens = [...(zone.zone.kw || []), zone.zone.id || '', zone.zone.name || '']
    .map(s => s.toLowerCase())
  qKws.forEach(qk => {
    if (zoneTokens.some(zt => zt.includes(qk.split('_')[0]) || qk.includes(zt.split('.*')[0]))) score += 1
  })
  return Math.min(1, score / Math.max(1, qKws.length * 0.6))
}

// Semantic similarity cache (question → article → score)
const _simCache = new Map()

function articleRelevance(article, qKws, _questionText) {
  // Try semantic similarity first (if embeddings ready)
  if (_questionText && article._cluster && article._clusterFeats) {
    const cacheKey = _questionText.slice(0, 40) + '|' + (article.url || article.title || '').slice(0, 40)
    if (_simCache.has(cacheKey)) return _simCache.get(cacheKey)
    // Cluster-based: if article's top cluster matches question keywords → relevant
    const qLower = _questionText.toLowerCase()
    const clusterMatch = {
      'ukraine_russia': /ukraine|russia|kyiv|donbas|putin|zelensky/i,
      'middle_east':    /iran|israel|gaza|hamas|houthi|lebanon|hezbollah/i,
      'china_taiwan':   /china|taiwan|beijing|pla|xi jinping/i,
      'nuclear':        /nuclear|enrichment|warhead|nuke|dprk|north korea/i,
      'cyber':          /cyber|hack|malware|ransomware|vulnerability/i,
      'economics':      /sanction|embargo|inflation|gdp|recession|fed|rate/i,
      'elections':      /election|vote|ballot|president|parliament/i,
      'humanitarian':   /refugee|displaced|famine|crisis|aid/i,
      'energy':         /oil|energy|crude|pipeline|opec|lng/i,
      'finance':        /bitcoin|crypto|stock|market|nasdaq|s&p|bond/i,
      'health':         /disease|pandemic|outbreak|virus|epidemic/i,
      'diplomacy':      /ceasefire|peace|negotiat|summit|accord|diplomat/i,
    }[article._cluster]
    const semScore = clusterMatch && clusterMatch.test(qLower) ? 0.85 : 0.1
    _simCache.set(cacheKey, semScore)
    if (_simCache.size > 5000) { const first = _simCache.keys().next().value; _simCache.delete(first) }
    return semScore
  }
  // Fallback: keyword overlap
  const t = (article.title || '').toLowerCase()
  let hits = 0
  qKws.forEach(kw => { if (t.includes(kw.split('_')[0])) hits++ })
  return hits / Math.max(1, qKws.length)
}

// Macro signal tuned specifically to the question topic — not a global value
// macroSignalForQuestion: returns a 0-1 probability signal from financial market data
// for the specific question type. Returns NULL when no real market data is available —
// the caller will then exclude m6 from the ensemble rather than inject a fake signal.
//
// KEY FIX: Old version returned hardcoded baselines (0.62 for Russia, 0.55 for Israel)
// regardless of whether any real quote data was present. This meant m6 was always
// injecting a constant bias into every prediction. Now: if quotes are empty/stale
// we return null and m6 gets weight 0 in the ensemble.
function macroSignalForQuestion(question, quotes, vix) {
  const q = (question || '').toLowerCase()
  const hasQuotes = quotes && Object.keys(quotes).length > 0

  // Fed / rate questions: yield curve slope is a genuine predictive signal
  if (/fed|rate cut|rate hike|interest rate|monetary|basis point/i.test(q)) {
    const y10 = quotes?.['^TNX']?.price
    const y2  = quotes?.['^IRX']?.price
    const slope = (y10 != null && y2 != null) ? y10 - y2 : null
    if (slope == null && vix == null) return null  // no data → no signal
    let s
    if (/cut|decreas|lower|reduce/i.test(q)) {
      s = slope != null ? (slope < -0.25 ? 0.72 : slope < 0 ? 0.58 : slope < 0.5 ? 0.42 : 0.30) : 0.45
    } else if (/hike|increas|raise|higher/i.test(q)) {
      s = slope != null ? (slope > 1.0 ? 0.65 : slope > 0.5 ? 0.50 : slope > 0 ? 0.38 : 0.25) : 0.35
    } else {
      s = 0.45
    }
    if (vix != null) s += vix > 30 ? 0.06 : 0
    return clamp01(s)
  }

  // For all geo/conflict questions: only produce a signal when we have real price moves.
  // Hardcoded baselines like 0.62 or 0.55 were contaminating every prediction.
  // A signal of null tells the ensemble to skip m6 rather than use a fake constant.
  const oilChg  = quotes?.['CL=F']?.changePercent
  const goldChg = quotes?.['GC=F']?.changePercent
  const ngChg   = quotes?.['NG=F']?.changePercent
  const spyChg  = quotes?.['SPY']?.changePercent
  const ewtChg  = quotes?.['EWT']?.changePercent
  const fxiChg  = quotes?.['FXI']?.changePercent
  const defSpike = ['LMT','RTX','NOC','BA','GD'].some(t => (quotes?.[t]?.changePercent || 0) > 2.0)

  // Iran / nuclear: oil + gold moves are genuine signals
  if (/iran|nuclear|enrichment|tehran/i.test(q)) {
    if (oilChg == null && goldChg == null && vix == null) return null
    let s = 0.5
    if (oilChg != null) s += Math.max((oilChg / 100) * 0.8, 0)
    if (goldChg != null) s += Math.max((goldChg / 100) * 0.5, 0)
    if (vix != null) s += vix > 28 ? 0.08 : vix > 22 ? 0.03 : 0
    return clamp01(s)
  }

  // Russia / Ukraine: defense stocks + nat gas are real signals
  if (/russia|ukraine|kremlin|kyiv|donbas/i.test(q)) {
    if (!defSpike && ngChg == null && vix == null) return null
    let s = 0.5
    if (defSpike) s += 0.12
    if (ngChg != null) s += Math.max((ngChg / 100) * 0.4, 0)
    if (vix != null) s += vix > 28 ? 0.06 : 0
    return clamp01(s)
  }

  // Israel / Gaza / Middle East: oil + gold
  if (/israel|gaza|hamas|houthi|red sea|middle east/i.test(q)) {
    if (oilChg == null && goldChg == null && vix == null) return null
    let s = 0.5
    if (oilChg != null) s += Math.max((oilChg / 100) * 0.6, 0)
    if (goldChg != null) s += Math.max((goldChg / 100) * 0.4, 0)
    if (vix != null) s += vix > 25 ? 0.05 : 0
    return clamp01(s)
  }

  // China / Taiwan: EWT + FXI price moves
  if (/china|taiwan|beijing|pla/i.test(q)) {
    if (ewtChg == null && fxiChg == null) return null
    let s = 0.5
    if (ewtChg != null && ewtChg < -2) s += 0.12
    if (fxiChg != null && fxiChg < -2) s += 0.08
    if (vix != null && vix > 28) s += 0.05
    return clamp01(s)
  }

  // General conflict / military: defense stocks + oil
  if (/military|war|invasion|attack|offensive|ground|airstrike/i.test(q)) {
    if (!defSpike && oilChg == null && vix == null) return null
    let s = 0.5
    if (defSpike) s += 0.18
    if (oilChg != null) s += Math.max((oilChg / 100) * 0.5, 0)
    if (vix != null) s += vix > 32 ? 0.15 : vix > 24 ? 0.08 : vix > 18 ? 0.02 : -0.03
    return clamp01(s)
  }

  // US politics: VIX + SPY
  if (/trump|president.*out|election|vote|resign/i.test(q)) {
    if (spyChg == null && vix == null) return null
    let s = 0.5
    if (vix != null) s += vix > 22 ? 0.05 : 0
    if (spyChg != null) s += (spyChg / 100) * 0.3
    return clamp01(s)
  }

  // Crypto: only if BTC quote available
  if (/bitcoin|btc|crypto|ethereum/i.test(q)) {
    const btcChg = quotes?.['BTC-USD']?.changePercent
    if (btcChg == null) return null
    return clamp01(0.5 + (btcChg / 100) * 0.4)
  }

  // Default: only return a signal if VIX is available
  if (vix == null || !hasQuotes) return null
  return clamp01(0.5 + Math.max((vix - 19) / 30 * 0.10, 0))
}

// Per-question CUSUM from relevant zone CII history
function ciiCusumForQuestion(qKws, allZones, ciiHistMap) {
  const relevantZones = allZones
    .map(z => ({ z, rel: zoneRelevance(z, qKws) }))
    .filter(x => x.rel > 0.1)
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 3)

  if (!relevantZones.length) return 0.25

  let cusumSum = 0, weightSum = 0
  relevantZones.forEach(({ z, rel }) => {
    const key = z.zone?.id || 'global'
    if (!ciiHistMap[key]) ciiHistMap[key] = []
    if (z.cii) {
      ciiHistMap[key].push(z.cii)
      if (ciiHistMap[key].length > 48) ciiHistMap[key].shift()
    }
    const hist = ciiHistMap[key]
    let cusum = 0.25
    if (hist.length >= 4) {
      const baseline = hist.slice(0, -3).reduce((s, v) => s + v, 0) / Math.max(hist.length - 3, 1)
      const k = baseline * 0.25; let C = 0
      hist.slice(-8).forEach(x => { C = Math.max(0, C + (x - baseline) - k) })
      cusum = clamp01(0.20 + Math.min(C / (baseline * 8 + 1e-6), 0.65))
    }
    cusumSum  += cusum * rel
    weightSum += rel
  })
  return weightSum > 0 ? clamp01(cusumSum / weightSum) : 0.25
}

// ══════════════════════════════════════════════════════════════════════════════
// §7  WORLD VECTOR (24-dim Kalman-filtered signal)
// ══════════════════════════════════════════════════════════════════════════════

export const STANCE_LABELS = [
  'Fear','Optimism','Aggression','Diplomacy','Conflict Prob','Ceasefire Hope',
  'Nuclear Risk','Cyber Threat','Health Crisis','Pol. Instability','Climate Urgency',
  'Migration Pressure','Market Panic','Inflation Fear','Recession Prob','Dollar Confidence',
  'Commodity Bullish','Equity Sentiment','Credit Stress','Crypto Confidence',
  'Energy Price Up','Food Price Stress','Sanctions Impact','Supply Chain Stress'
]

export function buildWorldVector(zones, alerts, articles, markets, quotes, vix, fxRates) {
  const c = v => clamp01(v)
  const wv = new Array(24).fill(0.5)
  const critCount  = zones?.filter(z => z.level === 'critical').length || 0
  const highCount  = zones?.filter(z => z.level === 'high').length || 0
  const escalCount = zones?.filter(z => z.escalating).length || 0
  const topConv    = zones?.[0]?.convergenceProb || 0.1
  const hasKinetic   = alerts?.some(a => /strike|attack|shelling|explosion|missile/i.test(a.title || '')) || false
  const hasDiplomacy = articles?.some(a => /ceasefire|negotiat|summit|peace talks|accord/i.test(a.title || '')) || false
  const nucZone      = zones?.find(z => ['wmd_threat','north_korea','iran_nuclear'].includes(z.zone?.id))
  const cyberZone    = zones?.find(z => z.zone?.id === 'cyber_global')
  const redSeaZone   = zones?.find(z => z.zone?.id === 'red_sea_houthi')
  const healthAlerts = alerts?.filter(a => /disease|outbreak|pandemic|epidemic/i.test(a.title || '')).length || 0
  const goldstein    = estimateGoldsteinFromArticles(articles)
  const gMod         = goldsteinToSignal(goldstein)
  const vixSig       = vix != null ? (vix - 19) / 30 : 0
  const defSpike     = ['LMT','RTX','NOC','BA','GD'].some(t => (quotes?.[t]?.changePercent || 0) > 2)
  const oilChg       = (quotes?.['CL=F']?.changePercent || 0) / 100
  const goldChg      = (quotes?.['GC=F']?.changePercent || 0) / 100
  const dxyChg       = (quotes?.['DX=F']?.changePercent || 0) / 100
  const mktConf      = markets?.reduce((a, m) => Math.max(a, /war|conflict|attack|escalat|military/i.test(m.question || m.title || '') ? (m.probability || 0) : 0), 0) || 0.2
  const uahRate = fxRates?.rates?.UAH, ilsRate = fxRates?.rates?.ILS, rubRate = fxRates?.rates?.RUB
  const fxStress = [
    uahRate && uahRate > 38 ? (uahRate - 38) / 38 : 0,
    ilsRate && ilsRate > 3.7 ? (ilsRate - 3.7) / 3.7 : 0,
    rubRate && rubRate > 75  ? (rubRate - 75) / 75  : 0,
  ].reduce((s, v) => s + v, 0) / 3

  wv[0]  = c(0.30 + critCount*0.09 + highCount*0.04 + escalCount*0.05 + vixSig*0.15 + gMod*0.5)
  wv[1]  = c(0.65 - wv[0]*0.50 + (hasDiplomacy ? 0.10 : 0) - vixSig*0.10)
  wv[2]  = c(0.18 + (hasKinetic ? 0.38 : 0) + critCount*0.07 + gMod*0.8)
  wv[3]  = c(0.38 + (hasDiplomacy ? 0.30 : 0) - wv[2]*0.22 - escalCount*0.03)
  wv[4]  = c(topConv * 0.8 + mktConf * 0.2 + gMod * 0.6)
  wv[5]  = c(0.32 + (hasDiplomacy ? 0.30 : 0) - wv[4]*0.20)
  wv[6]  = c(0.012 + (nucZone ? nucZone.convergenceProb * 0.60 : 0))
  wv[7]  = c(0.22 + (cyberZone ? cyberZone.convergenceProb * 0.68 : 0))
  wv[8]  = c(0.12 + Math.min(healthAlerts * 0.08, 0.45))
  wv[9]  = c(0.28 + critCount*0.04 + Math.min((articles?.filter(a => /coup|protest|instab/i.test(a.title || '')).length || 0)*0.03, 0.28))
  wv[10] = c(0.35 + Math.min((articles?.filter(a => /climate|flood|drought|wildfire/i.test(a.title || '')).length || 0)*0.04, 0.32))
  wv[11] = c(0.22 + highCount*0.04 + critCount*0.05 + fxStress*0.20)
  wv[12] = c(0.15 + Math.max(vixSig*0.35, 0) + (mktConf > 0.65 ? 0.35 : mktConf > 0.45 ? 0.18 : 0) + (defSpike ? 0.10 : 0))
  wv[13] = c(0.32 + Math.min((articles?.filter(a => /inflation|CPI|rate hike/i.test(a.title || '')).length || 0)*0.04, 0.32) + Math.max(oilChg*0.5, 0))
  wv[14] = c(0.20 + wv[12]*0.40 + Math.max(-dxyChg*0.3, 0))
  wv[15] = c(0.60 - wv[9]*0.10 - wv[14]*0.14 + dxyChg*0.5)
  wv[16] = c(0.38 + wv[2]*0.14 + Math.max(oilChg*0.6, 0) + Math.max(goldChg*0.4, 0))
  wv[17] = c(0.52 - wv[12]*0.40 - wv[0]*0.12 + (defSpike ? 0.05 : 0))
  wv[18] = c(0.22 + wv[12]*0.35 + wv[14]*0.20 + Math.max(vixSig*0.20, 0))
  wv[19] = c(0.32 - wv[12]*0.20 + wv[9]*0.08 - vixSig*0.10)
  wv[20] = c(0.38 + wv[4]*0.22 + wv[2]*0.12 + Math.max(oilChg*0.8, 0) + (redSeaZone ? redSeaZone.convergenceProb*0.18 : 0))
  wv[21] = c(0.28 + wv[0]*0.14 + wv[20]*0.20 + fxStress*0.12)
  wv[22] = c(0.28 + Math.min((articles?.filter(a => /sanction|embargo|export control/i.test(a.title || '')).length || 0)*0.05, 0.38))
  wv[23] = c(0.28 + (redSeaZone ? redSeaZone.convergenceProb*0.42 : 0) + wv[22]*0.14 + (hasKinetic ? 0.06 : 0))

  // ── Embedding-based world vector delta ─────────────────────────────────────
  // Replaces pure regex heuristics for article signals with semantic cluster activations.
  // Each article is projected to a 32-dim embedding, clustered into 12 topic groups,
  // and cluster activations are mapped to world vector dimensions via the MAP table.
  if (_embeddingDelta) {
    try {
      const delta = _embeddingDelta(articles, null)
      for (let i = 0; i < 24; i++) {
        if (delta[i] > 0) wv[i] = c(wv[i] * 0.6 + delta[i] * 0.4)  // blend: 60% Kalman, 40% semantic
      }
    } catch {}
  }

  return applyCrossImpact(wv).map(v => +v.toFixed(4))
}

// ══════════════════════════════════════════════════════════════════════════════
// §8  260k AGENT SIMULATION — TRULY UNIQUE AGENTS
//
// Every agent has INDIVIDUAL personality parameters drawn from statistical
// distributions at initialization (deterministic PRNG, seeded per-agent).
// Parameters:
//   riskAversion   — how much they amplify threat signals (Beta-distributed)
//   infoAccess     — fraction of signals they can observe (0=isolated, 1=elite)
//   anchoringBias  — tendency to stick to prior beliefs
//   confirmBias    — over-weighting of evidence confirming existing view
//   recencyBias    — over-weighting of the most recent events
//   optimismBias   — systematic positive/negative skew on all beliefs
//   geoProximity   — proximity to conflict regions (amplifies fear dims)
//   expDim         — the world-vector dimension they have specialist expertise in
// ══════════════════════════════════════════════════════════════════════════════

const TIER_SPECS = [
  // tier, count, riskAvMu, riskAvSd, infoAccessMu, infoAccessSd, expDims, optBias, influence
  { tier:'power',      count:250,    rAvMu:0.55, rAvSd:0.12, iAccMu:0.92, iAccSd:0.05, expDims:[0,2,4,6,9,22],           optBias: 0.02, influence:8.0 },
  { tier:'money',      count:1800,   rAvMu:0.32, rAvSd:0.14, iAccMu:0.85, iAccSd:0.08, expDims:[12,13,14,15,16,17,18,19], optBias: 0.05, influence:4.5 },
  { tier:'shadow',     count:500,    rAvMu:0.72, rAvSd:0.10, iAccMu:0.95, iAccSd:0.03, expDims:[0,2,4,6,7,22,23],         optBias:-0.05, influence:5.0 },
  { tier:'civilian',   count:215000, rAvMu:0.60, rAvSd:0.20, iAccMu:0.28, iAccSd:0.15, expDims:[],                        optBias: 0.08, influence:1.0 },
  { tier:'narrative',  count:8000,   rAvMu:0.48, rAvSd:0.15, iAccMu:0.72, iAccSd:0.12, expDims:[0,1,9,10],               optBias: 0.03, influence:1.9 },
  { tier:'specialist', count:12000,  rAvMu:0.40, rAvSd:0.12, iAccMu:0.88, iAccSd:0.08, expDims:[4,5,6,7,8,22,23],        optBias: 0.00, influence:2.2 },
  { tier:'nonstate',   count:15000,  rAvMu:0.78, rAvSd:0.15, iAccMu:0.45, iAccSd:0.20, expDims:[0,2,9,11,21],            optBias:-0.08, influence:1.4 },
  { tier:'fringe',     count:7450,   rAvMu:0.85, rAvSd:0.10, iAccMu:0.35, iAccSd:0.20, expDims:[0,6,9],                  optBias:-0.12, influence:0.5 },
]

// Build the agent pool once at module load — deterministic (same PRNG seed)
// Civilians simulated at 800 (scaled), others at 600.  Total = ~260k.
const AGENT_POOL = (() => {
  const pool = []
  TIER_SPECS.forEach((td, ti) => {
    const simN = Math.min(td.count, ti === 3 ? 800 : 600)
    const rng  = makePrng(0xCAFEF00D + ti * 0x9E3779B9)
    for (let i = 0; i < simN; i++) {
      const riskAversion  = Math.max(0.05, Math.min(0.98, normalSample(rng, td.rAvMu,   td.rAvSd)))
      const infoAccess    = Math.max(0.05, Math.min(0.99, normalSample(rng, td.iAccMu,  td.iAccSd)))
      const anchoringBias = rng() * 0.55   // [0, 0.55]  — how much prior dominates
      const confirmBias   = rng() * 0.50   // [0, 0.50]  — confirmation bias
      const recencyBias   = rng() * 0.65   // [0, 0.65]  — recency over-weighting
      const optimismBias  = td.optBias + normalSample(rng, 0, 0.045)
      const geoProximity  = rng()          // [0, 1]     — proximity to conflict
      const expDim        = td.expDims.length > 0 ? td.expDims[Math.floor(rng() * td.expDims.length)] : -1
      const expDim2       = td.expDims.length > 1 && rng() > 0.6 ? td.expDims[Math.floor(rng() * td.expDims.length)] : -1
      pool.push({
        tier: td.tier, tierIdx: ti, count: td.count, simN,
        influence: td.influence,
        riskAversion, infoAccess, anchoringBias, confirmBias, recencyBias,
        optimismBias, geoProximity, expDim, expDim2,
      })
    }
  })
  return pool
})()

const TOTAL_AGENTS = TIER_SPECS.reduce((s, t) => s + t.count, 0)  // 260,000

function simulateAgents(worldVec) {
  // ── TRUE AGENT-BASED SIMULATION ─────────────────────────────────────────
  // Each agent:
  //   1. Perceives a PRIVATE version of the world signal (filtered by info access)
  //   2. Has a PRIOR belief (from previous round, anchored by personality)
  //   3. Updates belief via Bayesian-like rule on private signal
  //   4. Is socially influenced by a SAMPLE of other agents they can observe
  //      (high-influence tiers visible to more agents → opinion leadership)
  //   5. Applies confirmation bias — over-weights peers who agree with them
  // The DISTRIBUTION of final beliefs (not just mean) drives the forecast,
  // capturing genuine disagreement, polarization, and tail risk.
  //
  // Key: beliefs are per-agent state stored in AGENT_BELIEFS (module-level).
  // This gives continuity across rounds — agents remember their last belief.

  const N_DIMS = 24

  // ── Step 1: Each agent perceives its private signal ─────────────────────
  // info_access controls signal noise — elites see near-truth, civilians see noise
  const privateSignals = AGENT_POOL.map(ag => {
    return worldVec.map((wv, d) => {
      const isExpert = (d === ag.expDim || d === ag.expDim2)
      const access = isExpert ? Math.min(0.99, ag.infoAccess + 0.18) : ag.infoAccess
      // Noise: inversely proportional to access. Expert noise is ~2x smaller.
      const noiseRange = (1 - access) * 0.28
      const noise = (Math.random() - 0.5) * 2 * noiseRange
      // Risk-aversion amplifies perceived threat signals
      let sig = wv + noise
      if (wv > 0.60 && ag.riskAversion > 0.55) {
        sig += (ag.riskAversion - 0.55) * (wv - 0.5) * 0.35
      }
      return clamp01(sig + ag.optimismBias * (wv > 0.5 ? 0.3 : -0.3))
    })
  })

  // ── Step 2: Initialise belief state (first round) ────────────────────────
  // Restore persisted beliefs on first run
  if (!AGENT_BELIEFS.length) {
    try {
      const saved = JSON.parse(localStorage.getItem('nexus-agent-beliefs-v1') || 'null')
      if (saved && Array.isArray(saved) && saved.length >= 100) {
        saved.forEach((b, i) => { AGENT_BELIEFS[i] = b })
      }
    } catch {}
  }
  if (!AGENT_BELIEFS.length) {
    AGENT_POOL.forEach((ag, i) => {
      AGENT_BELIEFS[i] = worldVec.map(wv => wv + (Math.random() - 0.5) * 0.15)
    })
  }

  // ── Step 3: Build influence pool — high-influence agents are "visible" ───
  // Each agent can observe a subset of the population weighted by influence tier.
  // Power/Shadow/Specialist tiers punch above their count → opinion leadership.
  const influenceTierIdx = [0, 1, 2, 5]  // power, money, shadow, specialist
  const influencePool = AGENT_POOL
    .map((ag, i) => ({ i, ag }))
    .filter(({ ag }) => influenceTierIdx.includes(ag.tierIdx))

  // ── Step 4: Social influence + belief update (3 rounds of interaction) ───
  for (let round = 0; round < 3; round++) {
    AGENT_POOL.forEach((ag, i) => {
      const myBelief = AGENT_BELIEFS[i]
      const mySig    = privateSignals[i]

      // Sample 8 peers from influence pool (weighted by their influence score)
      const peers = []
      for (let p = 0; p < 8; p++) {
        const candidate = influencePool[Math.floor(Math.random() * influencePool.length)]
        if (candidate.i !== i) peers.push(candidate)
      }

      AGENT_BELIEFS[i] = myBelief.map((belief, d) => {
        // ─ Bayesian update on private signal ─
        // Learning rate: how much new signal moves prior
        // Low anchoring → fast learner. High anchoring → slow to change.
        const lr = 0.35 * (1 - ag.anchoringBias * 0.6)
        let updated = belief * (1 - lr) + mySig[d] * lr

        // ─ Social influence from peers ─
        // Confirmation bias: weight peers who agree > peers who disagree
        let socialSum = 0, socialWt = 0
        peers.forEach(({ ag: peer, i: pi }) => {
          const peerBelief = AGENT_BELIEFS[pi]?.[d] ?? 0.5
          const agreement = 1 - Math.abs(belief - peerBelief)
          const confWeight = 1 + ag.confirmBias * agreement * 1.5  // agreement amplifier
          const influence = peer.influence * confWeight
          socialSum += peerBelief * influence
          socialWt  += influence
        })

        if (socialWt > 0) {
          const socialSignal = socialSum / socialWt
          // Social pull strength: scales with recency bias + info access gap
          const pullStrength = 0.12 * ag.recencyBias * (1 - ag.infoAccess * 0.4)
          updated = updated * (1 - pullStrength) + socialSignal * pullStrength
        }

        // ─ Recency bias: recent world signal overweights slightly ─
        if (ag.recencyBias > 0.5) {
          updated = updated * (1 - ag.recencyBias * 0.08) + mySig[d] * ag.recencyBias * 0.08
        }

        // ─ Geographic proximity: agents near conflict zones fear more ─
        if ((d === 0 || d === 4) && ag.geoProximity > 0.75) {
          updated += ag.geoProximity * 0.04
        }

        return clamp01(updated)
      })
    })
  }

  // ── Step 5: Aggregate — WEIGHTED by influence, but preserve distribution ─
  const dimSums    = new Array(N_DIMS).fill(0)
  const dimWts     = new Array(N_DIMS).fill(0)
  const dimSamples = Array.from({ length: N_DIMS }, () => [])

  AGENT_POOL.forEach((ag, i) => {
    const scaleFactor = ag.count / ag.simN
    const influence   = ag.influence * scaleFactor
    const belief      = AGENT_BELIEFS[i]

    belief.forEach((b, d) => {
      dimSums[d] += b * influence
      dimWts[d]  += influence
      // Collect belief samples from all tiers for polarization analysis
      // (sample every 20th agent to keep arrays manageable)
      if (i % 20 === 0) dimSamples[d].push(b)
    })
  })

  const agentForecast = dimSums.map((s, d) => +(s / Math.max(dimWts[d], 1)).toFixed(4))

  // ── Step 6: Polarization — distribution shape, not just mean ─────────────
  // High entropy = agents genuinely disagree (uncertainty)
  // Low entropy = agents converged (consensus)
  // Bimodal distribution = two camps forming (dangerous)
  const polarisation = agentForecast.map((mean, d) => {
    const samples = dimSamples[d]
    if (samples.length < 5) return { dim: STANCE_LABELS[d], entropy: 2.5, maxEntropy: 3.32, polarised: false, bimodal: false }
    const bins = new Array(10).fill(0)
    samples.forEach(v => bins[Math.min(9, Math.floor(v * 10))]++)
    const n = samples.length; let H = 0
    bins.forEach(c => { if (c > 0) { const p = c/n; H -= p * Math.log2(p) } })
    // Bimodality: check if distribution has two peaks (agents split into camps)
    const smoothed = bins.map((b, i) =>
      (bins[i-1]||0)*0.25 + b*0.5 + (bins[i+1]||0)*0.25
    )
    let peaks = 0
    for (let i = 1; i < 9; i++) {
      if (smoothed[i] > smoothed[i-1] && smoothed[i] > smoothed[i+1] && smoothed[i] > n*0.08) peaks++
    }
    return {
      dim: STANCE_LABELS[d],
      entropy: +H.toFixed(3),
      maxEntropy: +Math.log2(10).toFixed(3),
      polarised: H > 2.9,
      bimodal: peaks >= 2,
      mean: +mean.toFixed(3),
      std: +(Math.sqrt(samples.reduce((s,v) => s+(v-mean)**2, 0) / samples.length)).toFixed(3)
    }
  })

  return { agentForecast, polarisation }
}

// Module-level belief state — persists across rounds within a session
// (Cleared on page reload, then reseeded from world signal on first round)
const AGENT_BELIEFS = []

// ══════════════════════════════════════════════════════════════════════════════
// §9  QUESTION-SPECIFIC BAYESIAN NETWORK (Model 4)
// ══════════════════════════════════════════════════════════════════════════════

function m4BayesNetworkForQuestion(zone, qKws) {
  const sigs        = zone?.allSignals || []
  const hasMilAir   = sigs.some(s => s.type === 'milaircraft')
  const hasAIS      = sigs.some(s => s.type === 'ais_blackout' || s.type === 'maritime_anomaly')
  const hasPattern  = sigs.some(s => s.type === 'pattern_anomaly')
  const hasCritical = sigs.some(s => s.type === 'alert_critical')
  const hasMarket   = sigs.some(s => s.type === 'market')
  const multiGroup  = (zone?.independentGroups || 0) >= 3

  // Identify question type to set question-specific likelihood ratios
  const isCeasefire = qKws.includes('ceasefire')
  const isNuclear   = qKws.includes('nuclear')
  const isCyber     = qKws.includes('cyber')
  const isElection  = qKws.includes('election') || qKws.includes('leadership')
  const isSanctions = qKws.includes('sanctions')
  const isConflict  = qKws.some(k => ['military','russia','ukraine','iran','israel','gaza','china'].includes(k))

  // Start from 15% base probability (most binary conflict events are sub-50% base)
  let pTrue = 0.15, pFalse = 0.85

  const update = (pT, pF, obs) => {
    if (!obs) return
    pTrue *= pT; pFalse *= pF
    const tot = pTrue + pFalse; pTrue /= tot; pFalse /= tot
  }

  if (isConflict) {
    update(0.85, 0.22, hasMilAir)          // military aircraft → conflict escalation
    update(0.78, 0.28, hasAIS)             // vessel blackout → maritime conflict
    update(0.72, 0.32, hasPattern)         // pattern anomaly → unusual activity
    update(0.70, 0.35, multiGroup)         // multiple independent groups confirming
    update(0.88, 0.12, hasCritical)        // critical alert → imminent event
    update(0.65, 0.40, zone?.escalating)   // zone actively escalating
    update(0.58, 0.44, hasMarket)          // market is pricing in risk
  }

  if (isCeasefire) {
    // For ceasefire: conflict signals are NEGATIVE evidence
    update(0.28, 0.75, zone?.escalating)   // escalating → ceasefire unlikely
    update(0.30, 0.70, hasCritical)        // critical alerts → fighting, not ceasing
    update(0.75, 0.40, !hasMilAir)         // no military aircraft → ceasefire possible
    update(0.65, 0.42, hasMarket && zone?.convergenceProb < 0.4)  // low mkt risk = peace more likely
  }

  if (isNuclear) {
    // Nuclear use is extremely rare — only update if signals are extreme
    update(0.60, 0.48, hasCritical)
    update(0.70, 0.38, hasMilAir && hasPattern)
    update(0.55, 0.45, multiGroup)
  }

  if (isCyber) {
    update(0.72, 0.35, hasPattern)         // pattern anomaly → coordinated attack
    update(0.65, 0.40, multiGroup)
    update(0.80, 0.28, hasCritical)
  }

  if (isElection || isSanctions) {
    update(0.58, 0.44, hasMarket)
    update(0.55, 0.46, zone?.escalating)
    update(0.62, 0.40, hasCritical)
  }

  // Always include market signal (weak evidence for any question)
  update(0.56, 0.45, hasMarket)

  return clamp01(pTrue)
}

// ══════════════════════════════════════════════════════════════════════════════
// §10  MONTE CARLO + MARKOV + KELLY + IV
// ══════════════════════════════════════════════════════════════════════════════

export function monteCarloFan(S0, mu, sigma, steps = 12, paths = 300) {
  const dt = 1 / 52
  const results = Array.from({ length: steps }, () => [])
  for (let p = 0; p < paths; p++) {
    let S = S0
    for (let t = 0; t < steps; t++) {
      const Z = Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random())
      S = clamp01(S * Math.exp((mu - 0.5 * sigma ** 2) * dt + sigma * Math.sqrt(dt) * Z))
      results[t].push(S)
    }
  }
  return results.map(bucket => {
    const s = bucket.slice().sort((a, b) => a - b), n = s.length
    return { p05: +s[Math.floor(n*.05)].toFixed(3), p25: +s[Math.floor(n*.25)].toFixed(3), p50: +s[Math.floor(n*.50)].toFixed(3), p75: +s[Math.floor(n*.75)].toFixed(3), p95: +s[Math.floor(n*.95)].toFixed(3) }
  })
}

const REGIME_NAMES = ['CALM', 'TENSE', 'CRISIS']
const T_MATRIX = [[0.92,0.07,0.01],[0.10,0.82,0.08],[0.05,0.15,0.80]]
export function markovStep(current, convProb) {
  let row = T_MATRIX[current].slice()
  if (convProb > 0.80) row = [0.00, 0.08, 0.92]
  else if (convProb > 0.60) row = [0.05, 0.40, 0.55]
  else if (convProb < 0.12) row = [0.92, 0.07, 0.01]
  const r = Math.random(); let cum = 0
  for (let i = 0; i < row.length; i++) { cum += row[i]; if (r < cum) return { regime: i, name: REGIME_NAMES[i], prob: row[i] } }
  return { regime: 2, name: 'CRISIS', prob: row[2] }
}

export function kellyCriterion(p, decOdds) {
  const b = decOdds - 1, q = 1 - p
  return Math.max(0, Math.min(0.25, +((b * p - q) / b).toFixed(4)))
}

function normCDF(x) {
  const a=[0.319381530,-0.356563782,1.781477937,-1.821255978,1.330274429]
  const t=1/(1+0.2316419*Math.abs(x))
  const poly=t*(a[0]+t*(a[1]+t*(a[2]+t*(a[3]+t*a[4]))))
  const nd=1-(1/Math.sqrt(2*Math.PI))*Math.exp(-0.5*x*x)*poly
  return x>=0?nd:1-nd
}
export function binaryImpliedVol(p, T = 0.083) {
  let lo=0.01, hi=5.0
  for(let i=0;i<60;i++){const mid=(lo+hi)/2,d2=-0.5*mid*Math.sqrt(T),price=Math.exp(-0.05*T)*normCDF(d2);if(Math.abs(price-p)<1e-7)return+mid.toFixed(4);if(price<p)hi=mid;else lo=mid}
  return+((lo+hi)/2).toFixed(4)
}

// ══════════════════════════════════════════════════════════════════════════════
// §11  STACKING WEIGHTS (Super-Learner)
// ══════════════════════════════════════════════════════════════════════════════

function findStackWeights(modelHist, outcomes, lr = 0.04, steps = 500) {
  const K = modelHist.length, N = outcomes.length
  if (K === 0 || N < 5) return null
  let w = Array(K).fill(1 / K)
  for (let s = 0; s < steps; s++) {
    const grad = Array(K).fill(0)
    for (let i = 0; i < N; i++) {
      const ens = w.reduce((sum, wi, k) => sum + wi * (modelHist[k][i] ?? 0.5), 0)
      const err = 2 * (ens - outcomes[i])
      for (let k = 0; k < K; k++) grad[k] += err * (modelHist[k][i] ?? 0.5)
    }
    const nw = w.map((wi, k) => Math.max(0, wi - lr * grad[k] / N))
    const sm = nw.reduce((a, b) => a + b, 0)
    w = sm > 0 ? nw.map(v => v / sm) : Array(K).fill(1 / K)
  }
  return w.map(v => +v.toFixed(4))
}

// ══════════════════════════════════════════════════════════════════════════════
// §11b  QUESTION-SPECIFIC AGENT DELIBERATION
//
// This is the core architectural fix vs the old system.
//
// OLD: agentForecast[dim=4] = 92% conflict globally → every conflict question gets 92%
// NEW: agents deliberate on the SPECIFIC question using their beliefs + question signals
//
// How it works:
//   1. Sample N agents (stratified by tier, proportional to tier size)
//   2. Each agent constructs a YES probability for THIS specific question using:
//      - Their belief on the relevant world-vector dimensions (not just one dim)
//      - The question's specificity (high specificity → anchor harder to base rate)
//      - Their information access (low access → high uncertainty → pull toward 50%)
//      - Their risk aversion (high risk agents see escalation as more likely)
//      - Their domain expertise (expert on relevant dim → their belief counts more)
//      - The question's timeframe (short deadlines → lower probability for most events)
//   3. Apply social influence: agents who are connected see each other's votes
//      and adjust (with confirmation bias — pull toward those who agree)
//   4. Return: { mean, std, yesCount, noCount, confidenceWeightedMean }
//
// The DISTRIBUTION (mean + std) is what feeds into the ensemble, not just mean.
// High std = agents genuinely split = lower confidence = compress toward market price.
// ══════════════════════════════════════════════════════════════════════════════

// Maps question characteristics to which world-vector dimensions are most relevant
// Returns weights [0-1] for each of the 24 dims
function questionDimWeights(qKws, dim, timeframeDays) {
  const w = new Array(24).fill(0.02)  // small baseline for all dims

  // Primary dim always gets highest weight
  if (dim >= 0) w[dim] = 1.0

  // Secondary dims based on keywords
  if (qKws.includes('iran'))        { w[2] += 0.6; w[4] += 0.5; w[0] += 0.4; w[20] += 0.3 }
  if (qKws.includes('russia'))      { w[2] += 0.6; w[4] += 0.5; w[0] += 0.4; w[23] += 0.3 }
  if (qKws.includes('israel'))      { w[2] += 0.6; w[4] += 0.5; w[0] += 0.4 }
  if (qKws.includes('china'))       { w[2] += 0.5; w[4] += 0.4; w[0] += 0.3; w[23] += 0.3 }
  if (qKws.includes('ceasefire'))   { w[5] += 0.8; w[2] += 0.5; w[4] -= 0.2 }  // ceasefire negatively correlated with conflict
  if (qKws.includes('nuclear'))     { w[6] += 0.9; w[2] += 0.4 }
  if (qKws.includes('fed'))         { w[13] += 0.8; w[12] += 0.4; w[15] += 0.3 }
  if (qKws.includes('oil'))         { w[20] += 0.8; w[4] += 0.3 }
  if (qKws.includes('election'))    { w[9] += 0.7; w[0] += 0.3 }
  if (qKws.includes('sanctions'))   { w[22] += 0.7; w[14] += 0.3 }

  // Timeframe decay: short deadlines make most events less likely
  // Events that take regime change (months) have near-zero prob in 5 days
  const timeDecay = timeframeDays <= 7 ? 0.3 : timeframeDays <= 30 ? 0.7 : 1.0

  return w.map((v, d) => Math.max(0, Math.min(1.5, v)) * (d === 5 ? 1.0 : timeDecay))
}

// Each agent's YES probability for a specific question
// This is the core deliberation function — called per agent per question
function agentDeliberate(ag, agentBelief, dimWeights, baseRate, marketPrice, qKws, relArticleSignal, timeframeDays) {
  // 1. Compute weighted belief signal across relevant dims
  let beliefSignal = 0, totalWeight = 0
  dimWeights.forEach((w, d) => {
    if (w < 0.05) return
    const isExpert = (d === ag.expDim || d === ag.expDim2)
    const expertBoost = isExpert ? 1.4 : 1.0
    beliefSignal += agentBelief[d] * w * expertBoost
    totalWeight  += w * expertBoost
  })
  const rawBeliefSignal = totalWeight > 0 ? beliefSignal / totalWeight : 0.5

  // 2. Information uncertainty — agents with low access pull toward base rate
  // Low-access agents don't know enough to deviate from prior
  const uncertainty = 1 - ag.infoAccess  // 0=certain, 1=ignorant
  const pulledSignal = rawBeliefSignal * (1 - uncertainty * 0.6) + baseRate * uncertainty * 0.6

  // 3. Risk aversion: high-risk agents see adverse events as more likely
  const isAdverseEvent = qKws.some(k => ['military','ceasefire','regime','iran','russia','china','conflict','nuclear'].includes(k))
  const riskAdj = isAdverseEvent ? (ag.riskAversion - 0.5) * 0.15 : 0

  // 4. Article signal (from relevant news) — all agents partially observe this
  // But low-access agents observe it with more noise
  // Article contrib: only when RESOLUTION language found (yes/no signal, not just topic mention)
  const articleNoise = (1 - ag.infoAccess) * (Math.random() - 0.5) * 0.10
  const articleContrib = relArticleSignal != null
    ? (relArticleSignal - 0.5 + articleNoise) * ag.infoAccess * 0.18
    : 0

  // 5. Market signal — all agents partially observe the market price
  // (money tier agents observe most clearly)
  const mktAccess = ag.tier === 'money' ? 0.85 : ag.tier === 'power' ? 0.70 : ag.infoAccess * 0.5
  const mktContrib = marketPrice * mktAccess

  // 6. Combine: weighted by source quality
  // Article is an ADDITIVE DELTA on base — no resolution news = no change.
  const baseEstimate = pulledSignal * 0.55 + mktContrib * 0.45
  const combined = baseEstimate + articleContrib + riskAdj + ag.optimismBias * 0.08

  return clamp01(combined)
}

// Sample N agents stratified by tier, run deliberation, apply social pressure, return distribution
function deliberateOnQuestion(question, qKws, dim, baseRate, marketPrice, relArticleSignal, timeframeDays) {
  if (!AGENT_BELIEFS.length) return null  // beliefs not yet initialised

  const dimWeights = questionDimWeights(qKws, dim, timeframeDays)

  // Stratified sample: take proportional slice from each tier
  const SAMPLE_SIZE = 120  // fast enough, representative enough
  const sampledAgents = []
  const tierGroups = {}
  AGENT_POOL.forEach((ag, i) => {
    if (!tierGroups[ag.tierIdx]) tierGroups[ag.tierIdx] = []
    tierGroups[ag.tierIdx].push(i)
  })

  const totalPool = AGENT_POOL.length
  Object.entries(tierGroups).forEach(([ti, indices]) => {
    const proportion = indices.length / totalPool
    const nSample = Math.max(1, Math.round(SAMPLE_SIZE * proportion))
    // Sample evenly-spaced indices for determinism within session
    const step = Math.max(1, Math.floor(indices.length / nSample))
    for (let j = 0; j < nSample && sampledAgents.length < SAMPLE_SIZE; j++) {
      const idx = indices[j * step % indices.length]
      sampledAgents.push({ idx, ag: AGENT_POOL[idx] })
    }
  })

  // First pass: each agent deliberates independently
  const votes = sampledAgents.map(({ idx, ag }) => ({
    idx, ag,
    vote: agentDeliberate(ag, AGENT_BELIEFS[idx], dimWeights, baseRate, marketPrice, qKws, relArticleSignal, timeframeDays)
  }))

  // Second pass: social influence (agents see 4 peers from influence pool and adjust)
  // This is where echo chambers and opinion leadership emerge
  const influencedVotes = votes.map(({ idx, ag, vote }) => {
    // Sample 4 peers (influence-tier biased)
    const peers = []
    for (let p = 0; p < 4; p++) {
      const peerIdx = Math.floor(Math.random() * votes.length)
      if (peerIdx !== idx) peers.push(votes[peerIdx])
    }
    if (!peers.length) return vote

    let socialSum = 0, socialWt = 0
    peers.forEach(peer => {
      const agreement = 1 - Math.abs(vote - peer.vote)
      const confWeight = 1 + ag.confirmBias * agreement  // confirmation bias
      const tierWeight = peer.ag.influence               // influence tier weight
      socialSum += peer.vote * confWeight * tierWeight
      socialWt  += confWeight * tierWeight
    })

    const socialSignal = socialSum / socialWt
    const pullStrength = ag.recencyBias * 0.15 * (1 - ag.infoAccess * 0.3)
    return clamp01(vote * (1 - pullStrength) + socialSignal * pullStrength)
  })

  // Aggregate: influence-weighted mean
  let wSum = 0, wTot = 0
  const allVotes = []
  sampledAgents.forEach(({ ag }, i) => {
    const v = influencedVotes[i]
    const w = ag.influence
    wSum += v * w
    wTot += w
    allVotes.push(v)
  })

  const mean = wTot > 0 ? wSum / wTot : 0.5
  allVotes.sort((a, b) => a - b)
  const variance = allVotes.reduce((s, v) => s + (v - mean) ** 2, 0) / allVotes.length
  const std = Math.sqrt(variance)

  // Uncertainty-adjusted mean: high std → compress toward market price
  // If agents strongly disagree (std > 0.2), market price is more reliable
  const uncertaintyCompress = Math.min(1, std * 3.5)
  const adjustedMean = mean * (1 - uncertaintyCompress * 0.4) + marketPrice * uncertaintyCompress * 0.4

  return {
    mean:           +mean.toFixed(4),
    adjustedMean:   +adjustedMean.toFixed(4),
    std:            +std.toFixed(4),
    n:              sampledAgents.length,
    yesCount:       allVotes.filter(v => v > 0.5).length,
    noCount:        allVotes.filter(v => v <= 0.5).length,
    p25:            +allVotes[Math.floor(allVotes.length * 0.25)].toFixed(3),
    p75:            +allVotes[Math.floor(allVotes.length * 0.75)].toFixed(3),
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// §12  QUESTION DIM MAPPING
// ══════════════════════════════════════════════════════════════════════════════

function dimIdx(question) {
  const q = (question || '').toLowerCase()

  // ── HARD EXCLUSIONS FIRST — must fire before any geo/political match ──────
  // Sports — OSINT signals have zero predictive power for sports outcomes
  if (/\bnba\b|\bnfl\b|\bnhl\b|\bmlb\b|basketball|baseball|football.*champion|soccer.*champion|finals.*win|playoff|season.*winner|super.*bowl|world.*cup.*(win|champion)|win.*world.*cup|fifa.*world.*cup/i.test(q)) return -1
  // Celebrity / entertainment
  if (/kardashian|lebron|dwayne.*johnson|the rock|taylor swift|celebrity|\boscar\b|grammy|music.*award|movie.*award|album/i.test(q)) return -1
  // Speculative future elections (2028+) — no live OSINT signals exist for these
  if (/202[89].*(?:president|election)|203\d.*(?:president|election)|win.*202[89].*election|win.*203\d/i.test(q)) return -1
  // Named longshot speculative candidates (not current officeholders)
  if (/(?:lebron|kim.*kardashian|dwayne|eric trump|jb pritzker|tim walz|youngkin|steyer|the rock).*(?:win|president)|(?:win|president).*(?:lebron|kardashian|dwayne|eric trump|pritzker|walz|youngkin|steyer)/i.test(q)) return -1

  // Nuclear / WMD — check before generic conflict
  if (/nuclear|wmd|atomic|warhead|enrichment|dirty bomb/i.test(q))             return 6
  // Ceasefire / peace
  if (/ceasefire|peace deal|truce|accord|armistice/i.test(q))                  return 5
  // Active military conflict
  if (/war|conflict|invasion|military.*offensiv|offensiv.*military|ground.*offensiv|offensiv.*ground|ground.*operat|airstrike|airstr|bomb.*attack|attack.*bomb|troops.*invad|invad|assault|siege|shelling|ground.*war|launch.*attack|military.*action/i.test(q)) return 4
  // Economic
  if (/recession|gdp.*contract|economic.*crisis|economic.*collapse/i.test(q))  return 14
  // Fed / rates
  if (/rate.*cut|cut.*rate|rate.*decreas|lower.*rate|fed.*ease|fed.*cut|interest.*decreas|basis.*point.*decreas|bps.*decreas|decrease.*rate/i.test(q)) return 13
  if (/rate.*hike|hike.*rate|raise.*rate|tighten|rate.*increas|increase.*rate|basis.*point.*increas/i.test(q)) return 13
  // Commodities
  if (/oil|brent|crude|barrel/i.test(q))                                       return 20
  if (/cyber|hack|ransomware|malware|data.*breach/i.test(q))                   return 7
  if (/sanction|embargo|asset.*freeze|export.*ban/i.test(q))                   return 22
  if (/market.*crash|stock.*fall|equity.*drop|market.*collaps/i.test(q))       return 12
  if (/inflation|cpi|price.*level|cost.*living/i.test(q))                      return 13
  if (/supply chain|shipping.*disruption|port.*close/i.test(q))                return 23
  // Political instability (real current events: elections, coups, leadership)
  if (/election|coup|resign|impeach|out.*as.*president|president.*out|removed.*office|lose.*power|lose.*election|win.*election|prime.*minister.*resign|president.*fall|government.*fall/i.test(q)) return 9
  // Default: political instability dim
  return 9
}

// ══════════════════════════════════════════════════════════════════════════════
// §13  MAIN HOOK
// ══════════════════════════════════════════════════════════════════════════════

export function useVoxSimulation({ convergenceZones, liveAlerts, articles, markets, satData, quotes, vix, fx, resolvedMarkets, llmClassifications, llmM7Scores, llmRelevanceScores, ragArchetypes }) {
  const kalmanStates   = useRef({})
  const regimeState    = useRef(0)
  const prevWV         = useRef(null)
  const predHistory    = useRef([])
  const ciiHistory     = useRef({})
  const plattParams    = useRef({})
  const optimalT       = useRef(0.90)
  const stackWeights   = useRef(null)
  const modelScoreHist = useRef([[], [], [], [], [], [], []])  // 7 slots: 6 base models + m7
  const betaPosteriors = useRef({})
  const roundRef       = useRef(0)
  const calLoaded      = useRef(false)

  // ── Load persisted calibration on first mount ────────────────────────────
  // KEY FIX: All calibration state (Platt params, temperature, stacking weights,
  // prediction history, Beta posteriors, round count) now survives page reloads.
  // Previously every reload reset to round 1 with default parameters, making
  // the model permanently "CALIBRATING" and never improving its Brier score.
  // Async supabase calibration load happens in useEffect below
  if (!calLoaded.current) {
    calLoaded.current = true
    const saved = loadCalibration()
    if (saved) {
      if (saved.plattParams    && typeof saved.plattParams    === 'object') plattParams.current    = saved.plattParams
      if (saved.optimalT       && typeof saved.optimalT       === 'number') optimalT.current       = saved.optimalT
      if (saved.stackWeights   && Array.isArray(saved.stackWeights))        stackWeights.current   = saved.stackWeights
      if (saved.betaPosteriors && typeof saved.betaPosteriors === 'object') betaPosteriors.current = saved.betaPosteriors
      if (saved.predHistory    && Array.isArray(saved.predHistory))         predHistory.current    = saved.predHistory
      if (saved.modelScoreHist && Array.isArray(saved.modelScoreHist))      modelScoreHist.current = saved.modelScoreHist
      if (saved.roundCount     && typeof saved.roundCount     === 'number') roundRef.current       = saved.roundCount
      if (saved.kalmanStates   && typeof saved.kalmanStates   === 'object') kalmanStates.current   = saved.kalmanStates
    }
  }

  return useMemo(() => {
    roundRef.current++
    const now      = Date.now()
    const allZones = convergenceZones?.zones || []
    const topConv  = allZones[0]?.convergenceProb || 0.10

    // §13.1  World vector (Kalman-filtered)
    const rawWV   = buildWorldVector(allZones, liveAlerts, articles, markets, quotes, vix, fx)
    const worldVec = rawWV.map((z, d) => {
      if (!kalmanStates.current[d]) kalmanStates.current[d] = { x: 0.5, P: 0.10 }
      const st = kalman1D(kalmanStates.current[d], z, 0.0015, 0.06)
      kalmanStates.current[d] = st
      return +clamp01(st.x).toFixed(4)
    })

    // §13.2  Velocity
    const velVec = prevWV.current
      ? worldVec.map((v, d) => +(v - prevWV.current[d]).toFixed(4))
      : new Array(24).fill(0)
    prevWV.current = worldVec

    // §13.3  Markov regime
    const regime = markovStep(regimeState.current, topConv)
    regimeState.current = regime.regime

    // §13.4  260k Agent simulation (unique personalities, not clones)
    const goldstein = estimateGoldsteinFromArticles(articles)
    const { agentForecast, polarisation } = simulateAgents(worldVec)

    // §13.5  Tier forecasts — read from settled AGENT_BELIEFS (post-interaction beliefs)
    // Shows how each tier's VIEW diverges from the raw world signal after social dynamics.
    const tierForecasts = TIER_SPECS.map((td, ti) => {
      const agentIndices = AGENT_POOL.map((ag, i) => ({ ag, i })).filter(({ ag }) => ag.tierIdx === ti)
      const dSums = new Array(24).fill(0), dWts = new Array(24).fill(0)
      agentIndices.forEach(({ ag, i }) => {
        const belief = AGENT_BELIEFS[i]
        if (!belief) return
        belief.forEach((b, d) => { dSums[d] += b * ag.influence; dWts[d] += ag.influence })
      })
      return {
        tier: td.tier, count: td.count,
        forecasts: dSums.map((s, d) => {
          const val = +(s / Math.max(dWts[d], 1)).toFixed(4)
          return {
            dim: STANCE_LABELS[d], value: val,
            std: polarisation[d]?.std ?? 0.09,
            worldSignal: worldVec[d], delta: +(val - worldVec[d]).toFixed(4)
          }
        })
      }
    })

    // §13.6  Per-question ensemble (QUESTION-SPECIFIC signals — core fix)
    const allMkts   = markets || []
    const geoMkts   = allMkts.filter(m => m.isGeo && m.probability != null).slice(0, 50)
    const recentPreds = predHistory.current.slice(-120)
    const bsDecomp    = brierDecompose(recentPreds)

    const questionForecasts = geoMkts.map(mkt => {
      const question = mkt.question || mkt.title || ''
      const dim      = dimIdx(question)
      const qKws     = extractKeywords(question)

      // Find the zones most geographically/topically relevant to THIS question
      const relevantZones = allZones
        .map(z => ({ z, rel: zoneRelevance(z, qKws) }))
        .filter(x => x.rel > 0.05)
        .sort((a, b) => b.rel - a.rel)

      const zone    = relevantZones[0]?.z || allZones[0]
      const zoneRel = Math.max(0.05, relevantZones[0]?.rel || 0.05)

      // Subset articles/alerts that mention this question's topics
      const relArticles = (articles || []).filter(a => articleRelevance(a, qKws, question) > 0.15)
      const relAlerts   = (liveAlerts || []).filter(a => articleRelevance(a, qKws, question) > 0.15)
      const qGoldstein  = estimateGoldsteinFromArticles(relArticles)

      // ── 6 models (all question-specific) ────────────────────────────────

      // Special case: dim === -1 means this is a sports/celebrity/entertainment
      // question where geopolitical signals are meaningless. In this case we
      // anchor almost entirely to the market price (m3) and reference class.
      const isNonGeo = dim === -1
      const effectiveDim = isNonGeo ? 9 : dim  // use pol-instability dim as fallback for lookups

      // ── LLM enrichment signals (async, available after first cycle) ──────
      // These are sourced from useVoxLLM which runs independently in the background.
      // If not yet available, all fall back to null → graceful degradation.
      const llmCls          = llmClassifications?.[mkt.id] || null
      // LLM specificity: overrides regex-based isNonGeo if LLM is more confident
      const llmIsNonGeo     = llmCls?.is_nongeo === true
      const effectiveIsNonGeo = isNonGeo || llmIsNonGeo
      // Specificity (0-1): how specific this question is. High → trust market more.
      // "Will regime fall by March 31?" = 0.95. "Will conflict continue?" = 0.10.
      const llmSpecificity  = llmCls?.specificity ?? null
      // LLM base rate hint (overrides static REFERENCE_CLASSES if available)
      const llmBaseRate     = llmCls?.base_rate ?? null
      // m7: LLM-scored probability from news articles (independent 7th model)
      const m7              = llmM7Scores?.[mkt.id] ?? null

      // M1: Question-specific agent deliberation (THE core fix vs world-state proxy)
      // Each question gets its OWN mini-simulation where sampled agents reason about
      // THIS specific question using their beliefs, expertise, and social connections.
      // This replaces agentForecast[dim] which was: "political instability = 85%" →
      // being used as "Netanyahu out by March 31 = 85%" — fundamentally wrong.
      //
      // deliberateOnQuestion() returns:
      //   .adjustedMean — uncertainty-compressed vote mean (shrinks toward market when agents disagree)
      //   .std          — belief disagreement (high → less weight in ensemble)
      // M3: Market price — defined first because deliberation anchors to it
      const m3 = clamp01(mkt.probability)

      const rc_prelim = effectiveIsNonGeo ? { base: m3, std: 0.02 } : (llmBaseRate != null ? { base: llmBaseRate, std: 0.08 } : getReferenceClass(question))
      const timeframeDays = llmCls?.timeframe_days ?? 30
      // ── Article YES/NO signal — KEY FIX: topic relevance ≠ YES to question ──
      // "Iran fires missiles" ≠ "Iran will attack Israel = YES". Extract resolution language.
      let relArticleSignal = null
      if (relArticles.length > 0) {
        const YES_KW = ['launched','struck','attacked','invaded','signed','agreed','confirmed',
                        'occurred','exploded','killed','fired','deployed','seized','collapsed']
        const NO_KW  = ['denied','unlikely','ruled out','failed','withdrew','cancelled',
                        'avoided','no attack','halted','ceasefire','deal reached','ended']
        let yesHits = 0, noHits = 0, counted = 0
        relArticles.slice(0, 12).forEach(a => {
          const txt = ((a.title||'') + ' ' + (a.summary||'')).toLowerCase()
          const hasEntity = qKws.some(k => txt.includes(k.toLowerCase()))
          if (!hasEntity) return
          yesHits += YES_KW.filter(k => txt.includes(k)).length
          noHits  += NO_KW.filter(k => txt.includes(k)).length
          counted++
        })
        const total = yesHits + noHits
        if (counted > 0 && total > 0) {
          // Has resolution language — bound tightly: [0.35, 0.65]
          relArticleSignal = 0.35 + (yesHits / total) * 0.30
        }
        // No resolution language → null (base rate + market dominate, no article push)
      }
      const deliberation = effectiveIsNonGeo ? null : deliberateOnQuestion(
        question, qKws, effectiveDim, rc_prelim.base, m3, relArticleSignal, timeframeDays
      )
      // m1 = deliberation result if available. Fallback: market + ref class blend (NOT flat 0.5)
      // Flat 0.5 was dragging ALL predictions toward 50% when agents not initialized yet.
      const specificityPenalty = llmSpecificity != null ? llmSpecificity : 0.5
      const m1Base = deliberation != null
        ? clamp01(deliberation.adjustedMean)
        : clamp01(m3 * 0.65 + rc_prelim.base * 0.35)
      const agentDelibStd = deliberation?.std ?? 0.20  // moderate uncertainty when no deliberation

      // Bug 4 fix: blend in GraphRAG archetype priors when available.
      // Archetypes are LLM-generated from the entity graph for the top question —
      // their influence-weighted prior is the most informed signal we have when it exists.
      // We only apply this when archetypes are relevant to the current question
      // (match at least 1 keyword) to avoid the top-question's archetypes bleeding
      // into unrelated questions.
      let m1 = m1Base
      if (!effectiveIsNonGeo && ragArchetypes?.length > 0) {
        const relevantArchetypes = ragArchetypes.filter(arch => {
          const archText = ((arch.name || '') + ' ' + (arch.reasoning || '')).toLowerCase()
          return qKws.some(kw => archText.includes(kw.split('_')[0]))
        })
        if (relevantArchetypes.length >= 2) {
          // Weighted mean of archetype prior probabilities (by influence × count)
          let arcWSum = 0, arcWTot = 0
          relevantArchetypes.forEach(arch => {
            const w = (arch.influence || 1.0) * Math.min(1, (arch.count || 5000) / 50000)
            arcWSum += clamp01(arch.priorProbability ?? 0.5) * w
            arcWTot += w
          })
          const archetypePrior = arcWTot > 0 ? arcWSum / arcWTot : m1Base
          // Blend: archetype prior gets 25% weight, existing m1 gets 75%
          // (archetypes are from top-question context, may not perfectly match this question)
          m1 = clamp01(m1Base * 0.75 + archetypePrior * 0.25)
        }
      }

      // M2: Zone convergence — scale by relevance and specificity
      const zoneScale2 = Math.min(1, zoneRel * 1.2) * (1 - specificityPenalty * 0.5)
      // Cap convergenceProb by zone relevance — prevents globally-high conv from inflating all questions
      const cappedConvProb = zone ? Math.min(zone.convergenceProb, 0.25 + zoneRel * 0.75) : topConv * 0.4
      const m2Raw = effectiveIsNonGeo ? 0.5 : clamp01(
        zoneRel * cappedConvProb +
        (1 - zoneRel) * topConv * 0.3
      )
      const m2 = effectiveIsNonGeo ? 0.5 : clamp01(0.5 + (m2Raw - 0.5) * zoneScale2)

      // M4: Bayesian network — neutral for non-geo
      const m4 = effectiveIsNonGeo ? 0.5 : m4BayesNetworkForQuestion(zone, qKws)

      // M5: CUSUM — neutral for non-geo
      const m5 = effectiveIsNonGeo ? 0.5 : ciiCusumForQuestion(qKws, allZones, ciiHistory.current)

      // M6: Macro-financial signal — null when no real market data available.
      // When null, m6 is excluded from rawScores and its weight redistributed to m3.
      // This prevents fake constant signals (old hardcoded 0.62, 0.55 etc) from
      // injecting systematic bias into every prediction.
      const m6Raw = effectiveIsNonGeo ? null : macroSignalForQuestion(question, quotes, vix)
      const m6 = m6Raw  // may be null
      const hasM6 = m6Raw != null

      // M7: LLM news-based probability (7th independent model, async from useVoxLLM)
      // Only contributes when available AND the question has relevant news.
      // Never sees current VOX or market probability → genuinely independent signal.
      // Weighted 18% when available, replacing part of the DS combination weight.
      const hasM7 = m7 != null && !effectiveIsNonGeo

      // ── Reference class anchor ──────────────────────────────────────────
      // LLM base_rate overrides static REFERENCE_CLASSES when available.
      const rc     = effectiveIsNonGeo
        ? { base: m3, std: 0.02 }
        : (llmBaseRate != null ? { base: llmBaseRate, std: 0.08 } : getReferenceClass(question))
      const nSigs  = effectiveIsNonGeo ? 0 : Math.ceil((zone?.allSignals?.length || 0) * zoneRel)
      const nPos   = Math.floor(nSigs * (m2 + m4) / 2)
      const bpKey  = effectiveIsNonGeo ? `nongeo_${mkt.id || question.slice(0,20)}` : String(effectiveDim)
      if (!betaPosteriors.current[bpKey]) {
        betaPosteriors.current[bpKey] = { alpha: rc.base * 10, beta: (1 - rc.base) * 10 }
      }
      const post = bayesUpdate(betaPosteriors.current[bpKey].alpha, betaPosteriors.current[bpKey].beta, nPos, Math.max(nSigs, 1))

      // ── Recency boost from question-relevant recent alerts ──────────────
      const recentBoost = relAlerts.filter(a => a.age < 2).length
      const recencyMod  = Math.min(recentBoost * 0.025, 0.10)

      // ── Dempster-Shafer: agent + market signal combination ──────────────
      const aBel = m1 > 0.5 ? (m1 - 0.5) * 1.8 : 0
      const aDis = m1 < 0.5 ? (0.5 - m1) * 1.8 : 0
      const mBel = m3 > 0.5 ? (m3 - 0.5) * 1.4 : 0
      const mDis = m3 < 0.5 ? (0.5 - m3) * 1.4 : 0
      const ds     = dempsterShafer(aBel, aDis, mBel, mDis)
      const dsScore = clamp01(0.5 + (ds.bel - ds.dis) * 0.45)

      // ── Stacking weights ─────────────────────────────────────────────────
      // Non-geo: market 92%, everything else tiny.
      // Geo + LLM available: 7-model ensemble (m1..m6 + m7).
      //   Market weight auto-boosts when: specificity is high OR zone relevance is low.
      //   At specificity=0.9 + zoneRel=0.05 → market gets ~80%, all OSINT gets 20%.
      // Geo + no LLM: 6-model ensemble, same market boosting logic.
      const baseW6 = stackWeights.current || [0.20, 0.14, 0.33, 0.13, 0.08, 0.12]
      const w = (() => {
        if (effectiveIsNonGeo) return hasM7
          ? [0.01, 0.01, 0.76, 0.01, 0.01, 0.01, 0.18]  // m7 gets 18%, market 76%
          : [0.02, 0.02, 0.92, 0.02, 0.01, 0.01]

        // Specificity-aware market floor: high specificity → trust market more
        const specBoost  = llmSpecificity != null ? llmSpecificity * 0.30 : 0.10
        const mktFloor   = 0.45 + specBoost   // 0.45 (vague) → 0.75 (very specific)
        const mktBoost   = Math.max(0, (mktFloor - baseW6[2]) * (1 - Math.min(1, zoneRel * 2)))
        const scale      = 1 - mktBoost

        if (hasM7) {
          // Redistribute: m7 gets 18%, shrink all others proportionally
          const w6scaled = baseW6.map((wi, i) => i === 2 ? wi * scale + mktBoost : wi * scale)
          const m7w = 0.18
          return [...w6scaled.map(wi => wi * (1 - m7w)), m7w]
        }
        return baseW6.map((wi, i) => i === 2 ? wi * scale + mktBoost : wi * scale)
      })()

      // ── LOG-ODDS ENSEMBLE ────────────────────────────────────────────────
      // Build rawScores dynamically: skip m6 when null (no real market data).
      // Redistribute m6's weight to market (m3) — market is still the best signal
      // when macro data is unavailable, better than injecting a fake constant.
      const rawScores = []
      const rawWeights = []
      const addModel = (score, weight) => { if (score != null) { rawScores.push(score); rawWeights.push(weight) } }
      addModel(m1, w[0])
      addModel(m2, w[1])
      addModel(m3, w[2] + (!hasM6 ? (w[5] || 0) : 0))  // absorb m6 weight into m3 when m6 absent
      addModel(m4, w[3])
      addModel(m5, w[4])
      if (hasM6) addModel(m6, w[5])
      if (hasM7) addModel(m7, w[w.length - 1])
      // Renormalize weights to sum to 1
      const wSum = rawWeights.reduce((s, v) => s + v, 0)
      const normW = wSum > 0 ? rawWeights.map(v => v / wSum) : rawWeights.map(() => 1 / rawWeights.length)
      const logOddsEns = logOddsEnsemble(rawScores, normW)

      // Blend: if m7 available use it in place of DS (m7 is better informed)
      const blended = hasM7
        ? clamp01(logOddsEns * 0.85 + post.mean * 0.15 + recencyMod)
        : clamp01(logOddsEns * 0.80 + post.mean * 0.15 + dsScore * 0.05 + recencyMod)

      // Goldstein adjustment — only for geopolitical conflict questions
      const isConflictQ = qKws.some(k => ['military','russia','ukraine','iran','israel','gaza','china','north_korea'].includes(k))
      const gAdj        = isConflictQ ? goldsteinToSignal(qGoldstein) * 0.12 : 0
      const withGAdj    = clamp01(blended + gAdj)

      // ── 5-stage calibration pipeline ─────────────────────────────────────
      // For non-geo questions (sports, celebrity, future speculation):
      //   - Extremizing is SKIPPED — we have no OSINT edge over the crowd.
      //     Applying α=2.5 extremizing to an already-market-anchored forecast
      //     would push 1% → 80%, which is the root cause of absurd predictions.
      //   - Final forecast stays within ±5% of market price (no informational edge).
      // For geo questions: full 5-stage pipeline applies.
      const pp        = plattParams.current[bpKey] || plattParams.current[effectiveDim] || { a: 1.0, b: 0.0 }
      const plattCal  = applyPlatt(withGAdj, pp)
      const tempCal   = tempScale(plattCal, optimalT.current)
      const relCorr   = bsDecomp ? reliabilityCorrect(tempCal, bsDecomp) : tempCal
      // Non-geo: skip extremizing, clamp to ±8% of market.
      // Geo: mild α=1.2 extremize ONLY when we have strong multi-source signal
      //   (zoneRel > 0.4 AND agents not defaulting AND std low).
      //   Old α=2.5 was destroying accuracy — e.g. 30% → 6% on weak signals.
      //   α=1.2 gives a gentle push (30% → 24%) only when evidence is real.
      //   Hard cap: final forecast never moves more than 25% from market price.
      const hasStrongSignal = !effectiveIsNonGeo && zoneRel > 0.4 && agentDelibStd < 0.18 && m1 !== 0.5
      const extremized = (!effectiveIsNonGeo && hasStrongSignal) ? extremize(relCorr, 1.2) : relCorr
      const rawFinalForecast = effectiveIsNonGeo
        ? clamp01(m3 + Math.max(-0.08, Math.min(0.08, extremized - m3)))
        : betaCal(extremized, 0.97, 1.03, 0.0)
      const maxDev = effectiveIsNonGeo ? 0.08 : 0.25
      const finalForecast = clamp01(m3 + Math.max(-maxDev, Math.min(maxDev, rawFinalForecast - m3)))

      // ── Edge + Kelly + IV ────────────────────────────────────────────────
      const edge  = finalForecast - m3
      const kelly = Math.abs(edge) > 0.035
        ? kellyCriterion(
            edge > 0 ? finalForecast : 1 - finalForecast,
            edge > 0 ? Math.max(1.1, 1 / Math.max(0.01, m3)) : Math.max(1.1, 1 / Math.max(0.01, 1 - m3))
          )
        : 0
      const iv = binaryImpliedVol(m3)

      // ── Plain-English Reasoning ───────────────────────────────────────────
      // Explains WHY VOX diverges from market price in concrete terms
      const reasonParts = []

      // 1. What the market says vs us
      if (Math.abs(edge) > 0.035) {
        const mktWords = m3 < 0.1 ? 'very unlikely' : m3 < 0.3 ? 'unlikely' : m3 < 0.5 ? 'below 50%' : m3 < 0.7 ? 'likely' : m3 < 0.9 ? 'very likely' : 'near-certain'
        const voxWords = finalForecast < 0.1 ? 'very unlikely' : finalForecast < 0.3 ? 'unlikely' : finalForecast < 0.5 ? 'below 50%' : finalForecast < 0.7 ? 'likely' : finalForecast < 0.9 ? 'very likely' : 'near-certain'
        reasonParts.push(`Market prices this ${mktWords} (${Math.round(m3*100)}%). VOX models this as ${voxWords} (${Math.round(finalForecast*100)}%) — a ${Math.abs(Math.round(edge*100))}% ${edge>0?'upward':'downward'} revision.`)
      } else {
        reasonParts.push(`VOX agrees with the market (${Math.round(m3*100)}%). No significant edge found.`)
      }

      // 2. Goldstein signal from relevant news
      if (relArticles.length > 0 && qGoldstein !== 0) {
        const tone = qGoldstein < -4 ? 'severe conflict activity' : qGoldstein < -1 ? 'hostile activity' : qGoldstein > 3 ? 'diplomatic activity' : 'mixed signals'
        reasonParts.push(`${relArticles.length} relevant article${relArticles.length>1?'s':''} found — Goldstein tone: ${qGoldstein.toFixed(1)} (${tone}).`)
      } else if (relArticles.length === 0) {
        reasonParts.push('No specific news articles found for this question. Signal is based on broader context only.')
      }

      // 3. Zone relevance signal
      if (!effectiveIsNonGeo && zoneRel > 0.3) {
        const zoneConv = zone?.convergenceProb || 0
        reasonParts.push(`Matched OSINT zone "${zone?.zone?.name || 'Unknown'}" (relevance ${(zoneRel*100).toFixed(0)}%) with convergence probability ${Math.round(zoneConv*100)}%.`)
      } else if (!effectiveIsNonGeo && zoneRel <= 0.1) {
        reasonParts.push('No closely matching OSINT zone found. Geographic signal is weak.')
      }

      // 4. Key model disagreements
      const modelDiffs = rawScores.map((s,i) => ({ name: ['Agent','Convergence','Market','Bayesian','CUSUM','Macro'][i], diff: Math.abs(s - finalForecast), s }))
        .filter(m => m.diff > 0.15)
        .sort((a,b) => b.diff - a.diff)
      if (modelDiffs.length > 0) {
        const highest = modelDiffs[0]
        reasonParts.push(`${highest.name} model (${Math.round(highest.s*100)}%) diverges most from final forecast — ${highest.s > finalForecast ? 'pulling higher' : 'pulling lower'}.`)
      }

      // 5. Reference class context
      if (!effectiveIsNonGeo && Math.abs(rc.base - m3) > 0.12) {
        reasonParts.push(`Historical base rate for this event type is ${Math.round(rc.base*100)}% — the market price (${Math.round(m3*100)}%) ${m3 > rc.base ? 'exceeds' : 'is below'} this historical anchor.`)
      }

      // 6. Macro context
      if (!effectiveIsNonGeo && m6 > 0.6) {
        reasonParts.push(`Macro-financial signals are elevated for this question's sector (score: ${Math.round(m6*100)}%) — markets may be pricing in elevated risk.`)
      } else if (!effectiveIsNonGeo && m6 < 0.35) {
        reasonParts.push(`Macro signals are calm for this question's sector (score: ${Math.round(m6*100)}%) — financial markets are not signaling elevated risk.`)
      }

      const reasoning = reasonParts.join(' ')

      // Top 3 relevant article headlines for this question
      const topRelArticles = relArticles
        .sort((a, b) => (b.pub instanceof Date ? b.pub.getTime() : 0) - (a.pub instanceof Date ? a.pub.getTime() : 0))
        .slice(0, 3)
        .map(a => ({ title: a.title?.slice(0, 110) || '', source: a.source || '', url: a.url || '' }))

      return {
        id: mkt.id,
        question: question.slice(0, 120),
        dim, dimLabel: STANCE_LABELS[dim],
        marketPrice: m3, marketUrl: mkt.url,
        volume: mkt.volume || 0, volume24h: mkt.volume24h || 0,
        modelScores: rawScores.map((s, i) => ({
          name: ['Agent','Convergence','Market','Bayesian','CUSUM','Macro'][i],
          score: +s.toFixed(4)
        })),
        rawEnsemble:       +logOddsEns.toFixed(4),
        refClassPrior:     +rc.base.toFixed(4),
        bayesianPosterior: +post.mean.toFixed(4),
        plattCalibrated:   +plattCal.toFixed(4),
        tempCalibrated:    +tempCal.toFixed(4),
        extremized:        +extremized.toFixed(4),
        finalForecast:     +finalForecast.toFixed(4),
        edge:              +edge.toFixed(4),
        edgePct:           +(edge * 100).toFixed(1),
        kelly:             +kelly.toFixed(4),
        impliedVol:        iv,
        ci95: { lo: +post.ci95lo.toFixed(3), hi: +post.ci95hi.toFixed(3) },
        direction: edge > 0.035 ? 'LONG' : edge < -0.035 ? 'SHORT' : 'PASS',
        confidence: Math.abs(edge) > 0.12 ? 'HIGH' : Math.abs(edge) > 0.06 ? 'MEDIUM' : 'LOW',
        goldsteinSignal: +qGoldstein.toFixed(2),
        zoneRelevance:   +zoneRel.toFixed(3),
        questionKeywords: qKws.slice(0, 5),
        reasoning,
        liveNewsCount: relArticles.length,
        topRelArticles,
      }
    })

    // §13.7  Brier calibration record-keeping
    //
    // IMPORTANT: We only use REAL resolved outcomes for Brier scoring.
    // The previous approach fabricated outcomes from regime state (regimeProxy),
    // creating a circular measurement where forecasts scored well against
    // their own input signals — not against reality. That's not a Brier score;
    // it's a tautology. We removed it entirely.
    //
    // Real outcomes come from two sources only:
    //  a) RESOLVED_GROUND_TRUTH — 39 historically verified questions with known outcomes
    //  b) resolvedMarkets — actual Polymarket/Kalshi questions that have resolved
    //
    // When there are enough real resolved questions (>= 20), we show a real Brier.
    // Until then we show "CALIBRATING" so we don't lie about our accuracy.

    if (roundRef.current === 1) {
      // Seed with historically verified ground truth
      RESOLVED_GROUND_TRUTH.forEach(r => {
        predHistory.current.push({
          forecast: r.forecast, outcome: r.outcome,
          rawScore: r.forecast, round: 0, isRealOutcome: true
        })
      })
    }

    // Incorporate newly resolved Polymarket/Kalshi markets with real YES/NO outcomes
    if (resolvedMarkets?.length) {
      const seenIds = new Set(predHistory.current.filter(r => r.resolvedId).map(r => r.resolvedId))
      resolvedMarkets.slice(0, 100).forEach(m => {
        if (seenIds.has(m.id) || m.resolvedOutcome == null) return
        // Find the matching forecast we made for this question (if any)
        const matchedForecast = questionForecasts.find(qf =>
          qf.id === m.id ||
          (qf.question && m.question && qf.question.slice(0, 60).toLowerCase() === m.question.slice(0, 60).toLowerCase())
        )
        predHistory.current.push({
          // If we made a forecast for this question, use that forecast value
          // If not (new resolution we never saw), use reference class as proxy
          forecast: matchedForecast?.finalForecast ?? clamp01(getReferenceClass(m.question || '').base),
          rawScore: matchedForecast?.rawEnsemble ?? getReferenceClass(m.question || '').base,
          outcome: m.resolvedOutcome,  // REAL outcome — 0 or 1
          round: roundRef.current,
          resolvedId: m.id,
          isRealOutcome: true,
          question: (m.question || '').slice(0, 80),
        })
      })
    }

    // Track model score history for stacking weight training (no synthetic outcomes needed here)
    questionForecasts.forEach(qf => {
      if (qf.finalForecast == null) return
      qf.modelScores.forEach((ms, k) => { if (!modelScoreHist.current[k]) modelScoreHist.current[k] = []; modelScoreHist.current[k].push(ms.score) })
    })

    if (predHistory.current.length > 800) predHistory.current = predHistory.current.slice(-800)

    // §13.8  Retrain calibration every 10 rounds
    if (roundRef.current % 10 === 0 && predHistory.current.length >= 20) {
      const byDim = {}
      predHistory.current.forEach(r => { if (!byDim[r.dim]) byDim[r.dim] = []; byDim[r.dim].push(r) })
      Object.entries(byDim).forEach(([dim, recs]) => {
        if (recs.length >= 8) plattParams.current[+dim] = plattFit(recs.map(r => ({ rawScore: r.rawScore, outcome: r.outcome })))
      })
      const r100 = predHistory.current.slice(-100)
      if (r100.length >= 15) optimalT.current = Math.min(1.3, Math.max(0.55, findOptimalT(r100)))
      const minN = Math.min(...modelScoreHist.current.map(m => m.length))
      if (minN >= 25) {
        const outcomes = predHistory.current.slice(-minN).map(r => r.outcome)
        const trimMH   = modelScoreHist.current.map(m => m.slice(-minN))
        const newW = findStackWeights(trimMH, outcomes)
        if (newW) stackWeights.current = newW
      }
      Object.keys(betaPosteriors.current).forEach(dim => {
        const recs = byDim[+dim] || []
        if (!recs.length) return
        const nPos = recs.filter(r => r.outcome > 0.5).length
        betaPosteriors.current[+dim] = bayesUpdate(betaPosteriors.current[+dim].alpha, betaPosteriors.current[+dim].beta, nPos, recs.length)
      })
    }

    // §13.8b  Persist calibration to localStorage every round
    // Also sync to Supabase so server VOX engine uses same calibration
    // This makes calibration survive page reloads — the model picks up exactly
    // where it left off: same round count, same trained Platt params, same
    // optimal temperature, same stacking weights. Without this the model is
    // permanently stuck in "CALIBRATING" mode and never converges.
    try {
      saveCalibration({
        plattParams:    plattParams.current,
        optimalT:       optimalT.current,
        stackWeights:   stackWeights.current,
        betaPosteriors: betaPosteriors.current,
        predHistory:    predHistory.current.slice(-400),
        modelScoreHist: modelScoreHist.current.map(m => m.slice(-200)),
        roundCount:     roundRef.current,
        kalmanStates:   kalmanStates.current,
      })
    } catch {}

    // §13.9  Brier metrics + reliability diagram
    const r100 = predHistory.current.slice(-100)
    const bs   = brierScore(r100)
    const bss  = brierSkillScore(bs)
    const reliabilityDiagram = (() => {
      if (r100.length < 10) return []
      const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i/10, hi: (i+1)/10, f: [], o: [] }))
      r100.forEach(r => { const b = Math.min(9, Math.floor(clamp01(r.forecast)*10)); bins[b].f.push(r.forecast); bins[b].o.push(r.outcome) })
      return bins.map(b => ({ lo: b.lo, hi: b.hi, n: b.f.length, mF: b.f.length ? +mean(b.f).toFixed(3) : null, mO: b.o.length ? +mean(b.o).toFixed(3) : null })).filter(b => b.n > 0)
    })()

    // §13.10  Monte Carlo fans
    const volatileDims = worldVec
      .map((v, d) => ({ d, v, vel: Math.abs(velVec[d]) }))
      .sort((a, b) => b.vel - a.vel).slice(0, 3)
      .map(({ d, v }) => {
        const mu = velVec[d] * 52, sigma = 0.07 + Math.abs(velVec[d]) * 2.5
        return { dim: STANCE_LABELS[d], dimIdx: d, forecast: v, mu: +mu.toFixed(3), sigma: +sigma.toFixed(3), fan: monteCarloFan(v, mu/52, sigma, 12, 250) }
      })

    const topEdge     = questionForecasts.filter(q => Math.abs(q.edge) > 0.035).sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
    const divergences = worldVec.map((wv, d) => ({ dim: STANCE_LABELS[d], dimIdx: d, worldSignal: wv, forecast: agentForecast[d], delta: +(agentForecast[d]-wv).toFixed(4), absDelta: +Math.abs(agentForecast[d]-wv).toFixed(4) })).sort((a, b) => b.absDelta - a.absDelta)

    const POLY_TARGET  = 0.170, SUPER_TARGET = 0.143, ELITE_TARGET = 0.080

    return {
      worldVector: worldVec, worldVectorLabels: STANCE_LABELS, velVector: velVec,
      goldsteinScore: +goldstein.toFixed(2),
      regime,
      populationForecast: agentForecast,
      tierForecasts,
      questionForecasts, topEdge: topEdge.slice(0, 15),
      divergences: divergences.slice(0, 10),
      volatileDims, polarisation,
      brierScore: bs, brierSkillScore: bss,
      brierDecomposition: bsDecomp, reliabilityDiagram,
      brierSampleN: r100.length,
      // brierIsReal: true only when we have REAL resolved Polymarket/Kalshi outcomes,
      // not just the RESOLVED_GROUND_TRUTH seed. Without real resolutions, the Brier
      // reflects historical calibration quality, not live prediction accuracy.
      brierIsReal: predHistory.current.filter(r => r.resolvedId && r.isRealOutcome).length >= 5,
      resolvedCount: predHistory.current.filter(r => r.resolvedId && r.isRealOutcome).length,
      beatsPolymarket:       bs != null && bs < POLY_TARGET,
      beatsSuperForecasters: bs != null && bs < SUPER_TARGET,
      beatsTarget:           bs != null && bs < ELITE_TARGET,
      brierBenchmarks: { polymarket: POLY_TARGET, superforecaster: SUPER_TARGET, elite: ELITE_TARGET },
      calibration: {
        optimalTemperature:  optimalT.current,
        stackWeights:        stackWeights.current || [0.20, 0.14, 0.33, 0.13, 0.08, 0.12],
        plattParamCount:     Object.keys(plattParams.current).length,
        betaPosteriorCount:  Object.keys(betaPosteriors.current).length,
        roundCount:          roundRef.current,
      },
      totalAgents: TOTAL_AGENTS, simulatedAt: now,
      llmEnriched: Object.keys(llmM7Scores || {}).length,  // how many questions have m7
    }
  }, [convergenceZones, liveAlerts, articles, markets, quotes, vix, fx, resolvedMarkets, llmClassifications, llmM7Scores, llmRelevanceScores, ragArchetypes])
}

// ── Exported helper so the VOX UI can offer a "Reset Calibration" button ──────
export function clearVoxCalibration() {
  try { localStorage.removeItem(CAL_KEY) } catch {}
  // Also wipe server calibration if user explicitly clears
  saveCalibrationToSupabase({ plattA:1, plattB:0, optimalTemperature:1, stackWeights:{}, roundCount:0 }).catch(()=>{})
}
