/**
 * useGraphRAG — MiroFish-style GraphRAG for NEXUS
 *
 * Pipeline (mirrors MiroFish graph_builder + ontology_generator):
 *   1. Batch articles into chunks → send to Groq for entity/event extraction
 *   2. Build an in-memory graph: nodes (entities) + edges (relationships/events)
 *   3. Cluster entities into archetypes (actor types with shared properties)
 *   4. Cache in localStorage — only re-run when articles change significantly
 *
 * Rate-limit strategy:
 *   - Uses llama-3.1-8b-instant (highest RPM on Groq free tier: 30 RPM)
 *   - Batches 4-5 articles per call → ~6-8 Groq calls for 30 articles
 *   - 2.5s jitter delay between calls → stays well under 30 RPM
 *   - Falls back gracefully — partial graph is better than no graph
 */

import { useState, useCallback, useRef } from 'react'
import { useStore } from '../store'

const GROQ_URL  = 'https://api.groq.com/openai/v1/chat/completions'
const FAST_MODEL = 'llama-3.1-8b-instant'   // 30 RPM, good enough for extraction
const CACHE_KEY  = 'nexus-graphrag-v2'
const CACHE_TTL  = 20 * 60 * 1000  // 20 min
const BATCH_SIZE = 4               // articles per Groq call
const DELAY_MS   = 2500            // ms between batches

// ── helpers ────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function cacheRead(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch { return null }
}
function cacheWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch {}
}

async function groqJSON(key, prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: FAST_MODEL,
          messages: [
            { role: 'system', content: 'You are a knowledge graph extraction engine. Always respond ONLY with valid JSON. No markdown, no explanation, no preamble.' },
            { role: 'user',   content: prompt },
          ],
          max_tokens:  1200,
          temperature: 0.0,
          stream:      false,
        }),
      })
      if (r.status === 429) {
        await sleep(6000 * (attempt + 1))  // back off on rate limit
        continue
      }
      if (!r.ok) throw new Error(`Groq ${r.status}`)
      const d = await r.json()
      const text = d.choices?.[0]?.message?.content || ''
      const cleaned = text.replace(/```json|```/g, '').trim()
      return JSON.parse(cleaned)
    } catch (e) {
      if (attempt === retries) return null
      await sleep(3000)
    }
  }
  return null
}

// ── ENTITY / EVENT EXTRACTION ─────────────────────────────────────────────────

const EXTRACTION_PROMPT = (articles) => `
Extract entities and events from these ${articles.length} intelligence articles.

ARTICLES:
${articles.map((a, i) => `[${i+1}] ${a.title || ''} — ${(a.summary || a.description || '').slice(0, 200)}`).join('\n')}

Return JSON with this exact structure:
{
  "entities": [
    {
      "id": "unique_slug",
      "name": "Entity Name",
      "type": "COUNTRY|PERSON|ORG|MILITARY|MARKET|CONCEPT",
      "tier": "power|money|shadow|civilian|specialist",
      "region": "region or null",
      "attributes": {"role": "...", "stance": "..."}
    }
  ],
  "events": [
    {
      "id": "evt_slug",
      "description": "What happened (1 sentence)",
      "type": "MILITARY|DIPLOMATIC|ECONOMIC|POLITICAL|CYBER|OTHER",
      "actors": ["entity_id1", "entity_id2"],
      "sentiment": -1.0,
      "intensity": 0.7,
      "date": "approximate date or null"
    }
  ],
  "edges": [
    {
      "source": "entity_id",
      "target": "entity_id",
      "relation": "OPPOSES|SUPPORTS|TRADES|ALLIES|THREATENS|NEGOTIATES",
      "weight": 0.8,
      "context": "brief context"
    }
  ]
}

Rules:
- Max 8 entities, 4 events, 6 edges per batch
- Only entities explicitly mentioned in articles
- tier = power(heads of state, military leaders), money(financial actors), shadow(intel agencies, proxies), specialist(analysts, tech), civilian(population)
- sentiment: -1.0=very negative, 0=neutral, +1.0=very positive (from this event's perspective)
- intensity: 0-1 how significant/urgent this event is
`

// ── ARCHETYPE GENERATION ──────────────────────────────────────────────────────
// After building the graph, cluster entities into simulation archetypes
// Each archetype = a "character role" in the deliberation simulation

const ARCHETYPE_PROMPT = (graphSummary, question) => `
Given this geopolitical entity graph and prediction question, generate 5 agent archetypes.

GRAPH SUMMARY:
${graphSummary}

QUESTION TO PREDICT: ${question}

Generate 5 archetypes that would have MEANINGFULLY DIFFERENT opinions on this question:
Return JSON:
{
  "archetypes": [
    {
      "id": "archetype_slug",
      "name": "Archetype Name (e.g. 'Iranian Hardliner', 'Western Intel Analyst')",
      "tier": "power|money|shadow|specialist|civilian",
      "baseBeliefs": {
        "description": "How they see the world in 1 sentence",
        "riskTolerance": 0.3,
        "informationAccess": 0.85,
        "anchoring": 0.6,
        "confirmationBias": 0.4,
        "optimism": -0.1
      },
      "priorProbability": 0.15,
      "reasoning": "Why they think what they think about the question (2-3 sentences)",
      "influence": 2.5,
      "count": 12000
    }
  ]
}

Rules:
- Each archetype must have a DIFFERENT prior probability (span from 0.05 to 0.85)
- Make archetypes genuinely ideologically diverse — not all moderate
- Archetypes should reflect entities actually present in the graph
- count = how many of the 260k agent society they represent
`

// ── MAIN HOOK ─────────────────────────────────────────────────────────────────

export function useGraphRAG() {
  const { keys } = useStore()
  const [graph, setGraph]           = useState(null)   // { entities, events, edges }
  const [archetypes, setArchetypes] = useState([])
  const [building, setBuilding]     = useState(false)
  const [progress, setProgress]     = useState(0)
  const [error, setError]           = useState(null)
  const abortRef = useRef(false)

  const buildGraph = useCallback(async (articles, question = '') => {
    const groqKey = keys?.groq
    if (!groqKey || !articles?.length) return

    // Check cache — use article fingerprint to detect staleness
    const fingerprint = articles.slice(0, 20).map(a => a.title?.slice(0, 30)).join('|')
    const cached = cacheRead(CACHE_KEY)
    if (cached?.fingerprint === fingerprint && cached.graph) {
      setGraph(cached.graph)
      setArchetypes(cached.archetypes || [])
      return cached
    }

    setBuilding(true)
    setProgress(0)
    setError(null)
    abortRef.current = false

    const allEntities = {}   // id → entity (deduplicated)
    const allEvents   = []
    const allEdges    = []   // source+target+relation → edge (deduplicated)
    const edgeMap     = new Set()

    try {
      // ── Step 1: Extract entities + events from batches of articles ─────────
      const batches = []
      for (let i = 0; i < Math.min(articles.length, 40); i += BATCH_SIZE) {
        batches.push(articles.slice(i, i + BATCH_SIZE))
      }

      for (let b = 0; b < batches.length; b++) {
        if (abortRef.current) break
        setProgress(Math.round((b / batches.length) * 70))

        const result = await groqJSON(groqKey, EXTRACTION_PROMPT(batches[b]))

        if (result?.entities) {
          result.entities.forEach(e => {
            if (!allEntities[e.id]) allEntities[e.id] = { ...e, mentionCount: 0 }
            allEntities[e.id].mentionCount = (allEntities[e.id].mentionCount || 0) + 1
          })
        }
        if (result?.events) {
          result.events.forEach(ev => allEvents.push({ ...ev, batchIdx: b }))
        }
        if (result?.edges) {
          result.edges.forEach(eg => {
            const key = `${eg.source}|${eg.target}|${eg.relation}`
            if (!edgeMap.has(key)) {
              edgeMap.add(key)
              allEdges.push(eg)
            }
          })
        }

        if (b < batches.length - 1) await sleep(DELAY_MS)
      }

      setProgress(75)

      // ── Step 2: Compute entity influence scores (degree + mention count) ────
      const entityList = Object.values(allEntities)
      entityList.forEach(e => {
        const degree = allEdges.filter(ed => ed.source === e.id || ed.target === e.id).length
        e.influenceScore = Math.min(1, (degree * 0.15 + (e.mentionCount || 0) * 0.08))
      })
      // Sort by influence for display
      entityList.sort((a, b) => b.influenceScore - a.influenceScore)

      const graph = {
        entities:    entityList,
        events:      allEvents,
        edges:       allEdges,
        fingerprint,
        builtAt:     Date.now(),
        articleCount: articles.length,
      }

      setGraph(graph)
      setProgress(82)

      // ── Step 3: Generate question-specific archetypes from graph ───────────
      if (question && entityList.length > 0 && !abortRef.current) {
        await sleep(DELAY_MS)  // rate limit pause

        const topEntities = entityList.slice(0, 12)
        const graphSummary = [
          `Entities (${entityList.length} total, showing top 12):`,
          topEntities.map(e => `  - ${e.name} [${e.type}/${e.tier}] influence:${e.influenceScore.toFixed(2)}`).join('\n'),
          `\nKey relationships:`,
          allEdges.slice(0, 12).map(ed => `  - ${ed.source} ${ed.relation} ${ed.target} (weight:${ed.weight})`).join('\n'),
          `\nRecent events (${allEvents.length} total):`,
          allEvents.slice(0, 6).map(ev => `  - [${ev.type}] ${ev.description}`).join('\n'),
        ].join('\n')

        const archetypeResult = await groqJSON(groqKey, ARCHETYPE_PROMPT(graphSummary, question))

        if (archetypeResult?.archetypes) {
          setArchetypes(archetypeResult.archetypes)
          graph.archetypes = archetypeResult.archetypes
          graph.archetypeQuestion = question
        }
      }

      setProgress(100)
      cacheWrite(CACHE_KEY, { graph, archetypes: graph.archetypes || [], fingerprint })
      return graph

    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setBuilding(false)
    }
  }, [keys])

  const abort = useCallback(() => { abortRef.current = true }, [])

  return { graph, archetypes, building, progress, error, buildGraph, abort }
}
