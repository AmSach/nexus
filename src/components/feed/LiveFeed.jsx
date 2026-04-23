import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useUserLocation, filterLocalNews } from '../../hooks/useLocation'
import { useStore } from '../../store'
import ArticleCard from './ArticleCard'
import { Search, X, Globe, ChevronDown, ChevronUp, Loader, Filter, Clock, ExternalLink, Plus, Bookmark, BookmarkCheck } from 'lucide-react'
import { classifyCat, classifySev, classifyRegion, extractTags, extractEntities, hashId } from '../../utils/classify'
import { formatDistanceToNow } from 'date-fns'

// ── GDELT direct fetch (GDELT sends CORS headers natively — no proxy needed) ─
// Fallback to proxy only if direct fails
// ── GDELT URL builder — correct encoding ─────────────────────────────────────
// CRITICAL: query keywords must be encoded, but filter operators (sourcelang:, domain:)
// must be appended UNENCODED as separate space-separated tokens in the query param.
// Wrong:  query=ukraine+war+sourcelang%3Aenglish   (sourcelang gets double-encoded → no results)
// Right:  query=ukraine%20war%20sourcelang:english  (operator stays literal)
function buildGDELTUrl(queryTerms, mode, opts = {}) {
  const {
    maxrecords = 250,
    sort       = 'DateDesc',
    timespan   = '1week',
  } = opts

  // Keep query clean — just encode the terms themselves
  // sourcelang:english appended as raw filter token (space-separated, not encoded)
  const clean = queryTerms.trim().replace(/\s+/g, ' ')
  const encodedTerms = encodeURIComponent(clean)
  // Use + (not %20) to join filter token — GDELT parses both, but + is safer
  const fullQuery = `${encodedTerms}+sourcelang:english`

  const params = [
    `query=${fullQuery}`,
    `mode=${mode}`,
    `format=json`,
    `maxrecords=${maxrecords}`,
    `sort=${sort}`,
    `timespan=${timespan}`,
  ].join('&')

  return `https://api.gdeltproject.org/api/v2/doc/doc?${params}`
}

// ── GDELT fuzzy OR builder — expands single query into OR variants ─────────────
// GDELT supports: (term1 OR term2 OR term3) syntax for fuzzy matching
function buildFuzzyQuery(rawQuery) {
  const trimmed = rawQuery.trim()
  if (!trimmed) return [trimmed]

  const words = trimmed.toLowerCase().split(/\s+/).filter(w => w.length >= 1)
  if (words.length === 0) return [trimmed]

  const variants = []

  if (words.length > 1) {
    // Exact phrase
    variants.push(`"${words.join(' ')}"`)
    // All words OR'd — no parens, GDELT handles bare OR fine
    variants.push(words.join(' OR '))
  } else {
    variants.push(words[0])
    const abbrevMap = {
      'us': 'United States America Washington',
      'uk': 'United Kingdom Britain London',
      'eu': 'European Union Europe Brussels',
      'un': 'United Nations',
      'ir': 'Iran Tehran IRGC',
      'pk': 'Pakistan Islamabad',
    }
    if (abbrevMap[words[0]]) variants.push(abbrevMap[words[0]])
  }

  // Stem variant for longer words
  const stems = words.filter(w => w.length > 5).map(w => w.slice(0, -2)).filter(s => s.length > 3)
  if (stems.length > 0) variants.push(stems.join(' OR '))

  return [...new Set(variants)]
}

// ── CORS proxy list ────────────────────────────────────────────────────────────
const FALLBACK_PROXIES = [
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

// ── GDELT fetch — always goes through /api/gdelt server proxy ─────────────────
// The server builds the URL correctly with sourcelang:english UNENCODED
// Never build GDELT URLs client-side — encoding issues cause zero results
async function gdeltFetch(query, opts = {}, timeout = 55000) {
  const { maxrecords = 250, sort = 'DateDesc', timespan = '3months', mode = 'artlist' } = opts

  // Primary: our server proxy — builds URLs correctly
  try {
    const params = new URLSearchParams({
      q: query,
      mode,
      maxrecords: String(maxrecords),
      timespan,
      sort,
    })
    const r = await fetch(`/api/gdelt?${params}`, { signal: AbortSignal.timeout(timeout) })
    if (r.ok) {
      const d = await r.json()
      if (d && (d.articles || d.timeline)) return d
    }
  } catch {}

  // Fallback: direct GDELT (works in some environments without CORS issues)
  try {
    const enc = encodeURIComponent(query)
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${enc}+sourcelang:english&mode=${mode}&maxrecords=${maxrecords}&sort=${sort}&timespan=${timespan}&format=json`
    const r = await fetch(url, { signal: AbortSignal.timeout(Math.min(timeout, 30000)) })
    if (r.ok) {
      const d = await r.json()
      if (d && typeof d === 'object') return d
    }
  } catch {}

  // Last resort: allorigins proxy for direct GDELT URL
  try {
    const enc = encodeURIComponent(query)
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${enc}+sourcelang:english&mode=${mode}&maxrecords=${maxrecords}&sort=${sort}&timespan=${timespan}&format=json`
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(gdeltUrl)}`
    const r = await fetch(proxy, { signal: AbortSignal.timeout(20000) })
    if (r.ok) {
      const j = await r.json()
      const raw = j?.contents || ''
      if (raw && !raw.startsWith('<') && !raw.startsWith('!')) {
        const d = JSON.parse(raw)
        if (d && typeof d === 'object') return d
      }
    }
  } catch {}

  return null
}

function gdeltToArticle(a) {
  const combo = ((a.title || '') + ' ' + (a.domain || '')).toLowerCase()
  const pubStr = (a.seendate || '').replace(
    /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/,
    '$1-$2-$3T$4:$5:$6Z'
  )
  let pub; try { pub = pubStr ? new Date(pubStr) : new Date() } catch { pub = new Date() }
  return {
    id: hashId((a.url || a.title || '') + 'gs'),
    title: (a.title || '').slice(0, 220),
    summary: '',
    source: a.domain || 'GDELT',
    url: a.url || '#',
    category: classifyCat(combo, 'politics'),
    severity: classifySev(combo),
    region: classifyRegion(combo),
    tags: extractTags(combo),
    entities: extractEntities(a.title || '', ''),
    pub: isNaN(pub) ? new Date() : pub,
    _live: true, _gdelt: true,
  }
}

const SUGGESTED = [
  'Ukraine frontline', 'Gaza ceasefire', 'Iran nuclear',
  'Taiwan China', 'Fed rate decision', 'North Korea missile',
  'Sudan conflict', 'India Pakistan', 'cyber attack',
  'Arctic NATO Russia', 'AI regulation', 'oil OPEC',
]

const SEV_C = { critical: 'var(--red)', high: 'var(--orange)', medium: 'var(--yellow)', low: 'var(--accent)' }

// ── Main LiveFeed ─────────────────────────────────────────────────────────────
export default function LiveFeed({ articles, loading }) {
  const { filters, setFilter, clearFilters, entityFocus, setEntityFocus, addNode, save, unsave, isSaved, addSituation, setActiveSituation, setTab } = useStore()
  const [localSearch, setLocalSearch]     = useState('')
  const [gdeltQuery,  setGdeltQuery]      = useState('')
  const [gdeltInput,  setGdeltInput]      = useState('')
  const [gdeltResults,setGdeltResults]    = useState([])
  const [gdeltLoading,setGdeltLoading]    = useState(false)
  const [gdeltError,  setGdeltError]      = useState(null)
  const [gdeltTotal,  setGdeltTotal]      = useState(0)
  const [gdeltTimespan, setGdeltTimespan] = useState('3months')
  const [gdeltMax,    setGdeltMax]        = useState(75)
  const [gdeltSort,   setGdeltSort]       = useState('DateDesc')
  const [showFilters, setShowFilters]     = useState(false)
  const [mode,        setMode]            = useState('live') // 'live' | 'search'
  const [localOnly,   setLocalOnly]       = useState(false)
  const { loc, loading: locLoading } = useUserLocation()
  const [spark,       setSpark]           = useState(null)
  const prevLen    = useRef(0)
  const [newIds, setNewIds] = useState(new Set())
  const inputRef   = useRef(null)
  const gdeltRef   = useRef(null)
  const abortRef   = useRef(null)  // AbortController for in-flight GDELT requests

  // Flash new articles
  useEffect(() => {
    if (articles.length > prevLen.current && prevLen.current > 0) {
      const incoming = articles.slice(0, articles.length - prevLen.current).map(a => a.id)
      setNewIds(new Set(incoming))
      setTimeout(() => setNewIds(new Set()), 1500)
    }
    prevLen.current = articles.length
  }, [articles.length])

  // Ctrl+F = local search, Ctrl+G = GDELT search, Escape = clear
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); setMode('live'); setTimeout(() => inputRef.current?.focus(), 50) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') { e.preventDefault(); setMode('search'); setTimeout(() => gdeltRef.current?.focus(), 50) }
      if (e.key === 'Escape') { setLocalSearch(''); setEntityFocus(null); clearFilters() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── GDELT search ──────────────────────────────────────────────────────────
  const runGdeltSearch = useCallback(async (q) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    const query = (q !== undefined ? q : gdeltInput).trim()
    if (!query) return
    setGdeltQuery(query)
    setGdeltInput(query)
    setGdeltLoading(true)
    setGdeltError(null)
    setGdeltResults([])
    setSpark(null)
    setMode('search')

    try {
      const opts = { maxrecords: gdeltMax, sort: gdeltSort, timespan: gdeltTimespan }

      // Single server-side call — /api/gdelt builds URLs correctly with unencoded sourcelang:english
      // Server runs 12 search angles in parallel and returns merged deduplicated results
      const result = await gdeltFetch(query, opts, 58000)

      if (signal.aborted) return

      if (!result) {
        setGdeltError(`GDELT search failed — check your connection or try again in 30 seconds.`)
        return
      }

      const seenIds = new Set()
      const mergedArts = []
      ;(result.articles || []).forEach(a => {
        const key = a.url || a.title
        if (!key || seenIds.has(key)) return
        seenIds.add(key)
        const art = gdeltToArticle(a)
        if (art.title.length > 6) mergedArts.push(art)
      })
      mergedArts.sort((a, b) => b.pub - a.pub)

      if (mergedArts.length > 0) {
        setGdeltResults(mergedArts)
        setGdeltTotal(mergedArts.length)
      } else {
        setGdeltError(
          `No results for "${query}" — try a longer timespan, broader terms, or different spelling.`
        )
      }

      // Sparkline from timeline data
      try {
        const tl = result.timeline
        if (tl && typeof tl === 'object') {
          const raw =
            tl?.timeline?.[0]?.series ||
            tl?.timeline?.[0]?.data   ||
            tl?.data?.[0]?.series     ||
            tl?.series                || null
          if (Array.isArray(raw) && raw.length > 1) {
            const vals = raw.map(d =>
              typeof d?.value === 'number' ? d.value :
              typeof d?.normvalue === 'number' ? d.normvalue : 0
            )
            const max = Math.max(...vals, 1)
            if (max > 0) setSpark({ series: raw, vals, max })
          }
        }
      } catch {}
    } catch (e) {
      if (!signal.aborted) setGdeltError(`Search error: ${e.message}`)
    } finally {
      if (!signal.aborted) setGdeltLoading(false)
    }
  }, [gdeltInput, gdeltMax, gdeltSort, gdeltTimespan])

  const clearGdelt = () => {
    setGdeltQuery(''); setGdeltInput(''); setGdeltResults([])
    setGdeltError(null); setSpark(null); setMode('live')
  }

  const sendToMonitor = () => {
    if (!gdeltQuery) return
    const id = addSituation(gdeltQuery)
    setTimeout(() => { setActiveSituation(id); setTab('situations') }, 50)
  }

  // ── Filtered live articles ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let arts = articles
    if (entityFocus) { const ef = entityFocus.toLowerCase(); return arts.filter(a => (a.title + ' ' + (a.summary || '')).toLowerCase().includes(ef)) }
    if (localOnly && loc) arts = filterLocalNews(arts, loc)
    if (filters.category !== 'all') arts = arts.filter(a => a.category === filters.category)
    if (filters.severity !== 'all') arts = arts.filter(a => a.severity === filters.severity)
    if (filters.region   !== 'all') arts = arts.filter(a => a.region   === filters.region)
    const q = (localSearch || filters.search || '').toLowerCase().trim()
    if (q) arts = arts.filter(a => (a.title + ' ' + (a.summary || '') + (a.tags || []).join(' ') + a.source).toLowerCase().includes(q))
    return arts
  }, [articles, filters, localSearch, entityFocus, localOnly, loc])

  const counts = useMemo(() => ({
    critical: articles.filter(a => a.severity === 'critical').length,
    high:     articles.filter(a => a.severity === 'high').length,
  }), [articles])

  const displayList = mode === 'search' ? gdeltResults : filtered

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── TOP BAR: dual search + mode toggle ── */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--base)' }}>

        {/* Row 1: search inputs */}
        <div style={{ padding: '7px 10px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Live feed search */}
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={10} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: mode === 'live' ? 'var(--accent)' : 'var(--t4)' }} />
            <input ref={inputRef} value={localSearch}
              onChange={e => { setLocalSearch(e.target.value); setMode('live') }}
              onFocus={() => setMode('live')}
              placeholder="Filter live feed… (Ctrl+F)"
              className="inp"
              style={{ paddingLeft: '26px', paddingRight: localSearch ? '26px' : '8px', fontSize: '11px',
                borderColor: mode === 'live' && localSearch ? 'rgba(45,212,191,0.4)' : 'var(--border)' }} />
            {localSearch && (
              <button onClick={() => setLocalSearch('')}
                style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
                <X size={10} />
              </button>
            )}
          </div>

          <span className="mono" style={{ fontSize: '9px', color: 'var(--t4)', flexShrink: 0 }}>or</span>

          {/* GDELT global search */}
          <div style={{ position: 'relative', flex: 1.4 }}>
            <Globe size={10} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: mode === 'search' ? 'var(--accent)' : 'var(--t4)' }} />
            <input ref={gdeltRef} value={gdeltInput}
              onChange={e => setGdeltInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runGdeltSearch()}
              onFocus={() => { if (gdeltQuery) setMode('search') }}
              placeholder="Search 250K+ global sources via GDELT… (Ctrl+G)"
              className="inp"
              style={{ paddingLeft: '26px', paddingRight: gdeltInput ? '26px' : '8px', fontSize: '11px',
                borderColor: mode === 'search' ? 'rgba(45,212,191,0.4)' : 'var(--border)' }} />
            {gdeltInput && (
              <button onClick={clearGdelt}
                style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
                <X size={10} />
              </button>
            )}
          </div>
          <button className="btn btn-accent" style={{ fontSize: '10px', padding: '4px 10px', flexShrink: 0, height: '28px' }}
            onClick={() => runGdeltSearch()} disabled={gdeltLoading || !gdeltInput.trim()}>
            {gdeltLoading ? <Loader size={10} className="spin" /> : <Globe size={10} />}
          </button>
          <button className="btn" style={{ padding: '4px 7px', flexShrink: 0, height: '28px' }}
            onClick={() => setShowFilters(s => !s)} title="Search options">
            <Filter size={10} style={{ color: showFilters ? 'var(--accent)' : 'var(--t3)' }} />
          </button>
        </div>

        {/* Row 2: GDELT filter options */}
        {showFilters && (
          <div style={{ padding: '0 10px 7px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>TIMESPAN</span>
              <select value={gdeltTimespan} onChange={e => setGdeltTimespan(e.target.value)} className="inp"
                style={{ width: 'auto', fontSize: '9px', padding: '2px 4px' }}>
                {[['1day','24h'],['3days','3d'],['1week','1w'],['2weeks','2w'],['1month','1mo'],['3months','3mo'],['6months','6mo'],['1year','1yr']].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>SORT</span>
              <select value={gdeltSort} onChange={e => setGdeltSort(e.target.value)} className="inp"
                style={{ width: 'auto', fontSize: '9px', padding: '2px 4px' }}>
                <option value="DateDesc">Newest</option>
                <option value="DateAsc">Oldest</option>
                <option value="HybridRel">Relevance</option>
                <option value="ToneAsc">Most negative</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>MAX</span>
              <select value={gdeltMax} onChange={e => setGdeltMax(Number(e.target.value))} className="inp"
                style={{ width: 'auto', fontSize: '9px', padding: '2px 4px' }}>
                {[25,50,75,100,150,200,250].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Row 3: mode indicator + stats */}
        <div style={{ padding: '4px 10px 6px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Mode tabs */}
          <button onClick={() => setMode('live')}
            className="mono"
            style={{ fontSize: '8px', padding: '2px 7px', borderRadius: '2px', cursor: 'pointer', border: 'none',
              background: mode === 'live' ? 'rgba(45,212,191,0.12)' : 'transparent',
              color: mode === 'live' ? 'var(--accent)' : 'var(--t4)' }}>
            ● LIVE {loading && <span className="pulse">…</span>}
          </button>
          {gdeltQuery && (
            <button onClick={() => setMode('search')}
              className="mono"
              style={{ fontSize: '8px', padding: '2px 7px', borderRadius: '2px', cursor: 'pointer', border: 'none',
                background: mode === 'search' ? 'rgba(45,212,191,0.12)' : 'transparent',
                color: mode === 'search' ? 'var(--accent)' : 'var(--t4)' }}>
              ◈ GDELT "{gdeltQuery.slice(0, 24)}{gdeltQuery.length > 24 ? '…' : ''}"
            </button>
          )}

          {mode === 'live' && (
            <>
              <span className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>
                {filtered.length}{articles.length !== filtered.length ? ('/' + articles.length) : ''} articles
              </span>
              {(loc || locLoading) && (
                <button onClick={() => setLocalOnly(l => !l)}
                  style={{ padding:'2px 8px', borderRadius:'2px',
                    border:`1px solid ${localOnly?'var(--accent)':'var(--border)'}`,
                    background: localOnly ? 'rgba(45,212,180,0.12)' : 'transparent',
                    color: localOnly ? 'var(--accent)' : 'var(--t4)',
                    cursor:'pointer', fontSize:'9px', fontFamily:'JetBrains Mono,monospace',
                    display:'flex', alignItems:'center', gap:'3px' }}>
                  📍 {locLoading ? '…detecting' : (loc?.city||loc?.country||'Local')}
                </button>
              )}
              {counts.critical > 0 && <span className="mono" style={{ fontSize: '8px', color: 'var(--red)' }}>● {counts.critical} critical</span>}
              {counts.high > 0     && <span className="mono" style={{ fontSize: '8px', color: 'var(--orange)' }}>● {counts.high} high</span>}
              {entityFocus && (
                <span className="chip chip-accent" style={{ fontSize: '7px', cursor: 'pointer' }} onClick={() => setEntityFocus(null)}>
                  entity: {entityFocus} ×
                </span>
              )}
            </>
          )}
          {mode === 'search' && gdeltQuery && (
            <>
              <span className="mono" style={{ fontSize: '8px', color: 'var(--t3)' }}>
                {gdeltTotal} results · {gdeltTimespan} · GDELT
              </span>
              <button className="btn" style={{ fontSize: '8px', padding: '1px 6px', marginLeft: 'auto' }} onClick={sendToMonitor}>
                + monitor this
              </button>
              <button className="btn" style={{ fontSize: '8px', padding: '1px 6px' }}
                onClick={() => { gdeltResults.slice(0,10).forEach(a => addNode({ type:'event', label:a.title.slice(0,50), source:a.source, url:a.url, color:SEV_C[a.severity], x:100+Math.random()*600, y:80+Math.random()*400 })) /* no setTab — stay on search */ }}>
                top 10 → board ✓
              </button>
              <button className="btn" style={{ fontSize: '8px', padding: '1px 6px' }} onClick={clearGdelt}>
                ✕ clear
              </button>
            </>
          )}
        </div>

        {/* GDELT suggested queries — only when search is empty */}
        {!gdeltQuery && mode === 'live' && !localSearch && (
          <div style={{ padding: '0 10px 7px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: '7px', color: 'var(--t4)', alignSelf: 'center', marginRight: '2px', letterSpacing: '0.08em' }}>QUICK SEARCH:</span>
            {SUGGESTED.map(q => (
              <button key={q} onClick={() => { setGdeltInput(q); runGdeltSearch(q) }}
                className="mono"
                style={{ fontSize: '8px', padding: '2px 7px', borderRadius: '2px', cursor: 'pointer',
                  background: 'var(--panel)', border: '1px solid var(--border)',
                  color: 'var(--t3)', transition: 'all 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(45,212,191,0.4)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)' }}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── VOLUME SPARKLINE (GDELT search only) ── */}
      {mode === 'search' && spark && (
        <div style={{ flexShrink: 0, padding: '6px 10px 5px', borderBottom: '1px solid var(--border)', background: 'var(--base)' }}>
          <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginBottom: '4px' }}>
            COVERAGE VOLUME OVER {gdeltTimespan.toUpperCase()} — peak: {spark.max} articles
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1px', height: '32px' }}>
            {spark.vals.map((v, i) => {
              const h = Math.max(2, Math.round((v / spark.max) * 32))
              const isHigh = v > spark.max * 0.6
              const label = spark.series[i]?.date || `${i}`
              return (
                <div key={i} title={`${label}: ${v.toFixed(1)}`}
                  style={{ flex: 1, height: `${h}px`,
                    background: isHigh ? 'var(--orange)' : 'rgba(45,212,191,0.5)',
                    borderRadius: '1px', transition: 'opacity 0.1s' }} />
              )
            })}
          </div>
        </div>
      )}

      {/* ── CATEGORY FILTER (live mode only) ── */}
      {mode === 'live' && (
        <CategoryFilter filters={filters} setFilter={setFilter} clearFilters={clearFilters} articles={articles} />
      )}

      {/* ── ARTICLE LIST ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* GDELT loading */}
        {mode === 'search' && gdeltLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '10px' }}>
            <Loader size={22} className="spin" style={{ color: 'var(--accent)' }} />
            <span className="mono" style={{ fontSize: '10px', color: 'var(--t3)' }}>Searching GDELT global news database…</span>
            <span className="mono" style={{ fontSize: '9px', color: 'var(--t4)', marginTop: '4px' }}>May take up to 2 minutes — do not close this tab</span>
          </div>
        )}

        {/* GDELT error */}
        {mode === 'search' && gdeltError && !gdeltLoading && (
          <div style={{ padding: '16px' }}>
            <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '3px' }}>
              <div style={{ color: 'var(--red)', fontSize: '11px', marginBottom: '4px' }}>⚠ {gdeltError}</div>
              <button className="btn" style={{ fontSize: '9px' }} onClick={() => runGdeltSearch()}>retry</button>
            </div>
          </div>
        )}

        {/* Results */}
        {!gdeltLoading && displayList.map(a => mode === 'search'
          ? <GDELTResultRow key={a.id} article={a} onAddNode={addNode} onSave={save} onUnsave={unsave} saved={isSaved(a.id)} />
          : <ArticleCard key={a.id} article={a} isNew={newIds.has(a.id)} />
        )}

        {/* Live empty */}
        {mode === 'live' && !loading && filtered.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <p style={{ color: 'var(--t3)', fontSize: '12px' }}>No articles match current filters.</p>
            <button className="btn" style={{ marginTop: '8px', fontSize: '10px' }} onClick={clearFilters}>clear filters</button>
          </div>
        )}

        {/* GDELT no results */}
        {mode === 'search' && !gdeltLoading && !gdeltError && gdeltResults.length === 0 && gdeltQuery && (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <Globe size={24} style={{ color: 'var(--t4)', marginBottom: '8px' }} />
            <p style={{ color: 'var(--t2)', fontSize: '12px', marginBottom: '4px' }}>No results for "{gdeltQuery}"</p>
            <p style={{ color: 'var(--t4)', fontSize: '10px', lineHeight: 1.7 }}>Try broader keywords, or increase the timespan in filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Category filter bar ───────────────────────────────────────────────────────
function CategoryFilter({ filters, setFilter, clearFilters, articles }) {
  const cats = useMemo(() => {
    const m = {}
    articles.forEach(a => { m[a.category] = (m[a.category] || 0) + 1 })
    return m
  }, [articles])

  const CATS = ['all','conflict','politics','intelligence','finance','health','environment','technology','crime']
  const COLORS = { conflict:'var(--red)', politics:'var(--purple)', intelligence:'var(--accent)', finance:'var(--yellow)', health:'#ec4899', environment:'var(--green)', technology:'var(--accent2)', crime:'var(--orange)' }

  return (
    <div style={{ flexShrink: 0, display: 'flex', gap: '4px', padding: '5px 8px', borderBottom: '1px solid var(--border)', overflowX: 'auto', background: 'var(--base)' }}>
      {CATS.map(cat => {
        const active = filters.category === cat || (cat === 'all' && filters.category === 'all')
        const count  = cat === 'all' ? articles.length : (cats[cat] || 0)
        if (cat !== 'all' && !count) return null
        return (
          <button key={cat} onClick={() => setFilter('category', cat)}
            className="mono"
            style={{ fontSize: '8px', padding: '2px 7px', borderRadius: '2px', cursor: 'pointer', flexShrink: 0, border: 'none',
              background: active ? (COLORS[cat] || 'rgba(45,212,191,0.12)') + (active ? '20' : '00') : 'transparent',
              color: active ? (COLORS[cat] || 'var(--accent)') : 'var(--t4)',
              borderBottom: active ? `2px solid ${COLORS[cat] || 'var(--accent)'}` : '2px solid transparent',
            }}>
            {cat === 'all' ? `ALL ${count}` : `${cat} ${count}`}
          </button>
        )
      })}
    </div>
  )
}

// ── GDELT result row (no summary available from GDELT artlist) ────────────────
function GDELTResultRow({ article, onAddNode, onSave, onUnsave, saved }) {
  const [open, setOpen] = useState(false)
  const color = SEV_C[article.severity] || 'var(--accent)'
  const ago = (() => { try { return formatDistanceToNow(article.pub, { addSuffix: true }) } catch { return '' } })()

  return (
    <div onClick={() => setOpen(o => !o)}
      style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
        borderLeft: `3px solid ${color}`, transition: 'background 0.1s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '3px', flexWrap: 'wrap' }}>
        <a href={article.url !== '#' ? article.url : undefined} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ fontFamily: 'JetBrains Mono', fontSize: '9px', fontWeight: 600,
            color: article.url !== '#' ? 'var(--accent)' : 'var(--t2)',
            textDecoration: article.url !== '#' ? 'underline' : 'none',
            textDecorationColor: 'rgba(45,212,191,0.35)' }}>
          ↗ {article.source}
        </a>
        <span className="mono" style={{ fontSize: '8px', color }}>{article.severity}</span>
        {article.region && article.region !== 'Global' && (
          <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{article.region}</span>
        )}
        <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginLeft: 'auto' }}>{ago}</span>
        {article.tags?.slice(0,3).map(t => <span key={t} className="chip" style={{ fontSize: '7px' }}>{t}</span>)}
      </div>

      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t1)', lineHeight: 1.4 }}>
        {article.title}
      </div>

      {!open && (
        <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)', marginTop: '2px' }}>
          GDELT · title only · click to expand
        </div>
      )}

      {open && (
        <div onClick={e => e.stopPropagation()} className="fade-in" style={{ marginTop: '7px' }}>
          <div style={{ fontSize: '11px', color: 'var(--t3)', lineHeight: 1.6, marginBottom: '7px', fontStyle: 'italic' }}>
            GDELT provides titles and source metadata only — no article body. Full content at source.
          </div>
          {article.entities?.length > 0 && (
            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '7px' }}>
              {article.entities.slice(0,8).map((e,i) => <span key={i} className="entity" style={{ fontSize: '8px' }}>{e.name}</span>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: '5px' }}>
            <button className={`btn ${saved ? 'btn-accent' : ''}`} style={{ fontSize: '9px', padding: '2px 7px' }}
              onClick={() => saved ? onUnsave(article.id) : onSave(article)}>
              {saved ? <><BookmarkCheck size={9}/> saved</> : <><Bookmark size={9}/> save</>}
            </button>
            <button className="btn" style={{ fontSize: '9px', padding: '2px 7px' }}
              onClick={() => onAddNode({ type:'event', label:article.title.slice(0,52), source:article.source, url:article.url, color, x:200+Math.random()*400, y:150+Math.random()*300 })}>
              <Plus size={9}/> board
            </button>
            {article.url !== '#' && (
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="btn"
                style={{ fontSize: '9px', padding: '2px 7px' }} onClick={e => e.stopPropagation()}>
                <ExternalLink size={9}/> read full article
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
