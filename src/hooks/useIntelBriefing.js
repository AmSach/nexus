/**
 * useIntelBriefing — Groq-powered global intelligence summary
 *
 * Maxes out the context window with:
 * - Live satellite signals (earthquakes, conflict, aircraft, ships, disasters)
 * - Clustered news articles (TF-IDF embedded, grouped by topic)
 * - Prediction market probabilities (Kalshi + Polymarket)
 * - VOX world vector state (24-dim geopolitical risk)
 * - ACPL signal triage output (what the model flagged as high-priority)
 * - Convergence zone alerts
 *
 * Model: llama-3.3-70b-versatile (128k context, best quality)
 * Target: ~100k tokens of context, streaming output
 * Cadence: regenerates when signal count changes significantly OR on demand
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL    = 'llama-3.3-70b-versatile'
const MAX_CTX  = 100_000   // tokens to fill (model supports 128k)
const MAX_OUT  = 4_096     // output tokens

// Rough token estimator: ~4 chars/token
const estTokens = (s) => Math.ceil((s || '').length / 4)

function buildContext({ signals, articles, markets, worldVec, convergence, clusteredArticles, acplStats }) {
  const parts = []
  const now = new Date().toUTCString()

  // ── Header ────────────────────────────────────────────────────────────────
  parts.push(`NEXUS INTELLIGENCE PLATFORM — GLOBAL SITUATION REPORT
Generated: ${now}
Classification: OPEN SOURCE INTELLIGENCE (OSINT)
═══════════════════════════════════════════════════════════════════`)

  // ── VOX World State ───────────────────────────────────────────────────────
  if (worldVec?.length >= 24) {
    const dims = [
      'Political Instability','Stability','Kinetic Conflict','Diplomacy','Convergence',
      'De-escalation','Nuclear Risk','Cyber Threat','Disease Risk','Electoral Instability',
      'Climate','Economic Stress','Market Risk','Inflation','Currency Stress',
      'Trade','Energy','Market Sentiment','Leverage','Equity Risk',
      'Supply Chain','Trade War','Sanctions','Chokepoints'
    ]
    const high = worldVec.map((v, i) => ({ dim: dims[i], v })).filter(x => x.v > 0.55).sort((a,b) => b.v - a.v)
    parts.push(`\n── GEOPOLITICAL RISK VECTOR (VOX World State, Kalman-filtered) ──
${high.map(x => `  ${x.dim.padEnd(24)}: ${(x.v*100).toFixed(1)}%`).join('\n')}
${worldVec.map((v,i) => `${dims[i]}: ${(v*100).toFixed(0)}%`).join(' | ')}`)
  }

  // ── Convergence Zones ─────────────────────────────────────────────────────
  const zones = convergence?.criticalZones || convergence?.zones || []
  if (zones.length > 0) {
    parts.push(`\n── SIGNAL CONVERGENCE ALERTS (${zones.length} active zones) ──`)
    zones.slice(0, 15).forEach(z => {
      parts.push(`  [${(z.convergenceProb*100||0).toFixed(0)}%] ${z.zone?.name || z.name} — ${z.independentGroups || 0} independent sources${z.escalating ? ' ↑ ESCALATING' : ''}`)
    })
  }

  // ── Live Satellite Signals ────────────────────────────────────────────────
  const critSigs = (signals || []).filter(s => s.severity === 'critical')
  const highSigs = (signals || []).filter(s => s.severity === 'high').slice(0, 60)
  const allSigs  = [...critSigs, ...highSigs]

  if (allSigs.length > 0) {
    parts.push(`\n── LIVE SATELLITE & SENSOR SIGNALS (${(signals||[]).length} total, showing critical+high) ──`)

    // Group by type
    const byType = {}
    allSigs.forEach(s => {
      const t = s.type || 'other'
      if (!byType[t]) byType[t] = []
      byType[t].push(s)
    })

    const typeLabels = {
      earthquake: '🌍 SEISMIC', aircraft: '✈ AIRCRAFT', milaircraft: '✈ MILITARY AIR',
      ship: '🚢 MARITIME', warship: '⚔ WARSHIP', conflict: '⚔ CONFLICT',
      gdacs: '⚠ DISASTER', hurricane: '🌀 STORM', volcano: '🌋 VOLCANO',
      disease: '🦠 DISEASE', nuclear: '☢ NUCLEAR', cyber: '💻 CYBER',
      firms: '🔥 FIRE', notam: '✈ NOTAM', sigmet: '⛈ SIGMET',
      humanitarian: '🆘 HUMANITARIAN', alert: '🚨 ALERT',
    }

    Object.entries(byType).forEach(([type, sigs]) => {
      const label = typeLabels[type] || type.toUpperCase()
      parts.push(`\n  ${label} (${sigs.length}):`)
      sigs.slice(0, 20).forEach(s => {
        const loc = s.lat && s.lng ? ` [${s.lat.toFixed(2)}°, ${s.lng.toFixed(2)}°]` : ''
        const meta = s.meta?.mag ? ` M${s.meta.mag}` : s.meta?.cveID ? ` ${s.meta.cveID}` : ''
        parts.push(`    • [${s.severity.toUpperCase()}]${loc}${meta} ${s.name || ''}`)
        if (s.desc) parts.push(`      ${s.desc.slice(0, 120)}`)
      })
    })
  }

  // ── Prediction Markets ────────────────────────────────────────────────────
  const geoMkts = (markets || [])
    .filter(m => m.is_geo && m.probability != null)
    .sort((a,b) => Math.abs(b.probability - 0.5) - Math.abs(a.probability - 0.5))
    .slice(0, 40)

  if (geoMkts.length > 0) {
    parts.push(`\n── PREDICTION MARKETS — GEOPOLITICAL (${geoMkts.length} active) ──`)
    geoMkts.forEach(m => {
      const pct = ((m.probability || 0) * 100).toFixed(0)
      const bar = '█'.repeat(Math.round((m.probability||0)*10)) + '░'.repeat(10-Math.round((m.probability||0)*10))
      parts.push(`  ${pct.padStart(3)}% ${bar} ${(m.title||'').slice(0,80)}`)
    })
  }

  // ── News Articles by Cluster ──────────────────────────────────────────────
  const clusterOrder = [
    'ukraine_russia','middle_east','china_taiwan','nuclear','cyber',
    'economics','elections','humanitarian','energy','finance','health','diplomacy'
  ]
  const clusterNames = {
    ukraine_russia: '🇺🇦 UKRAINE / RUSSIA',
    middle_east:    '🕌 MIDDLE EAST',
    china_taiwan:   '🇨🇳 CHINA / TAIWAN',
    nuclear:        '☢ NUCLEAR / WMD',
    cyber:          '💻 CYBER / TECH',
    economics:      '📊 ECONOMICS / SANCTIONS',
    elections:      '🗳 ELECTIONS / POLITICS',
    humanitarian:   '🆘 HUMANITARIAN',
    energy:         '⛽ ENERGY',
    finance:        '💰 FINANCE / MARKETS',
    health:         '🦠 HEALTH / DISEASE',
    diplomacy:      '🤝 DIPLOMACY',
  }

  // Token budget tracking
  let tokensSoFar = estTokens(parts.join('\n'))
  const TOKEN_BUDGET = MAX_CTX - MAX_OUT - 2000  // reserve for system prompt + output

  if (clusteredArticles && Object.keys(clusteredArticles).length > 0) {
    parts.push(`\n── NEWS INTELLIGENCE BY TOPIC CLUSTER ──`)
    for (const cluster of clusterOrder) {
      const arts = clusteredArticles[cluster] || []
      if (!arts.length) continue
      if (tokensSoFar > TOKEN_BUDGET) break

      const sectionHeader = `\n  ${clusterNames[cluster] || cluster.toUpperCase()} (${arts.length} articles):`
      parts.push(sectionHeader)
      tokensSoFar += estTokens(sectionHeader)

      for (const a of arts.slice(0, 25)) {
        if (tokensSoFar > TOKEN_BUDGET) break
        const line = `    • [${a.source || '?'}] ${a.title || ''}`
        parts.push(line)
        tokensSoFar += estTokens(line)
      }
    }
  } else if ((articles||[]).length > 0) {
    // Fallback: no clusters, just dump articles
    parts.push(`\n── RECENT NEWS INTELLIGENCE (${articles.length} articles) ──`)
    for (const a of (articles||[]).slice(0, 150)) {
      if (tokensSoFar > TOKEN_BUDGET) break
      const line = `  • [${a.source||'?'}] ${a.title||''}`
      parts.push(line)
      tokensSoFar += estTokens(line)
    }
  }

  // ── ACPL Model State ──────────────────────────────────────────────────────
  if (acplStats) {
    parts.push(`\n── ACPL MODEL STATE ──
  Steps: ${acplStats.totalSteps || 0} | CE Loss: ${acplStats.ceLoss?.toFixed(4) || 'n/a'} | DQN Loss: ${acplStats.dqnLoss?.toFixed(4) || 'n/a'}
  ε: ${acplStats.epsilon?.toFixed(3) || 'n/a'} | FP Rate: ${((acplStats.falsePositiveRate||0)*100).toFixed(1)}% | Suppressed: ${acplStats.suppressed||0} | Escalated: ${acplStats.escalated||0}`)
  }

  const context = parts.join('\n')
  return { context, estimatedTokens: estTokens(context) }
}

export function useIntelBriefing({ signals, articles, markets, worldVec, convergence, clusteredArticles, acplStats, groqKey, enabled = true }) {
  const [briefing, setBriefing]   = useState('')
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState(null)
  const [tokens,   setTokens]     = useState(0)
  const [lastRun,  setLastRun]    = useState(null)
  const abortRef  = useRef(null)
  const prevCount = useRef(0)

  const generate = useCallback(async () => {
    if (!groqKey || !enabled) return
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setLoading(true); setError(null); setBriefing('')

    const { context, estimatedTokens } = buildContext({
      signals, articles, markets, worldVec, convergence, clusteredArticles, acplStats
    })
    setTokens(estimatedTokens)

    const systemPrompt = `You are NEXUS — a senior intelligence analyst AI with access to real-time global satellite data, sensor networks, prediction markets, and news intelligence. You produce authoritative, dense, actionable intelligence products.

RULES:
- Write like a classified intelligence brief, not a news article
- Lead with the most operationally significant finding
- Use precise language: specific actors, locations, dates, probabilities
- Cite your sources (signals, markets, satellite data) inline
- Flag contradictions between sources explicitly  
- Quantify uncertainty: "high confidence", "assessed", "estimated", "unconfirmed"
- Never pad. Every sentence must carry information.
- Structure: Executive Summary → Critical Alerts → Regional Breakdowns → Market Intelligence → Outlook`

    const userPrompt = `${context}

─────────────────────────────────────────────────────────────────────────────
TASK: Generate a comprehensive global intelligence briefing based on ALL data above.

FORMAT:
## 🔴 EXECUTIVE SUMMARY
[3-5 sentences: the single most important global development right now]

## 🚨 CRITICAL ALERTS  
[List every critical/high-severity signal with tactical implications]

## 🌍 REGIONAL INTELLIGENCE

### Ukraine / Russia
### Middle East
### China / Taiwan / Indo-Pacific  
### Nuclear / WMD Proliferation
### Cyber / Infrastructure

## 📊 MARKET INTELLIGENCE
[Prediction market probabilities → what they imply about near-term events]

## 🔮 72-HOUR OUTLOOK
[Assessed probability of key developments based on current signal convergence]

## ⚠ INTELLIGENCE GAPS
[What data would change this assessment]`

    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens: MAX_OUT,
          temperature: 0.15,
          stream: true,
        }),
      })

      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error?.message || `Groq ${r.status}`)
      }

      const reader = r.body.getReader()
      const dec    = new TextDecoder()
      let full     = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const tok = JSON.parse(data)?.choices?.[0]?.delta?.content
            if (tok) { full += tok; setBriefing(full) }
          } catch {}
        }
      }

      setLastRun(new Date())
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [groqKey, enabled, signals?.length, articles?.length, markets?.length])

  // Auto-regenerate when signal count changes significantly (>50 new signals)
  useEffect(() => {
    if (!groqKey || !enabled) return
    const count = (signals?.length || 0) + (articles?.length || 0)
    if (Math.abs(count - prevCount.current) > 50) {
      prevCount.current = count
      generate()
    }
  }, [(signals?.length || 0) + (articles?.length || 0)]) // eslint-disable-line

  return { briefing, loading, error, tokens, lastRun, generate }
}
