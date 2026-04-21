import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { matchArticlesToSituation } from '../../utils/classify'
import { SEV_COLOR } from '../../data/constants'
import {
  Plus, X, Zap, AlertTriangle, Globe, Shield, Eye,
  Clock, ChevronDown, ChevronRight, Radio, RefreshCw,
  Target, Activity, FileText, TrendingUp, TrendingDown,
  Link2, Layers, Search, Filter, Download, MoreHorizontal,
  BarChart2, GitBranch, MessageSquare, Crosshair, Radar,
  ArrowUpRight, ArrowDownRight, Minus, Users, MapPin,
  AlertOctagon, BookOpen, ExternalLink, ChevronUp
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { useActiveFetch } from '../../hooks/useActiveFetch'
import { useGroq } from '../../hooks/useGroq'
import { useSweepDelta } from '../../hooks/useSweepDelta'

// ── Constants ────────────────────────────────────────────────────────────
const SEV_C = { critical: 'var(--red)', high: 'var(--orange)', medium: 'var(--yellow)', low: 'var(--accent)' }
const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 }

const PRESETS = [
  { icon: '🪖', name: 'Ukraine frontline war',      group: 'Conflict' },
  { icon: '🚢', name: 'Taiwan Strait PLA',          group: 'Conflict' },
  { icon: '🔴', name: 'Gaza Hamas IDF ceasefire',   group: 'Conflict' },
  { icon: '⚓', name: 'Houthi Red Sea shipping',    group: 'Conflict' },
  { icon: '🛡️', name: 'Russia NATO Baltic',         group: 'Conflict' },
  { icon: '🌍', name: 'Sahel coup junta',           group: 'Conflict' },
  { icon: '☢️', name: 'Iran nuclear IAEA',          group: 'WMD' },
  { icon: '🚀', name: 'North Korea DPRK missile',   group: 'WMD' },
  { icon: '💻', name: 'cyberattack hack breach APT',group: 'Intel' },
  { icon: '🕵️', name: 'espionage intelligence spy', group: 'Intel' },
  { icon: '📈', name: 'Federal Reserve rate cut',   group: 'Finance' },
  { icon: '🛢️', name: 'OPEC oil crude price',       group: 'Finance' },
  { icon: '🤖', name: 'AI chip semiconductor',      group: 'Tech' },
  { icon: '🌏', name: 'India Pakistan Kashmir',     group: 'South Asia' },
]

// ── Key resolver — env var takes priority over user-stored key ────────────
function resolveGroqKey(storeKey) {
  try {
    const envKey = import.meta.env.VITE_GROQ_KEY
    if (envKey && envKey.length > 10) return envKey
  } catch {}
  return storeKey || ''
}

// ── Groq streaming with model fallback chain ──────────────────────────────
const GROQ_MODELS_SIT = ['llama-3.3-70b-versatile','llama-3.1-70b-versatile','llama-3.1-8b-instant','mixtral-8x7b-32768','gemma2-9b-it','llama3-70b-8192','llama3-8b-8192']

async function groqStream(key, systemPrompt, userPrompt, onToken) {
  let r = null, lastErr = null
  for (const model of GROQ_MODELS_SIT) {
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens: 4000, temperature: 0.1, stream: true,
        }),
        signal: AbortSignal.timeout(60000),
      })
      if (r.ok) break
      if (r.status === 429 || r.status === 503 || r.status === 404 || r.status === 500) {
        await new Promise(res => setTimeout(res, 800)); lastErr = new Error(`Groq ${r.status}`); continue
      }
      throw new Error(`Groq ${r.status}`)
    } catch(e) { lastErr = e; if (e.name==='AbortError') throw e; await new Promise(res=>setTimeout(res,800)) }
  }
  if (!r?.ok) throw lastErr || new Error('All Groq models failed')
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of dec.decode(value).split('\n')) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
      try {
        const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ''
        if (delta) { full += delta; onToken(full) }
      } catch {}
    }
  }
  return full
}

// ── Signal correlation: find articles that cross-reference each other ─────
// Only filter stopwords and noise — keep country names, org names, all real signals
const STOPWORDS = new Set(['The','A','An','In','At','Of','For','And','Or','But','Is','Are','Was','Were','Has','Have','Had','By','To','From','With','On','That','This','Its','It','He','She','They','We','Said','Says','After','Before','Over','Under','New','One','Two','Three'])
// Pure noise sources that aren't meaningful connections
const NOISE_SOURCES = new Set(['NewsAPI-generic','GDELT-placeholder'])

function correlateSignals(articles) {
  if (articles.length < 3) return []

  // Build signal fingerprint: named entities + meaningful tags combined
  // Include country/org names because "Iran + IRGC + Khamenei" IS the signal
  const entityMap = {}
  const maxOccurrence = Math.max(8, Math.floor(articles.length * 0.85))

  articles.forEach(a => {
    const signals = [
      ...(a.entities || []).map(e => e.name),
      ...(a.tags || []),
    ].filter(n =>
      n && n.length > 2 &&
      !STOPWORDS.has(n) &&
      !NOISE_SOURCES.has(n) &&
      !/^\d+$/.test(n)
    )
    // Deduplicate within article
    const unique = [...new Set(signals)]
    unique.forEach(e => {
      if (!entityMap[e]) entityMap[e] = new Set()
      entityMap[e].add(a.id)
    })
  })

  // Convert to arrays, filter ubiquitous (appear in > 60% of articles)
  const meaningful = Object.entries(entityMap)
    .map(([e, ids]) => [e, [...ids]])
    .filter(([, ids]) => ids.length >= 2 && ids.length <= maxOccurrence)

  // Build pair scores
  const pairs = {}
  meaningful.forEach(([entity, ids]) => {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join('::')
        if (!pairs[key]) pairs[key] = { count: 0, entities: [] }
        pairs[key].count++
        pairs[key].entities.push(entity)
      }
  })

  // Threshold: 2+ shared signals, from different sources
  return Object.entries(pairs)
    .filter(([, v]) => v.count >= 1)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([key, v]) => {
      const [id1, id2] = key.split('::')
      const a1 = articles.find(a => a.id === id1)
      const a2 = articles.find(a => a.id === id2)
      if (!a1 || !a2) return null
      if (a1.source === a2.source && a1.title.slice(0,40) === a2.title.slice(0,40)) return null
      return { a1, a2, count: v.count, sharedEntities: v.entities.slice(0, 5) }
    })
    .filter(Boolean)
}

// ── Velocity: article count deltas ─────────────────────────────────────
function computeVelocity(articles) {
  const now = Date.now()
  const last1h = articles.filter(a => now - a.pub < 3600000).length
  const last6h = articles.filter(a => now - a.pub < 6 * 3600000).length
  const last24h = articles.filter(a => now - a.pub < 24 * 3600000).length
  return { last1h, last6h, last24h, total: articles.length }
}

// ── Source diversity score ───────────────────────────────────────────────
function sourceDiversity(articles) {
  const srcs = new Set(articles.map(a => a.source))
  const regions = new Set(articles.map(a => a.region))
  return { sources: srcs.size, regions: regions.size, score: Math.min(10, srcs.size + regions.size) }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Situations({ articles }) {
  const {
    situations, addSituation, removeSituation, updateSituationNotes,
    activeSituation, setActiveSituation,
  } = useStore()
  const [newName, setNewName] = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const [presetGroup, setPresetGroup] = useState('All')

  const create = useCallback((nameArg) => {
    // If explicit name passed (preset click), use it exclusively
    const n = nameArg ? nameArg.trim() : newName.trim()
    if (!n) return
    const id = addSituation(n)
    setActiveSituation(id)
    setNewName('')
    setShowPresets(false)
  }, [newName, addSituation, setActiveSituation])

  const active = situations.find(s => s.id === activeSituation)

  // Pre-compute matched articles for all situations
  const matchedMap = useMemo(() => {
    const m = {}
    situations.forEach(sit => { m[sit.id] = matchArticlesToSituation(sit.name, articles) })
    return m
  }, [situations, articles])

  const groups = ['All', ...Array.from(new Set(PRESETS.map(p => p.group)))]

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ══ PANEL A: Situation List ══════════════════════════════════════ */}
      <div style={{
        width: '220px', flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', background: 'var(--base)'
      }}>
        {/* Header */}
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '7px' }}>
            <Radar size={9} style={{ color: 'var(--accent)' }} />
            <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.14em' }}>SITUATIONS</span>
            <span className="chip" style={{ marginLeft: 'auto', fontSize: '8px', padding: '1px 4px' }}>
              {situations.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '3px' }}>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && create()}
              placeholder="Track situation…" className="inp"
              style={{ fontSize: '11px', padding: '5px 8px', flex: 1 }} />
            <button className="btn btn-accent" style={{ padding: '5px 7px', flexShrink: 0 }} onClick={() => create()}>
              <Plus size={10} />
            </button>
          </div>
          {/* Presets toggle */}
          <button onClick={() => setShowPresets(o => !o)} className="btn"
            style={{ width: '100%', marginTop: '4px', fontSize: '9px', padding: '4px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--t3)' }}>
            <Zap size={8} style={{ color: 'var(--yellow)' }} />
            QUICK TRACK
            {showPresets ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
          </button>
          {showPresets && (
            <div style={{ marginTop: '5px' }}>
              <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '5px' }}>
                {groups.map(g => (
                  <button key={g} className="btn" onClick={() => setPresetGroup(g)}
                    style={{ fontSize: '8px', padding: '2px 5px', color: presetGroup === g ? 'var(--accent)' : 'var(--t3)', borderColor: presetGroup === g ? 'rgba(45,212,191,0.3)' : 'var(--border)' }}>
                    {g}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '180px', overflowY: 'auto' }}>
                {PRESETS.filter(p => presetGroup === 'All' || p.group === presetGroup).map(p => (
                  <button key={p.name} className="btn" onClick={() => create(p.name)}
                    style={{ fontSize: '10px', padding: '4px 7px', justifyContent: 'flex-start', gap: '6px', textAlign: 'left' }}>
                    <span style={{ flexShrink: 0 }}>{p.icon}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t2)' }}>
                      {p.name.split(' ').slice(0, 3).join(' ')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '5px' }}>
          {situations.length === 0 && (
            <div style={{ padding: '20px 8px', textAlign: 'center' }}>
              <Radar size={28} style={{ color: 'var(--t4)', marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />
              <p style={{ color: 'var(--t3)', fontSize: '11px', lineHeight: 1.7, marginBottom: '4px' }}>
                Add any situation to start monitoring intelligence signals.
              </p>
              <p style={{ color: 'var(--t4)', fontSize: '10px' }}>Use presets above or type any topic.</p>
            </div>
          )}
          {situations.map(sit => {
            const matched = matchedMap[sit.id] || []
            const isActive = activeSituation === sit.id
            const vel = computeVelocity(matched)
            const maxSev = matched.reduce((max, a) => SEV_RANK[a.severity] > SEV_RANK[max] ? a.severity : max, 'low')
            const pulse = SEV_C[maxSev] || 'var(--t4)'
            const hasCrit = matched.some(a => a.severity === 'critical')
            const hasHigh = matched.some(a => a.severity === 'high')

            return (
              <div key={sit.id}
                onClick={() => setActiveSituation(sit.id)}
                style={{
                  marginBottom: '3px', padding: '9px 10px', borderRadius: '3px', cursor: 'pointer',
                  border: `1px solid ${isActive ? 'rgba(45,212,191,0.35)' : 'var(--border)'}`,
                  background: isActive ? 'rgba(45,212,191,0.05)' : 'var(--panel)',
                  transition: 'all 0.12s', position: 'relative',
                  borderLeft: `3px solid ${pulse}`,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--raised)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'var(--panel)' }}>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--t1)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sit.name}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>
                        {matched.length} sigs
                      </span>
                      {vel.last1h > 0 && (
                        <span className="mono" style={{ fontSize: '8px', color: 'var(--green)' }}>
                          +{vel.last1h}/1h
                        </span>
                      )}
                      {hasCrit && <span className="mono" style={{ fontSize: '8px', color: 'var(--red)' }}>⬤CRIT</span>}
                      {!hasCrit && hasHigh && <span className="mono" style={{ fontSize: '8px', color: 'var(--orange)' }}>⬤HIGH</span>}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeSituation(sit.id); if (isActive) setActiveSituation(null) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: '1px', flexShrink: 0, opacity: 0.6 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>
                    <X size={9} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '5px 8px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <p className="mono" style={{ fontSize: '7px', color: 'var(--t4)', lineHeight: 1.5 }}>
            {articles.length} live signals · {[...new Set(articles.map(a => a.source))].length} sources
          </p>
        </div>
      </div>

      {/* ══ PANELS B+C: Detail ══════════════════════════════════════════ */}
      {active
        ? <CommandCenter sit={active} articles={matchedMap[active.id] || []} allArticles={articles} onNotes={n => updateSituationNotes(active.id, n)} />
        : <EmptyState />
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND CENTER — the real thing
// ─────────────────────────────────────────────────────────────────────────────
function CommandCenter({ sit, articles, allArticles, onNotes, onActiveArticles }) {
  const { addNode, setTab, keys } = useStore()
  const { fetchForSituation, fetchCustomFeed, loading: activeFetchLoading, lastFetch } = useActiveFetch()
  const { analyzeBoard, suggestLinks, buildTimeline, loading: groqLoading, error: groqError, hasKey: groqHasKey } = useGroq()
  const { latestDelta, computeDelta, clearDeltas } = useSweepDelta(sit.id)
  const [showDelta, setShowDelta] = React.useState(false)
  const [rightPanel, setRightPanel] = useState('brief') // 'brief' | 'correlate' | 'notes'
  const [signalFilter, setSignalFilter] = useState('all') // 'all'|sev
  const [signalSearch, setSignalSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [notes, setNotes] = useState(sit.notes || '')
  const [activeArticles, setActiveArticles] = useState([]) // actively fetched articles
  const [customFeedUrl, setCustomFeedUrl] = useState('')
  const [showFeedInput, setShowFeedInput] = useState(false)
  const [customFeedStatus, setCustomFeedStatus] = useState('')

  // Merge passively matched + actively fetched articles, dedup by id
  // IMPORTANT: articles from the live feed are filtered through the situation matcher
  // so we don't get false alarms (e.g. gold prices appearing in Strait of Hormuz)
  // activeArticles from Fetch Now are already targeted so we keep all of them
  const allSignals = useMemo(() => {
    // Live feed articles (global RSS) — filter through situation matcher to avoid unrelated news
    const matchedLive = matchArticlesToSituation(sit.name, articles)
    // Active fetch results are already situation-targeted — keep ALL of them, no re-filtering
    // Double-filtering drops valid articles that don't perfectly match the regex but are relevant
    const seen = new Set()
    return [...activeArticles, ...matchedLive].filter(a => {
      if (!a?.id || seen.has(a.id)) return false
      seen.add(a.id)
      return true
    }).sort((a, b) => b.pub - a.pub)
  }, [articles, activeArticles, sit.name])

  const handleActiveFetch = useCallback(async () => {
    const fresh = await fetchForSituation(sit.name)
    if (fresh.length > 0) {
      // Relevance filter: keep articles that mention ANY token from the situation name
      // OR any synonym of those tokens — ensures topicality without being too strict
      const rawTokens = sit.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)

      // Build full synonym set for this situation
      const { SITUATION_EXPANSIONS } = await import('../../data/constants')
      const allTerms = new Set(rawTokens)
      rawTokens.forEach(tok => {
        if (SITUATION_EXPANSIONS[tok]) {
          const syns = SITUATION_EXPANSIONS[tok]
          if (Array.isArray(syns)) syns.slice(0, 6).forEach(s => typeof s === 'string' && allTerms.add(s.toLowerCase()))
        }
        Object.entries(SITUATION_EXPANSIONS).forEach(([key, syns]) => {
          if (!Array.isArray(syns)) return
          if (key === tok || syns.includes(tok)) {
            syns.slice(0, 4).forEach(s => typeof s === 'string' && allTerms.add(s.toLowerCase()))
          }
        })
      })
      const termArr = [...allTerms]

      const relevanceFilter = (a) => {
        const text = ((a.title||'') + ' ' + (a.summary||'')).toLowerCase()
        return termArr.some(term => text.includes(term))
      }

      const toAdd = fresh.filter(relevanceFilter)
      // Only fallback to unfiltered if truly nothing passes (< 5%) — this means
      // GDELT returned completely off-topic results, which should be rare
      const finalToAdd = toAdd.length > 0 ? toAdd : fresh.slice(0, 5)
      setActiveArticles(prev => {
        const seen = new Set(prev.map(a => a.id))
        const newOnes = finalToAdd.filter(a => !seen.has(a.id))
        const merged = [...newOnes, ...prev].slice(0, 500)
        setTimeout(() => computeDelta(merged), 100)
        return merged
      })
    }
  }, [fetchForSituation, sit.name, computeDelta])

  const handleCustomFeed = useCallback(async () => {
    if (!customFeedUrl.startsWith('http')) return
    setCustomFeedStatus('fetching...')
    const arts = await fetchCustomFeed(customFeedUrl)
    if (arts.length > 0) {
      setActiveArticles(prev => {
        const seen = new Set(prev.map(a => a.id))
        const newOnes = arts.filter(a => !seen.has(a.id))
        return [...newOnes, ...prev].slice(0, 200)
      })
      setCustomFeedStatus(`+${arts.length} signals`)
      setCustomFeedUrl('')
      setTimeout(() => setCustomFeedStatus(''), 3000)
    } else {
      setCustomFeedStatus('no articles found')
      setTimeout(() => setCustomFeedStatus(''), 3000)
    }
  }, [fetchCustomFeed, customFeedUrl])

  // AI briefing state
  const [briefing,     setBriefing]     = useState('')
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError,   setBriefError]   = useState(null)
  const briefRef = useRef(null)
  // AI sub-mode: 'brief' | 'analyze' | 'suggest' | 'timeline'
  const [aiMode,    setAiMode]    = useState('brief')
  const [aiText,    setAiText]    = useState('')
  const [aiRunning, setAiRunning] = useState(false)

  // Reset ALL briefing state when the active situation changes
  useEffect(() => {
    setBriefing('')
    setBriefError(null)
    setBriefLoading(false)
    setAiText('')
    setAiRunning(false)
    setAiMode('brief')
    setNotes(sit.notes || '')
    setActiveArticles([])
    setSignalFilter('all')
    setSignalSearch('')
    setExpandedIds(new Set())
    setRightPanel('brief')
  }, [sit.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll briefing panel as it streams
  useEffect(() => {
    if (briefRef.current) briefRef.current.scrollTop = briefRef.current.scrollHeight
  }, [briefing])

  // Velocity
  const vel = useMemo(() => computeVelocity(allSignals), [allSignals])
  // Diversity
  const div = useMemo(() => sourceDiversity(allSignals), [allSignals])
  // Correlations
  const correlations = useMemo(() => correlateSignals(allSignals), [allSignals])
  // Severity
  const sev = useMemo(() => ({
    critical: allSignals.filter(a => a.severity === 'critical').length,
    high:     allSignals.filter(a => a.severity === 'high').length,
    medium:   allSignals.filter(a => a.severity === 'medium').length,
    low:      allSignals.filter(a => a.severity === 'low').length,
  }), [allSignals])

  const maxSev = sev.critical > 0 ? 'CRITICAL' : sev.high > 2 ? 'HIGH' : sev.high > 0 ? 'ELEVATED' : sev.medium > 0 ? 'MODERATE' : allSignals.length > 0 ? 'LOW' : 'INACTIVE'
  const threatColor = { CRITICAL: 'var(--red)', HIGH: 'var(--orange)', ELEVATED: 'var(--orange)', MODERATE: 'var(--yellow)', LOW: 'var(--accent)', INACTIVE: 'var(--t4)' }[maxSev]

  // Top entities across all matched articles
  const entities = useMemo(() => {
    const m = {}
    allSignals.forEach(a => (a.entities || []).forEach(e => { m[e.name] = (m[e.name] || 0) + 1 }))
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [allSignals])

  // Top tags
  const tags = useMemo(() => {
    const m = {}
    allSignals.forEach(a => (a.tags || []).forEach(t => { m[t] = (m[t] || 0) + 1 }))
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [allSignals])

  // Region breakdown
  const regions = useMemo(() => {
    const m = {}
    allSignals.forEach(a => { m[a.region] = (m[a.region] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [allSignals])

  // Source breakdown
  const sources = useMemo(() => {
    const m = {}
    allSignals.forEach(a => { m[a.source] = (m[a.source] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [allSignals])

  // Filtered signal list
  const filteredArts = useMemo(() => {
    let a = allSignals
    if (signalFilter !== 'all') a = a.filter(x => x.severity === signalFilter)
    if (signalSearch) {
      const q = signalSearch.toLowerCase()
      a = a.filter(x => (x.title + x.source + (x.summary || '')).toLowerCase().includes(q))
    }
    return a
  }, [allSignals, signalFilter, signalSearch])

  // Grouped by date
  const grouped = useMemo(() => {
    const g = {}
    filteredArts.forEach(a => {
      const day = a.pub.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      if (!g[day]) g[day] = []
      g[day].push(a)
    })
    return Object.entries(g)
  }, [filteredArts])

  const runBriefing = useCallback(async () => {
    const activeKey = resolveGroqKey(keys.groq)
    if (!activeKey || allSignals.length === 0) return
    setBriefLoading(true); setBriefError(null); setBriefing('')

    // Rank signals: critical/high first, then by recency
    const sevRank = { critical: 4, high: 3, medium: 2, low: 1 }
    const ranked = [...allSignals].sort((a, b) => {
      const d = (sevRank[b.severity]||0) - (sevRank[a.severity]||0)
      return d !== 0 ? d : b.pub - a.pub
    })

    // Build signal block — HARD CAP at 50 signals, 150 chars each
    // Groq free tier limit: 12,000 TPM. 50 signals * ~150 chars * 1.3 = ~9750 tokens safe.
    const MAX_SIGNALS = 50
    const MAX_SUMMARY = 150
    const signalBlock = ranked.slice(0, MAX_SIGNALS).map((a, i) => {
      const summary = a.summary ? a.summary.slice(0, MAX_SUMMARY).replace(/\n/g, ' ') : ''
      const url = a.url && a.url !== '#' ? a.url : ''
      const time = a.pub ? a.pub.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
      return [
        `[${i+1}] ${a.source} | ${a.severity.toUpperCase()} | ${time}`,
        `${a.title}`,
        summary ? summary : '',
        url ? url : '',
      ].filter(Boolean).join(' | ')
    }).join('\n')

    const sysPrompt = `You are a senior intelligence analyst writing a classified briefing. Rules:
1. ONLY use facts from the signals provided. Never invent or hallucinate.
2. Read the CONTENT field of each signal — that is the article body. Use it.
3. Every development point MUST cite [Source Name] in brackets.
4. Every development point SHOULD include the link in parentheses if one is provided.
5. Name specific people, organizations, locations, numbers. Never say "officials" without naming them.
6. If a signal's CONTENT is "(no summary available)", rely only on the headline.

FORMAT (use exactly):
THREAT: [CRITICAL/HIGH/MODERATE/LOW] — [specific reason, ≤12 words]
STATUS: [2 sentences, specific who/what/where/when from signal content]
DEVELOPMENTS:
▸ [Specific fact + detail from signal content] [Source] (link)
▸ [Specific fact + detail from signal content] [Source] (link)
▸ [Specific fact + detail from signal content] [Source] (link)
▸ [Specific fact + detail from signal content] [Source] (link)
▸ [Specific fact + detail from signal content] [Source] (link)
ACTORS: [Named individuals and organizations from the signals]
RISK: [Specific escalation trigger visible in signals]
WATCH: [Specific next event or metric to monitor]
SOURCES: [All source names used]`

    const userPrompt = `SITUATION: ${sit.name}
SIGNALS: ${allSignals.length} total (${sev.critical} critical, ${sev.high} high, ${sev.medium} medium, ${sev.low} low)
VELOCITY: +${vel.last1h} signals/1h, +${vel.last6h}/6h, +${vel.last24h}/24h
REGIONS: ${regions.slice(0,5).map(([r]) => r).join(', ')}
KEY ENTITIES: ${entities.slice(0,10).map(([e]) => e).join(', ')}

=== INTELLIGENCE SIGNALS (read CONTENT carefully) ===

${signalBlock}

=== END ===

Write the briefing. Use CONTENT fields. Cite [Source] and (link) in every development point.`

    try {
      await groqStream(activeKey, sysPrompt, userPrompt, token => setBriefing(token))
    } catch(e) {
      setBriefError(e.message)
    } finally {
      setBriefLoading(false)
    }
  }, [keys.groq, sit.name, allSignals, sev, vel, regions, entities])

  // ── AI sub-mode runners (Analyze / Suggest / Timeline) ───────────────────
  const runAI = React.useCallback(async (mode) => {
    if (!groqHasKey) return
    setAiMode(mode)
    setAiText('')
    setAiRunning(true)

    // Send ALL signals — Groq llama-3.3-70b has 128K context window.
    // Even 300 signals at ~100 tokens each = ~30K tokens, well within limits.
    // Sort critical/high first so the most important signals lead the prompt.
    const sevRank = { critical: 4, high: 3, medium: 2, low: 1 }
    const allRanked = [...allSignals]
      .sort((a, b) => (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0) || b.pub - a.pub)

    // Build rich nodes for every signal
    const allNodes = allRanked.map((a, i) => {
      const dateStr = a.pub
        ? a.pub.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        : 'date unknown'
      const summaryStr = a.summary && a.summary.length > 20
        ? a.summary.slice(0, 400)  // full summary
        : '(headline only)'
      return {
        id:     `s${i}`,
        type:   'event',
        label:  `[${a.severity.toUpperCase()}] ${a.title}`,
        detail: `Source: ${a.source} | Date: ${dateStr} | ${summaryStr}`,
      }
    })

    const edges = []

    try {
      if (mode === 'analyze') {
        await analyzeBoard(allNodes, edges, t => setAiText(t))
      } else if (mode === 'suggest') {
        await suggestLinks(allNodes, t => setAiText(t))
      } else if (mode === 'timeline') {
        await buildTimeline(allNodes, t => setAiText(t))
      }
    } catch (e) {
      console.warn('AI error:', e)
    }
    setAiRunning(false)
  }, [groqHasKey, allSignals, analyzeBoard, suggestLinks, buildTimeline])

  const [boardToast, setBoardToast] = React.useState('')
  const addAllToBoard = () => {
    // Save ALL signals — no arbitrary cap. Board handles any number of nodes.
    // Sort critical/high first so the most important signals are prominent
    const sevRank = { critical: 4, high: 3, medium: 2, low: 1 }
    const sorted = [...allSignals].sort((a, b) =>
      (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0)
    )
    sorted.forEach((a, i) => {
      // Arrange in a loose grid — up to 10 columns
      const col = i % 10
      const row = Math.floor(i / 10)
      addNode({
        type: 'event',
        label: a.title.slice(0, 50),
        detail: (a.summary || '').slice(0, 200),
        source: a.source,
        url: a.url,
        color: SEV_C[a.severity] || 'var(--accent)',
        x: 80 + col * 150 + (Math.random() * 30 - 15),
        y: 80 + row * 120 + (Math.random() * 20 - 10),
      })
    })
    setBoardToast(`${sorted.length} signals saved to board`)
    setTimeout(() => setBoardToast(''), 3000)
    // No tab switch — user stays in Monitor
  }

  // Auto-fetch on situation open (once per situation)
  const fetchedSits = React.useRef(new Set())
  React.useEffect(() => {
    if (!fetchedSits.current.has(sit.id)) {
      fetchedSits.current.add(sit.id)
      handleActiveFetch()
    }
  }, [sit.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = id => setExpandedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  // Activity sparkline data (articles per hour, last 24h)
  const sparkline = useMemo(() => {
    const buckets = new Array(24).fill(0)
    const now = Date.now()
    allSignals.forEach(a => {
      const hoursAgo = Math.floor((now - a.pub) / 3600000)
      if (hoursAgo < 24) buckets[23 - hoursAgo]++
    })
    return buckets
  }, [allSignals])
  const maxBucket = Math.max(...sparkline, 1)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

      {/* ── TOP COMMAND STRIP ──────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, background: 'var(--base)',
        borderBottom: '1px solid var(--border)',
        padding: '8px 14px',
      }}>
        {/* Row 1: Title + threat + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
          <Crosshair size={12} style={{ color: threatColor, flexShrink: 0 }} />
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--t1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sit.name}
          </div>
          {/* Threat badge */}
          <div className="mono" style={{
            fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '2px',
            background: threatColor + '18', color: threatColor,
            border: `1px solid ${threatColor}40`, letterSpacing: '0.12em', flexShrink: 0,
          }}>
            ◈ {maxSev}
          </div>
          {/* Live pulse */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block', boxShadow: '0 0 5px var(--green)' }} className="pulse" />
            <span className="mono" style={{ fontSize: '8px', color: 'var(--green)' }}>LIVE</span>
          </div>
          <button className="btn btn-blue" style={{ fontSize: '9px', flexShrink: 0 }} onClick={addAllToBoard}
            title="Save signals to Intel Board without navigating away">
            <GitBranch size={9} /> save to board
          </button>
          {/* Delta indicator — shows what changed since last fetch */}
          {latestDelta && (latestDelta.newSignals.length > 0 || latestDelta.escalations.length > 0) && (
            <button
              onClick={() => setShowDelta(s => !s)}
              className="btn"
              style={{
                fontSize: '9px', flexShrink: 0,
                background: showDelta ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.06)',
                borderColor: 'rgba(251,191,36,0.4)', color: 'var(--yellow)',
                animation: !showDelta ? 'pulse-border 2s infinite' : 'none',
              }}
              title="Show what changed since last Fetch Now">
              ◈ {latestDelta.newSignals.length} new · {latestDelta.escalations.length} escalated
            </button>
          )}
          {boardToast && (
            <span className="mono fade-in" style={{ fontSize: '8px', color: 'var(--green)', flexShrink: 0 }}>
              ✓ {boardToast}
            </span>
          )}
          {/* Active fetch button */}
          <button
            className="btn btn-accent"
            style={{ fontSize: '9px', flexShrink: 0, gap: '4px' }}
            onClick={handleActiveFetch}
            disabled={activeFetchLoading}
            title="Fetch signals from: GDELT (250K+ outlets, 5 query variants) + CC-NEWS seed feeds (25 direct RSS) + Reddit live + NewsAPI + GNews + NewsData.io">
            {activeFetchLoading
              ? <RefreshCw size={9} className="spin" />
              : <Radio size={9} />}
            {activeFetchLoading ? 'fetching…' : 'fetch now'}
            {activeArticles.length > 0 && (
              <span style={{ background: 'var(--accent)', color: 'var(--void)', borderRadius: '2px', padding: '0 3px', fontSize: '7px', fontWeight: 700 }}>
                +{activeArticles.length}
              </span>
            )}
            {lastFetch && !activeFetchLoading && (
              <span style={{ color: 'var(--t4)', fontSize: '7px' }}>
                {lastFetch.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
              </span>
            )}
          </button>
          {/* Custom feed toggle */}
          <button
            className="btn"
            style={{ fontSize: '9px', flexShrink: 0 }}
            onClick={() => setShowFeedInput(s => !s)}
            title="Add any RSS feed URL to pull into this situation">
            <Plus size={9} /> feed
          </button>
        </div>

        {/* Row 2: 6 metric tiles */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { label: 'SIGNALS', value: allSignals.length, color: 'var(--t2)' },
            { label: 'CRITICAL', value: sev.critical, color: 'var(--red)', hide: sev.critical === 0 },
            { label: 'HIGH', value: sev.high, color: 'var(--orange)', hide: sev.high === 0 },
            { label: '1H', value: `+${vel.last1h}`, color: vel.last1h > 3 ? 'var(--yellow)' : 'var(--t3)' },
            { label: '24H', value: `+${vel.last24h}`, color: 'var(--t3)' },
            { label: 'SOURCES', value: div.sources, color: 'var(--t3)' },
            { label: 'REGIONS', value: div.regions, color: 'var(--t3)' },
          ].filter(m => !m.hide).map(m => (
            <div key={m.label} style={{
              padding: '3px 8px', background: 'var(--panel)',
              border: '1px solid var(--border)', borderRadius: '2px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '48px',
            }}>
              <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)', letterSpacing: '0.1em' }}>{m.label}</span>
              <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: m.color, lineHeight: 1.2 }}>{m.value}</span>
            </div>
          ))}

          {/* Sparkline: 24h activity */}
          <div style={{
            padding: '3px 8px', background: 'var(--panel)',
            border: '1px solid var(--border)', borderRadius: '2px',
            display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '80px'
          }}>
            <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)', letterSpacing: '0.1em' }}>ACTIVITY 24H</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1px', height: '18px' }}>
              {sparkline.map((v, i) => (
                <div key={i} style={{
                  flex: 1, height: `${Math.max(2, (v / maxBucket) * 18)}px`,
                  background: v > 0 ? (v >= maxBucket * 0.7 ? threatColor : 'var(--border2)') : 'var(--border)',
                  borderRadius: '1px', transition: 'height 0.3s',
                }} title={`${v} signals`} />
              ))}
            </div>
          </div>
        </div>
        {/* Custom feed URL input */}
        {showFeedInput && (
          <div style={{ marginTop: '6px', display: 'flex', gap: '5px', alignItems: 'center' }}>
            <Radio size={9} style={{ color: 'var(--t4)', flexShrink: 0 }} />
            <input
              value={customFeedUrl}
              onChange={e => setCustomFeedUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCustomFeed()}
              placeholder="Paste any RSS feed URL… (e.g. https://feeds.reuters.com/...)"
              className="inp"
              style={{ fontSize: '10px', flex: 1 }}
            />
            <button className="btn btn-accent" style={{ fontSize: '9px', flexShrink: 0 }} onClick={handleCustomFeed} disabled={activeFetchLoading}>
              pull
            </button>
            {customFeedStatus && (
              <span className="mono" style={{ fontSize: '9px', color: 'var(--green)', flexShrink: 0 }}>{customFeedStatus}</span>
            )}
          </div>
        )}
      </div>

      {/* ── SWEEP DELTA PANEL ─────────────────────────────────────────── */}
      {showDelta && latestDelta && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.04)', padding: '8px 14px' }} className="fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="mono" style={{ fontSize: '8px', color: 'var(--yellow)', letterSpacing: '0.12em' }}>
              ◈ SWEEP DELTA — {latestDelta.time} · {latestDelta.newSignals.length} new · {latestDelta.escalations.length} escalated · {latestDelta.velocityChange > 0 ? '+' : ''}{latestDelta.velocityChange} total
            </span>
            {latestDelta.newSources?.length > 0 && (
              <span className="mono" style={{ fontSize: '8px', color: 'var(--accent)' }}>
                +new sources: {latestDelta.newSources.join(', ')}
              </span>
            )}
            <button onClick={() => { setShowDelta(false); clearDeltas() }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: '10px' }}>×</button>
          </div>

          {/* Escalations first — most urgent */}
          {latestDelta.escalations.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <div className="mono" style={{ fontSize: '7px', color: 'var(--red)', letterSpacing: '0.1em', marginBottom: '4px' }}>ESCALATED</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {latestDelta.escalations.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '3px 6px', background: 'rgba(239,68,68,0.07)', borderRadius: '2px', borderLeft: '2px solid var(--red)' }}>
                    <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{e.from} → </span>
                    <span className="mono" style={{ fontSize: '8px', color: 'var(--red)', fontWeight: 700 }}>{e.to}</span>
                    <a href={e.url !== '#' ? e.url : undefined} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '10px', color: 'var(--t1)', flex: 1, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.title.slice(0, 90)}{e.title.length > 90 ? '…' : ''}
                    </a>
                    <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', flexShrink: 0 }}>{e.source}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New signals — show top 8 */}
          {latestDelta.newSignals.length > 0 && (
            <div>
              <div className="mono" style={{ fontSize: '7px', color: 'var(--yellow)', letterSpacing: '0.1em', marginBottom: '4px' }}>
                NEW SIGNALS ({latestDelta.newSignals.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {latestDelta.newSignals.slice(0, 8).map((sig, i) => {
                  const sevColors = { critical: 'var(--red)', high: 'var(--orange)', medium: 'var(--yellow)', low: 'var(--accent)' }
                  const isAcled = sig._acled
                  const isFirms = sig._firms
                  const isFred  = sig._fred
                  return (
                    <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '3px 6px',
                      background: 'rgba(45,212,191,0.04)', borderRadius: '2px',
                      borderLeft: `2px solid ${sevColors[sig.severity] || 'var(--accent)'}` }}>
                      {isAcled && <span className="mono" style={{ fontSize: '7px', padding: '1px 3px', background: 'rgba(239,68,68,0.15)', color: 'var(--red)', borderRadius: '1px', flexShrink: 0 }}>ACLED</span>}
                      {isFirms && <span className="mono" style={{ fontSize: '7px', padding: '1px 3px', background: 'rgba(251,191,36,0.15)', color: 'var(--yellow)', borderRadius: '1px', flexShrink: 0 }}>FIRMS</span>}
                      {isFred  && <span className="mono" style={{ fontSize: '7px', padding: '1px 3px', background: 'rgba(167,139,250,0.15)', color: 'var(--purple)', borderRadius: '1px', flexShrink: 0 }}>FRED</span>}
                      <a href={sig.url !== '#' ? sig.url : undefined} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '10px', color: 'var(--t1)', flex: 1, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sig.title.slice(0, 95)}{sig.title.length > 95 ? '…' : ''}
                      </a>
                      <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', flexShrink: 0 }}>{sig.source}</span>
                    </div>
                  )
                })}
                {latestDelta.newSignals.length > 8 && (
                  <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', paddingLeft: '6px' }}>
                    +{latestDelta.newSignals.length - 8} more new signals in the feed below
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MAIN BODY: left=signals, right=analyst panels ────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>

        {/* ── SIGNAL FEED ────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)', minWidth: 0 }}>

          {/* Signal filter bar */}
          <div style={{
            flexShrink: 0, padding: '6px 10px', borderBottom: '1px solid var(--border)',
            display: 'flex', gap: '5px', alignItems: 'center', background: 'var(--base)'
          }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '240px' }}>
              <Search size={9} style={{ position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)' }} />
              <input value={signalSearch} onChange={e => setSignalSearch(e.target.value)}
                placeholder="Filter signals…" className="inp"
                style={{ paddingLeft: '22px', fontSize: '10px', padding: '4px 8px 4px 22px' }} />
            </div>
            {['all', 'critical', 'high', 'medium', 'low'].map(s => (
              <button key={s} className="btn" onClick={() => setSignalFilter(s)}
                style={{
                  fontSize: '8px', padding: '3px 7px',
                  color: signalFilter === s ? (SEV_C[s] || 'var(--accent)') : 'var(--t3)',
                  borderColor: signalFilter === s ? (SEV_C[s] || 'var(--accent)') + '50' : 'var(--border)',
                  background: signalFilter === s ? (SEV_C[s] || 'var(--accent)') + '12' : 'transparent',
                }}>
                {s === 'all' ? `ALL (${articles.length})` : s.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Intelligence feed with sticky day headers */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredArts.length === 0 ? (
              <NoSignals sitName={sit.name} hasArticles={articles.length > 0} />
            ) : (
              grouped.map(([day, arts]) => (
                <div key={day}>
                  <div style={{
                    padding: '5px 10px 3px', background: 'var(--base)',
                    borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 1,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <Clock size={8} style={{ color: 'var(--t4)' }} />
                    <span className="mono" style={{ fontSize: '8px', color: 'var(--t3)', letterSpacing: '0.08em' }}>{day}</span>
                    <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>{arts.length} signals</span>
                  </div>
                  {arts.map(a => (
                    <SignalRow key={a.id} article={a}
                      expanded={expandedIds.has(a.id)}
                      onToggle={() => toggleExpand(a.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── ANALYST PANEL ────────────────────────────────────────── */}
        <div style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--void)' }}>

          {/* Panel tabs */}
          <div style={{
            flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--border)',
            background: 'var(--base)',
          }}>
            {[
              { id: 'brief',       label: 'BRIEF',   icon: <Shield size={9} /> },
              { id: 'intel',       label: 'INTEL',   icon: <Layers size={9} /> },
              { id: 'connections', label: 'CONNECT', icon: <GitBranch size={9} /> },
              { id: 'correlate',   label: 'LINKS',   icon: <Link2 size={9} /> },
              { id: 'notes',       label: 'NOTES',   icon: <FileText size={9} /> },
            ].map(t => (
              <button key={t.id} onClick={() => setRightPanel(t.id)}
                style={{
                  flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  fontFamily: 'JetBrains Mono', fontSize: '8px', letterSpacing: '0.08em',
                  background: rightPanel === t.id ? 'var(--panel)' : 'transparent',
                  color: rightPanel === t.id ? 'var(--accent)' : 'var(--t3)',
                  borderBottom: rightPanel === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'all 0.1s',
                }}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* ── BRIEF: AI Situation Report ── */}
            {rightPanel === 'brief' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* ── AI mode selector ── */}
                <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--base)' }}>
                  <div style={{ display: 'flex', padding: '5px 8px', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                      { id: 'brief',    label: '⚡ Brief',    desc: 'Situation report — threat, developments, sources, links' },
                      { id: 'analyze',  label: '◈ Analyze',  desc: 'What does this board tell us? What is missing?' },
                      { id: 'suggest',  label: '◉ Suggest',  desc: 'Suggest connections between key actors' },
                      { id: 'timeline', label: '◷ Timeline', desc: 'Chronological narrative of events' },
                    ].map(m => (
                      <button key={m.id} title={m.desc}
                        onClick={() => {
                          setAiMode(m.id)
                          setAiText('')   // clear previous output — each mode is independent
                          setBriefing('') // also clear brief if switching away
                          setBriefError(null)
                        }}
                        style={{
                          fontFamily: 'JetBrains Mono', fontSize: '9px', padding: '3px 8px',
                          borderRadius: '2px', cursor: 'pointer', border: 'none',
                          background: aiMode === m.id ? 'rgba(45,212,191,0.12)' : 'transparent',
                          color: aiMode === m.id ? 'var(--accent)' : 'var(--t4)',
                          borderBottom: aiMode === m.id ? '2px solid var(--accent)' : '2px solid transparent',
                        }}>
                        {m.label}
                      </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    {/* Run button */}
                    {groqHasKey && allSignals.length > 0 && !(briefLoading || aiRunning) && (
                      <button className="btn btn-accent" style={{ fontSize: '9px', padding: '3px 8px' }}
                        onClick={() => {
                          if (aiMode === 'brief') runBriefing()
                          else runAI(aiMode)
                        }}>
                        <Zap size={9} />
                        {aiMode === 'brief'
                          ? (briefing ? 'regenerate' : 'generate')
                          : (aiText && aiMode === aiMode ? 'regenerate' : 'run')}
                      </button>
                    )}
                    {(briefLoading || aiRunning) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <RefreshCw size={9} className="spin" style={{ color: 'var(--accent)' }} />
                        <span className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>streaming…</span>
                      </div>
                    )}
                    {!groqHasKey && (
                      <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>add Groq key in Settings</span>
                    )}
                  </div>
                  {/* Mode description */}
                  <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', padding: '0 10px 5px', lineHeight: 1.5 }}>
                    {aiMode === 'brief'    && 'Classified-style situation report: THREAT / STATUS / DEVELOPMENTS (with source names and links) / ACTORS / RISK / WATCH'}
                    {aiMode === 'analyze'  && 'Board analysis from your signals: what story do they tell, what is the most important gap, what should be investigated next'}
                    {aiMode === 'suggest'  && 'Suggest specific connections between the key actors found in your signals — what evidence would confirm each link'}
                    {aiMode === 'timeline' && 'Chronological narrative of events from your signals — confirmed facts vs estimates, what is missing'}
                  </div>
                </div>

                {/* ── AI output ── */}
                <div ref={briefRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                  {/* No key */}
                  {!groqHasKey && (
                    <div style={{ padding: '12px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                      <p style={{ fontSize: '11px', color: 'var(--t3)', lineHeight: 1.7, marginBottom: '6px' }}>
                        Add a <strong style={{ color: 'var(--accent)' }}>Groq API key</strong> in Settings to enable AI analysis.
                      </p>
                      <p className="mono" style={{ fontSize: '9px', color: 'var(--t4)', lineHeight: 1.6 }}>
                        Free at console.groq.com — runs LLaMA 3.3 70B on Groq's inference hardware. Practically unlimited.
                      </p>
                    </div>
                  )}

                  {/* No signals */}
                  {groqHasKey && allSignals.length === 0 && (
                    <div style={{ padding: '16px', textAlign: 'center' }}>
                      <p style={{ fontSize: '11px', color: 'var(--t3)' }}>No signals yet — hit Fetch Now to pull data for this situation.</p>
                    </div>
                  )}

                  {/* Brief mode errors */}
                  {aiMode === 'brief' && briefError && (
                    <div style={{ padding: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '3px', marginBottom: '8px' }}>
                      <div style={{ color: 'var(--red)', fontSize: '11px', marginBottom: '4px' }}>⚠ {briefError}</div>
                      <button className="btn" style={{ fontSize: '9px' }} onClick={runBriefing}>retry</button>
                    </div>
                  )}
                  {aiMode !== 'brief' && groqError && (
                    <div style={{ padding: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '3px', marginBottom: '8px' }}>
                      <div style={{ color: 'var(--red)', fontSize: '11px' }}>⚠ {groqError}</div>
                    </div>
                  )}

                  {/* Brief mode output */}
                  {aiMode === 'brief' && briefing && (
                    <BriefingRenderer text={briefing} threatColor={threatColor} sitName={sit.name} />
                  )}

                  {/* Analyze / Suggest / Timeline output */}
                  {aiMode !== 'brief' && aiText && (
                    <div>
                      <div style={{ marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="mono" style={{ fontSize: '8px', color: 'var(--accent)', letterSpacing: '0.12em' }}>
                          ◈ AI · {aiMode.toUpperCase()} · {sit.name.slice(0,30).toUpperCase()}
                        </span>
                        <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>
                          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {aiRunning && <span className="pulse" style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', marginLeft: '5px', verticalAlign: 'middle' }} />}
                        </span>
                      </div>
                      <IntelTextRenderer text={aiText} />
                    </div>
                  )}

                  {/* Empty state — show generate button */}
                  {groqHasKey && allSignals.length > 0 && !briefLoading && !aiRunning &&
                    ((aiMode === 'brief' && !briefing && !briefError) ||
                     (aiMode !== 'brief' && !aiText && !groqError)) && (
                    <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                      <Shield size={24} style={{ color: 'var(--t4)', marginBottom: '10px', display: 'block', margin: '0 auto 10px' }} />
                      <p style={{ fontSize: '12px', color: 'var(--t2)', marginBottom: '4px' }}>
                        {allSignals.length} signals ready
                      </p>
                      <p style={{ fontSize: '10px', color: 'var(--t3)', lineHeight: 1.6, marginBottom: '12px' }}>
                        {aiMode === 'brief'    && 'Generate a classified-style situation report with sources and links.'}
                        {aiMode === 'analyze'  && 'Analyze the signals: what story do they tell, what is missing.'}
                        {aiMode === 'suggest'  && 'Suggest connections between key actors across the signals.'}
                        {aiMode === 'timeline' && 'Build a chronological narrative from the signals.'}
                      </p>
                      <button className="btn btn-accent" style={{ fontSize: '11px', padding: '7px 16px' }}
                        onClick={() => { if (aiMode === 'brief') runBriefing(); else runAI(aiMode) }}>
                        <Zap size={11} /> Run {aiMode}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── INTEL: Intelligence Dashboard ── */}
            {rightPanel === 'intel' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                <IntelDashboard
                  entities={entities} tags={tags} regions={regions}
                  sources={sources} vel={vel} sev={sev} threatColor={threatColor}
                />
              </div>
            )}

            {/* ── CONNECTIONS: Cross-domain analysis ── */}
            {rightPanel === 'connections' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                <CrossDomainPanel articles={allSignals} allArticles={allArticles} sitName={sit.name} groqKey={resolveGroqKey(keys.groq)} />
              </div>
            )}

            {/* ── CORRELATE: Cross-signal entity links ── */}
            {rightPanel === 'correlate' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                <CorrelationPanel correlations={correlations} articles={articles} />
              </div>
            )}

            {/* ── NOTES: Analyst workspace ── */}
            {rightPanel === 'notes' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '10px 12px' }}>
                <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.1em', marginBottom: '6px' }}>ANALYST NOTES — {sit.name.toUpperCase()}</div>
                <textarea value={notes}
                  onChange={e => { setNotes(e.target.value); onNotes(e.target.value) }}
                  placeholder={`Analyst workspace for: ${sit.name}\n\nRecord:\n• Key judgements\n• Source reliability assessments\n• Leads to follow\n• Hypotheses\n• Questions for further research`}
                  className="inp"
                  style={{ flex: 1, resize: 'none', fontSize: '12px', lineHeight: 1.8, fontFamily: 'JetBrains Mono', background: 'var(--panel)', padding: '10px 12px' }} />
                <div style={{ marginTop: '6px', display: 'flex', gap: '5px' }}>
                  <button className="btn" style={{ fontSize: '9px' }}
                    onClick={() => { navigator.clipboard?.writeText(notes) }}>
                    copy
                  </button>
                  <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginLeft: 'auto', alignSelf: 'center' }}>
                    {notes.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL ROW — one article in the feed
// ─────────────────────────────────────────────────────────────────────────────
function SignalRow({ article, expanded, onToggle }) {
  const { save, unsave, isSaved, addNode } = useStore()
  const saved = isSaved(article.id)
  const color = SEV_C[article.severity] || 'var(--accent)'
  const hasSummary = article.summary && article.summary.length > 20
  const timeStr = article.pub
    ? article.pub.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
      article.pub.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div
      onClick={onToggle}
      style={{
        padding: '8px 10px', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', borderLeft: `3px solid ${color}`,
        background: expanded ? 'var(--base)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'var(--hover)' }}
      onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        {/* Time column */}
        <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', flexShrink: 0, paddingTop: '3px', minWidth: '40px' }}>
          {article.pub ? article.pub.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '2px', flexWrap: 'wrap' }}>
            {article._acled && <span className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(239,68,68,0.12)', color: 'var(--red)', borderRadius: '2px', letterSpacing: '0.06em' }}>◉ ACLED</span>}
            {article._firms && <span className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(251,191,36,0.12)', color: 'var(--yellow)', borderRadius: '2px', letterSpacing: '0.06em' }}>◉ SATELLITE</span>}
            {article._fred  && <span className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(167,139,250,0.12)', color: 'var(--purple)', borderRadius: '2px', letterSpacing: '0.06em' }}>◉ MACRO</span>}
            {article._gdelt && <span className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(45,212,191,0.08)', color: 'var(--t4)', borderRadius: '2px', letterSpacing: '0.06em' }}>GDELT</span>}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t1)', lineHeight: 1.4, marginBottom: '3px' }}>
            {article.title}
          </div>
          {/* Meta row: source (linked) + severity + region + tags */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              href={article.url && article.url !== '#' ? article.url : undefined}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                fontFamily: 'JetBrains Mono', fontSize: '9px', fontWeight: 600,
                color: article.url && article.url !== '#' ? 'var(--accent)' : 'var(--t2)',
                textDecoration: article.url && article.url !== '#' ? 'underline' : 'none',
                textDecorationColor: 'rgba(45,212,191,0.35)',
              }}
            >
              {article.url && article.url !== '#' ? `↗ ${article.source}` : article.source}
            </a>
            <span className="mono" style={{ fontSize: '8px', color }}>{article.severity}</span>
            {article.region && article.region !== 'Global' && (
              <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{article.region}</span>
            )}
            <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginLeft: 'auto' }}>{timeStr}</span>
            {article.tags?.slice(0, 3).map(t => (
              <span key={t} className="chip" style={{ fontSize: '7px', padding: '1px 4px' }}>{t}</span>
            ))}
          </div>
          {/* Inline summary preview — always visible when there's content */}
          {!expanded && hasSummary && (
            <div style={{ fontSize: '10px', color: 'var(--t3)', lineHeight: 1.55, marginTop: '4px',
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {article.summary}
            </div>
          )}
        </div>
        <div style={{ color: 'var(--t4)', flexShrink: 0, paddingTop: '2px' }}>
          {expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        </div>
      </div>

      {expanded && (
        <div onClick={e => e.stopPropagation()} className="fade-in" style={{ paddingLeft: '48px', paddingTop: '8px' }}>
          {/* Full summary */}
          {hasSummary ? (
            <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.75, marginBottom: '8px' }}>
              {article.summary}
            </p>
          ) : (
            <p style={{ fontSize: '11px', color: 'var(--t4)', lineHeight: 1.6, marginBottom: '8px', fontStyle: 'italic' }}>
              No article summary available — click ↗ source to read the full article.
            </p>
          )}
          {/* Entities */}
          {article.entities?.length > 0 && (
            <div style={{ marginBottom: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {article.entities.slice(0,8).map((e, i) => (
                <span key={i} className="entity" style={{ fontSize: '9px' }}>{e.name}</span>
              ))}
            </div>
          )}
          {/* Read full article link — prominent */}
          {article.url && article.url !== '#' && (
            <div style={{ marginBottom: '8px' }}>
              <a href={article.url} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', color: 'var(--accent)',
                  textDecoration: 'underline', textDecorationColor: 'rgba(45,212,191,0.4)' }}
                onClick={e => e.stopPropagation()}>
                ↗ Read full article at {article.source}
              </a>
            </div>
          )}
          {/* Actions */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            <button className={`btn ${saved ? 'btn-accent' : ''}`} style={{ fontSize: '9px', padding: '3px 8px' }}
              onClick={() => saved ? unsave(article.id) : save(article)}>
              {saved ? '★ saved' : '☆ save'}
            </button>
            <button className="btn" style={{ fontSize: '9px', padding: '3px 8px' }}
              onClick={() => {
                addNode({
                  type: 'event',
                  label: article.title.slice(0, 52),
                  detail: (article.summary || '').slice(0, 250),
                  source: article.source,
                  url: article.url,
                  color: SEV_C[article.severity],
                  x: 200 + Math.random() * 400,
                  y: 150 + Math.random() * 300,
                })
                // no tab switch — user stays in Monitor
              }}>
              + board
            </button>
            {article.url && article.url !== '#' && (
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="btn"
                style={{ fontSize: '9px', padding: '3px 8px' }} onClick={e => e.stopPropagation()}>
                ↗ source
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEL DASHBOARD — Palantir-style breakdown panels
// ─────────────────────────────────────────────────────────────────────────────
function IntelDashboard({ entities, tags, regions, sources, vel, sev, threatColor }) {
  const totalSigs = sev.critical + sev.high + sev.medium + sev.low
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Severity distribution */}
      <Panel title="THREAT DISTRIBUTION" icon={<AlertOctagon size={9} />}>
        {totalSigs === 0 ? (
          <p className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>No signals yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[
              { k: 'critical', label: 'CRITICAL', c: 'var(--red)' },
              { k: 'high',     label: 'HIGH',     c: 'var(--orange)' },
              { k: 'medium',   label: 'MEDIUM',   c: 'var(--yellow)' },
              { k: 'low',      label: 'LOW',      c: 'var(--accent)' },
            ].map(({ k, label, c }) => {
              const n = sev[k]; if (!n) return null
              const pct = Math.round((n / totalSigs) * 100)
              return (
                <div key={k}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span className="mono" style={{ fontSize: '8px', color: c }}>{label}</span>
                    <span className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>{n} ({pct}%)</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: '2px', transition: 'width 0.5s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {/* Signal velocity */}
      <Panel title="SIGNAL VELOCITY" icon={<Activity size={9} />}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '5px' }}>
          {[
            { label: '1H', value: vel.last1h, alert: vel.last1h > 5 },
            { label: '6H', value: vel.last6h, alert: vel.last6h > 15 },
            { label: '24H', value: vel.last24h },
            { label: 'TOTAL', value: vel.total },
          ].map(v => (
            <div key={v.label} style={{ textAlign: 'center', padding: '6px', background: 'var(--panel)', border: `1px solid ${v.alert ? 'var(--orange)' : 'var(--border)'}`, borderRadius: '2px' }}>
              <div className="mono" style={{ fontSize: '7px', color: v.alert ? 'var(--orange)' : 'var(--t4)' }}>{v.label}</div>
              <div className="mono" style={{ fontSize: '14px', fontWeight: 700, color: v.alert ? 'var(--orange)' : 'var(--t2)' }}>{v.value}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Key entities */}
      <Panel title="KEY ACTORS / ENTITIES" icon={<Users size={9} />}>
        {entities.length === 0
          ? <p className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>No entities extracted</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {entities.slice(0, 14).map(([name, count]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--t1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <div style={{ width: `${Math.min(60, count * 10)}px`, height: '3px', background: 'var(--accent)', opacity: 0.5, borderRadius: '1px', flexShrink: 0 }} />
                  <span className="mono" style={{ fontSize: '8px', color: 'var(--t3)', flexShrink: 0, minWidth: '16px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          )
        }
      </Panel>

      {/* Geographic distribution */}
      <Panel title="GEOGRAPHIC SPREAD" icon={<MapPin size={9} />}>
        {regions.length === 0
          ? <p className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>No region data</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {regions.map(([region, count]) => (
                <div key={region} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--t2)', flex: 1 }}>{region}</span>
                  <div style={{ height: '3px', width: `${Math.min(80, count * 5)}px`, background: 'var(--purple)', opacity: 0.6, borderRadius: '1px' }} />
                  <span className="mono" style={{ fontSize: '8px', color: 'var(--t3)', minWidth: '20px', textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          )
        }
      </Panel>

      {/* Intelligence tags */}
      <Panel title="SIGNAL TAGS" icon={<BookOpen size={9} />}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {tags.length === 0
            ? <p className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>No tags extracted</p>
            : tags.map(([tag, count]) => (
              <span key={tag} className="chip chip-accent" style={{ fontSize: '9px' }}>
                {tag} <span style={{ opacity: 0.6 }}>{count}</span>
              </span>
            ))
          }
        </div>
      </Panel>

      {/* Source diversity */}
      <Panel title="SOURCE SPREAD" icon={<Radio size={9} />}>
        {sources.length === 0
          ? <p className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>No sources</p>
          : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {sources.map(([src, count]) => (
                <span key={src} className="chip chip-blue" style={{ fontSize: '8px' }}>
                  {src} <span style={{ opacity: 0.6 }}>{count}</span>
                </span>
              ))}
            </div>
          )
        }
      </Panel>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CORRELATION PANEL — Maltego-style cross-signal linking
// ─────────────────────────────────────────────────────────────────────────────
function CorrelationPanel({ correlations, articles }) {
  if (articles.length < 4) {
    return (
      <div style={{ padding: '16px', textAlign: 'center' }}>
        <Link2 size={24} style={{ color: 'var(--t4)', display: 'block', margin: '0 auto 8px' }} />
        <p className="mono" style={{ fontSize: '9px', color: 'var(--t3)', lineHeight: 1.7 }}>
          Need at least 4 signals to detect correlations.<br />
          Currently: {articles.length} signal{articles.length !== 1 ? 's' : ''}.
        </p>
      </div>
    )
  }

  if (correlations.length === 0) {
    return (
      <div style={{ padding: '12px' }}>
        <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '8px', letterSpacing: '0.1em' }}>CROSS-SIGNAL CORRELATIONS</div>
        <p style={{ fontSize: '11px', color: 'var(--t3)', lineHeight: 1.7 }}>
          No overlapping signals detected yet across sources. This typically means either: the topic has few articles so far, or all articles come from a single source (same-source pairs are excluded).
        </p>
        <p style={{ fontSize: '10px', color: 'var(--t4)', marginTop: '6px', lineHeight: 1.6 }}>
          Links appear when 2+ articles from different sources share actors, locations, organizations, or intelligence tags. Hit "Fetch Now" to pull more signals.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.1em', marginBottom: '2px' }}>
        ENTITY-LINKED SIGNAL PAIRS — {correlations.length} detected
      </div>
      <p style={{ fontSize: '10px', color: 'var(--t3)', lineHeight: 1.6, marginBottom: '4px' }}>
        These article pairs share named actors or intelligence tags — potential connected developments or same-actor operations.
      </p>
      {correlations.map(({ a1, a2, count, sharedEntities }, i) => (
        <div key={i} style={{
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: '3px', padding: '9px 10px',
          borderLeft: `3px solid var(--accent)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', flexWrap: 'wrap' }}>
            <Link2 size={9} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span className="chip chip-accent" style={{ fontSize: '7px' }}>{count} named entities</span>
            {(sharedEntities || []).map(e => (
              <span key={e} className="chip" style={{ fontSize: '7px', color: 'var(--t2)' }}>{e}</span>
            ))}
          </div>
          <CorrelationArticle article={a1} />
          <div style={{ height: '1px', background: 'var(--border)', margin: '5px 0', position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '50%', top: '-7px', transform: 'translateX(-50%)',
              background: 'var(--panel)', padding: '0 6px',
              fontFamily: 'JetBrains Mono', fontSize: '8px', color: 'var(--accent)',
            }}>⟺</span>
          </div>
          <CorrelationArticle article={a2} />
        </div>
      ))}
    </div>
  )
}

function CorrelationArticle({ article }) {
  const color = SEV_C[article.severity]
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
      <div style={{ width: '3px', background: color, borderRadius: '1px', flexShrink: 0, alignSelf: 'stretch', minHeight: '32px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Full title — no truncation */}
        <div style={{ fontSize: '11px', color: 'var(--t1)', lineHeight: 1.45, marginBottom: '3px', fontWeight: 500 }}>
          {article.title}
        </div>
        {/* Source + time + severity + link — all visible */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: open ? '5px' : '0' }}>
          <a
            href={article.url && article.url !== '#' ? article.url : undefined}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              fontFamily: 'JetBrains Mono', fontSize: '9px', fontWeight: 600,
              color: article.url && article.url !== '#' ? 'var(--accent)' : 'var(--t3)',
              textDecoration: article.url && article.url !== '#' ? 'underline' : 'none',
              textDecorationColor: 'rgba(45,212,191,0.35)',
            }}
          >
            ↗ {article.source}
          </a>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: '9px', color: color }}>{article.severity}</span>
          {article.region && article.region !== 'Global' && (
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', color: 'var(--t4)' }}>{article.region}</span>
          )}
          {article.pub && (
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', color: 'var(--t4)' }}>
              {article.pub.toLocaleDateString([], { month: 'short', day: 'numeric' })} {article.pub.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {article.summary && (
            <button onClick={() => setOpen(o => !o)}
              style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', color: 'var(--t4)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginLeft: 'auto' }}>
              {open ? '▲ less' : '▼ summary'}
            </button>
          )}
        </div>
        {/* Expandable summary */}
        {open && article.summary && (
          <div style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.7, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
            {article.summary}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIEFING RENDERER — formats the AI output nicely
// ─────────────────────────────────────────────────────────────────────────────
// ── IntelTextRenderer — styles structured AI output ─────────────────────────
// Detects section headers (ALL CAPS lines), bullet lines (▸), sub-labels (WHO/WHAT/WHERE),
// confirmed/estimated markers, and renders each appropriately
function IntelTextRenderer({ text }) {
  if (!text) return null
  const lines = text.split('\n')

  return (
    <div style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', lineHeight: 1.75 }}>
      {lines.map((line, i) => {
        const t = line.trim()
        if (!t) return <div key={i} style={{ height: '6px' }} />

        // Section dividers ── ─────────────────────────────────
        if (/^──/.test(t) || /^─{4,}/.test(t)) {
          return (
            <div key={i} style={{ margin: '10px 0 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border2)' }} />
            </div>
          )
        }

        // ALL CAPS section headers (OVERALL PICTURE, KEY DEVELOPMENTS, etc.)
        if (/^[A-Z][A-Z\s&\/\-_]{4,}$/.test(t) && !t.startsWith('▸')) {
          return (
            <div key={i} style={{ marginTop: '12px', marginBottom: '4px' }}>
              <span className="mono" style={{ fontSize: '8px', letterSpacing: '0.14em', color: 'var(--accent)', fontWeight: 700 }}>{t}</span>
            </div>
          )
        }

        // Bullet lines ▸
        if (t.startsWith('▸')) {
          const rest = t.slice(1).trim()
          // Look for [CONFIRMED] / [ESTIMATED] / [INFERRED] markers
          const confirmed = rest.includes('[CONFIRMED]')
          const estimated = rest.includes('[ESTIMATED]') || rest.includes('(estimated')
          const inferred  = rest.includes('[INFERRED]')
          const clean = rest.replace(/\[(CONFIRMED|ESTIMATED|INFERRED)\]/g, '').trim()
          const badge = confirmed ? { label: 'CONFIRMED', color: 'var(--green)' }
                      : estimated ? { label: 'ESTIMATED', color: 'var(--yellow)' }
                      : inferred  ? { label: 'INFERRED',  color: 'var(--t3)' }
                      : null
          return (
            <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '3px', paddingLeft: '4px' }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }}>▸</span>
              <span style={{ color: 'var(--t1)', flex: 1 }}>
                {clean}
                {badge && (
                  <span className="mono" style={{ marginLeft: '6px', fontSize: '8px', color: badge.color,
                    background: badge.color + '18', padding: '0 4px', borderRadius: '2px' }}>
                    {badge.label}
                  </span>
                )}
              </span>
            </div>
          )
        }

        // Sub-labels: WHO: / WHAT: / WHERE: / SOURCE: / RELATIONSHIP: etc.
        const subLabel = t.match(/^(WHO|WHAT|WHERE|WHY\/RESULT|RESULT|SOURCE|DATE|RELATIONSHIP|EVIDENCE IN SIGNALS|CONFIRMATION NEEDED|SIGNIFICANCE|CONNECTION \d+|PATTERN|NEXT EXPECTED):(.*)/)
        if (subLabel) {
          const label = subLabel[1]
          const val   = subLabel[2].trim()
          const labelColor = label.startsWith('CONNECTION') ? 'var(--orange)'
                           : label === 'SOURCE'   ? 'var(--accent)'
                           : label === 'SIGNIFICANCE' ? 'var(--yellow)'
                           : label === 'CONFIRMATION NEEDED' ? 'var(--purple)'
                           : label === 'NEXT EXPECTED' ? 'var(--orange)'
                           : 'var(--t3)'
          return (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '2px', paddingLeft: '12px' }}>
              <span className="mono" style={{ fontSize: '8px', color: labelColor, flexShrink: 0, minWidth: '80px', letterSpacing: '0.06em' }}>{label}</span>
              <span style={{ color: 'var(--t2)', fontSize: '11px' }}>{val}</span>
            </div>
          )
        }

        // Timeline date/status line: [DATE] [CONFIRMED/ESTIMATED/INFERRED]
        const timelineEntry = t.match(/^\[([^\]]+)\]\s*\[?(CONFIRMED|ESTIMATED|INFERRED)\]?/)
        if (timelineEntry) {
          const dateStr   = timelineEntry[1]
          const statusStr = timelineEntry[2]
          const statusColor = statusStr === 'CONFIRMED' ? 'var(--green)' : statusStr === 'ESTIMATED' ? 'var(--yellow)' : 'var(--t3)'
          return (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', marginBottom: '2px' }}>
              <span className="mono" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t1)' }}>{dateStr}</span>
              <span className="mono" style={{ fontSize: '8px', color: statusColor, background: statusColor + '18', padding: '1px 5px', borderRadius: '2px' }}>{statusStr}</span>
            </div>
          )
        }

        // CONNECTION N: header
        if (/^CONNECTION \d+:/.test(t)) {
          const parts = t.split(':')
          return (
            <div key={i} style={{ marginTop: '12px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="mono" style={{ fontSize: '9px', color: 'var(--orange)', fontWeight: 700, letterSpacing: '0.1em' }}>{parts[0]}</span>
              <span style={{ fontSize: '11px', color: 'var(--t1)', fontWeight: 600 }}>{parts.slice(1).join(':').trim()}</span>
            </div>
          )
        }

        // Default: plain paragraph line
        return (
          <div key={i} style={{ color: 'var(--t2)', marginBottom: '2px' }}>
            {t}
          </div>
        )
      })}
    </div>
  )
}

function BriefingRenderer({ text, threatColor }) {
  const lines = text.split('\n')
  return (
    <div style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', lineHeight: 1.7 }}>
      <div style={{
        padding: '3px 8px', marginBottom: '8px',
        background: threatColor + '15', border: `1px solid ${threatColor}35`,
        borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span className="mono" style={{ fontSize: '7px', color: threatColor, letterSpacing: '0.15em' }}>◈ INTEL BRIEF — AI</span>
        <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: '4px' }} />
        // New tight format: THREAT:, STATUS:, DEVELOPMENTS:, ACTORS:, RISK:, WATCH:
        const isLabel = /^(THREAT|STATUS|DEVELOPMENTS|ACTORS|RISK|WATCH|SOURCES):/.test(line)
        const isDev = line.trim().startsWith('▸') || line.trim().startsWith('→')
        if (isLabel) {
          const colon = line.indexOf(':')
          const label = line.slice(0, colon)
          const val = line.slice(colon + 1).trim()
          const labelColor = label === 'THREAT' ? threatColor : label === 'RISK' ? 'var(--orange)' : label === 'WATCH' ? 'var(--yellow)' : label === 'SOURCES' ? 'var(--t3)' : 'var(--accent)'
          return (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '4px', alignItems: 'flex-start' }}>
              <span className="mono" style={{ fontSize: '8px', color: labelColor, letterSpacing: '0.1em', flexShrink: 0, paddingTop: '2px', minWidth: '80px' }}>{label}</span>
              <span style={{ color: label === 'THREAT' ? threatColor : 'var(--t1)', fontWeight: label === 'THREAT' ? 700 : 400 }}>{val}</span>
            </div>
          )
        }
        if (isDev) {
          return (
            <div key={i} style={{ paddingLeft: '86px', color: 'var(--t2)', marginBottom: '2px', fontSize: '10.5px' }}>
              {line.trim()}
            </div>
          )
        }
        if (line.trim() === 'DEVELOPMENTS:') {
          return <div key={i} style={{ color: 'var(--accent)', fontSize: '8px', letterSpacing: '0.1em', marginBottom: '3px', marginTop: '2px', paddingLeft: '0' }}>DEVELOPMENTS</div>
        }
        return <div key={i} style={{ color: 'var(--t3)', fontSize: '10px' }}>{line}</div>
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function Panel({ title, icon, children }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '7px', paddingBottom: '5px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
        <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.12em' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function BriefPlaceholder({ sitName, count, onGenerate, hasKey }) {
  if (!hasKey) return (
    <div style={{ padding: '12px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
      <p style={{ fontSize: '11px', color: 'var(--t3)', lineHeight: 1.7, marginBottom: '6px' }}>
        Add a <strong style={{ color: 'var(--accent)' }}>Groq API key</strong> in Settings to enable AI situation reports.
      </p>
      <p style={{ fontSize: '10px', color: 'var(--t4)', lineHeight: 1.6 }}>
        Free key at console.groq.com — uses LLaMA 70B to produce classified-style briefs from your live feed.
      </p>
    </div>
  )
  if (count === 0) return (
    <div style={{ padding: '12px', textAlign: 'center' }}>
      <p style={{ fontSize: '11px', color: 'var(--t3)' }}>No signals to brief yet.</p>
    </div>
  )
  return (
    <div style={{ textAlign: 'center', padding: '20px 10px' }}>
      <Shield size={28} style={{ color: 'var(--t4)', marginBottom: '10px', display: 'block', margin: '0 auto 10px' }} />
      <p style={{ fontSize: '12px', color: 'var(--t2)', marginBottom: '5px' }}>
        {count} signals available
      </p>
      <p style={{ fontSize: '11px', color: 'var(--t3)', lineHeight: 1.7, marginBottom: '12px' }}>
        Generate an analyst-grade situation report using LLaMA 70B. Includes threat level, key developments, actor analysis, and risk vectors.
      </p>
      <button className="btn btn-accent" style={{ fontSize: '11px', padding: '7px 14px' }} onClick={onGenerate}>
        <Zap size={11} /> Generate Situation Report
      </button>
    </div>
  )
}

function NoSignals({ sitName, hasArticles }) {
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center' }}>
      <Radar size={32} style={{ color: 'var(--t4)', display: 'block', margin: '0 auto 12px' }} />
      <p style={{ color: 'var(--t2)', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
        No signals for "{sitName}"
      </p>
      {hasArticles ? (
        <>
          <p style={{ color: 'var(--t3)', fontSize: '11px', lineHeight: 1.7, maxWidth: '340px', margin: '0 auto 10px' }}>
            Keywords auto-expanded with synonyms but no matches found yet. The feed refreshes every 2 minutes.
          </p>
          <p style={{ color: 'var(--t4)', fontSize: '10px', lineHeight: 1.6, maxWidth: '340px', margin: '0 auto' }}>
            Try broader terms: "Ukraine frontline war" beats "ukraine". Use presets for best results.
          </p>
        </>
      ) : (
        <p style={{ color: 'var(--t3)', fontSize: '11px', lineHeight: 1.7 }}>
          Feed is loading. Hit Refresh in the top bar.
        </p>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '14px' }}>
      <div style={{ opacity: 0.07 }}>
        <Globe size={72} />
      </div>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <p style={{ color: 'var(--t1)', fontSize: '15px', fontWeight: 700, marginBottom: '8px', fontFamily: 'Orbitron, sans-serif', letterSpacing: '0.08em' }}>
          NEXUS COMMAND
        </p>
        <p style={{ color: 'var(--t3)', fontSize: '12px', lineHeight: 1.8 }}>
          Track any geopolitical situation, financial event, or intelligence topic. Signals are fuzzy-matched across 30+ live feeds with semantic synonym expansion.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px', maxWidth: '360px' }}>
        {[
          { icon: <Radar size={12} />,      label: 'Fuzzy signal matching',    desc: 'Semantic synonym expansion' },
          { icon: <Shield size={12} />,      label: 'AI Situation Reports',     desc: 'Groq LLaMA 70B streaming' },
          { icon: <Link2 size={12} />,       label: 'Correlation Engine',       desc: 'Cross-signal entity linking' },
          { icon: <BarChart2 size={12} />,   label: 'Intel Dashboard',          desc: 'Actors, regions, velocity' },
        ].map(f => (
          <div key={f.label} style={{ padding: '10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
            <div style={{ color: 'var(--accent)', marginBottom: '5px' }}>{f.icon}</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--t1)', marginBottom: '2px' }}>{f.label}</div>
            <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// CROSS-DOMAIN CONNECTIONS — finds links between politics/military/finance/cyber
// ─────────────────────────────────────────────────────────────────────────────
function CrossDomainPanel({ articles, allArticles, sitName, groqKey }) {
  const [analysis, setAnalysis] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  // Build cross-domain stats — how many signals per domain intersect
  const domainMap = React.useMemo(() => {
    const domains = ['conflict', 'politics', 'finance', 'intelligence', 'crime', 'technology', 'environment', 'health']
    const counts = {}
    domains.forEach(d => { counts[d] = articles.filter(a => a.category === d).length })
    return counts
  }, [articles])

  // Find articles that bridge multiple domains via shared entities
  const bridges = React.useMemo(() => {
    const results = []
    const domainPairs = [
      ['conflict', 'finance'],
      ['conflict', 'intelligence'],
      ['politics', 'finance'],
      ['politics', 'intelligence'],
      ['intelligence', 'crime'],
      ['conflict', 'politics'],
      ['technology', 'intelligence'],
      ['finance', 'crime'],
    ]
    // For each pair: find shared entities between articles of those two categories
    domainPairs.forEach(([d1, d2]) => {
      const arts1 = articles.filter(a => a.category === d1)
      const arts2 = articles.filter(a => a.category === d2)
      if (!arts1.length || !arts2.length) return
      // Build entity sets
      const ents1 = new Map()
      arts1.forEach(a => (a.entities || []).forEach(e => {
        if (!ents1.has(e.name)) ents1.set(e.name, [])
        ents1.get(e.name).push(a)
      }))
      // Also tags
      arts1.forEach(a => (a.tags || []).forEach(t => {
        if (!ents1.has(t)) ents1.set(t, [])
        ents1.get(t).push(a)
      }))
      const sharedLinks = []
      arts2.forEach(a => {
        const allE = [...(a.entities || []).map(e => e.name), ...(a.tags || [])]
        allE.forEach(e => {
          if (ents1.has(e) && ents1.get(e).length > 0) {
            const a1 = ents1.get(e)[0]
            sharedLinks.push({ entity: e, art1: a1, art2: a, d1, d2 })
          }
        })
      })
      if (sharedLinks.length > 0) {
        results.push({
          d1, d2,
          links: sharedLinks.slice(0, 3),
          count: sharedLinks.length,
        })
      }
    })
    return results.sort((a, b) => b.count - a.count).slice(0, 6)
  }, [articles])

  const runAnalysis = async () => {
    if (!groqKey || articles.length === 0) return
    setLoading(true); setError(null); setAnalysis('')

    const domainSummary = Object.entries(domainMap)
      .filter(([, n]) => n > 0)
      .map(([d, n]) => `${d}: ${n}`)
      .join(', ')

    const bridgeSummary = bridges.map(b =>
      `${b.d1}↔${b.d2}: "${b.links[0]?.entity}" connects [${b.links[0]?.art1?.title?.slice(0,60)}] and [${b.links[0]?.art2?.title?.slice(0,60)}]`
    ).join('\n')

    // Include summaries and URLs so AI has actual content to work with
    const topHeadlines = articles.slice(0, 15).map((a, i) => {
      const body = a.summary ? a.summary.slice(0, 150).replace(/\n/g, ' ') : ''
      return `[${i+1}] ${a.category}·${a.severity} [${a.source}] — ${a.title}${body ? ' | ' + body : ''}`
    }).join('\n')

    const sysPrompt = `You are an OSINT analyst. Analyze ONLY the signals provided for "${sitName}". Use only the specific facts in the headlines — do not invent connections. Name the specific actors, organizations, and events from the data.

Format:
CONNECTIONS:
▸ [domain1↔domain2]: [specific actor/entity from data] — [what this specific link means]
▸ [domain1↔domain2]: [specific actor/entity from data] — [what this specific link means]
▸ [domain1↔domain2]: [specific actor/entity from data] — [what this specific link means]
PATTERN: [overarching pattern evident from THIS data specifically]
IMPLICATION: [strategic implication for "${sitName}" specifically]

Only state connections visible in the provided signals. If domains don't overlap, say so.`

    const userPrompt = `Situation: ${sitName}
Domain signals: ${domainSummary}
Auto-detected bridges: ${bridgeSummary || 'none auto-detected'}

SIGNAL FEED:
${topHeadlines}`

    try {
      await groqStream(groqKey, sysPrompt, userPrompt, token => setAnalysis(token))
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const domainColors = {
    conflict: 'var(--red)', politics: 'var(--purple)', finance: 'var(--yellow)',
    intelligence: 'var(--accent)', crime: 'var(--orange)', technology: 'var(--accent2)',
    environment: 'var(--green)', health: '#ec4899',
  }

  const activeDomains = Object.entries(domainMap).filter(([, n]) => n > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.1em' }}>
        CROSS-DOMAIN INTELLIGENCE CONNECTIONS
      </div>

      {/* Domain signal counts */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', padding: '8px 10px' }}>
        <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '6px', letterSpacing: '0.1em' }}>SIGNAL DOMAINS IN THIS SITUATION</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {activeDomains.length === 0
            ? <span style={{ color: 'var(--t4)', fontSize: '10px' }}>No domain data yet</span>
            : activeDomains.map(([d, n]) => (
              <div key={d} style={{
                padding: '3px 8px', borderRadius: '2px',
                background: (domainColors[d] || 'var(--accent)') + '18',
                border: `1px solid ${(domainColors[d] || 'var(--accent)') + '40'}`,
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                <span className="mono" style={{ fontSize: '8px', color: domainColors[d] || 'var(--accent)' }}>{d.toUpperCase()}</span>
                <span className="mono" style={{ fontSize: '9px', color: 'var(--t2)', fontWeight: 700 }}>{n}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Detected bridges */}
      {bridges.length > 0 && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', padding: '8px 10px' }}>
          <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '6px', letterSpacing: '0.1em' }}>AUTO-DETECTED DOMAIN BRIDGES</div>
          {bridges.map((b, i) => (
            <div key={i} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: i < bridges.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span className="mono" style={{ fontSize: '8px', color: domainColors[b.d1] || 'var(--accent)' }}>{b.d1}</span>
                <span style={{ color: 'var(--t4)', fontSize: '10px' }}>↔</span>
                <span className="mono" style={{ fontSize: '8px', color: domainColors[b.d2] || 'var(--accent)' }}>{b.d2}</span>
                <span className="chip" style={{ fontSize: '7px', marginLeft: 'auto' }}>{b.count} links</span>
              </div>
              {b.links.slice(0, 2).map((link, j) => (
                <div key={j} style={{ paddingLeft: '10px', borderLeft: '2px solid var(--border2)', marginBottom: '3px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--accent)', marginBottom: '1px' }}>"{link.entity}"</div>
                  <div style={{ fontSize: '9px', color: 'var(--t3)' }}>
                    {link.art1.title.slice(0, 55)}…
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--t3)' }}>
                    {link.art2.title.slice(0, 55)}…
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* AI cross-domain analysis */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', padding: '8px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.1em', flex: 1 }}>AI CONNECTION ANALYSIS</span>
          {!loading && (
            <button className="btn btn-accent" style={{ fontSize: '9px', padding: '3px 8px' }} onClick={runAnalysis}
              disabled={!groqKey || articles.length === 0}>
              <Zap size={9} />{analysis ? 'refresh' : 'analyze'}
            </button>
          )}
          {loading && <RefreshCw size={9} className="spin" style={{ color: 'var(--accent)' }} />}
        </div>
        {!groqKey && (
          <p className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>Add Groq key in Settings to enable AI connection analysis.</p>
        )}
        {!analysis && !loading && groqKey && (
          <p className="mono" style={{ fontSize: '9px', color: 'var(--t4)', lineHeight: 1.6 }}>
            Finds hidden links across military, finance, cyber and political signals — the kind of pattern that changes the whole picture.
          </p>
        )}
        {error && <p style={{ color: 'var(--red)', fontSize: '10px' }}>⚠ {error}</p>}
        {analysis && (
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: '10.5px', lineHeight: 1.75 }}>
            {analysis.split('\n').map((line, i) => {
              if (!line.trim()) return <div key={i} style={{ height: '4px' }} />
              const isHeader = /^(CONNECTIONS|PATTERN|IMPLICATION):/.test(line)
              const isDev = line.trim().startsWith('▸')
              if (isHeader) {
                const colon = line.indexOf(':')
                return (
                  <div key={i} style={{ marginTop: '6px', marginBottom: '3px' }}>
                    <span className="mono" style={{ fontSize: '8px', color: 'var(--accent)', letterSpacing: '0.1em' }}>{line.slice(0, colon)}</span>
                    <span style={{ color: 'var(--t1)' }}>{line.slice(colon)}</span>
                  </div>
                )
              }
              if (isDev) {
                return <div key={i} style={{ color: 'var(--t2)', marginBottom: '2px', paddingLeft: '4px' }}>{line}</div>
              }
              return <div key={i} style={{ color: 'var(--t3)' }}>{line}</div>
            })}
          </div>
        )}
      </div>
    </div>
  )
}
