/**
 * useVoxLLM — LLM-powered signal enrichment for VOX forecasting
 *
 * THREE independent LLM tasks, each improving a different failure mode:
 *
 * TASK 1 — Question Classification
 *   Input:  raw question text
 *   Output: { category, specificity (0-1), actors[], timeframe_days, base_rate_hint }
 *   Use:    specificity directly controls how much we trust market vs OSINT signals.
 *           "Will Iranian regime fall by March 31?" → specificity=0.95, category="regime_change"
 *           "Will there be conflict in Middle East?" → specificity=0.10, category="conflict"
 *   Bias:   NONE — classification has no directional opinion on YES/NO
 *
 * TASK 2 — Article→Question Relevance Scoring
 *   Input:  list of article headlines + question text
 *   Output: { articleIdx: relevanceScore } (0-1 per article)
 *   Use:    replaces crude keyword matching in articleRelevance().
 *           Fixes the signal bleed where "Iran conflict" articles boost
 *           "Golden State Warriors win NBA Finals" via keyword overlap.
 *   Bias:   NONE — only measures topical similarity, not prediction direction
 *
 * TASK 3 — News-Based Resolution Probability (m7)
 *   Input:  question + top 5 relevant articles (headlines + snippets only)
 *   Output: probability 0-1
 *   Use:    becomes 7th model in ensemble, weighted 15-20%.
 *           This is where LLM DOES add directional signal — but it only sees news,
 *           never the current VOX or market probability, so it's independent.
 *   Bias:   Minimal — LLM reads same news humans read, has same access to info
 *           as superforecasters. Weight kept at 15-20% so it can't dominate.
 *
 * CACHING: All outputs cached in localStorage per question ID + article hash.
 *   Cache TTL: 4 hours for classification, 30 min for news scoring.
 *   This means the LLM runs ~once per question per news cycle, not every render.
 *
 * RATE LIMITING: Max 3 concurrent requests, 1 req/sec to Groq free tier.
 *   Batches 5 questions per call for classification, 3 articles per question for m7.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const GROQ_URL  = 'https://api.groq.com/openai/v1/chat/completions'
const LLM_MODEL = 'llama-3.1-8b-instant'   // fast + free tier — 8B is fine for classification
const LLM_MODEL_M7 = 'llama-3.3-70b-versatile'  // 70B for actual probability estimation

const CACHE_KEY_CLASS   = 'nexus-vox-llm-class-v1'
const CACHE_KEY_REL     = 'nexus-vox-llm-rel-v1'
const CACHE_KEY_M7      = 'nexus-vox-llm-m7-v1'
const CLASS_TTL         = 24 * 60 * 60 * 1000   // 24h — question classification rarely changes
const REL_TTL           = 30 * 60 * 1000          // 30 min — news relevance updates with news
const M7_TTL            = 45 * 60 * 1000          // 45 min — m7 probability updates with news

// ── localStorage cache helpers ────────────────────────────────────────────────
function cacheLoad(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
}
function cacheSave(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}
function cacheGet(store, id, ttl) {
  const entry = store[id]
  if (!entry) return null
  if (Date.now() - entry.ts > ttl) return null
  return entry.value
}
function cacheSet(store, id, value) {
  store[id] = { ts: Date.now(), value }
}

// ── Groq fetch (non-streaming, JSON mode) ─────────────────────────────────────
async function groqJSON(apiKey, systemPrompt, userPrompt, maxTokens = 300) {
  const models = [LLM_MODEL, 'llama3-8b-8192', 'gemma2-9b-it']
  for (const model of models) {
    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens:  maxTokens,
          temperature: 0.0,   // deterministic — we want stable classifications
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.status === 429) { await new Promise(res => setTimeout(res, 2000)); continue }
      if (!r.ok) continue
      const d = await r.json()
      const text = d.choices?.[0]?.message?.content || '{}'
      return JSON.parse(text)
    } catch { continue }
  }
  return null
}

async function groqJSONHeavy(apiKey, systemPrompt, userPrompt, maxTokens = 200) {
  const models = [LLM_MODEL_M7, 'llama-3.1-70b-versatile', LLM_MODEL]
  for (const model of models) {
    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens:  maxTokens,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (r.status === 429) { await new Promise(res => setTimeout(res, 2500)); continue }
      if (!r.ok) continue
      const d = await r.json()
      const text = d.choices?.[0]?.message?.content || '{}'
      return JSON.parse(text)
    } catch { continue }
  }
  return null
}

// ── TASK 1: Question Classification ──────────────────────────────────────────
const CLASS_SYS = `You are a forecasting question classifier. Output ONLY valid JSON.
For each question, output its index as key, with these exact fields:
  category: one of "regime_change|ceasefire|military_action|election|economic|fed_rates|commodity_price|sports|celebrity|speculative_future|diplomatic|territorial|nuclear|cyber|humanitarian"
  specificity: float 0-1. 1.0 = extremely specific (one named event on one date). 0.1 = vague ongoing condition.
  actors: array of up to 3 main named actors/countries (strings)
  timeframe_days: integer days until deadline (estimate from question text)
  is_nongeo: boolean — true for sports, celebrity, entertainment, far-future (2028+) elections
  base_rate: float 0-1, historical base rate for this category of event in this timeframe
Do not add commentary. Output only the JSON object.`

async function classifyQuestions(apiKey, questions) {
  // Batch up to 8 questions per call
  const batches = []
  for (let i = 0; i < questions.length; i += 8) batches.push(questions.slice(i, i + 8))
  const results = {}
  for (const batch of batches) {
    const prompt = batch.map((q, i) => `${i}: "${q.question}"`).join('\n')
    const raw = await groqJSON(apiKey,
      CLASS_SYS,
      `Classify these ${batch.length} forecasting questions:\n${prompt}`,
      400
    )
    if (!raw) continue
    batch.forEach((q, i) => {
      if (raw[i] || raw[String(i)]) {
        results[q.id] = raw[i] || raw[String(i)]
      }
    })
    if (batches.length > 1) await new Promise(r => setTimeout(r, 1000)) // rate limit
  }
  return results
}

// ── TASK 2: Article→Question Relevance ───────────────────────────────────────
const REL_SYS = `You are a news relevance scorer. Output ONLY valid JSON.
Given a forecasting question and article headlines, score each article's relevance to the question.
Output: { "0": 0.95, "1": 0.10, "2": 0.40 ... } (index: relevance 0-1)
Rules:
- 0.9-1.0: article directly reports on the specific event/actors in the question
- 0.5-0.8: article is about same actors or same region but different specific event
- 0.2-0.4: article is tangentially related (same country, different event)
- 0.0-0.1: article is unrelated
Score based on content relevance to the SPECIFIC question, not just keyword overlap.`

async function scoreArticleRelevance(apiKey, question, articles) {
  if (!articles.length) return {}
  const articleList = articles.slice(0, 15).map((a, i) =>
    `${i}: "${(a.title || '').slice(0, 120)}"`
  ).join('\n')
  const raw = await groqJSON(apiKey,
    REL_SYS,
    `Question: "${question}"\n\nArticles:\n${articleList}\n\nScore each article's relevance.`,
    200
  )
  if (!raw) return {}
  const out = {}
  Object.entries(raw).forEach(([k, v]) => {
    const idx = parseInt(k)
    if (!isNaN(idx) && typeof v === 'number') out[idx] = Math.max(0, Math.min(1, v))
  })
  return out
}

// ── TASK 3: m7 — News-Based Resolution Probability ───────────────────────────
const M7_SYS = `You are a superforecaster. Output ONLY valid JSON with exactly two fields.
Rules for estimating YES probability:
- Read the articles carefully. Identify which directly report on the actors/events in the question.
- Use base rate as your STARTING POINT, then adjust based on what the articles actually say.
- Adjust UP from base rate if: articles report the event is underway, imminent, or already confirmed.
- Adjust DOWN from base rate if: articles report the event was cancelled, denied, failed, or is unlikely.
- If articles are genuinely irrelevant to the question, return the base rate unchanged.
- Do NOT anchor so hard to base rate that you ignore clear article evidence.
- Be a calibrated forecaster: move meaningfully when evidence warrants it.
- Output: { "probability": 0.XX, "confidence": "low|medium|high" }`

async function scoreM7(apiKey, question, topArticles, baseRate = 0.5) {
  if (!topArticles.length) return null
  const articleText = topArticles.slice(0, 5).map((a, i) =>
    `[${i+1}] ${(a.title || '').slice(0, 100)}${a.summary ? ' — ' + a.summary.slice(0, 150) : ''}`
  ).join('\n')
  const raw = await groqJSONHeavy(apiKey,
    M7_SYS,
    `Forecasting question: "${question}"\nBase rate for this event type: ${(baseRate * 100).toFixed(0)}%\n\nArticles to analyze:\n${articleText}\n\nEstimate YES probability.`,
    100
  )
  if (!raw || typeof raw.probability !== 'number') return null
  // If confidence is low, blend toward base rate (LLM is uncertain, don't trust it fully)
  const p = Math.max(0.01, Math.min(0.99, raw.probability))
  if (raw.confidence === 'low') return Math.max(0.01, Math.min(0.99, p * 0.5 + baseRate * 0.5))
  return p
}

// ── Simple hash for cache keys ────────────────────────────────────────────────
function hash(str) {
  let h = 0
  for (let i = 0; i < Math.min(str.length, 200); i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

// ── MAIN HOOK ─────────────────────────────────────────────────────────────────
export function useVoxLLM({ markets, articles, groqKey, enabled = true }) {
  const [classifications, setClassifications] = useState({})   // questionId → classification
  const [relevanceScores, setRelevanceScores]  = useState({})   // `${qId}_${articleHash}` → score
  const [m7Scores, setM7Scores]                = useState({})   // questionId → probability
  const [status, setStatus] = useState('idle')  // idle | running | done | error
  const running = useRef(false)
  const lastMarketsHash = useRef('')
  const lastArticlesHash = useRef('')

  const run = useCallback(async () => {
    if (!enabled || !groqKey || running.current) return
    const key = groqKey.trim()
    if (!key || key.length < 20) return

    // Only re-run if markets or articles changed meaningfully
    const mHash = hash((markets || []).map(m => m.id || m.question || '').slice(0, 30).join('|'))
    const aHash = hash((articles || []).map(a => a.title || '').slice(0, 20).join('|'))
    if (mHash === lastMarketsHash.current && aHash === lastArticlesHash.current) return
    lastMarketsHash.current = mHash
    lastArticlesHash.current = aHash

    running.current = true
    setStatus('running')

    try {
      const classCache = cacheLoad(CACHE_KEY_CLASS)
      const relCache   = cacheLoad(CACHE_KEY_REL)
      const m7Cache    = cacheLoad(CACHE_KEY_M7)

      const geoMarkets = (markets || [])
        .filter(m => m.isGeo && m.probability != null && m.question)
        .slice(0, 40)

      // ── TASK 1: Classify uncached questions ──────────────────────────────
      const unclassified = geoMarkets.filter(m => !cacheGet(classCache, m.id, CLASS_TTL))
      if (unclassified.length > 0) {
        const newClasses = await classifyQuestions(key, unclassified)
        Object.entries(newClasses).forEach(([id, cls]) => cacheSet(classCache, id, cls))
        cacheSave(CACHE_KEY_CLASS, classCache)
      }
      // Load all classifications into state
      const allClass = {}
      geoMarkets.forEach(m => {
        const c = cacheGet(classCache, m.id, CLASS_TTL)
        if (c) allClass[m.id] = c
      })
      setClassifications(allClass)

      // ── TASK 2 + 3: Score articles and run m7 for top questions ──────────
      // Run m7 on ALL geo markets, prioritized by volume + mid-range probability.
      // Old code only ran on extremes (<15% or >75%), missing the entire 15-75%
      // range where geopolitical uncertainty is highest and LLM adds most value.
      const prioritized = geoMarkets
        .slice()
        .sort((a, b) => {
          const aScore = (a.volume || 0) * 0.001 + (a.probability > 0.15 && a.probability < 0.75 ? 2 : 0)
          const bScore = (b.volume || 0) * 0.001 + (b.probability > 0.15 && b.probability < 0.75 ? 2 : 0)
          return bScore - aScore
        })
        .slice(0, 20)

      const newRelScores = {}
      const newM7 = {}

      for (const mkt of prioritized) {
        await new Promise(r => setTimeout(r, 400))  // 400ms between questions — rate limit

        const question = mkt.question || ''
        const cls = allClass[mkt.id]
        if (cls?.is_nongeo) continue  // skip sports/celebrity — LLM would just parrot market

        // Build article hash for this question's article set
        const topArticles = (articles || [])
          .filter(a => a.title)
          .slice(0, 20)  // check top 20 for relevance

        const relCacheKey = `${mkt.id}_${hash(topArticles.map(a => a.title).join('|'))}`

        let relScores = cacheGet(relCache, relCacheKey, REL_TTL)
        if (!relScores) {
          relScores = await scoreArticleRelevance(key, question, topArticles)
          if (relScores && Object.keys(relScores).length > 0) {
            cacheSet(relCache, relCacheKey, relScores)
          }
        }
        if (relScores) newRelScores[mkt.id] = relScores

        await new Promise(r => setTimeout(r, 300))

        // m7: only for questions that have at least some relevant articles
        const relevantArticles = topArticles.filter((_, i) => (relScores?.[i] || 0) > 0.3)
        const m7CacheKey = `${mkt.id}_${hash(relevantArticles.map(a => a.title).join('|'))}`
        let m7 = cacheGet(m7Cache, m7CacheKey, M7_TTL)
        if (m7 === null && relevantArticles.length >= 1) {
          const baseRate = cls?.base_rate ?? 0.5
          m7 = await scoreM7(key, question, relevantArticles, baseRate)
          if (m7 !== null) cacheSet(m7Cache, m7CacheKey, m7)
        }
        if (m7 !== null) newM7[mkt.id] = m7
      }

      cacheSave(CACHE_KEY_REL, relCache)
      cacheSave(CACHE_KEY_M7, m7Cache)

      setRelevanceScores(prev => ({ ...prev, ...newRelScores }))
      setM7Scores(prev => ({ ...prev, ...newM7 }))
      setStatus('done')

    } catch (e) {
      console.warn('[useVoxLLM] error:', e.message)
      setStatus('error')
    } finally {
      running.current = false
    }
  }, [markets, articles, groqKey, enabled])

  // Run on mount and whenever markets/articles change (with 3s debounce)
  const timerRef = useRef(null)
  useEffect(() => {
    if (!enabled || !groqKey) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(run, 3000)  // 3s debounce — don't run mid-render
    return () => clearTimeout(timerRef.current)
  }, [run, enabled, groqKey])

  return {
    classifications,    // { questionId: { category, specificity, actors, timeframe_days, is_nongeo, base_rate } }
    relevanceScores,    // { questionId: { articleIdx: score } }
    m7Scores,           // { questionId: probability 0-1 }
    status,
    // Helper: get LLM-improved article relevance for a question
    getArticleRelevance: (questionId, articleIdx) => relevanceScores[questionId]?.[articleIdx] ?? null,
    // Helper: get m7 probability for a question
    getM7: (questionId) => m7Scores[questionId] ?? null,
    // Helper: get classification for a question
    getClass: (questionId) => classifications[questionId] ?? null,
  }
}

// Exported for debugging in console
export function clearVoxLLMCache() {
  try {
    localStorage.removeItem(CACHE_KEY_CLASS)
    localStorage.removeItem(CACHE_KEY_REL)
    localStorage.removeItem(CACHE_KEY_M7)
  } catch {}
}
