/**
 * IntelCenter — Unified intelligence workspace
 *
 * Three modes, one tab:
 *   FEED    — live RSS stream from 157 sources, filterable
 *   SEARCH  — GDELT global search across 250K+ outlets
 *   MONITOR — situation tracking with AI analysis
 *
 * Layout:
 *   [mode bar] [search/filter bar]
 *   [left panel: feed/results/situations] [right panel: article detail / situation analyst]
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../../store'
import { useActiveFetch } from '../../hooks/useActiveFetch'
import { useGroq } from '../../hooks/useGroq'
import { useSweepDelta } from '../../hooks/useSweepDelta'
import { matchArticlesToSituation, classifyCat, classifySev, classifyRegion, extractTags, extractEntities, hashId } from '../../utils/classify'
import { SITUATION_EXPANSIONS, PRESETS } from '../../data/constants'
import {
  Search, Globe, Radio, Plus, X, RefreshCw, ChevronDown, ChevronUp,
  Loader, ExternalLink, Bookmark, BookmarkCheck, GitBranch, Brain,
  Zap, Clock, Shield, Layers, Link2, AlertTriangle, Activity,
  Filter, BarChart2, Edit3, Trash2
} from 'lucide-react'

// ── GDELT infrastructure ──────────────────────────────────────────────────────
function buildGDELTUrl(queryTerms, mode, opts = {}) {
  const { maxrecords = 200, sort = 'DateDesc', timespan = '1week' } = opts
  const encodedTerms = encodeURIComponent(queryTerms.trim())
  const fullQuery = `${encodedTerms}%20sourcelang:english`
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${fullQuery}&mode=${mode}&format=json&maxrecords=${maxrecords}&sort=${sort}&timespan=${timespan}`
}

function buildFuzzyQuery(raw) {
  const words = raw.trim().toLowerCase().split(/\s+/).filter(w => w.length >= 1)
  if (!words.length) return [raw]
  const variants = []
  if (words.length > 1) {
    variants.push(`"${words.join(' ')}"`)
    variants.push(`(${words.join(' OR ')})`)
  } else {
    variants.push(words[0])
    const abbrev = { us:'(United States OR America)', uk:'(United Kingdom OR Britain)', eu:'(European Union OR Europe)', un:'(United Nations)', ir:'(Iran OR Tehran)', pk:'(Pakistan OR Islamabad)' }
    if (abbrev[words[0]]) variants.push(abbrev[words[0]])
  }
  const stems = words.filter(w => w.length > 5).map(w => w.slice(0,-2)).filter(s => s.length > 3)
  if (stems.length) variants.push(`(${stems.join(' OR ')})`)
  return variants
}

const PROXIES = [
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
]

async function gdeltFetch(url, timeout = 12000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    if (r.ok) { const t = await r.text(); const d = JSON.parse(t); if (d && typeof d === 'object') return d }
  } catch {}
  for (const proxy of PROXIES) {
    try {
      const r = await fetch(proxy(url), { signal: AbortSignal.timeout(timeout + 3000) })
      if (!r.ok) continue
      const j = await r.json()
      const raw = j.contents || j.body || j.data || ''
      if (raw && raw.length > 10) {
        const d = JSON.parse(raw)
        if (d && typeof d === 'object') return d
      }
    } catch { continue }
  }
  return null
}

function gdeltToArticle(a) {
  const combo = ((a.title || '') + ' ' + (a.domain || '')).toLowerCase()
  const pubStr = (a.seendate || '').replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z')
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

const SEV_C = { critical: 'var(--red)', high: 'var(--orange)', medium: 'var(--yellow)', low: 'var(--accent)' }
const SEV_ORDER = { critical: 4, high: 3, medium: 2, low: 1 }

// ── Severity badge ────────────────────────────────────────────────────────────
function SevBadge({ sev }) {
  const c = SEV_C[sev] || 'var(--t4)'
  return <span className="mono" style={{ fontSize: '7px', padding: '1px 5px', borderRadius: '2px', background: c+'18', color: c, letterSpacing: '0.06em' }}>{(sev||'').toUpperCase()}</span>
}

// ── Article row ───────────────────────────────────────────────────────────────
function ArticleRow({ article, selected, onSelect, onSave, saved, onAddNode, compact = false }) {
  const isNew = article._new
  const c = SEV_C[article.severity] || 'var(--accent)'
  return (
    <div onClick={() => onSelect(article)}
      style={{
        padding: compact ? '6px 10px' : '8px 12px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: selected ? 'rgba(45,212,191,0.05)' : 'transparent',
        borderLeft: selected ? `3px solid ${c}` : `3px solid transparent`,
        transition: 'background 0.1s',
        animation: isNew ? 'fadeIn 0.4s ease' : 'none',
      }}>
      {/* Source + badges row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px', flexWrap: 'wrap' }}>
        {article._acled   && <span className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(239,68,68,0.12)', color: 'var(--red)', borderRadius: '2px' }}>◉ ACLED</span>}
        {article._firms   && <span className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(251,191,36,0.12)', color: 'var(--yellow)', borderRadius: '2px' }}>◉ SAT</span>}
        {article._fred    && <span className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(167,139,250,0.12)', color: 'var(--purple)', borderRadius: '2px' }}>◉ MACRO</span>}
        {article._gdelt   && <span className="mono" style={{ fontSize: '7px', padding: '1px 4px', background: 'rgba(45,212,191,0.07)', color: 'var(--t4)', borderRadius: '2px' }}>GDELT</span>}
        <span className="mono" style={{ fontSize: '9px', color: 'var(--accent)' }}>{article.source}</span>
        <SevBadge sev={article.severity} />
        <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginLeft: 'auto' }}>
          {article.pub ? new Date(article.pub).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      {/* Title */}
      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t1)', lineHeight: 1.4 }}>
        {article.title}
      </div>
    </div>
  )
}

// ── Article detail pane ───────────────────────────────────────────────────────
function ArticleDetail({ article, onClose, onSave, saved, onAddNode }) {
  const { briefArticle, loading, error } = useGroq()
  const [brief, setBrief] = useState('')
  const c = SEV_C[article.severity] || 'var(--accent)'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--base)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
          <SevBadge sev={article.severity} />
          <span className="mono" style={{ fontSize: '9px', color: 'var(--accent)' }}>{article.source}</span>
          <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginLeft: 'auto' }}>
            {article.pub ? new Date(article.pub).toLocaleDateString() : ''}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)' }}><X size={12}/></button>
        </div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', lineHeight: 1.4 }}>{article.title}</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {/* Tags */}
        {article.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '10px' }}>
            {article.tags.slice(0,6).map(t => (
              <span key={t} className="mono" style={{ fontSize: '8px', padding: '1px 5px', background: 'rgba(45,212,191,0.07)', color: 'var(--accent)', borderRadius: '2px' }}>{t}</span>
            ))}
          </div>
        )}

        {/* Summary */}
        {article.summary && (
          <p style={{ fontSize: '12px', color: 'var(--t2)', lineHeight: 1.75, marginBottom: '12px' }}>{article.summary}</p>
        )}

        {/* Entities */}
        {article.entities?.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '5px', letterSpacing: '0.1em' }}>ENTITIES</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {article.entities.slice(0,8).map((e,i) => (
                <span key={i} className="entity" style={{ fontSize: '9px' }}>{e.name}</span>
              ))}
            </div>
          </div>
        )}

        {/* AI brief */}
        <div style={{ marginBottom: '12px' }}>
          {!brief && !loading && (
            <button className="btn" style={{ fontSize: '9px', width: '100%', justifyContent: 'center' }}
              onClick={() => briefArticle(article, t => setBrief(t))}>
              <Brain size={9}/> quick AI read
            </button>
          )}
          {loading && <div className="mono" style={{ fontSize: '9px', color: 'var(--accent)', textAlign: 'center' }}><Loader size={10} className="spin" style={{ display: 'inline-block' }}/> reading…</div>}
          {brief && (
            <div style={{ padding: '8px 10px', background: 'rgba(45,212,191,0.04)', border: '1px solid rgba(45,212,191,0.15)', borderRadius: '3px' }}>
              <div className="mono" style={{ fontSize: '7px', color: 'var(--accent)', marginBottom: '5px' }}>◈ AI BRIEF</div>
              <p style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>{brief}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {article.url && article.url !== '#' && (
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ fontSize: '10px' }}>
              <ExternalLink size={10}/> read full article
            </a>
          )}
          <button className={`btn ${saved ? 'btn-accent' : ''}`} style={{ fontSize: '10px' }} onClick={onSave}>
            {saved ? <><BookmarkCheck size={10}/> saved</> : <><Bookmark size={10}/> save</>}
          </button>
          {onAddNode && (
            <button className="btn" style={{ fontSize: '10px' }}
              onClick={() => onAddNode({ type: 'event', label: article.title.slice(0,52), detail: article.summary?.slice(0,200), source: article.source, url: article.url, color: SEV_C[article.severity], x: 200+Math.random()*400, y: 150+Math.random()*300 })}>
              <GitBranch size={10}/> board
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main IntelCenter ──────────────────────────────────────────────────────────
export default function IntelCenter({ articles, loading }) {
  const {
    situations, addSituation, removeSituation, updateSituationNotes,
    activeSituation, setActiveSituation,
    filters, setFilter, clearFilters,
    save, unsave, isSaved,
    addNode, keys,
  } = useStore()

  // Mode: 'feed' | 'search' | 'monitor'
  const [mode, setMode] = useState('feed')

  // Feed state
  const [localSearch, setLocalSearch] = useState('')
  const [selectedArticle, setSelectedArticle] = useState(null)

  // GDELT search state
  const abortRef   = useRef(null)
  const [gdeltInput,   setGdeltInput]   = useState('')
  const [gdeltResults, setGdeltResults] = useState([])
  const [gdeltLoading, setGdeltLoading] = useState(false)
  const [gdeltError,   setGdeltError]   = useState(null)
  const [gdeltTotal,   setGdeltTotal]   = useState(0)
  const [gdeltTimespan, setGdeltTimespan] = useState('1week')
  const [gdeltMax,     setGdeltMax]     = useState(75)

  // Monitor state
  const [newSitName, setNewSitName] = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const [presetGroup, setPresetGroup] = useState('All')

  const { fetchForSituation, loading: fetchLoading, lastFetch } = useActiveFetch()
  const activeSit = situations.find(s => s.id === activeSituation)

  // ── Feed filter ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (mode !== 'feed') return []
    let list = [...articles]
    if (filters.category && filters.category !== 'all') list = list.filter(a => a.category === filters.category)
    if (filters.severity && filters.severity !== 'all') list = list.filter(a => a.severity === filters.severity)
    if (filters.region   && filters.region   !== 'all') list = list.filter(a => a.region === filters.region)
    if (localSearch) {
      const q = localSearch.toLowerCase()
      list = list.filter(a => (a.title+' '+(a.summary||'')+' '+a.source).toLowerCase().includes(q))
    }
    return list
  }, [articles, filters, localSearch, mode])

  // ── GDELT search ──────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q = gdeltInput) => {
    const query = (q || gdeltInput).trim()
    if (!query) return
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    const sig = abortRef.current.signal

    setGdeltInput(query)
    setGdeltLoading(true)
    setGdeltError(null)
    setGdeltResults([])
    setMode('search')

    try {
      const opts = { maxrecords: gdeltMax, sort: 'DateDesc', timespan: gdeltTimespan }
      const variants = buildFuzzyQuery(query)
      const urls = variants.map(v => buildGDELTUrl(v, 'artlist', opts))

      const allFetches = await Promise.all(
        urls.map(u => new Promise(async (res) => {
          sig.addEventListener('abort', () => res(null), { once: true })
          try { res(await gdeltFetch(u, 14000)) } catch { res(null) }
        }))
      )

      if (sig.aborted) return
      const seen = new Set()
      const merged = []
      allFetches.forEach(d => {
        if (!d?.articles) return
        d.articles.forEach(a => {
          const key = a.url || a.title; if (!key || seen.has(key)) return
          seen.add(key)
          const art = gdeltToArticle(a)
          if (art.title.length > 6) merged.push(art)
        })
      })
      merged.sort((a,b) => b.pub - a.pub)

      if (merged.length > 0) { setGdeltResults(merged); setGdeltTotal(merged.length) }
      else setGdeltError(`No results for "${query}". Try broader terms or longer timespan.`)
    } catch (e) {
      if (!abortRef.current?.signal?.aborted) setGdeltError(`Search failed: ${e.message}`)
    } finally {
      if (!abortRef.current?.signal?.aborted) setGdeltLoading(false)
    }
  }, [gdeltInput, gdeltMax, gdeltTimespan])

  // ── Monitor helpers ───────────────────────────────────────────────────────
  const createSit = useCallback((name) => {
    const n = (name || newSitName).trim(); if (!n) return
    const id = addSituation(n)
    setActiveSituation(id)
    setNewSitName('')
    setShowPresets(false)
    setMode('monitor')
  }, [newSitName, addSituation, setActiveSituation])

  const presetGroups = ['All', ...Array.from(new Set(PRESETS.map(p => p.group)))]

  // Current articles list depending on mode
  const displayList = mode === 'feed' ? filtered : mode === 'search' ? gdeltResults : []

  const MODES = [
    { id: 'feed',    label: `◉ Live Feed`, count: articles.length },
    { id: 'search',  label: '⌕ GDELT Search', count: gdeltTotal || null },
    { id: 'monitor', label: `◈ Monitor`, count: situations.length },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Top bar: mode switcher + input ── */}
      <div style={{ flexShrink: 0, background: 'var(--base)', borderBottom: '1px solid var(--border)', padding: '0 0 0 0' }}>
        {/* Mode tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} className="mono"
              style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: '9px', letterSpacing: '0.1em',
                background: mode === m.id ? 'rgba(45,212,191,0.06)' : 'transparent',
                color: mode === m.id ? 'var(--accent)' : 'var(--t3)',
                borderBottom: `2px solid ${mode === m.id ? 'var(--accent)' : 'transparent'}`,
                display: 'flex', alignItems: 'center', gap: '5px' }}>
              {m.label}
              {m.count != null && <span className="chip" style={{ padding: '0 4px', fontSize: '8px' }}>{m.count}</span>}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {loading && <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center' }}><Loader size={10} className="spin" style={{ color: 'var(--accent)' }}/></div>}
        </div>

        {/* Context-sensitive toolbar */}
        {mode === 'feed' && (
          <div style={{ padding: '7px 12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
              <Search size={10} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--t4)' }}/>
              <input value={localSearch} onChange={e => setLocalSearch(e.target.value)}
                placeholder="Filter live feed…" className="inp"
                style={{ paddingLeft: '26px', fontSize: '11px', width: '100%' }}/>
            </div>
            <select value={filters.severity || 'all'} onChange={e => setFilter('severity', e.target.value)}
              className="inp" style={{ fontSize: '10px', padding: '4px 8px', width: 'auto' }}>
              {['all','critical','high','medium','low'].map(s => <option key={s} value={s}>{s === 'all' ? 'All severity' : s}</option>)}
            </select>
            <select value={filters.category || 'all'} onChange={e => setFilter('category', e.target.value)}
              className="inp" style={{ fontSize: '10px', padding: '4px 8px', width: 'auto' }}>
              <option value="all">All categories</option>
              {['politics','conflict','cyber','finance','health','climate','nuclear','military'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filters.region || 'all'} onChange={e => setFilter('region', e.target.value)}
              className="inp" style={{ fontSize: '10px', padding: '4px 8px', width: 'auto' }}>
              <option value="all">All regions</option>
              {['Europe','Middle East','East Asia','South Asia','Africa','North America','Latin America','Arctic'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {(localSearch || filters.severity !== 'all' || filters.category !== 'all' || filters.region !== 'all') && (
              <button className="btn" style={{ fontSize: '9px', padding: '4px 8px' }}
                onClick={() => { setLocalSearch(''); clearFilters() }}>
                <X size={9}/> clear
              </button>
            )}
          </div>
        )}

        {mode === 'search' && (
          <div style={{ padding: '7px 12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Globe size={10} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)' }}/>
              <input value={gdeltInput} onChange={e => setGdeltInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                placeholder="Search 250,000+ global sources via GDELT…" className="inp"
                style={{ paddingLeft: '26px', fontSize: '11px', width: '100%', borderColor: 'rgba(45,212,191,0.3)' }}/>
            </div>
            <select value={gdeltTimespan} onChange={e => setGdeltTimespan(e.target.value)}
              className="inp" style={{ fontSize: '10px', padding: '4px 8px', width: 'auto' }}>
              {['24hours','3days','1week','2weeks','1month','3months'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={gdeltMax} onChange={e => setGdeltMax(Number(e.target.value))}
              className="inp" style={{ fontSize: '10px', padding: '4px 8px', width: 'auto' }}>
              {[50,75,100,150,200,250].map(n => <option key={n} value={n}>{n} results</option>)}
            </select>
            <button className="btn btn-accent" style={{ padding: '5px 12px', fontSize: '10px' }}
              onClick={() => runSearch()} disabled={gdeltLoading || !gdeltInput.trim()}>
              {gdeltLoading ? <Loader size={10} className="spin"/> : <Search size={10}/>} Search
            </button>
            {gdeltResults.length > 0 && (
              <button className="btn" style={{ fontSize: '9px', padding: '4px 8px' }}
                onClick={() => { setGdeltResults([]); setGdeltTotal(0); setGdeltError(null) }}>
                <X size={9}/> clear
              </button>
            )}
          </div>
        )}

        {mode === 'monitor' && (
          <div style={{ padding: '7px 12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input value={newSitName} onChange={e => setNewSitName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createSit()}
              placeholder="Track new situation… (e.g. Pakistan Afghanistan)" className="inp"
              style={{ flex: 1, fontSize: '11px', borderColor: 'rgba(45,212,191,0.3)' }}/>
            <button className="btn btn-accent" style={{ padding: '5px 10px', fontSize: '10px' }} onClick={() => createSit()}>
              <Plus size={10}/> Track
            </button>
            <button className="btn" style={{ fontSize: '9px', padding: '4px 8px' }}
              onClick={() => setShowPresets(p => !p)}>
              <Zap size={9} style={{ color: 'var(--yellow)' }}/> Presets {showPresets ? '▲' : '▼'}
            </button>
          </div>
        )}
      </div>

      {/* Preset panel — shown below toolbar when open */}
      {mode === 'monitor' && showPresets && (
        <div style={{ flexShrink: 0, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--void)' }} className="fade-in">
          <div style={{ display: 'flex', gap: '4px', marginBottom: '7px', flexWrap: 'wrap' }}>
            {presetGroups.map(g => (
              <button key={g} className="btn" style={{ fontSize: '8px', padding: '2px 7px', color: presetGroup === g ? 'var(--accent)' : 'var(--t3)', borderColor: presetGroup === g ? 'rgba(45,212,191,0.3)' : 'var(--border)' }}
                onClick={() => setPresetGroup(g)}>{g}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {PRESETS.filter(p => presetGroup === 'All' || p.group === presetGroup).map(p => (
              <button key={p.name} className="btn" onClick={() => createSit(p.name)}
                style={{ fontSize: '9px', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span>{p.icon||'◈'}</span> {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ════ FEED / SEARCH: article list + detail ════════════════════════ */}
        {(mode === 'feed' || mode === 'search') && (
          <>
            {/* Article list */}
            <div style={{ width: selectedArticle ? '380px' : '100%', flexShrink: 0, borderRight: selectedArticle ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.2s' }}>

              {/* Search suggested queries */}
              {mode === 'search' && !gdeltInput && !gdeltLoading && gdeltResults.length === 0 && (
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '7px', letterSpacing: '0.1em' }}>SUGGESTED SEARCHES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {['Ukraine frontline','Gaza ceasefire','Iran nuclear','Taiwan China','North Korea missile','Sudan conflict','India Pakistan','cyber attack','oil OPEC','Fed rate decision'].map(q => (
                      <button key={q} className="btn" style={{ fontSize: '9px', padding: '3px 8px' }}
                        onClick={() => { setGdeltInput(q); runSearch(q) }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* GDELT search stats */}
              {mode === 'search' && gdeltResults.length > 0 && (
                <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--base)', flexShrink: 0 }}>
                  <span className="mono" style={{ fontSize: '8px', color: 'var(--accent)' }}>{gdeltTotal} results for "{gdeltInput}"</span>
                  <div style={{ flex: 1 }} />
                  <button className="btn" style={{ fontSize: '8px', padding: '2px 7px' }}
                    onClick={() => { gdeltResults.slice(0,15).forEach(a => addNode({ type:'event', label:a.title.slice(0,50), source:a.source, url:a.url, color:SEV_C[a.severity], x:100+Math.random()*600, y:80+Math.random()*400 })) }}>
                    top 15 → board ✓
                  </button>
                </div>
              )}

              {/* Error */}
              {mode === 'search' && gdeltError && (
                <div style={{ padding: '14px', margin: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '3px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '5px' }}>{gdeltError}</div>
                  <button className="btn" style={{ fontSize: '9px' }} onClick={() => runSearch()}>retry</button>
                </div>
              )}

              {/* Loading spinner */}
              {mode === 'search' && gdeltLoading && (
                <div style={{ padding: '32px', textAlign: 'center' }}>
                  <Loader size={20} className="spin" style={{ color: 'var(--accent)', marginBottom: '8px' }}/>
                  <div className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>Searching across 250,000+ sources…</div>
                </div>
              )}

              {/* Article list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {displayList.map(a => (
                  <ArticleRow key={a.id} article={a}
                    selected={selectedArticle?.id === a.id}
                    onSelect={setSelectedArticle}
                    onSave={() => isSaved(a.id) ? unsave(a.id) : save(a)}
                    saved={isSaved(a.id)}
                    onAddNode={addNode}
                    compact={displayList.length > 50}
                  />
                ))}
                {mode === 'feed' && filtered.length === 0 && !loading && (
                  <div style={{ padding: '32px', textAlign: 'center' }}>
                    <div style={{ fontSize: '30px', opacity: 0.07, marginBottom: '8px' }}>◈</div>
                    <p style={{ color: 'var(--t4)', fontSize: '12px' }}>No articles match your filters</p>
                  </div>
                )}
              </div>
            </div>

            {/* Article detail */}
            {selectedArticle && (
              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }} className="fade-in">
                <ArticleDetail
                  article={selectedArticle}
                  onClose={() => setSelectedArticle(null)}
                  onSave={() => isSaved(selectedArticle.id) ? unsave(selectedArticle.id) : save(selectedArticle)}
                  saved={isSaved(selectedArticle?.id)}
                  onAddNode={addNode}
                />
              </div>
            )}
          </>
        )}

        {/* ════ MONITOR ════════════════════════════════════════════════════ */}
        {mode === 'monitor' && (
          <>
            {/* Situation list */}
            <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {situations.length === 0 ? (
                  <div style={{ padding: '20px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', opacity: 0.1, marginBottom: '8px' }}>◈</div>
                    <p style={{ fontSize: '11px', color: 'var(--t4)', lineHeight: 1.6 }}>Add a situation to monitor, or use presets above</p>
                  </div>
                ) : (
                  situations.map(sit => {
                    const matched = matchArticlesToSituation(sit.name, articles)
                    const isActive = sit.id === activeSituation
                    const maxSev = matched.find(a => a.severity === 'critical') ? 'critical'
                      : matched.find(a => a.severity === 'high') ? 'high'
                      : matched.find(a => a.severity === 'medium') ? 'medium'
                      : matched.length > 0 ? 'low' : null
                    const c = SEV_C[maxSev] || 'var(--t4)'
                    return (
                      <div key={sit.id}
                        onClick={() => setActiveSituation(sit.id)}
                        style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                          background: isActive ? 'rgba(45,212,191,0.06)' : 'transparent',
                          borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: c, flexShrink: 0,
                            boxShadow: maxSev === 'critical' ? `0 0 6px ${c}` : 'none' }}/>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: isActive ? 'var(--t1)' : 'var(--t2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sit.name}
                          </span>
                          <button onClick={e => { e.stopPropagation(); removeSituation(sit.id); if (isActive) setActiveSituation(situations[0]?.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: '0 2px' }}>
                            <X size={10}/>
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{matched.length} signals</span>
                          {maxSev && <SevBadge sev={maxSev} />}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Situation CommandCenter */}
            {activeSit ? (
              <SituationPanel
                key={activeSit.id}
                sit={activeSit}
                articles={articles}
                allArticles={articles}
                onNotes={n => updateSituationNotes(activeSit.id, n)}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', opacity: 0.07, marginBottom: '12px' }}>◈</div>
                  <p style={{ color: 'var(--t4)', fontSize: '12px' }}>Select a situation or create one above</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── SituationPanel — full CommandCenter extracted here ────────────────────────
// This is the full Monitor panel from Situations.jsx, self-contained
function SituationPanel({ sit, articles, allArticles, onNotes }) {
  const { addNode, keys, save, unsave, isSaved } = useStore()
  const { fetchForSituation, loading: fetchLoading, lastFetch } = useActiveFetch()
  const { analyzeBoard, suggestLinks, buildTimeline, loading: groqLoading, error: groqError, hasKey: groqHasKey } = useGroq()
  const { latestDelta, computeDelta, clearDeltas } = useSweepDelta(sit.id)

  const [activeArticles, setActiveArticles]   = useState([])
  const [rightPanel, setRightPanel]           = useState('brief')
  const [selectedSignal, setSelectedSignal]   = useState(null)
  const [signalFilter, setSignalFilter]       = useState('all')
  const [signalSearch, setSignalSearch]       = useState('')
  const [notes, setNotes]                     = useState(sit.notes || '')
  const [showDelta, setShowDelta]             = useState(false)
  const [briefing, setBriefing]               = useState('')
  const [briefLoading, setBriefLoading]       = useState(false)
  const [briefError, setBriefError]           = useState(null)
  const [aiMode, setAiMode]                   = useState('brief')
  const [aiText, setAiText]                   = useState('')
  const [aiRunning, setAiRunning]             = useState(false)
  const briefRef = useRef(null)

  // Merged signals — active fetch results first (targeted), then live feed matches (filtered)
  const allSignals = useMemo(() => {
    const matchedLive = matchArticlesToSituation(sit.name, articles)
    const seen = new Set()
    return [...activeArticles, ...matchedLive].filter(a => {
      if (!a?.id || seen.has(a.id)) return false
      seen.add(a.id); return true
    }).sort((a,b) => b.pub - a.pub)
  }, [articles, activeArticles, sit.name])

  // Severity counts
  const sev = useMemo(() => ({
    critical: allSignals.filter(a => a.severity === 'critical').length,
    high:     allSignals.filter(a => a.severity === 'high').length,
    medium:   allSignals.filter(a => a.severity === 'medium').length,
    low:      allSignals.filter(a => a.severity === 'low').length,
  }), [allSignals])

  const maxSev = sev.critical > 0 ? 'CRITICAL' : sev.high > 2 ? 'HIGH' : sev.high > 0 ? 'ELEVATED' : sev.medium > 0 ? 'MODERATE' : allSignals.length > 0 ? 'LOW' : 'INACTIVE'
  const threatColor = { CRITICAL: 'var(--red)', HIGH: 'var(--orange)', ELEVATED: 'var(--yellow)', MODERATE: 'var(--yellow)', LOW: 'var(--accent)', INACTIVE: 'var(--t4)' }[maxSev]

  // Filtered signals list
  const filteredSignals = useMemo(() => {
    let list = allSignals
    if (signalFilter !== 'all') list = list.filter(a => a.severity === signalFilter)
    if (signalSearch) {
      const q = signalSearch.toLowerCase()
      list = list.filter(a => (a.title+' '+a.source).toLowerCase().includes(q))
    }
    return list
  }, [allSignals, signalFilter, signalSearch])

  // Reset on sit change
  useEffect(() => {
    setBriefing(''); setBriefError(null); setBriefLoading(false)
    setAiText(''); setAiRunning(false); setAiMode('brief')
    setNotes(sit.notes || ''); setActiveArticles([])
    setSignalFilter('all'); setSignalSearch(''); setSelectedSignal(null)
    setRightPanel('brief')
  }, [sit.id])

  // Auto-fetch once on open
  const fetchedRef = useRef(new Set())
  useEffect(() => {
    if (!fetchedRef.current.has(sit.id)) {
      fetchedRef.current.add(sit.id)
      handleFetch()
    }
  }, [sit.id])

  const handleFetch = useCallback(async () => {
    const fresh = await fetchForSituation(sit.name)
    if (fresh.length > 0) {
      const tokens = sit.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      const loose = tokens.length > 1
        ? (a) => tokens.some(tok => (a.title+' '+(a.summary||'')).toLowerCase().includes(tok))
        : () => true
      const toAdd = fresh.filter(loose)
      const final = toAdd.length >= fresh.length * 0.3 ? toAdd : fresh
      setActiveArticles(prev => {
        const seen = new Set(prev.map(a => a.id))
        const newOnes = final.filter(a => !seen.has(a.id))
        const merged = [...newOnes, ...prev].slice(0, 500)
        setTimeout(() => computeDelta(merged), 100)
        return merged
      })
    }
  }, [fetchForSituation, sit.name, computeDelta])

  // Groq key resolver
  const groqKey = keys.groq || import.meta.env.VITE_GROQ_KEY || ''

  const runBriefing = useCallback(async () => {
    if (!groqKey) return
    setBriefLoading(true); setBriefError(null); setBriefing('')
    setAiMode('brief')
    try {
      const sevRank = { critical: 4, high: 3, medium: 2, low: 1 }
      const ranked = [...allSignals].sort((a,b)=>(sevRank[b.severity]||0)-(sevRank[a.severity]||0)||b.pub-a.pub)
      const block = ranked.map((a,i)=>[
        `[${i+1}] SOURCE: ${a.source} | SEV: ${a.severity.toUpperCase()} | TIME: ${a.pub?.toLocaleDateString?.()??''}`,
        `HEADLINE: ${a.title}`,
        a.summary?`CONTENT: ${a.summary.slice(0,300)}`:'',
        a.url&&a.url!=='#'?`LINK: ${a.url}`:'',
      ].filter(Boolean).join('\n')).join('\n\n')

      const sys = `You are a senior intelligence analyst writing a classified briefing. Only use provided signals. Format: THREAT LEVEL / STATUS / DEVELOPMENTS (with [Source] citations) / ACTORS / RISK ASSESSMENT / WATCH LIST. Be specific — names, dates, locations.`
      const user = `Situation: "${sit.name}" | Signals: ${allSignals.length}\nMax severity: ${maxSev}\n\nSIGNALS:\n${block}`

      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role:'system', content:sys },{ role:'user', content:user }], max_tokens: 4000, temperature: 0.1, stream: true }),
      })
      if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error?.message||`Groq ${r.status}`) }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let full = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data: ')||line==='data: [DONE]') continue
          try { const d = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content||''; if(d){full+=d;setBriefing(full)} } catch {}
        }
      }
    } catch (e) { setBriefError(e.message) }
    finally { setBriefLoading(false) }
  }, [groqKey, allSignals, sit.name, maxSev])

  const runAI = useCallback(async (mode) => {
    if (!groqHasKey) return
    setAiMode(mode); setAiText(''); setAiRunning(true)
    const sevRank = { critical:4, high:3, medium:2, low:1 }
    const nodes = [...allSignals].sort((a,b)=>(sevRank[b.severity]||0)-(sevRank[a.severity]||0)||b.pub-a.pub)
      .map((a,i) => ({
        id:`s${i}`, type:'event',
        label:`[${a.severity.toUpperCase()}] ${a.title}`,
        detail:`Source: ${a.source} | ${a.pub?.toLocaleDateString?.()??''} | ${(a.summary||'').slice(0,400)}`,
      }))
    try {
      if (mode==='analyze')  await analyzeBoard(nodes, [], t => setAiText(t))
      if (mode==='suggest')  await suggestLinks(nodes, t => setAiText(t))
      if (mode==='timeline') await buildTimeline(nodes, t => setAiText(t))
    } catch {}
    setAiRunning(false)
  }, [groqHasKey, allSignals, analyzeBoard, suggestLinks, buildTimeline])

  const addAllToBoard = () => {
    const sevRank = { critical:4, high:3, medium:2, low:1 }
    ;[...allSignals].sort((a,b)=>(sevRank[b.severity]||0)-(sevRank[a.severity]||0)).forEach((a,i)=>{
      const col=i%10, row=Math.floor(i/10)
      addNode({ type:'event', label:a.title.slice(0,50), detail:(a.summary||'').slice(0,200), source:a.source, url:a.url, color:SEV_C[a.severity]||'var(--accent)', x:80+col*150+(Math.random()*30-15), y:80+row*120+(Math.random()*20-10) })
    })
  }

  const RIGHT_TABS = [
    { id: 'brief',       label: '⚡ Brief',    desc: 'Situation report' },
    { id: 'analyze',     label: '◈ Analyze',  desc: 'What do these signals mean?' },
    { id: 'suggest',     label: '◉ Suggest',  desc: 'Hidden connections' },
    { id: 'timeline',    label: '◷ Timeline', desc: 'Chronological reconstruction' },
    { id: 'intel',       label: '◎ Intel',    desc: 'Entities, regions, velocity' },
    { id: 'connections', label: '⟁ Links',    desc: 'Cross-signal correlations' },
    { id: 'notes',       label: '✎ Notes',    desc: 'Analyst notes' },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>

      {/* ── Signal feed (left) ── */}
      <div style={{ width: '360px', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Situation header */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--base)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: threatColor, boxShadow: `0 0 6px ${threatColor}`, flexShrink: 0 }}/>
            <span style={{ fontFamily: 'Orbitron', fontSize: '11px', fontWeight: 700, color: 'var(--t1)', letterSpacing: '0.06em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sit.name.toUpperCase()}
            </span>
            <span className="mono" style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '2px', background: threatColor+'18', color: threatColor }}>{maxSev}</span>
          </div>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            {Object.entries(sev).filter(([,v])=>v>0).map(([k,v])=>(
              <span key={k} className="mono" style={{ fontSize: '8px', color: SEV_C[k], opacity: 0.8 }}>{v} {k}</span>
            ))}
            <div style={{ flex: 1 }}/>
            <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{allSignals.length} signals</span>
          </div>
        </div>

        {/* Delta banner */}
        {showDelta && latestDelta && (
          <div style={{ padding: '6px 12px', background: 'rgba(251,191,36,0.05)', borderBottom: '1px solid rgba(251,191,36,0.25)', flexShrink: 0 }} className="fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
              <span className="mono" style={{ fontSize: '7px', color: 'var(--yellow)', letterSpacing: '0.1em' }}>◈ SWEEP DELTA — {latestDelta.time}</span>
              <button onClick={() => { setShowDelta(false); clearDeltas() }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', fontSize: '10px' }}>×</button>
            </div>
            {latestDelta.escalations.map((e,i)=>(
              <div key={i} style={{ display:'flex', gap:'5px', alignItems:'center', padding:'2px 5px', background:'rgba(239,68,68,0.07)', borderRadius:'2px', marginBottom:'2px' }}>
                <span className="mono" style={{ fontSize:'7px', color:'var(--red)' }}>{e.from}→{e.to}</span>
                <span style={{ fontSize:'9px', color:'var(--t1)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.title?.slice(0,70)}</span>
              </div>
            ))}
            {latestDelta.newSignals.slice(0,5).map((s,i)=>(
              <div key={i} style={{ display:'flex', gap:'5px', padding:'2px 5px', background:'rgba(45,212,191,0.04)', borderRadius:'2px', marginBottom:'2px', borderLeft:`2px solid ${SEV_C[s.severity]||'var(--accent)'}` }}>
                {s._acled && <span className="mono" style={{ fontSize:'7px', color:'var(--red)' }}>ACLED</span>}
                {s._firms && <span className="mono" style={{ fontSize:'7px', color:'var(--yellow)' }}>SAT</span>}
                <span style={{ fontSize:'9px', color:'var(--t1)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.title?.slice(0,75)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Feed controls */}
        <div style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '5px', alignItems: 'center', flexShrink: 0 }}>
          <input value={signalSearch} onChange={e => setSignalSearch(e.target.value)}
            placeholder="Filter signals…" className="inp" style={{ flex: 1, fontSize: '10px', padding: '3px 7px' }}/>
          <select value={signalFilter} onChange={e => setSignalFilter(e.target.value)}
            className="inp" style={{ fontSize: '9px', padding: '3px 6px', width: 'auto' }}>
            {['all','critical','high','medium','low'].map(s => <option key={s} value={s}>{s==='all'?'All':s}</option>)}
          </select>
          <button className="btn" style={{ padding: '3px 7px', fontSize: '9px' }} title="Save all to board" onClick={addAllToBoard}>
            <GitBranch size={9}/>
          </button>
          <button className="btn" style={{ padding: '3px 7px', fontSize: '9px' }}
            disabled={fetchLoading} onClick={handleFetch} title="Fetch Now">
            {fetchLoading ? <Loader size={9} className="spin"/> : <RefreshCw size={9}/>}
          </button>
          {latestDelta && (latestDelta.newSignals.length>0||latestDelta.escalations.length>0) && (
            <button className="btn" style={{ padding:'3px 7px', fontSize:'8px', color:'var(--yellow)', borderColor:'rgba(251,191,36,0.4)', background:'rgba(251,191,36,0.06)' }}
              onClick={() => setShowDelta(s=>!s)}>
              ◈ {latestDelta.newSignals.length}+{latestDelta.escalations.length}
            </button>
          )}
          {lastFetch && !fetchLoading && (
            <span className="mono" style={{ fontSize:'7px', color:'var(--t4)', flexShrink:0 }}>
              {lastFetch.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
            </span>
          )}
        </div>

        {/* Signal list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredSignals.length === 0 && (
            <div style={{ padding:'24px', textAlign:'center' }}>
              <div style={{ fontSize:'24px', opacity:0.1, marginBottom:'8px' }}>◈</div>
              <p style={{ fontSize:'11px', color:'var(--t4)', lineHeight:1.6 }}>
                {allSignals.length === 0 ? 'Fetching signals…' : 'No signals match your filter'}
              </p>
            </div>
          )}
          {filteredSignals.map(a => (
            <div key={a.id} onClick={() => setSelectedSignal(s => s?.id===a.id ? null : a)}
              style={{ padding:'7px 12px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                background: selectedSignal?.id===a.id ? 'rgba(45,212,191,0.05)' : 'transparent',
                borderLeft: `3px solid ${selectedSignal?.id===a.id ? SEV_C[a.severity] : 'transparent'}`,
              }}>
              <div style={{ display:'flex', gap:'4px', alignItems:'center', marginBottom:'2px', flexWrap:'wrap' }}>
                {a._acled && <span className="mono" style={{ fontSize:'7px', padding:'1px 3px', background:'rgba(239,68,68,0.12)', color:'var(--red)', borderRadius:'1px' }}>ACLED</span>}
                {a._firms && <span className="mono" style={{ fontSize:'7px', padding:'1px 3px', background:'rgba(251,191,36,0.12)', color:'var(--yellow)', borderRadius:'1px' }}>SAT</span>}
                {a._fred  && <span className="mono" style={{ fontSize:'7px', padding:'1px 3px', background:'rgba(167,139,250,0.12)', color:'var(--purple)', borderRadius:'1px' }}>MACRO</span>}
                <span className="mono" style={{ fontSize:'8px', color:'var(--accent)' }}>{a.source}</span>
                <SevBadge sev={a.severity} />
                <span className="mono" style={{ fontSize:'7px', color:'var(--t4)', marginLeft:'auto' }}>
                  {a.pub ? new Date(a.pub).toLocaleDateString([],{month:'short',day:'numeric'}) : ''}
                </span>
              </div>
              <div style={{ fontSize:'11px', color:'var(--t1)', lineHeight:1.4 }}>{a.title}</div>
              {selectedSignal?.id === a.id && a.summary && (
                <div style={{ marginTop:'5px', fontSize:'10px', color:'var(--t3)', lineHeight:1.6 }}>{a.summary.slice(0,200)}{a.summary.length>200?'…':''}</div>
              )}
              {selectedSignal?.id === a.id && (
                <div style={{ display:'flex', gap:'4px', marginTop:'6px', flexWrap:'wrap' }}>
                  {a.url&&a.url!=='#' && <a href={a.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ fontSize:'9px' }}><ExternalLink size={9}/> read</a>}
                  <button className="btn" style={{ fontSize:'9px' }} onClick={e=>{e.stopPropagation();addNode({type:'event',label:a.title.slice(0,52),detail:a.summary?.slice(0,200),source:a.source,url:a.url,color:SEV_C[a.severity],x:200+Math.random()*400,y:150+Math.random()*300})}}><GitBranch size={9}/> board</button>
                  <button className={`btn ${isSaved(a.id)?'btn-accent':''}`} style={{ fontSize:'9px' }} onClick={e=>{e.stopPropagation();isSaved(a.id)?unsave(a.id):save(a)}}>{isSaved(a.id)?<><BookmarkCheck size={9}/> saved</>:<><Bookmark size={9}/> save</>}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Analyst panel (right) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* AI mode tabs */}
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--base)' }}>
          <div style={{ display: 'flex', overflowX: 'auto', padding: '0 8px' }}>
            {RIGHT_TABS.map(t => (
              <button key={t.id} title={t.desc}
                onClick={() => { setRightPanel(t.id); setAiText(''); setBriefing('') }}
                className="mono"
                style={{ padding:'8px 10px', border:'none', cursor:'pointer', fontSize:'8px', letterSpacing:'0.08em', flexShrink:0,
                  background: rightPanel===t.id ? 'rgba(45,212,191,0.06)' : 'transparent',
                  color: rightPanel===t.id ? 'var(--accent)' : 'var(--t3)',
                  borderBottom: `2px solid ${rightPanel===t.id ? 'var(--accent)' : 'transparent'}` }}>
                {t.label}
              </button>
            ))}
            <div style={{ flex:1 }}/>
            {/* Run button */}
            {['brief','analyze','suggest','timeline'].includes(rightPanel) && groqHasKey && allSignals.length > 0 && !(briefLoading||aiRunning) && (
              <button className="btn btn-accent" style={{ margin:'5px 6px', fontSize:'9px', padding:'3px 10px' }}
                onClick={() => rightPanel==='brief' ? runBriefing() : runAI(rightPanel)}>
                <Zap size={9}/> {rightPanel==='brief' ? (briefing?'regen':'generate') : (aiText?'regen':'run')}
              </button>
            )}
            {(briefLoading||aiRunning) && (
              <div style={{ display:'flex', alignItems:'center', gap:'4px', padding:'0 10px' }}>
                <Loader size={9} className="spin" style={{ color:'var(--accent)' }}/>
                <span className="mono" style={{ fontSize:'8px', color:'var(--t3)' }}>streaming…</span>
              </div>
            )}
          </div>
        </div>

        {/* Panel content */}
        <div ref={briefRef} style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>

          {/* Brief */}
          {rightPanel === 'brief' && (
            <>
              {!groqHasKey && <div style={{ padding:'10px', background:'rgba(249,115,22,0.08)', borderRadius:'3px', fontSize:'11px', color:'var(--orange)' }}>Add Groq key in Settings to enable AI briefings.</div>}
              {briefError && <div style={{ padding:'8px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'3px', marginBottom:'8px', fontSize:'11px', color:'var(--red)' }}>{briefError}</div>}
              {briefing ? (
                <div style={{ fontFamily:'JetBrains Mono', fontSize:'11px', lineHeight:1.8, color:'var(--t2)', whiteSpace:'pre-wrap' }}>
                  {briefing}
                  {briefLoading && <span style={{ display:'inline-block', width:'5px', height:'5px', borderRadius:'50%', background:'var(--accent)', marginLeft:'3px', verticalAlign:'middle', animation:'pulse 1s infinite' }}/>}
                </div>
              ) : !briefLoading && groqHasKey && allSignals.length > 0 ? (
                <div style={{ textAlign:'center', padding:'20px' }}>
                  <Shield size={28} style={{ color:'var(--t4)', marginBottom:'10px' }}/>
                  <p style={{ color:'var(--t3)', fontSize:'12px', marginBottom:'4px' }}>{allSignals.length} signals ready</p>
                  <p style={{ color:'var(--t4)', fontSize:'10px', marginBottom:'12px' }}>Click Generate to produce an AI situation report with source citations</p>
                </div>
              ) : !briefLoading && allSignals.length === 0 ? (
                <p style={{ color:'var(--t4)', fontSize:'11px', textAlign:'center', padding:'20px' }}>No signals yet — click Refresh to fetch data for this situation.</p>
              ) : null}
            </>
          )}

          {/* Analyze / Suggest / Timeline */}
          {['analyze','suggest','timeline'].includes(rightPanel) && (
            <>
              {!groqHasKey && <div style={{ padding:'10px', background:'rgba(249,115,22,0.08)', borderRadius:'3px', fontSize:'11px', color:'var(--orange)' }}>Add Groq key in Settings.</div>}
              {groqError && <div style={{ padding:'8px', background:'rgba(239,68,68,0.08)', borderRadius:'3px', fontSize:'11px', color:'var(--red)', marginBottom:'8px' }}>{groqError}</div>}
              {aiText ? (
                <div>
                  <div className="mono" style={{ fontSize:'8px', color:'var(--accent)', marginBottom:'8px', paddingBottom:'5px', borderBottom:'1px solid var(--border)', letterSpacing:'0.12em' }}>
                    ◈ AI · {rightPanel.toUpperCase()} · {sit.name.slice(0,30).toUpperCase()}
                    {aiRunning && <span style={{ marginLeft:'6px', display:'inline-block', width:'5px', height:'5px', borderRadius:'50%', background:'var(--accent)', verticalAlign:'middle', animation:'pulse 1s infinite' }}/>}
                  </div>
                  <div style={{ fontFamily:'JetBrains Mono', fontSize:'11px', lineHeight:1.8, color:'var(--t2)', whiteSpace:'pre-wrap' }}>{aiText}</div>
                </div>
              ) : !aiRunning && groqHasKey && allSignals.length > 0 ? (
                <div style={{ textAlign:'center', padding:'20px' }}>
                  <div style={{ fontSize:'24px', opacity:0.15, marginBottom:'10px' }}>
                    {rightPanel==='analyze'?'◈':rightPanel==='suggest'?'◉':'◷'}
                  </div>
                  <p style={{ color:'var(--t3)', fontSize:'12px', marginBottom:'4px' }}>{allSignals.length} signals</p>
                  <p style={{ color:'var(--t4)', fontSize:'10px' }}>
                    {rightPanel==='analyze' && 'Cross-reference signals, identify contradictions, assess current situation'}
                    {rightPanel==='suggest' && 'Find hidden connections between key actors across all signals'}
                    {rightPanel==='timeline' && 'Chronological reconstruction — every event, confirmed vs estimated'}
                  </p>
                </div>
              ) : null}
            </>
          )}

          {/* Intel dashboard */}
          {rightPanel === 'intel' && <SitIntelDash signals={allSignals} />}

          {/* Connections */}
          {rightPanel === 'connections' && <SitCorrelations signals={allSignals} />}

          {/* Notes */}
          {rightPanel === 'notes' && (
            <textarea value={notes} onChange={e => { setNotes(e.target.value); onNotes(e.target.value) }}
              placeholder="Analyst notes for this situation…" className="inp"
              style={{ width:'100%', minHeight:'300px', resize:'vertical', fontSize:'12px', lineHeight:1.7, boxSizing:'border-box' }}/>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Simple intel dashboard ────────────────────────────────────────────────────
function SitIntelDash({ signals }) {
  const entities = useMemo(() => {
    const m = {}; signals.forEach(a => (a.entities||[]).forEach(e => { m[e.name]=(m[e.name]||0)+1 }))
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,20)
  }, [signals])
  const regions = useMemo(() => {
    const m = {}; signals.forEach(a => { if(a.region) m[a.region]=(m[a.region]||0)+1 })
    return Object.entries(m).sort((a,b)=>b[1]-a[1])
  }, [signals])
  const sources = useMemo(() => {
    const m = {}; signals.forEach(a => { if(a.source) m[a.source]=(m[a.source]||0)+1 })
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,12)
  }, [signals])

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
      <div>
        <div className="mono" style={{ fontSize:'8px', color:'var(--t4)', marginBottom:'7px', letterSpacing:'0.1em' }}>TOP ENTITIES ({entities.length})</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
          {entities.map(([name,count]) => (
            <span key={name} className="entity" style={{ fontSize:'9px' }}>{name} <span style={{ color:'var(--t4)' }}>×{count}</span></span>
          ))}
        </div>
      </div>
      <div>
        <div className="mono" style={{ fontSize:'8px', color:'var(--t4)', marginBottom:'7px', letterSpacing:'0.1em' }}>REGIONS</div>
        {regions.map(([r,c]) => (
          <div key={r} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
            <span style={{ fontSize:'10px', color:'var(--t2)', width:'120px', flexShrink:0 }}>{r}</span>
            <div style={{ flex:1, height:'3px', background:'var(--border)', borderRadius:'2px' }}>
              <div style={{ height:'100%', background:'var(--accent)', borderRadius:'2px', width:`${(c/signals.length)*100}%`, transition:'width 0.5s' }}/>
            </div>
            <span className="mono" style={{ fontSize:'8px', color:'var(--t4)', width:'24px', textAlign:'right' }}>{c}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="mono" style={{ fontSize:'8px', color:'var(--t4)', marginBottom:'7px', letterSpacing:'0.1em' }}>SOURCE DIVERSITY ({sources.length})</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
          {sources.map(([s,c]) => (
            <span key={s} className="mono" style={{ fontSize:'8px', padding:'2px 6px', background:'rgba(45,212,191,0.06)', color:'var(--t3)', borderRadius:'2px' }}>{s} <span style={{ color:'var(--accent)' }}>{c}</span></span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Simple correlation panel ──────────────────────────────────────────────────
function SitCorrelations({ signals }) {
  const correlations = useMemo(() => {
    const pairs = []
    for (let i=0; i<Math.min(signals.length,40); i++) {
      for (let j=i+1; j<Math.min(signals.length,40); j++) {
        const a = signals[i], b = signals[j]
        const aEnts = new Set((a.entities||[]).map(e=>e.name))
        const shared = (b.entities||[]).filter(e=>aEnts.has(e.name)).map(e=>e.name)
        const tagA = new Set(a.tags||[]), sharedTags = (b.tags||[]).filter(t=>tagA.has(t))
        if (shared.length>0||sharedTags.length>0) {
          pairs.push({ a:a.title.slice(0,55), b:b.title.slice(0,55), shared:[...shared,...sharedTags].slice(0,4), srcA:a.source, srcB:b.source })
        }
      }
    }
    return pairs.slice(0,15)
  }, [signals])

  if (!correlations.length) return <p style={{ color:'var(--t4)', fontSize:'11px', textAlign:'center', padding:'20px' }}>No correlations found. Fetch more signals to surface cross-source connections.</p>
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
      {correlations.map((c,i) => (
        <div key={i} style={{ padding:'8px 10px', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'3px' }}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginBottom:'5px' }}>
            {c.shared.map(e=><span key={e} className="entity" style={{ fontSize:'8px' }}>{e}</span>)}
          </div>
          <div style={{ fontSize:'10px', color:'var(--t2)', lineHeight:1.5 }}>[{c.srcA}] {c.a}</div>
          <div style={{ fontSize:'10px', color:'var(--t3)', marginTop:'2px' }}>↕ shares entity with</div>
          <div style={{ fontSize:'10px', color:'var(--t2)', lineHeight:1.5, marginTop:'2px' }}>[{c.srcB}] {c.b}</div>
        </div>
      ))}
    </div>
  )
}
