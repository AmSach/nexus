/**
 * NEXUS Intelligence Search — Full OSINT Profile
 *
 * All data fetched server-side via /api/intel (no CORS, no proxy, direct to sources).
 * Sources: GDELT (direct), Google News, Wikipedia, Wikidata, OpenSanctions,
 *          OpenCorporates (companies + officers), ICIJ Offshore Leaks,
 *          SEC EDGAR, CourtListener, Interpol, OpenStreetMap, DuckDuckGo x7 angles.
 * AI: Groq relationship extraction + full intelligence profile.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useStore } from '../../store'
import { searchICIJ } from '../../data/icij_seed'
import { searchOFAC } from '../../data/sanctions_seed'
import { loadSDN, searchSDN, getSDNStats, resolveEntitiesWithGroq } from '../../data/sdn_db'
import { classifyCat, classifySev, classifyRegion, extractTags, hashId } from '../../utils/classify'
import {
  Search, X, Plus, Loader, Globe, GitBranch, ChevronRight,
  AlertTriangle, ExternalLink, BookmarkCheck, Bookmark,
  FileText, Link2, DollarSign, Shield, MapPin, Eye,
  Building2, Radio, ArrowRight, Flag, Scale, Filter, RefreshCw
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const GROQ_MODELS_GDELT = ['llama-3.3-70b-versatile','llama-3.1-70b-versatile','llama-3.1-8b-instant','mixtral-8x7b-32768','gemma2-9b-it','llama3-70b-8192','llama3-8b-8192']

async function groqFetch(key, body) {
  let lastErr = null
  for (const model of GROQ_MODELS_GDELT) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ ...body, model }),
        signal: AbortSignal.timeout(60000),
      })
      if (r.ok) return r
      if (r.status===429||r.status===503||r.status===404||r.status===500) {
        await new Promise(r2=>setTimeout(r2,800)); lastErr=new Error(`Groq ${r.status}`); continue
      }
      throw new Error(`Groq ${r.status}`)
    } catch(e) { lastErr=e; if(e.name==='AbortError')throw e; await new Promise(r2=>setTimeout(r2,800)) }
  }
  throw lastErr || new Error('All Groq models failed')
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY FETCH — server-side via /api/intel (no CORS, no proxy issues)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchIntelAPI(query, timespan = '1year', userKeys = {}) {
  const keyParams = [
    userKeys.urlscan_key    ? 'urlscan_key='    + encodeURIComponent(userKeys.urlscan_key)    : '',
    userKeys.virustotal_key ? 'virustotal_key=' + encodeURIComponent(userKeys.virustotal_key) : '',
    userKeys.abuseipdb_key  ? 'abuseipdb_key='  + encodeURIComponent(userKeys.abuseipdb_key)  : '',
    userKeys.sectrails_key  ? 'sectrails_key='  + encodeURIComponent(userKeys.sectrails_key)  : '',
    userKeys.hibp_key       ? 'hibp_key='       + encodeURIComponent(userKeys.hibp_key)       : '',
    userKeys.hunter_key     ? 'hunter_key='     + encodeURIComponent(userKeys.hunter_key)     : '',
    userKeys.dehashed_key   ? 'dehashed_key='   + encodeURIComponent(userKeys.dehashed_key)   : '',
    userKeys.wigle_key      ? 'wigle_key='      + encodeURIComponent(userKeys.wigle_key)      : '',
    userKeys.intelx_key     ? 'intelx_key='     + encodeURIComponent(userKeys.intelx_key)     : '',
  ].filter(Boolean).join('&')
  const url = '/api/intel?q=' + encodeURIComponent(query) + '&type=all&timespan=' + timespan + (keyParams ? '&' + keyParams : '')
  const r = await fetch(url, { signal: AbortSignal.timeout(90000) })
  if (!r.ok) throw new Error('Intel API ' + r.status)
  return r.json()
}

// ─────────────────────────────────────────────────────────────────────────────
// GDELT DEDICATED — separate API call with full timeout budget (10 search angles)
// Fires in parallel with intel API so neither blocks the other
// ─────────────────────────────────────────────────────────────────────────────
async function fetchGDELTDedicated(query, timespan = '1year') {
  const url = `/api/gdelt?q=${encodeURIComponent(query)}&timespan=${timespan}`
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(55000) })
    if (!r.ok) throw new Error(`GDELT API ${r.status}`)
    return r.json()
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK — client-side GDELT via proxies (if /api/intel fails or dev mode)
// ─────────────────────────────────────────────────────────────────────────────
const PROXIES = [
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
]

async function gdeltProxy(url) {
  return Promise.any(
    PROXIES.map(async proxy => {
      const r = await fetch(proxy(url), { signal: AbortSignal.timeout(14000) })
      if (!r.ok) throw new Error(r.status)
      const j = await r.json()
      const raw = j.contents || j.body || j.data || ''
      if (!raw || raw.length < 30) throw new Error('empty')
      // Validate it's actually GDELT JSON, not an error HTML page
      if (raw.startsWith('<') || raw.startsWith('<!')) throw new Error('got html not json')
      const parsed = JSON.parse(raw)
      if (!parsed?.articles && !parsed?.timeline) throw new Error('no articles key')
      return parsed
    })
  ).catch(() => null)
}

async function fetchGDELTFallback(query, timespan) {
  const words = query.trim().split(/\s+/).filter(w => w.length > 1)
  const variants = [
    words[0],
    words.length > 1 ? `"${query}"` : null,
    words.length > 1 ? words.join(' OR ') : null,
  ].filter(Boolean)

  const seen = new Set(); const all = []
  await Promise.allSettled(variants.map(q => {
    const enc = encodeURIComponent(q) + '+sourcelang:english'
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${enc}&mode=artlist&maxrecords=50&sort=DateDesc&timespan=${timespan}&format=json`
    return gdeltProxy(url).then(d => {
      if (!d?.articles) return
      d.articles.forEach(a => {
        if (!a?.title) return
        const key = (a.url || a.title).slice(0, 80)
        if (seen.has(key)) return
        seen.add(key); all.push(a)
      })
    }).catch(() => {})
  }))
  return all
}

// ─────────────────────────────────────────────────────────────────────────────
// GROQ — intelligence profile synthesis
// ─────────────────────────────────────────────────────────────────────────────
async function groqProfile(query, data, groqKey) {
  if (!groqKey) return ''
  const sections = []
  if (data.wiki?.extract)            sections.push(`WIKIPEDIA: ${data.wiki.extract.slice(0,400)}`)
  if (data.wikidata?.positions?.length) sections.push(`POSITIONS HELD: ${data.wikidata.positions.join(', ')}`)
  if (data.wikidata?.nationalities?.length) sections.push(`NATIONALITY: ${data.wikidata.nationalities.join(', ')}`)
  if (data.wikidata?.spouses?.length)   sections.push(`SPOUSE(S): ${data.wikidata.spouses.join(', ')}`)
  if (data.wikidata?.employers?.length) sections.push(`EMPLOYERS: ${data.wikidata.employers.join(', ')}`)
  if (data.wikidata?.education?.length) sections.push(`EDUCATION: ${data.wikidata.education.join(', ')}`)
  if (data.wikidata?.residences?.length) sections.push(`RESIDENCES: ${data.wikidata.residences.join(', ')}`)
  if (data.wikidata?.politicalParties?.length) sections.push(`POLITICAL PARTIES: ${data.wikidata.politicalParties.join(', ')}`)
  if (data.sanctions?.length)        sections.push(`⚠ SANCTIONS: ${data.sanctions.map(s=>`${s.name} [${s.datasets.join(',')}]`).join(' | ')}`)
  if (data.interpol?.length)         sections.push(`🚨 INTERPOL: ${data.interpol.map(i=>`${i.name} — ${i.charges}`).join(' | ')}`)
  if (data.icij?.length)             sections.push(`🏦 OFFSHORE LEAKS: ${data.icij.map(i=>`${i.name} (${i.jurisdiction||'?'}) [${i.dataset||'?'}]`).join(' | ')}`)
  if (data.companies?.length)        sections.push(`COMPANIES: ${data.companies.map(c=>`${c.name} (${c.jurisdiction}, ${c.status})`).join(' | ')}`)
  if (data.officerships?.length)     sections.push(`OFFICER ROLES: ${data.officerships.map(o=>`${o.position} at ${o.company} (${o.jurisdiction})`).join(' | ')}`)
  if (data.courts?.length)           sections.push(`COURT CASES: ${data.courts.map(c=>`${c.caseName} (${c.court}, ${c.date})`).join(' | ')}`)
  if (data.articles?.length)         sections.push(`TOP NEWS: ${data.articles.slice(0,12).map((a,i)=>`[${i+1}] ${a.title}`).join(' | ')}`)
  if (data.ddgLeaks?.relatedTopics?.length) sections.push(`LEAK SIGNALS: ${data.ddgLeaks.relatedTopics.slice(0,5).map(t=>t.text).join(' | ')}`)
  if (data.ddgAddress?.relatedTopics?.length) sections.push(`ADDRESS SIGNALS: ${data.ddgAddress.relatedTopics.slice(0,4).map(t=>t.text).join(' | ')}`)
  if (data.fec?.candidates?.length) sections.push(`FEC CANDIDATES: ${data.fec.candidates.map(c=>`${c.name} ${c.party} ${c.office}`).join(' | ')}`)
  if (data.worldbank?.length) sections.push(`⚠ WORLD BANK DEBARRED: ${data.worldbank.map(w=>`${w.name} ${w.country} ${w.from}→${w.to}`).join(' | ')}`)
  if (data.ukOfficers?.length) sections.push(`UK COMPANIES HOUSE: ${data.ukOfficers.map(o=>`${o.name} ${o.description}`).join(' | ')}`)
  if (data.pastes?.length) sections.push(`PASTE DUMPS: ${data.pastes.length} paste mentions found`)
  if (data.socialProfiles?.length) sections.push(`SOCIAL PROFILES: ${data.socialProfiles.map(s=>`${s.platform}: ${s.url}`).join(' | ')}`)
  if (data.propertySignals?.length) sections.push(`PROPERTY SIGNALS: ${data.propertySignals.map(p=>p.text?.slice(0,80)).join(' | ')}`)

  try {
    const r = await groqFetch(groqKey, {
        messages: [{ role: 'user', content:
`You are a senior intelligence analyst. Build a full OSINT profile for: "${query}"

INTELLIGENCE DATA:
${sections.join('\n')}

Write a comprehensive intelligence profile with these exact sections:

**IDENTITY & BACKGROUND**
[Who they are, confirmed biographical facts, nationality, age]

**NETWORK & ASSOCIATES**
[Known associates, family, political/business connections, organizations]

**FINANCIAL FOOTPRINT**
[Known assets, companies owned/directed, offshore structures, wealth estimates, suspicious financial activity]

**LEGAL EXPOSURE**
[Court cases, criminal charges, sanctions, watchlist appearances, Interpol notices]

**LOCATIONS & MOVEMENTS**
[Known residences, frequent locations, last known whereabouts, travel patterns]

**DIGITAL & DARK WEB FOOTPRINT**
[Social media presence, data breaches, dark web mentions, leaked data]

**RED FLAGS & RISK INDICATORS**
[Specific suspicious patterns, anomalies, links to criminal activity]

**INTELLIGENCE ASSESSMENT**
[Overall profile summary, threat/risk level LOW/MEDIUM/HIGH/CRITICAL, confidence level]

Use specific names, dates, amounts. Bold key facts. Flag offshore/sanctions/court items prominently.`
        }],
        max_tokens: 1200, temperature: 0.1, stream: false,
    })
    const d = await r.json()
    return d.choices?.[0]?.message?.content || ''
  } catch { return '' }
}

async function groqRelationships(query, data, groqKey) {
  if (!groqKey) return []
  const lines = [
    ...(data.articles || []).slice(0, 20).map((a, i) => `[${i+1}] "${a.title}" (${a.domain||a.source||''})`),
    ...(data.gnews || []).slice(0, 10).map((a, i) => `[GN${i+1}] "${a.title}" (${a.source})`),
    data.wikidata?.positions?.length ? `[WIKIDATA] Positions: ${data.wikidata.positions.join(', ')}` : '',
    data.wikidata?.employers?.length ? `[WIKIDATA] Employers: ${data.wikidata.employers.join(', ')}` : '',
    data.wikidata?.spouses?.length   ? `[WIKIDATA] Spouses: ${data.wikidata.spouses.join(', ')}` : '',
    data.wikidata?.memberships?.length ? `[WIKIDATA] Memberships: ${data.wikidata.memberships.join(', ')}` : '',
    data.sanctions?.length ? `[SANCTIONS] ${data.sanctions.map(s => s.name).join(', ')}` : '',
    data.icij?.length ? `[ICIJ] ${data.icij.map(i => i.name).join(', ')}` : '',
    data.officerships?.length ? `[OFFICERS] ${data.officerships.map(o => `${o.position} at ${o.company}`).join(' | ')}` : '',
  ].filter(Boolean).join('\n')

  try {
    const r = await groqFetch(groqKey, {
        messages: [{ role: 'user', content:
`Extract all entity relationships for "${query}" from this data:
${lines}

Return ONLY a JSON array. Each item:
{"from":"exact name","to":"exact name","type":"CONTROLS|FUNDS|OPPOSES|ALLIED_WITH|COMMANDS|OWNS|SANCTIONED_BY|MARRIED_TO|PARENT_OF|EMPLOYED_BY|MEMBER_OF|LOCATED_IN|INVESTIGATED_BY|ACCUSED_OF|DIRECTS","evidence":"brief source","confidence":"HIGH|MEDIUM|LOW"}

Rules: Real named entities only. Min 10 relationships. Include family/business/political. ONLY the JSON array.`
        }],
        max_tokens: 2000, temperature: 0.1, stream: false,
    })
    const d = await r.json()
    const text = d.choices?.[0]?.message?.content || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const s = clean.indexOf('['), e = clean.lastIndexOf(']')
    if (s === -1 || e === -1) return []
    return JSON.parse(clean.slice(s, e + 1))
  } catch { return [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function articleToLocal(a) {
  const combo = ((a.title||'') + ' ' + (a.domain||a.source||'')).toLowerCase()
  const raw = a.seendate || a.pubDate || ''
  const pubStr = raw.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z')
  let pub; try { pub = pubStr ? new Date(pubStr) : new Date() } catch { pub = new Date() }
  if (isNaN(pub)) pub = new Date()
  return {
    id: hashId((a.url||a.title||'')+'i'),
    title: (a.title||'').slice(0,220),
    source: a.domain || a.source || 'GDELT',
    url: a.url || '#',
    category: classifyCat(combo, 'politics'),
    severity: classifySev(combo),
    region: classifyRegion(combo),
    tags: extractTags(combo),
    pub,
  }
}

const SEV_C = { critical:'var(--red)', high:'var(--orange)', medium:'var(--yellow)', low:'var(--accent)' }
const EDGE_COLOR_MAP = {
  CONTROLS:'#ef4444', FUNDS:'#fbbf24', OPPOSES:'#f97316', ALLIED_WITH:'#4ade80',
  COMMANDS:'#f87171', OWNS:'#a78bfa', SANCTIONED_BY:'#ef4444', MARRIED_TO:'#f472b6',
  PARENT_OF:'#60a5fa', EMPLOYED_BY:'#38bdf8', MEMBER_OF:'#60a5fa', DIRECTS:'#fbbf24',
  LOCATED_IN:'#4ade80', INVESTIGATED_BY:'#f97316', ACCUSED_OF:'#ef4444',
}
function inferType(name) {
  const n = (name||'').toLowerCase()
  if (/nato|un |eu |imf|iaea|fbi|cia|kremlin|pentagon|mossad|irgc|pla|fsb|wagner|hamas|hezbollah|houthi|isis|taliban|idf|parliament|congress|government|ministry|agency|forces|army|navy|council|bank|group|corp|company|fund|llc|ltd|inc/.test(n)) return 'org'
  if (/moscow|kyiv|washington|beijing|london|paris|berlin|tehran|gaza|kabul|islamabad|delhi|ankara|riyadh|ukraine|russia|china|iran|israel|india|pakistan|syria|yemen|sudan|strait|sea|gulf|island|offshore/.test(n)) return 'location'
  return 'person'
}
const TYPE_CLR = { person:'#38bdf8', org:'#fbbf24', location:'#4ade80', event:'#fb923c', financial:'#a78bfa', military:'#f87171' }

const SUGGESTED = [
  {label:'Vladimir Putin',icon:'👤'},{label:'Elon Musk',icon:'👤'},
  {label:'Kim Jong Un',icon:'👤'},{label:'Xi Jinping',icon:'👤'},
  {label:'Benjamin Netanyahu',icon:'👤'},{label:'Narendra Modi',icon:'👤'},
  {label:'Wagner Group',icon:'🏛'},{label:'Hamas',icon:'🏛'},
  {label:'IRGC',icon:'🏛'},{label:'Saudi Aramco',icon:'🏛'},
  {label:'Houthi',icon:'🏛'},{label:'BlackRock',icon:'🏛'},
  {label:'Taiwan Strait',icon:'📍'},{label:'APT28',icon:'💻'},
]

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function GDELTSearch() {
  const { addNode, addEdge, setTab, save, unsave, isSaved, addSituation, _board, keys } = useStore()
  React.useEffect(() => { window.__nexusStore = useStore }, [])
  const groqKey = import.meta.env.VITE_GROQ_KEY || keys.groq || ''

  // ── SDN full database — preload on mount ─────────────────────────────
  const [sdnDb,        setSdnDb]        = React.useState(null)
  const [sdnStats,     setSdnStats]     = React.useState(null)
  const [sdnResolutions, setSdnResolutions] = React.useState({})
  const [sdnResolving,   setSdnResolving]   = React.useState(false)
  React.useEffect(() => {
    loadSDN().then(db => {
      if (db?.length) { setSdnDb(db); setSdnStats(getSDNStats(db)) }
    })
  }, [])

  const [inputVal,    setInputVal]    = useState('')
  const [query,       setQuery]       = useState('')
  const [activeTab,   setActiveTab]   = useState('overview')
  const [timespan,    setTimespan]    = useState('1year')
  const [history,     setHistory]     = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [loadingGraph,setLoadingGraph]= useState(false)
  const [graphBuilt,  setGraphBuilt]  = useState(false)
  const [dismissed,   setDismissed]   = useState({})

  // Loading states per source
  const [loadMain,  setLoadMain]  = useState(false)  // /api/intel
  const [loadGroq,  setLoadGroq]  = useState(false)
  const [apiError,  setApiError]  = useState(null)

  // All data
  const [intelData,     setIntelData]     = useState(null)   // raw /api/intel response
  const [articles,      setArticles]      = useState([])     // processed GDELT articles
  const [gnArticles,    setGnArticles]    = useState([])     // Google News
  const [relationships, setRelationships] = useState([])
  const [aiProfile,     setAiProfile]     = useState('')
  const [timeline,      setTimeline]      = useState(null)

  const inputRef = useRef(null)

  useEffect(() => {
    const h = e => { if ((e.metaKey||e.ctrlKey)&&e.key==='k') { e.preventDefault(); inputRef.current?.focus() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ── SEARCH ───────────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q) => {
    const trimmed = (q || inputVal).trim()
    if (!trimmed) return

    setQuery(trimmed)
    setInputVal(trimmed)
    setActiveTab('overview')
    setHistory(h => [trimmed, ...h.filter(x => x !== trimmed)].slice(0, 8))
    setGraphBuilt(false)
    setIntelData(null)
    setArticles([]); setGnArticles([])
    setRelationships([]); setAiProfile('')
    setTimeline(null); setApiError(null)
    setLoadMain(true)

    let data = null

    // Fire GDELT dedicated endpoint AND intel endpoint IN PARALLEL
    // GDELT has its own 55s budget — never blocks intel, never gets blocked
    const gdeltDedicatedPromise = fetchGDELTDedicated(trimmed, timespan)

    // Primary intel API (biography, legal, financial, sanctions...)
    try {
      data = await fetchIntelAPI(trimmed, timespan, keys)
      setIntelData(data)
      // Articles from intel API (fast subset)
      const intelArts = (data.articles || []).map(articleToLocal).filter(a => a.title.length > 6)
      setArticles(intelArts)
      setGnArticles(data.gnews || [])
      setTimeline(data.timeline || null)
      // Auto-switch to news if articles arrived but no wiki profile
      if (intelArts.length > 0 && !data.wiki && !data.wikidata) setActiveTab('news')
    } catch (err) {
      setApiError(`Intel API unavailable (${err.message}) — GDELT dedicated still running`)
      data = { articles: [], gnews: [], _summary: {} }
      setIntelData(data)
    } finally {
      setLoadMain(false)
    }

    // GDELT dedicated — arrives separately, merges into articles
    gdeltDedicatedPromise.then(gdelt => {
      if (!gdelt?.articles?.length) return
      const gdeltArts = gdelt.articles.map(articleToLocal).filter(a => a.title.length > 6)
      // Merge with existing articles, deduplicate by url
      setArticles(prev => {
        const seen = new Set(prev.map(a => a.url))
        const fresh = gdeltArts.filter(a => !seen.has(a.url))
        const merged = [...prev, ...fresh].sort((a, b) => b.pub - a.pub)
        // Auto-switch to news if no other data showing
        if (merged.length > 0 && !data?.wiki && !data?.wikidata) {
          setActiveTab(t => t === 'overview' ? 'news' : t)
        }
        return merged
      })
      if (gdelt.timeline && !data?.timeline) setTimeline(gdelt.timeline)
    }).catch(() => {})

    // Groq synthesis — starts after intel arrives, uses merged data
    if (data && groqKey) {
      setLoadGroq(true)
      // Give GDELT 3 extra seconds to merge before Groq runs
      setTimeout(() => {
        Promise.all([
          groqRelationships(trimmed, data, groqKey).then(r => setRelationships(r)),
          groqProfile(trimmed, data, groqKey).then(p => setAiProfile(p)),
        ]).finally(() => setLoadGroq(false))
      }, 3000)
    }
  }, [inputVal, timespan, groqKey])

  // ── BUILD GRAPH ──────────────────────────────────────────────────────────
  const buildGraph = useCallback(async () => {
    if (!intelData) return
    setLoadingGraph(true)
    const store = useStore.getState()
    const qLow = query.toLowerCase()
    const wiki = intelData.wiki
    const wd   = intelData.wikidata

    store.addNode({
      type: inferType(query), label: query.slice(0,55),
      detail: wiki?.extract?.slice(0,300) || wd?.description || `Intel target: ${query}`,
      source: wiki?.url ? 'Wikipedia' : 'NEXUS OSINT',
      url: wiki?.url || '#', color: '#2dd4bf', x: 500, y: 320,
    })
    await new Promise(r => setTimeout(r, 80))

    const em = new Map()
    const add = (name, type, evidence, conf) => {
      if (!name||name.length<2||name.toLowerCase()===qLow) return
      const k = name.toLowerCase()
      if (!em.has(k)) em.set(k, {name,type:type||inferType(name),count:0,evidence:[],confidence:conf||'MEDIUM'})
      em.get(k).count++; em.get(k).evidence.push(evidence||'')
    }

    relationships.forEach(r => { add(r.from,inferType(r.from),r.evidence,r.confidence); add(r.to,inferType(r.to),r.evidence,r.confidence) })
    ;(intelData.wikiLinks||[]).forEach(l => add(l,inferType(l),'Wikipedia','LOW'))
    ;(wd?.spouses||[]).forEach(s => add(s,'person','Wikidata: spouse','HIGH'))
    ;(wd?.employers||[]).forEach(e => add(e,'org','Wikidata: employer','HIGH'))
    ;(wd?.memberships||[]).forEach(m => add(m,'org','Wikidata: member','HIGH'))
    ;(wd?.politicalParties||[]).forEach(p => add(p,'org','Wikidata: party','HIGH'))
    ;(intelData.sanctions||[]).forEach(s => s.datasets.forEach(d => add(d,'org',`Sanction: ${s.name}`,'HIGH')))
    ;(intelData.companies||[]).forEach(c => add(c.name,'org',`OpenCorporates ${c.jurisdiction}`,'MEDIUM'))
    ;(intelData.officerships||[]).forEach(o => add(o.companyName,'org',`Officer: ${o.position}`,'HIGH'))
    ;(intelData.icij||[]).forEach(i => add(i.name,'org',`ICIJ ${i.dataset||'Offshore'}`,'HIGH'))
    // News articles — add top 15 as event nodes
    ;(articles||[]).slice(0,15).forEach(a => {
      const eId = store.addNode({ type:'event', label:a.title.slice(0,55), detail:a.title, source:a.source, url:a.url, color:SEV_C[a.severity]||'#fb923c', x:200+Math.random()*700, y:80+Math.random()*500 })
    })
    // Documents — add as document nodes
    ;(intelData.documents||[]).slice(0,50).forEach(d => {
      store.addNode({ type:'event', label:d.title.slice(0,55), detail:`${d.source||'DocumentCloud'} · ${d.pages||'?'} pages · ${d.created||''}`, source:'DocumentCloud', url:d.url, color:'#60a5fa', x:150+Math.random()*700, y:100+Math.random()*500 })
    })
    // Interpol red notices
    ;(intelData.interpol||[]).forEach(n => add(n.name,'person','Interpol red notice: '+n.charges,'HIGH'))
    // OFAC SDN
    ;(intelData.ofac||[]).forEach(n => add(n.name,'person','OFAC SDN: '+n.program,'HIGH'))
    // Courts — case names as event nodes, opposing parties as person nodes
    ;(intelData.courts||[]).slice(0,20).forEach(c => {
      if (c.caseName) add(c.caseName,'event','CourtListener opinion: '+c.court,'MEDIUM')
    })
    ;(intelData.dockets||[]).slice(0,20).forEach(d => {
      if (d.caseName) add(d.caseName,'event','PACER docket: '+d.court,'MEDIUM')
    })
    // FEC — committees and contribution networks
    ;(intelData.fec?.candidates||[]).forEach(c => add(c.name,'person','FEC candidate: '+c.party,'HIGH'))
    ;(intelData.fec?.committees||[]).forEach(c => add(c.name,'org','FEC committee: '+c.type,'HIGH'))
    // World Bank debarred
    ;(intelData.worldbank||[]).forEach(w => add(w.name,'org','World Bank debarred: '+w.country,'HIGH'))
    // UK Companies House
    ;(intelData.ukOfficers||[]).forEach(o => { if(o.name) add(o.name,'person','UK Companies House officer','MEDIUM') })
    // SEC filings — companies that filed about this entity
    ;(intelData.sec||[]).forEach(s => { if(s.entity&&s.entity!==query) add(s.entity,'org','SEC filing: '+s.form,'MEDIUM') })
    // OCCRP Aleph
    ;(intelData.occrp||[]).forEach(r => add(r.caption,'org','OCCRP: '+r.dataset,'HIGH'))
    // Social profiles — add as person nodes
    ;(intelData.socialProfiles||[]).slice(0,10).forEach(s => add(s.handle,'person','Social: '+s.platform,'LOW'))
    // IntelX records
    ;(intelData.intelx||[]).slice(0,8).forEach(r => add(r.name,'event','IntelX: '+r.bucket,'MEDIUM'))
    // Locations
    ;(intelData.locations||[]).slice(0,5).forEach(l => { if(l.name) add(l.name.split(',')[0],'location','OpenStreetMap','LOW') })
    // Wikidata residences
    ;(intelData.wikidata?.residences||[]).forEach(r => add(r,'location','Wikidata residence','MEDIUM'))
    ;(intelData.wikidata?.education||[]).forEach(e => add(e,'org','Wikidata: education','MEDIUM'))
    ;(intelData.wikidata?.children||[]).forEach(c => add(c,'person','Wikidata: child','HIGH'))
    ;(intelData.wikidata?.nationalities||[]).forEach(n => add(n,'location','Wikidata: nationality','LOW'))

    const entities = [...em.values()].sort((a,b)=>b.count-a.count).slice(0,40)
    entities.forEach((ent,i) => {
      const tier = ent.confidence==='HIGH'?0:ent.confidence==='MEDIUM'?1:2
      const R = 180+tier*140
      const angle = (2*Math.PI*i/Math.max(entities.length,1))+tier*0.4
      store.addNode({
        type:ent.type, label:ent.name.slice(0,55),
        detail:ent.evidence.filter(Boolean).slice(0,2).join(' | ').slice(0,250),
        source:ent.evidence[0]?.includes('Wiki')?'Wikipedia':ent.evidence[0]?.includes('ICIJ')?'ICIJ':ent.evidence[0]?.includes('Sanction')?'OpenSanctions':'GDELT+Groq',
        color:TYPE_CLR[ent.type]||'#94a3b8',
        x:500+Math.cos(angle)*R+(Math.random()-.5)*30,
        y:320+Math.sin(angle)*R+(Math.random()-.5)*30,
      })
    })

    await new Promise(r => setTimeout(r,120))
    const board = store._board()
    const allNodes = board?.nodes||[]
    const findNode = name => {
      const nl = name.toLowerCase()
      return allNodes.find(n=>n.label.toLowerCase()===nl||n.label.toLowerCase().startsWith(nl.slice(0,15))||nl.startsWith(n.label.toLowerCase().slice(0,15)))
    }
    const seen = new Set()
    relationships.forEach(rel => {
      if (!rel.from||!rel.to||!rel.type) return
      const src=findNode(rel.from),tgt=findNode(rel.to)
      if (!src||!tgt||src.id===tgt.id) return
      const ek=[src.id,tgt.id].sort().join('|')+rel.type
      if (seen.has(ek)) return; seen.add(ek)
      store.addEdge({src:src.id,tgt:tgt.id,type:rel.type.toLowerCase(),label:rel.type.replace(/_/g,' ').toLowerCase(),
        color:EDGE_COLOR_MAP[rel.type]||'#334155',dash:['OPPOSES','ACCUSED_OF','INVESTIGATED_BY'].includes(rel.type)})
    })
    setGraphBuilt(true); setLoadingGraph(false)
  }, [query,intelData,relationships,articles])

  const toggleExpand = id => setExpandedIds(p => { const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n })

  const wd = intelData?.wikidata
  const wiki = intelData?.wiki
  const sanctions = intelData?.sanctions || []
  const icij = intelData?.icij || []
  const companies = intelData?.opencorp || intelData?.companies || []
  const officerships = intelData?.officerships || []
  const courts         = intelData?.courts || intelData?.dockets || []
  const occrp          = intelData?.occrp || []
  const courtFinancial = intelData?.courtFinancial || []
  const courtPeople    = intelData?.courtPeople || []
  const locations = intelData?.locations || []
  const interpol = intelData?.interpol || []
  const wikiLinks = intelData?.wikiLinks || []
  const sec = intelData?.sec || []
  const ddgLeaks = intelData?.ddgLeaks
  const ddgDarkweb = intelData?.ddgDarkweb
  const ddgFinancial = intelData?.ddgFinancial
  const ddgSocial = intelData?.ddgSocial
  const ddgAddress = intelData?.ddgAddress
  const ddgCriminal  = intelData?.ddgCriminal
  const ddgCrypto    = intelData?.ddgCrypto
  const ofac         = intelData?.ofac || []
  const euSanctions  = intelData?.euSanctions || []
  const dockets      = intelData?.dockets || []
  const justia       = intelData?.justia || []
  const bing         = intelData?.bing || []
  const documents    = intelData?.documents || []
  const wikiCategories = intelData?.wikiCategories || []
  const fec          = intelData?.fec || { candidates:[], committees:[] }
  const worldbank    = intelData?.worldbank || []
  const pastes       = intelData?.pastes || []
  const wayback      = intelData?.wayback || []
  const ukOfficers   = intelData?.ukOfficers || []
  const socialProfiles = intelData?.socialProfiles || []
  const intelxResults  = intelData?.intelx || []
  const hibpBreaches   = intelData?.hibpBreaches || []
  const hunterEmails   = intelData?.hunterEmails || []
  const hunterOrg      = intelData?.hunterOrg || null
  const dehashed       = intelData?.dehashed || []
  const wigleNetworks  = intelData?.wigleNetworks || []
  const urlscan          = intelData?.urlscan || []
  const virustotal       = intelData?.virustotal || null
  const abuseipdb        = intelData?.abuseipdb || null
  const sectrailsSubs    = intelData?.sectrailsSubs || []
  const sectrailsDns     = intelData?.sectrailsDns || intelData?.sectrailsDNS || []
  const leakix           = intelData?.leakix || []
  const bgpview          = intelData?.bgpview || null
  const ipinfo           = intelData?.ipinfo || null
  const emailrep         = intelData?.emailRep || intelData?.emailrep || null
  const certs            = intelData?.certs || []
  const ahmia            = intelData?.ahmia || []
  const usernameSearch   = intelData?.usernameSearch || []
  const usernameProfiles = intelData?.usernameProfiles || []
  const indianCourts     = intelData?.indianCourts || []
  const propertySignals  = intelData?.propertySignals || []



  const dismiss = (field, id) => setDismissed(d => ({...d, [field+':'+id]: true}))
  const notDismissed = (field, item, id) => !dismissed[field+':'+(id||item?.id||item?.uid||item?.nodeId||item?.caseName||item?.name||'')]
  const hasAlerts = sanctions.length > 0 || icij.length > 0 || interpol.length > 0 || worldbank.length > 0 || ofac.length > 0

  // Timeline sparkline
  const spark = (() => {
    const series = timeline?.timeline?.[0]?.data
    if (!series?.length) return null
    const max = Math.max(...series.map(d => d.value||0), 1)
    return { series, max }
  })()

  const TABS = [
    { id:'overview',    label:'Overview',    icon:<Globe size={10}/>,        badge: (wiki||wd)?1:0 },
    { id:'news',        label:'News',        icon:<FileText size={10}/>,     badge: articles.length+gnArticles.length+bing.length },
    { id:'connections', label:'Connections', icon:<Link2 size={10}/>,        badge: relationships.length, loading: loadGroq },
    { id:'financial',   label:'Financial',   icon:<DollarSign size={10}/>,   badge: companies.length+officerships.length+icij.length+sec.length+ukOfficers.length+(fec?.candidates?.length||0)+worldbank.length, alert: icij.length>0||worldbank.length>0 },
    { id:'legal',       label:'Legal',       icon:<Scale size={10}/>,        badge: courts.length+dockets.length+sanctions.length+interpol.length+(ofac?.length||0)+worldbank.length+(indianCourts?.length||0)+courtPeople.length+courtFinancial.length+occrp.length, alert: hasAlerts||(ofac?.length||0)>0 },
    { id:'locations',   label:'Locations',   icon:<MapPin size={10}/>,       badge: locations.length },
    { id:'digital',     label:'Social/Dark', icon:<Eye size={10}/>,          badge: socialProfiles.length+pastes.length+(ddgLeaks?.relatedTopics?.length||0)+intelxResults.length+hibpBreaches.length+(virustotal?1:0)+(abuseipdb?1:0)+urlscan.length+leakix.length+dehashed.length+hunterEmails.length, alert: pastes.length>0 },
    { id:'osint',       label:'Web OSINT',   icon:<Eye size={10}/>,          badge: (ddgLeaks?.relatedTopics?.length||0)+(ddgDarkweb?.relatedTopics?.length||0)+(ddgCriminal?.relatedTopics?.length||0)+(ddgFinancial?.relatedTopics?.length||0)+usernameProfiles.length+usernameSearch.length },
    { id:'documents',   label:'Documents',   icon:<FileText size={10}/>,     badge: documents.length+wikiCategories.length },
    { id:'report',      label:'AI Profile',  icon:<Shield size={10}/>,       badge: aiProfile?1:0, loading: loadGroq },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--void)'}}>

      {/* HEADER */}
      <div style={{flexShrink:0,padding:'12px 16px 10px',background:'var(--base)',borderBottom:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
          <Globe size={13} style={{color:'var(--accent)'}}/>
          <span style={{fontFamily:'Orbitron,sans-serif',fontSize:'12px',fontWeight:700,color:'var(--accent)',letterSpacing:'0.15em'}}>INTELLIGENCE SEARCH</span>
          <span className="mono" style={{fontSize:'7px',color:'var(--t4)'}}>GDELT · GNews · Wikipedia · Wikidata · OpenSanctions · OpenCorporates · ICIJ · CourtListener · Interpol · OSM · DuckDuckGo</span>
          <div style={{marginLeft:'auto',display:'flex',gap:'4px'}}>
            {showFilters && (
              <select value={timespan} onChange={e=>setTimespan(e.target.value)} className="inp" style={{width:'auto',fontSize:'10px',padding:'3px 6px'}}>
                {[['1week','1 week'],['1month','1 month'],['3months','3 months'],['1year','1 year'],['5years','5 years']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            )}
            <button className="btn" style={{padding:'3px 8px'}} onClick={()=>setShowFilters(s=>!s)}>
              <Filter size={10} style={{color:showFilters?'var(--accent)':'var(--t3)'}}/>
            </button>
          </div>
        </div>

        <div style={{display:'flex',gap:'6px',alignItems:'center',marginBottom:'8px'}}>
          <div style={{position:'relative',flex:1}}>
            <Search size={13} style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',color:'var(--t3)'}}/>
            <input ref={inputRef} value={inputVal} onChange={e=>setInputVal(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')doSearch()}}
              placeholder="Search any person, org, company, place — full OSINT profile instantly"
              className="inp" style={{paddingLeft:'34px',paddingRight:inputVal?'32px':'10px',fontSize:'13px',height:'40px'}}/>
            {inputVal&&<button onClick={()=>{setInputVal('');setQuery('')}}
              style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--t3)'}}>
              <X size={12}/></button>}
          </div>
          <button className="btn btn-accent" style={{height:'40px',padding:'0 18px',fontSize:'11px',fontWeight:600,flexShrink:0}}
            onClick={()=>doSearch()} disabled={loadMain||!inputVal.trim()}>
            {loadMain?<Loader size={12} className="spin"/>:<Search size={12}/>}
            {loadMain?'Searching…':'Search'}
          </button>
        </div>

        {/* Error / fallback notice */}
        {apiError && (
          <div style={{padding:'5px 10px',background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.2)',borderRadius:'3px',marginBottom:'6px',fontSize:'9px',color:'var(--orange)',fontFamily:'JetBrains Mono'}}>
            ⚠ {apiError}
          </div>
        )}

        {history.length>1&&(
          <div style={{display:'flex',alignItems:'center',gap:'4px',flexWrap:'wrap'}}>
            <span className="mono" style={{fontSize:'7px',color:'var(--t4)'}}>TRAIL:</span>
            {history.slice(0,6).map((h,i)=>(
              <React.Fragment key={h}>
                <button onClick={()=>doSearch(h)} className="mono"
                  style={{fontSize:'8px',color:h===query?'var(--accent)':'var(--t3)',background:'none',border:'none',cursor:'pointer',padding:'1px 4px',textDecoration:h===query?'none':'underline',textDecorationColor:'var(--t4)'}}>
                  {h}
                </button>
                {i<Math.min(history.length-1,5)&&<ChevronRight size={8} style={{color:'var(--t4)'}}/>}
              </React.Fragment>
            ))}
          </div>
        )}

        {!query&&!loadMain&&(
          <div style={{marginTop:'8px'}}>
            <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'5px',letterSpacing:'0.1em'}}>FULL OSINT PROFILE — news · finances · legal · dark web · associates · locations</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
              {SUGGESTED.map(s=>(
                <button key={s.label} onClick={()=>doSearch(s.label)}
                  style={{fontFamily:'JetBrains Mono',fontSize:'9px',padding:'3px 8px',borderRadius:'3px',background:'var(--panel)',border:'1px solid var(--border)',color:'var(--t3)',cursor:'pointer',display:'flex',alignItems:'center',gap:'4px'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--t3)'}}>
                  <span>{s.icon}</span>{s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RESULTS + ALWAYS-VISIBLE DOC SEARCH SIDEBAR */}
      <div style={{flex:1,display:'flex',flexDirection:'row',overflow:'hidden'}}>

        {/* Doc search sidebar — always visible regardless of entity search state */}
        <DocSearchPanel />

        {query&&(
        <div style={{flex:1,display:'flex',flexDirection:'row',overflow:'hidden',minWidth:0}}>
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

          {/* Status bar */}
          <div style={{flexShrink:0,padding:'5px 12px',borderBottom:'1px solid var(--border)',background:'var(--base)',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
            <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)'}}>"{query}"</span>
            {loadMain&&<span style={{display:'flex',alignItems:'center',gap:'4px'}}><Loader size={9} className="spin" style={{color:'var(--accent)'}}/><span className="mono" style={{fontSize:'8px',color:'var(--accent)'}}>fetching all sources…</span></span>}
            {!loadMain&&intelData&&(
              <span className="mono" style={{fontSize:'8px',color:'var(--t3)'}}>
                {articles.length+gnArticles.length+bing.length} articles · {sanctions.length+(ofac?.length||0)} sanctions · {(icij?.length||0)} ICIJ · {companies.length+officerships.length+ukOfficers.length} companies · {courts.length+dockets.length} courts · {interpol.length} Interpol · {socialProfiles.length} social · {pastes.length} pastes
              </span>
            )}
            {loadGroq&&<span style={{display:'flex',alignItems:'center',gap:'4px'}}><Loader size={9} className="spin" style={{color:'#c084fc'}}/><span className="mono" style={{fontSize:'8px',color:'#c084fc'}}>Groq AI…</span></span>}
            <div style={{marginLeft:'auto',display:'flex',gap:'5px'}}>
              {intelData&&!loadMain&&(
                <button className="btn btn-accent" style={{fontSize:'9px',padding:'3px 10px'}}
                  onClick={async()=>{await buildGraph();setTab('board')}} disabled={loadingGraph}>
                  {loadingGraph?<><Loader size={9} className="spin"/> Building…</>:<><GitBranch size={9}/> Build Graph</>}
                </button>
              )}
              {graphBuilt&&<button className="btn" style={{fontSize:'9px',padding:'3px 10px'}} onClick={()=>setTab('board')}><GitBranch size={9}/> Open Board</button>}
              <button className="btn" style={{fontSize:'9px',padding:'3px 9px'}}
                onClick={()=>{const id=addSituation(query);setTimeout(()=>{useStore.getState().setActiveSituation?.(id);setTab('situations')},50)}}>
                <Radio size={9}/> Monitor
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{flexShrink:0,display:'flex',borderBottom:'1px solid var(--border)',background:'var(--base)',overflowX:'auto'}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                style={{display:'flex',alignItems:'center',gap:'4px',padding:'7px 11px',border:'none',cursor:'pointer',flexShrink:0,background:'transparent',
                  borderBottom:activeTab===t.id?'2px solid var(--accent)':'2px solid transparent',
                  color:activeTab===t.id?'var(--accent)':'var(--t3)',fontSize:'10px',fontWeight:activeTab===t.id?600:400}}>
                {t.icon}{t.label}
                {t.badge>0&&!t.loading&&<span style={{fontSize:'7px',padding:'0 4px',background:t.alert?'rgba(239,68,68,0.2)':'rgba(45,212,191,0.15)',borderRadius:'2px',color:t.alert?'#ef4444':'var(--accent)'}}>{t.badge}</span>}
                {t.loading&&<Loader size={8} className="spin" style={{color:'var(--t4)'}}/>}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{flex:1,overflowY:'auto'}}>

            {/* ── OVERVIEW ── */}
            {activeTab==='overview'&&(
              <div style={{padding:'14px'}}>
                {hasAlerts&&(
                  <div style={{padding:'10px 12px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.35)',borderRadius:'4px',marginBottom:'12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px'}}>
                      <AlertTriangle size={12} style={{color:'#ef4444'}}/>
                      <span style={{fontSize:'11px',fontWeight:700,color:'#ef4444'}}>⚠ INTELLIGENCE ALERTS</span>
                    </div>
                    {interpol.length>0&&<div style={{fontSize:'10px',color:'var(--t1)',marginBottom:'3px'}}>🚨 <strong>INTERPOL RED NOTICE</strong>: {interpol.map(i=>`${i.name} — ${i.charges}`).join(' | ')}</div>}
                    {sanctions.length>0&&<div style={{fontSize:'10px',color:'var(--t2)',marginBottom:'3px'}}>🚩 In <strong>{sanctions.length}</strong> sanctions/watchlist databases: {sanctions.map(s=>s.datasets.join(', ')).join(' · ')}</div>}
                    {icij.length>0&&<div style={{fontSize:'10px',color:'var(--t2)'}}>🏦 <strong>{icij.length}</strong> ICIJ Offshore Leaks records (Panama/Paradise/Pandora Papers)</div>}
                  </div>
                )}

                {wiki&&(
                  <div style={{display:'flex',gap:'12px',padding:'12px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'4px',marginBottom:'12px'}}>
                    {wiki.thumbnail&&<img src={wiki.thumbnail} alt="" style={{width:'65px',height:'65px',objectFit:'cover',borderRadius:'3px',flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'14px',fontWeight:700,color:'var(--t1)',marginBottom:'2px'}}>{wiki.title}</div>
                      <div className="mono" style={{fontSize:'9px',color:'var(--accent)',marginBottom:'5px'}}>{wiki.description}</div>
                      <p style={{fontSize:'11px',color:'var(--t2)',lineHeight:1.7,margin:0}}>{wiki.extract?.slice(0,400)}{wiki.extract?.length>400?'…':''}</p>
                    </div>
                    {wiki.url&&<a href={wiki.url} target="_blank" rel="noopener noreferrer" style={{color:'var(--t4)',flexShrink:0}}><ExternalLink size={12}/></a>}
                  </div>
                )}

                {wd&&(
                  <div style={{padding:'10px 12px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'4px',marginBottom:'12px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#818cf8',marginBottom:'8px',letterSpacing:'0.1em'}}>WIKIDATA STRUCTURED PROFILE</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
                      {wd.birthDate&&<InfoRow label="Born" val={wd.birthDate}/>}
                      {wd.deathDate&&<InfoRow label="Died" val={wd.deathDate}/>}
                      {wd.nationalities?.length>0&&<InfoRow label="Nationality" val={wd.nationalities.join(', ')}/>}
                      {wd.positions?.length>0&&<InfoRow label="Positions" val={wd.positions.slice(0,3).join(', ')}/>}
                      {wd.politicalParties?.length>0&&<InfoRow label="Party" val={wd.politicalParties.join(', ')}/>}
                      {wd.employers?.length>0&&<InfoRow label="Employer" val={wd.employers.join(', ')}/>}
                      {wd.education?.length>0&&<InfoRow label="Education" val={wd.education.join(', ')}/>}
                      {wd.spouses?.length>0&&<InfoRow label="Spouse(s)" val={wd.spouses.join(', ')}/>}
                      {wd.children?.length>0&&<InfoRow label="Children" val={wd.children.join(', ')}/>}
                      {wd.siblings?.length>0&&<InfoRow label="Siblings" val={wd.siblings.join(', ')}/>}
                      {wd.memberships?.length>0&&<InfoRow label="Memberships" val={wd.memberships.slice(0,4).join(', ')}/>}
                      {wd.residences?.length>0&&<InfoRow label="Residences" val={wd.residences.join(', ')}/>}
                      {wd.netWorthAmount&&<InfoRow label="Net Worth" val={`${wd.netWorthAmount} ${wd.netWorthCurrency||''}`}/>}
                    </div>
                    <a href={wd.wikidataUrl} target="_blank" rel="noopener noreferrer" className="mono" style={{fontSize:'8px',color:'var(--t4)',textDecoration:'none',marginTop:'6px',display:'block'}}>↗ Full Wikidata entry ({wd.id})</a>
                  </div>
                )}

                {wikiLinks.length>0&&(
                  <div>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'6px',letterSpacing:'0.1em'}}>WIKIPEDIA CONNECTIONS ({wikiLinks.length}) — click to pivot</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
                      {wikiLinks.map((link,i)=>{
                        const color=TYPE_CLR[inferType(link)]||'#94a3b8'
                        return(
                          <button key={`${link}-${i}`} onClick={()=>doSearch(link)}
                            style={{display:'flex',alignItems:'center',gap:'4px',padding:'3px 8px',borderRadius:'3px',background:'var(--panel)',border:`1px solid ${color}33`,color:'var(--t2)',cursor:'pointer',fontSize:'10px'}}
                            onMouseEnter={e=>{e.currentTarget.style.borderColor=color;e.currentTarget.style.color=color}}
                            onMouseLeave={e=>{e.currentTarget.style.borderColor=`${color}33`;e.currentTarget.style.color='var(--t2)'}}>
                            <span style={{width:'5px',height:'5px',borderRadius:'50%',background:color}}/>{link}<ArrowRight size={8} style={{color:'var(--t4)'}}/>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── SDN + ICIJ instant local lookup ── */}
                {query&&(()=>{
                  const sdnHits = sdnDb ? searchSDN(query, sdnDb, { threshold: 0.2, maxResults: 50 }) : []
                  const icijHits = searchICIJ(query)
                  const ofacSeedHits = sdnDb ? [] : searchOFAC(query)
                  if (!sdnHits.length && !icijHits.length && !ofacSeedHits.length) return null
                  const weakHits = sdnHits.filter(h => h._needsResolution)
                  if (weakHits.length > 0 && groqKey && !sdnResolving && !Object.keys(sdnResolutions).length) {
                    setSdnResolving(true)
                    resolveEntitiesWithGroq(query, weakHits, groqKey)
                      .then(rs => { const m={}; rs.forEach(r=>{if(r.id)m[r.id]=r}); setSdnResolutions(m); setSdnResolving(false) })
                      .catch(()=>setSdnResolving(false))
                  }
                  const displayHits = sdnHits.filter(h => {
                    if (!h._needsResolution) return true
                    const res = sdnResolutions[h.id]
                    if (!res) return true
                    return res.verdict !== 'DIFFERENT'
                  })
                  return (
                    <div style={{marginBottom:'12px'}}>
                      {displayHits.length>0&&(
                        <div style={{padding:'8px 10px',background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.35)',borderRadius:'4px',marginBottom:'6px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px',flexWrap:'wrap'}}>
                            <span style={{fontSize:'11px',fontWeight:700,color:'#ef4444'}}>🚨 OFAC SDN — {displayHits.length} MATCH{displayHits.length>1?'ES':''}</span>
                            {sdnResolving&&<span className="mono" style={{fontSize:'7px',color:'#c084fc'}}>⟳ Groq resolving…</span>}
                            {sdnStats&&<span className="mono" style={{fontSize:'7px',color:'var(--t4)'}}>{sdnStats.total?.toLocaleString()} total · {sdnStats.withCrypto} w/crypto</span>}
                            <a href="https://sanctionssearch.ofac.treas.gov/" target="_blank" rel="noopener noreferrer" style={{fontSize:'8px',color:'var(--accent)',marginLeft:'auto'}}>OFAC ↗</a>
                          </div>
                          {displayHits.slice(0,50).map((hit,i)=>{
                            const res=sdnResolutions[hit.id]
                            const isWeak=hit._needsResolution
                            return(
                              <div key={i} style={{padding:'6px 8px',background:'rgba(239,68,68,0.05)',borderRadius:'3px',marginBottom:'4px',
                                borderLeft:`2px solid ${res?.verdict==='SAME'?'#ef4444':res?.verdict==='RELATED'?'#f97316':isWeak?'#555':'rgba(239,68,68,0.4)'}`}}>
                                <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap',marginBottom:'2px'}}>
                                  <span style={{fontSize:'11px',fontWeight:700,color:'#ef4444'}}>{hit.name}</span>
                                  <span className="mono" style={{fontSize:'7px',padding:'1px 4px',background:'rgba(239,68,68,0.15)',color:'#f97316',borderRadius:'2px'}}>{hit.type}</span>
                                  {(hit.programs||[]).slice(0,2).map((p,j)=><span key={j} className="mono" style={{fontSize:'7px',padding:'1px 4px',background:'rgba(249,115,22,0.1)',color:'#f97316',borderRadius:'2px'}}>{p}</span>)}
                                  {!res&&isWeak&&!sdnResolving&&<span className="mono" style={{fontSize:'7px',color:'var(--t4)',marginLeft:'auto'}}>❓ partial</span>}
                                  {!res&&isWeak&&sdnResolving&&<span className="mono" style={{fontSize:'7px',color:'#c084fc',marginLeft:'auto'}}>⟳</span>}
                                  {res&&<span className="mono" style={{fontSize:'7px',marginLeft:'auto',padding:'1px 5px',borderRadius:'2px',fontWeight:700,
                                    background:res.verdict==='SAME'?'rgba(239,68,68,0.15)':res.verdict==='RELATED'?'rgba(249,115,22,0.15)':'rgba(100,100,100,0.1)',
                                    color:res.verdict==='SAME'?'#ef4444':res.verdict==='RELATED'?'#f97316':'var(--t4)'}}>
                                    {res.verdict==='SAME'?'✓ SAME':res.verdict==='RELATED'?'⟷ RELATED':'✗ DIFF'} · {res.confidence}
                                  </span>}
                                </div>
                                {res?.reason&&res.verdict!=='DIFFERENT'&&<div style={{fontSize:'8px',color:'#c084fc',marginBottom:'2px',fontStyle:'italic'}}>🤖 {res.reason}</div>}
                                {hit.aliases?.length>0&&<div style={{fontSize:'9px',color:'var(--t3)',marginBottom:'2px'}}>AKA: {hit.aliases.slice(0,3).join(' · ')}</div>}
                                <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                                  {hit.dob&&<span className="mono" style={{fontSize:'8px',color:'var(--t3)'}}>DOB: {hit.dob}</span>}
                                  {hit.swift&&<span className="mono" style={{fontSize:'8px',color:'#f59e0b'}}>SWIFT: {hit.swift}</span>}
                                  {hit.vesselFlag&&<span className="mono" style={{fontSize:'8px',color:'#0088ff'}}>🚢 {hit.vesselFlag}</span>}
                                  {hit.cryptoAddresses&&Object.keys(hit.cryptoAddresses).length>0&&<span className="mono" style={{fontSize:'8px',color:'#f59e0b'}}>₿ CRYPTO</span>}
                                </div>
                                {hit.addresses?.length>0&&<div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginTop:'2px'}}>📍 {hit.addresses.slice(0,2).map(a=>[a.city,a.country].filter(Boolean).join(', ')).join(' | ')}</div>}
                              </div>
                            )
                          })}
                          {displayHits.length>8&&<div className="mono" style={{fontSize:'8px',color:'var(--t4)',padding:'4px 8px'}}>+{displayHits.length-8} more</div>}
                        </div>
                      )}
                      {icijHits.length>0&&(
                        <div style={{padding:'8px 10px',background:'rgba(249,115,22,0.07)',border:'1px solid rgba(249,115,22,0.3)',borderRadius:'4px',marginBottom:'6px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}}>
                            <span style={{fontSize:'11px',fontWeight:700,color:'#f97316'}}>🏦 ICIJ OFFSHORE LEAKS — {icijHits.length} MATCH{icijHits.length>1?'ES':''}</span>
                            <a href={`https://offshoreleaks.icij.org/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer" style={{fontSize:'8px',color:'var(--accent)',marginLeft:'auto'}}>Full DB ↗</a>
                          </div>
                          {icijHits.map((hit,i)=>(
                            <div key={i} style={{padding:'4px 8px',background:'rgba(249,115,22,0.05)',borderRadius:'3px',marginBottom:'3px'}}>
                              <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                                <span style={{fontSize:'10px',fontWeight:600,color:'var(--t1)'}}>{hit.name}</span>
                                <span className="mono" style={{fontSize:'7px',color:'#f97316',padding:'1px 4px',background:'rgba(249,115,22,0.15)',borderRadius:'2px'}}>{hit.dataset}</span>
                                <span className="mono" style={{fontSize:'7px',color:'var(--t4)'}}>{hit.jurisdiction}</span>
                              </div>
                              {hit.note&&<div style={{fontSize:'9px',color:'var(--t3)',marginTop:'2px'}}>{hit.note}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {loadMain&&!wiki&&!wd&&(
                  <div style={{display:'flex',alignItems:'center',gap:'8px',color:'var(--t4)',fontSize:'11px'}}>
                    <Loader size={14} className="spin" style={{color:'var(--accent)'}}/>Fetching intelligence from all sources…
                  </div>
                )}
              </div>
            )}

            {/* ── NEWS ── */}
            {activeTab==='news'&&(
              <div>
                {spark?.series?.length>0&&(
                  <div style={{padding:'8px 14px',borderBottom:'1px solid var(--border)',background:'var(--base)'}}>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'4px',letterSpacing:'0.1em'}}>SIGNAL VOLUME — {timespan.toUpperCase()}</div>
                    <div style={{display:'flex',alignItems:'flex-end',gap:'1px',height:'28px'}}>
                      {(spark.series||[]).map((d,i)=>{
                        const h=Math.max(2,Math.round((d.value/(spark.max||1))*28))
                        return<div key={i} style={{flex:1,height:`${h}px`,background:d.value>(spark.max||1)*0.6?'var(--orange)':'var(--accent)',opacity:0.6,borderRadius:'1px',cursor:'default'}} title={`${d.value}`}/>
                      })}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:'2px'}}>
                      <span className="mono" style={{fontSize:'7px',color:'var(--t4)'}}>older</span>
                      <span className="mono" style={{fontSize:'7px',color:'var(--orange)'}}>peak: {spark.max}</span>
                      <span className="mono" style={{fontSize:'7px',color:'var(--t4)'}}>now</span>
                    </div>
                  </div>
                )}

                {loadMain&&articles.length===0&&(
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'120px',gap:'10px',color:'var(--t3)',fontSize:'11px'}}>
                    <Loader size={16} className="spin" style={{color:'var(--accent)'}}/>Fetching from GDELT 250k+ sources…
                  </div>
                )}

                {articles.length>0&&(
                  <>
                    <div style={{padding:'5px 14px',borderBottom:'1px solid var(--border)',background:'var(--panel)'}}>
                      <span className="mono" style={{fontSize:'8px',color:'var(--accent)',letterSpacing:'0.1em'}}>GDELT — {articles.length} ARTICLES (server-direct)</span>
                    </div>
                    {articles.map(a=><ArticleRow key={a.id} article={a} expanded={expandedIds.has(a.id)} onToggle={()=>toggleExpand(a.id)} saved={isSaved(a.id)} onSave={()=>save(a)} onUnsave={()=>unsave(a.id)} onAddNode={()=>addNode({type:'event',label:a.title.slice(0,52),detail:a.title,source:a.source,url:a.url,color:SEV_C[a.severity]||'#fb923c',x:200+Math.random()*600,y:100+Math.random()*400})} onPivot={t=>doSearch(t)}/>)}
                  </>
                )}

                {gnArticles.length>0&&(
                  <>
                    <div style={{padding:'5px 14px',borderBottom:'1px solid var(--border)',background:'var(--panel)',marginTop:'4px'}}>
                      <span className="mono" style={{fontSize:'8px',color:'#4ade80',letterSpacing:'0.1em'}}>GOOGLE NEWS — {gnArticles.length} ARTICLES</span>
                    </div>
                    {gnArticles.map((a,i)=>(
                      <div key={i} style={{padding:'8px 14px',borderBottom:'1px solid var(--border)',borderLeft:'3px solid #4ade80'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'2px'}}>
                          <span className="mono" style={{fontSize:'9px',color:'#4ade80'}}>{a.source}</span>
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)',marginLeft:'auto'}}>{a.pubDate?.slice(0,16)}</span>
                        </div>
                        <a href={a.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'12px',fontWeight:500,color:'var(--t1)',textDecoration:'none',lineHeight:1.4,display:'block'}}
                          onMouseEnter={e=>e.currentTarget.style.color='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.color='var(--t1)'}>
                          {a.title} ↗
                        </a>
                      </div>
                    ))}
                  </>
                )}

                                {bing.length>0&&(
                  <>
                    <div style={{padding:'5px 14px',borderBottom:'1px solid var(--border)',background:'var(--panel)',marginTop:'4px'}}>
                      <span className="mono" style={{fontSize:'8px',color:'#00bfff',letterSpacing:'0.1em'}}>BING NEWS — {bing.length} ARTICLES</span>
                    </div>
                    {bing.map((a,i)=>(
                      <div key={i} style={{padding:'8px 14px',borderBottom:'1px solid var(--border)',borderLeft:'3px solid #00bfff'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'2px'}}>
                          <span className="mono" style={{fontSize:'9px',color:'#00bfff'}}>Bing News</span>
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)',marginLeft:'auto'}}>{a.pubDate?.slice(0,16)}</span>
                        </div>
                        <a href={a.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'12px',fontWeight:500,color:'var(--t1)',textDecoration:'none',lineHeight:1.4,display:'block'}}
                          onMouseEnter={e=>e.currentTarget.style.color='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.color='var(--t1)'}>{a.title} ↗</a>
                      </div>
                    ))}
                  </>
                )}

                {articles.length===0&&gnArticles.length===0&&bing.length===0&&!loadMain&&(
                  <div style={{padding:'32px',textAlign:'center'}}>
                    <Search size={24} style={{display:'block',margin:'0 auto 10px',color:'var(--t4)',opacity:0.4}}/>
                    <div style={{color:'var(--t4)',fontSize:'11px'}}>No articles found for "{query}"</div>
                    <div style={{color:'var(--t4)',fontSize:'10px',marginTop:'4px'}}>Try a longer timespan or slightly different spelling</div>
                  </div>
                )}
              </div>
            )}

            {/* ── CONNECTIONS ── */}
            {activeTab==='connections'&&(
              <div style={{padding:'12px 14px'}}>
                {!groqKey&&<div style={{padding:'10px',background:'rgba(167,139,250,0.06)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:'3px',marginBottom:'12px',fontSize:'10px',color:'var(--t3)'}}>⚠ Add Groq API key in Settings to enable AI relationship extraction.</div>}
                {loadGroq&&relationships.length===0&&<div style={{display:'flex',alignItems:'center',gap:'8px',color:'var(--t4)',fontSize:'11px',marginBottom:'12px'}}><Loader size={12} className="spin" style={{color:'#a78bfa'}}/>Groq AI extracting relationships from all sources…</div>}
                {relationships.length>0&&(
                  <>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'8px',letterSpacing:'0.1em'}}>AI RELATIONSHIPS ({relationships.length}) — click names to pivot</div>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                      {relationships.map((r,i)=>(
                        <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 10px',background:'var(--panel)',borderRadius:'3px',border:'1px solid var(--border)',flexWrap:'wrap'}}>
                          <button onClick={()=>doSearch(r.from)} style={{fontSize:'10px',color:'var(--t1)',fontWeight:600,background:'none',border:'none',cursor:'pointer',padding:0}}
                            onMouseEnter={e=>e.currentTarget.style.color=TYPE_CLR[inferType(r.from)]||'var(--accent)'}
                            onMouseLeave={e=>e.currentTarget.style.color='var(--t1)'}>{r.from}</button>
                          <span style={{fontSize:'8px',padding:'2px 6px',borderRadius:'2px',background:(EDGE_COLOR_MAP[r.type]||'#334155')+'22',color:EDGE_COLOR_MAP[r.type]||'#94a3b8',fontFamily:'JetBrains Mono',whiteSpace:'nowrap'}}>{r.type?.replace(/_/g,' ')}</span>
                          <button onClick={()=>doSearch(r.to)} style={{fontSize:'10px',color:'var(--t1)',fontWeight:600,background:'none',border:'none',cursor:'pointer',padding:0}}
                            onMouseEnter={e=>e.currentTarget.style.color=TYPE_CLR[inferType(r.to)]||'var(--accent)'}
                            onMouseLeave={e=>e.currentTarget.style.color='var(--t1)'}>{r.to}</button>
                          <span className="mono" style={{marginLeft:'auto',fontSize:'7px',color:'var(--t4)'}}>{r.confidence}</span>
                          {r.evidence&&<span style={{width:'100%',fontSize:'9px',color:'var(--t4)',fontStyle:'italic'}}>"{r.evidence.slice(0,120)}"</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── FINANCIAL ── */}
            {activeTab==='financial'&&(
              <div style={{padding:'12px 14px'}}>
                {icij.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',padding:'6px 10px',background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.3)',borderRadius:'3px'}}>
                      <AlertTriangle size={11} style={{color:'#f97316'}}/>
                      <span className="mono" style={{fontSize:'8px',color:'#f97316',letterSpacing:'0.1em'}}>ICIJ OFFSHORE LEAKS — {icij.length} RECORDS</span>
                    </div>
                    {icij.filter(item => notDismissed('icij', item, item.nodeId||item.name)).map((item,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid rgba(249,115,22,0.25)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                          <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)'}}>{item.name}</span>
                          {item.type&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{item.type}</span>}
                          {item.jurisdiction&&<span className="mono" style={{fontSize:'8px',color:'#f97316'}}>{item.jurisdiction}</span>}
                          {item.dataset&&<span className="mono" style={{fontSize:'8px',padding:'1px 4px',background:'rgba(249,115,22,0.15)',color:'#f97316',borderRadius:'2px'}}>{item.dataset}</span>}
                          {item.url&&<a href={item.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',color:'var(--t4)'}}><ExternalLink size={10}/></a>}
                        </div>
                        {item.note&&<div style={{fontSize:'9px',color:'var(--t3)',marginTop:'3px'}}>{item.note}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {officerships.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'8px',letterSpacing:'0.1em'}}>COMPANY OFFICER ROLES ({officerships.length})</div>
                    {officerships.filter(o=>notDismissed('off',o,o.company+o.position)).map((o,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                          <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)'}}>{o.company}</span>
                          <span className="mono" style={{fontSize:'8px',color:'var(--accent)'}}>{o.position}</span>
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{o.jurisdiction?.toUpperCase()}</span>
                          {o.startDate&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{o.start}–{o.endDate||'present'}</span>}
                          {o.companyUrl&&<a href={o.companyUrl} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',color:'var(--t4)'}}><ExternalLink size={10}/></a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {companies.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'8px',letterSpacing:'0.1em'}}>OPENCORPORATES — {companies.length} REGISTRATIONS · {officerships.length} OFFICER RECORDS</div>
                    {companies.filter(c=>notDismissed('co',c,c.name+c.jurisdiction)).map((c,i)=>{
                      const raw = c._raw || c
                      return (
                        <div key={i} style={{padding:'8px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'6px',borderLeft:`3px solid ${c.status?.toLowerCase().includes('active')?'#4ade80':'#ef4444'}`}}>
                          {/* Header row */}
                          <div style={{display:'flex',gap:'8px',alignItems:'flex-start',marginBottom:'4px'}}>
                            <a href={c.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'11px',fontWeight:700,color:'var(--orange)',textDecoration:'none',flex:1,lineHeight:1.3}}>{c.name}</a>
                            <span className="mono" style={{fontSize:'7px',padding:'1px 5px',borderRadius:'2px',flexShrink:0,background:c.status?.toLowerCase().includes('active')?'#4ade8022':'#ef444422',color:c.status?.toLowerCase().includes('active')?'#4ade80':'#ef4444'}}>{c.status}</span>
                          </div>
                          {/* Core fields */}
                          <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'3px'}}>
                            {c.number&&<span className="mono" style={{fontSize:'8px',color:'var(--t3)'}}>#{c.number}</span>}
                            {c.jurisdiction&&<span className="mono" style={{fontSize:'8px',color:'var(--accent)'}}>📍 {c.jurisdiction.toUpperCase()}</span>}
                            {c.type&&<span className="mono" style={{fontSize:'8px',color:'var(--t3)'}}>🏢 {c.type}</span>}
                            {c.incorporated&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>Inc: {c.incorporated}</span>}
                            {c.dissolved&&<span className="mono" style={{fontSize:'8px',color:'#ef4444'}}>Dissolved: {c.dissolved}</span>}
                          </div>
                          {c.address&&<div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'3px'}}>📮 {c.address}</div>}
                          {c.registered_agent&&<div className="mono" style={{fontSize:'8px',color:'var(--t3)',marginBottom:'3px'}}>Agent: {c.registered_agent}</div>}
                          {/* Industry codes */}
                          {c.industry_codes?.length>0&&(
                            <div className="mono" style={{fontSize:'7px',color:'var(--t4)',marginBottom:'3px'}}>
                              Industry: {c.industry_codes.map(ic=>`${ic.code||ic.industry_code||''} (${ic.code_scheme||ic.scheme||''})`).join(' · ')}
                            </div>
                          )}
                          {/* Inline officers */}
                          {c.officers?.length>0&&(
                            <div style={{marginTop:'5px',paddingTop:'5px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                              <div className="mono" style={{fontSize:'7px',color:'var(--t4)',marginBottom:'3px',letterSpacing:'0.08em'}}>OFFICERS ({c.officers.length})</div>
                              {c.officers.map((o,oi)=>{
                                const off=o.officer||o
                                return (
                                  <div key={oi} style={{fontSize:'8px',color:'var(--t2)',marginBottom:'2px',paddingLeft:'8px',borderLeft:'2px solid rgba(255,165,0,0.3)'}}>
                                    <span style={{fontWeight:600}}>{off.name||'?'}</span>
                                    <span className="mono" style={{color:'var(--t4)',marginLeft:'6px'}}>{off.position||''}</span>
                                    {off.start_date&&<span className="mono" style={{color:'var(--t4)',marginLeft:'4px'}}>from {off.start_date}</span>}
                                    {off.end_date&&<span className="mono" style={{color:'#ef4444',marginLeft:'4px'}}>to {off.end_date}</span>}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {/* Filings */}
                          {c.filings?.length>0&&(
                            <div style={{marginTop:'5px',paddingTop:'5px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                              <div className="mono" style={{fontSize:'7px',color:'var(--t4)',marginBottom:'3px',letterSpacing:'0.08em'}}>FILINGS ({c.filings.length})</div>
                              {c.filings.slice(0,5).map((f,fi)=>{
                                const fil=f.filing||f
                                return <div key={fi} className="mono" style={{fontSize:'7px',color:'var(--t3)',marginBottom:'2px'}}>{fil.date||fil.filing_date||''} — {fil.title||fil.description||fil.type||'Filing'}</div>
                              })}
                            </div>
                          )}
                          {/* Identifiers */}
                          {c.identifiers?.length>0&&(
                            <div style={{marginTop:'4px'}}>
                              {c.identifiers.map((id,ii)=>(
                                <span key={ii} className="mono" style={{fontSize:'7px',color:'var(--t4)',marginRight:'6px'}}>{id.identifier_system_name||id.scheme||''}: {id.uid||id.identifier||''}</span>
                              ))}
                            </div>
                          )}
                          {/* Links */}
                          <div style={{marginTop:'4px',display:'flex',gap:'8px',alignItems:'center'}}>
                            {c.registry_url&&<a href={c.registry_url} target="_blank" rel="noopener noreferrer" className="mono" style={{fontSize:'7px',color:'var(--t4)'}}>↗ Official Registry</a>}
                            <a href={c.url} target="_blank" rel="noopener noreferrer" className="mono" style={{fontSize:'7px',color:'var(--orange)'}}>↗ OpenCorporates</a>
                            <div style={{marginLeft:'auto'}}><DismissBtn onDismiss={()=>dismiss('co',c,c.name+c.jurisdiction)}/></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {sec.length>0&&(
                  <div>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'8px',letterSpacing:'0.1em'}}>SEC EDGAR — {sec.length} US FILINGS</div>
                    {sec.filter(s=>notDismissed('sec',s,s.date+s.entity)).map((s,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',marginBottom:'2px'}}>
                          <span className="mono" style={{fontSize:'9px',padding:'1px 5px',background:'rgba(99,102,241,0.15)',color:'#818cf8',borderRadius:'2px',fontWeight:700}}>{s.form||'FILING'}</span>
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{s.date}</span>
                          {s.period&&s.period!==s.date&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>Period: {s.period}</span>}
                          {s.url&&<a href={s.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',color:'var(--t4)'}}><ExternalLink size={10}/></a>}
                        </div>
                        <div style={{display:'flex',gap:'6px',alignItems:'center',marginTop:'2px'}}>
                          <div style={{fontSize:'10px',color:'var(--t1)',fontWeight:500,flex:1}}>{s.entity}</div>
                          <BoardBtn label={s.entity} type='org' detail={'SEC '+s.form+' filing '+s.date} source='SEC EDGAR' url={s.url} color='#818cf8' />
                          <DismissBtn onDismiss={()=>dismiss('sec', s.date+s.entity)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* UK Companies House */}
                {ukOfficers.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#818cf8',marginBottom:'8px',letterSpacing:'0.1em'}}>🇬🇧 UK COMPANIES HOUSE — {ukOfficers.length} OFFICER RECORDS</div>
                    {(intelData?.ukOfficers||[]).filter(o=>notDismissed('uk',o,o.name)).map((o,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid rgba(129,140,248,0.2)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                          <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)'}}>{o.name}</span>
                          {o.url&&<a href={o.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',color:'var(--t4)'}}><ExternalLink size={10}/></a>}
                        </div>
                        {o.description&&<div style={{fontSize:'9px',color:'var(--t3)',marginTop:'2px'}}>{o.description}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {/* World Bank Debarment */}
                {worldbank.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',padding:'6px 10px',background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.3)',borderRadius:'3px'}}>
                      <AlertTriangle size={11} style={{color:'#f97316'}}/>
                      <span className="mono" style={{fontSize:'8px',color:'#f97316',letterSpacing:'0.1em'}}>⚠ WORLD BANK DEBARRED — {worldbank.length} MATCH(ES)</span>
                    </div>
                    {(intelData?.worldbank||[]).filter(w=>notDismissed('wb',w,w.name)).map((w,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'rgba(249,115,22,0.05)',border:'1px solid rgba(249,115,22,0.25)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{fontSize:'11px',fontWeight:700,color:'#f97316'}}>{w.name}</div>
                        <div className="mono" style={{fontSize:'9px',color:'var(--t3)',marginTop:'2px'}}>{w.country} · {w.from}→{w.to}</div>
                        {w.grounds&&<div style={{fontSize:'10px',color:'var(--t3)',marginTop:'2px'}}>{w.grounds}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {/* FEC Campaign Finance */}
                {fec.candidates?.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#60a5fa',marginBottom:'8px',letterSpacing:'0.1em'}}>🗳 FEC CAMPAIGN FINANCE (US)</div>
                    {fec.candidates.filter(c=>notDismissed('fec',c,c.name)).map((c,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                          <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)'}}>{c.name}</span>
                          {c.party&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{c.party}</span>}
                          {c.office&&<span className="mono" style={{fontSize:'8px',color:'#60a5fa'}}>{c.office}</span>}
                          {c.url&&<a href={c.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',fontSize:'9px',color:'var(--accent)'}}>↗ FEC</a>}
                        </div>
                        <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginTop:'2px'}}>{c.state} · {c.cycles}</div>
                      </div>
                    ))}
                  </div>
                )}
                {icij.length===0&&companies.length===0&&officerships.length===0&&sec.length===0&&ukOfficers.length===0&&worldbank.length===0&&!loadMain&&(
                  <div style={{padding:'20px',textAlign:'center',color:'var(--t4)',fontSize:'11px'}}>No financial records found across all checked databases.</div>
                )}
                {loadMain&&<div style={{color:'var(--t4)',fontSize:'11px',display:'flex',gap:'6px',alignItems:'center'}}><Loader size={12} className="spin"/>Searching financial databases…</div>}
              </div>
            )}

            {/* ── LEGAL ── */}
            {activeTab==='legal'&&(
              <div style={{padding:'12px 14px'}}>
                {interpol.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div style={{padding:'8px 10px',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.4)',borderRadius:'3px',marginBottom:'8px'}}>
                      <div className="mono" style={{fontSize:'9px',color:'#ef4444',fontWeight:700,letterSpacing:'0.1em'}}>🚨 INTERPOL RED NOTICE</div>
                    </div>
                    {interpol.filter(n=>notDismissed('interpol',n,n.name)).map((n,i)=>(
                      <div key={i} style={{padding:'8px 10px',background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{fontSize:'12px',fontWeight:700,color:'#ef4444',marginBottom:'4px'}}>{n.name}</div>
                        {n.dob&&<div style={{fontSize:'9px',color:'var(--t2)',marginBottom:'2px'}}>DOB: {n.dob}</div>}
                        {n.nationalities?.length>0&&<div style={{fontSize:'9px',color:'var(--t2)',marginBottom:'2px'}}>Nationalities: {n.nationalities.join(', ')}</div>}
                        {n.charges&&<div style={{fontSize:'10px',color:'var(--t1)',marginBottom:'2px'}}>Charges: {n.charges}</div>}
                        {n.url&&<a href={n.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'9px',color:'var(--accent)'}}>↗ Interpol record</a>}
                      </div>
                    ))}
                  </div>
                )}

                {sanctions.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',padding:'6px 10px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'3px'}}>
                      <Flag size={11} style={{color:'#ef4444'}}/>
                      <span className="mono" style={{fontSize:'8px',color:'#ef4444',letterSpacing:'0.1em'}}>OPENSANCTIONS — {sanctions.length} MATCHES</span>
                    </div>
                    {sanctions.filter(s=>notDismissed('sanctions',s,s.id||s.name)).map((s,i)=>(
                      <div key={i} style={{padding:'8px 10px',background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'4px'}}>
                          <span style={{fontSize:'11px',fontWeight:700,color:'#ef4444'}}>{s.name}</span>
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{s.schema}</span>
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)',marginLeft:'auto'}}>Match: {Math.round(s.score*100)}%</span>
                          <BoardBtn label={s.name} type='person' detail={'Sanction: '+s.schema+' match '+(s.score*100|0)+'%'} source='OpenSanctions' url={s.url} color='#ef4444' />
                          <DismissBtn onDismiss={()=>dismiss('sanctions', s.id||s.name)} />
                        </div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:'3px',marginBottom:'4px'}}>
                          {s.datasets.map((d,j)=><span key={j} className="mono" style={{fontSize:'7px',padding:'1px 5px',background:'rgba(239,68,68,0.15)',color:'#ef4444',borderRadius:'2px'}}>{d}</span>)}
                        </div>
                        {s.properties?.nationality?.length>0&&<div style={{fontSize:'9px',color:'var(--t3)'}}>Nationality: {s.properties.nationality.join(', ')}</div>}
                        {s.properties?.birthDate?.length>0&&<div style={{fontSize:'9px',color:'var(--t3)'}}>Born: {s.properties.birthDate[0]}</div>}
                        <a href={s.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'9px',color:'var(--accent)'}}>↗ OpenSanctions record</a>
                      </div>
                    ))}
                  </div>
                )}

                {courts.length>0&&(
                  <div>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'8px',letterSpacing:'0.1em'}}>COURTLISTENER — {courts.length} US FEDERAL RECORDS</div>
                    {courts.filter(c=>notDismissed('courts',c,c.caseName)).map((c,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'3px'}}>
                          <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)'}}>{c.caseName}</span>
                          <BoardBtn label={c.caseName} type='event' detail={c.snippet||c.court} source='CourtListener' url={c.url} color='#f59e0b' />
                          <DismissBtn onDismiss={()=>dismiss('courts', c.caseName)} />
                          {c.url&&<a href={c.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',color:'var(--t4)'}}><ExternalLink size={10}/></a>}
                        </div>
                        <div style={{display:'flex',gap:'8px',marginBottom:'3px'}}>
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{c.court}</span>
                          {c.date&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{c.date}</span>}
                          {c.status&&<span className="mono" style={{fontSize:'8px',color:'var(--accent)'}}>{c.status}</span>}
                          {c.judge&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>Judge: {c.judge}</span>}
                        </div>
                        {c.snippet&&<p style={{fontSize:'10px',color:'var(--t3)',lineHeight:1.6,margin:0}}>{c.snippet}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* CourtListener Financial Disclosures */}
                {courtFinancial.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#f59e0b',marginBottom:'8px',letterSpacing:'0.1em'}}>💰 COURTLISTENER FINANCIAL DISCLOSURES — {courtFinancial.length} RECORDS</div>
                    {courtFinancial.map((d,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'rgba(245,158,11,0.05)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'3px',marginBottom:'4px',display:'flex',gap:'8px',alignItems:'center'}}>
                        <span style={{fontSize:'11px',color:'var(--t1)',flex:1}}>{d.person||'Unknown'}</span>
                        <span className="mono" style={{fontSize:'9px',color:'var(--t4)'}}>Year: {d.year}</span>
                        {d.url&&<a href={d.url} target="_blank" rel="noopener noreferrer" style={{color:'#f59e0b',fontSize:'9px'}}>↗ Disclosure</a>}
                      </div>
                    ))}
                  </div>
                )}

                {/* CourtListener People */}
                {courtPeople.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#818cf8',marginBottom:'8px',letterSpacing:'0.1em'}}>👤 COURTLISTENER PEOPLE — {courtPeople.length} RECORDS</div>
                    {courtPeople.map((p,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid rgba(129,140,248,0.2)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                          <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)'}}>{p.name}</span>
                          {p.dob&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>b.{p.dob}</span>}
                          {p.positions&&<span className="mono" style={{fontSize:'8px',color:'#818cf8'}}>{p.positions} positions</span>}
                          {p.url&&<a href={p.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',color:'var(--t4)'}}><ExternalLink size={10}/></a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                                {/* OFAC SDN List */}
                {ofac.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',padding:'6px 10px',background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.5)',borderRadius:'3px'}}>
                      <AlertTriangle size={11} style={{color:'#ef4444'}}/>
                      <span className="mono" style={{fontSize:'8px',color:'#ef4444',letterSpacing:'0.1em'}}>🇺🇸 OFAC SDN LIST — {ofac.length} MATCH(ES) — US TREASURY</span>
                    </div>
                    {ofac.map((o,i)=>(
                      <div key={i} style={{padding:'8px 10px',background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{fontSize:'12px',fontWeight:700,color:'#ef4444',marginBottom:'3px'}}>{o.name}</div>
                        <div className="mono" style={{fontSize:'9px',color:'var(--t3)'}}>Type: {o.sdnType} · Program: {o.program}</div>
                        {o.aka&&<div style={{fontSize:'9px',color:'var(--t3)',marginTop:'2px'}}>AKA: {o.aka}</div>}
                        {o.dob&&<div className="mono" style={{fontSize:'9px',color:'var(--t3)',marginTop:'2px'}}>DOB: {o.dob} · Nationality: {o.nationality}</div>}
                        {o.remarks&&<p style={{fontSize:'9px',color:'var(--t3)',margin:'4px 0 0',lineHeight:1.5}}>{o.remarks}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* OCCRP Aleph — organized crime + corruption */}
                {occrp.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',padding:'6px 10px',background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.3)',borderRadius:'3px'}}>
                      <span className="mono" style={{fontSize:'8px',color:'#a78bfa',letterSpacing:'0.1em'}}>🔴 OCCRP ALEPH — {occrp.length} RECORDS (ORGANIZED CRIME/CORRUPTION)</span>
                    </div>
                    {occrp.filter(r=>notDismissed('occrp',r,r.id||r.caption)).map((r,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'rgba(167,139,250,0.05)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                          <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)'}}>{r.caption}</span>
                          {r.schema&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{r.schema}</span>}
                          {r.country&&<span className="mono" style={{fontSize:'8px',color:'#a78bfa'}}>{r.country}</span>}
                          {r.dataset&&<span className="mono" style={{fontSize:'8px',padding:'1px 4px',background:'rgba(167,139,250,0.15)',color:'#a78bfa',borderRadius:'2px'}}>{r.dataset}</span>}
                          {r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',color:'var(--t4)'}}><ExternalLink size={10}/></a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* PACER Dockets */}
                {dockets.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#a78bfa',marginBottom:'8px',letterSpacing:'0.1em'}}>📋 PACER / RECAP FEDERAL DOCKETS — {dockets.length} RECORDS</div>
                    {dockets.filter(d=>notDismissed('dockets',d,d.caseName)).map((d,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'3px'}}>
                          <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)'}}>{d.caseName}</span>
                          <BoardBtn label={d.caseName} type='event' detail={d.status||d.court} source='PACER' url={d.url} color='#f59e0b' />
                          <DismissBtn onDismiss={()=>dismiss('dockets', d.caseName)} />
                          {d.url&&<a href={d.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',color:'var(--t4)'}}><ExternalLink size={10}/></a>}
                        </div>
                        <div className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{d.court} · Filed: {d.date||d.dateFiled} {(d.closed||d.dateTerminated)?` · Closed: ${d.closed||d.dateTerminated}`:''}</div>
                        {(d.status||d.cause)&&<div style={{fontSize:'9px',color:'var(--t3)',marginTop:'2px'}}>{d.status||''} {d.cause?`· ${d.cause}`:''}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Justia */}
                {justia.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#38bdf8',marginBottom:'8px',letterSpacing:'0.1em'}}>⚖ JUSTIA — US CASE LAW ({justia.length})</div>
                    {justia.map((j,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'var(--panel)',border:'1px solid rgba(56,189,248,0.15)',borderRadius:'3px',marginBottom:'3px',display:'flex',gap:'8px',alignItems:'center'}}>
                        <span style={{fontSize:'10px',color:'var(--t2)',flex:1}}>{j.title}</span>
                        {j.url&&<a href={j.url} target="_blank" rel="noopener noreferrer" style={{color:'#38bdf8',fontSize:'9px',flexShrink:0}}>↗</a>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Indian Courts */}
                {indianCourts.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'8px',letterSpacing:'0.1em'}}>⚖ INDIA eCOURTS / KANOON ({indianCourts.length})</div>
                    {indianCourts.map((c,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'3px'}}>
                        <div style={{fontSize:'10px',color:'var(--t2)'}}>{c.text}</div>
                        {c.url&&<a href={c.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'9px',color:'var(--accent)'}}>↗ View</a>}
                      </div>
                    ))}
                  </div>
                )}
                {interpol.length===0&&sanctions.length===0&&courts.length===0&&worldbank.length===0&&indianCourts.length===0&&!loadMain&&(
                  <div style={{padding:'20px',textAlign:'center',color:'var(--t4)',fontSize:'11px'}}>No legal records found across all checked databases.</div>
                )}
              </div>
            )}

            {/* ── LOCATIONS ── */}
            {activeTab==='locations'&&(
              <div style={{padding:'12px 14px'}}>
                {wd?.residences?.length>0&&(
                  <div style={{marginBottom:'12px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'6px',letterSpacing:'0.1em'}}>WIKIDATA RESIDENCES</div>
                    {wd.residences.map((r,i)=><div key={i} style={{padding:'5px 8px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'3px',fontSize:'11px',color:'var(--t1)'}}>{r}</div>)}
                  </div>
                )}
                {locations.length>0&&(
                  <div>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'6px',letterSpacing:'0.1em'}}>OPENSTREETMAP ({locations.length})</div>
                    {locations.map((l,i)=>(
                      <div key={i} style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                          <span style={{fontSize:'10px',color:'var(--t1)'}}>{l.name?.slice(0,90)}</span>
                          {l.url&&<a href={l.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',color:'var(--t4)'}}><ExternalLink size={10}/></a>}
                        </div>
                        <div className="mono" style={{fontSize:'8px',color:'var(--accent)',marginTop:'2px'}}>{parseFloat(l.lat).toFixed(4)}° / {parseFloat(l.lng).toFixed(4)}° · {l.cls||l.type}</div>
                      </div>
                    ))}
                  </div>
                )}
                {ddgAddress?.relatedTopics?.length>0&&(
                  <div style={{marginTop:'12px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'6px',letterSpacing:'0.1em'}}>ADDRESS / LOCATION SIGNALS</div>
                    {ddgAddress.relatedTopics.slice(0,25).map((t,i)=>(
                      <div key={i} style={{padding:'5px 8px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'3px',fontSize:'10px',color:'var(--t2)'}}>
                        {t.text?.slice(0,200)}
                        {t.url&&<a href={t.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'6px',color:'var(--accent)',fontSize:'9px'}}>↗</a>}
                      </div>
                    ))}
                  </div>
                )}
                {/* Property / residence signals */}
                {propertySignals.length>0&&(
                  <div style={{marginTop:'12px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'6px',letterSpacing:'0.1em'}}>🏠 PROPERTY / RESIDENCE SIGNALS ({propertySignals.length})</div>
                    {propertySignals.map((p,i)=>(
                      <div key={i} style={{padding:'5px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'3px'}}>
                        <div style={{fontSize:'10px',color:'var(--t2)'}}>{p.text?.slice(0,250)}</div>
                        {p.url&&<a href={p.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'9px',color:'var(--accent)'}}>↗ Source</a>}
                      </div>
                    ))}
                  </div>
                )}

                {/* BGPView - ASN/routing */}
                {bgpview&&(
                  <div style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#60a5fa',marginBottom:'6px',letterSpacing:'0.1em'}}>🌐 BGP/ASN ROUTING</div>
                    <div style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid rgba(96,165,250,0.2)',borderRadius:'3px',fontSize:'9px',color:'var(--t3)'}}>
                      <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                        {bgpview.asn&&<span>ASN: <span className="mono" style={{color:'var(--t1)'}}>AS{bgpview.asn}</span></span>}
                        {bgpview.name&&<span><span style={{color:'var(--t2)'}}>{bgpview.name}</span></span>}
                        {bgpview.country&&<span style={{color:'var(--t2)'}}>{bgpview.country}</span>}
                        {bgpview.rir&&<span style={{color:'var(--t4)'}}>{bgpview.rir}</span>}
                      </div>
                      {bgpview.prefixes?.length>0&&<div style={{marginTop:'3px',fontSize:'8px',color:'var(--t4)'}}>Prefixes: {bgpview.prefixes.join(', ')}</div>}
                      {bgpview.url&&<a href={bgpview.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'9px',color:'#60a5fa',marginTop:'4px',display:'block'}}>↗ BGPView</a>}
                    </div>
                  </div>
                )}

                {/* ipinfo.io */}
                {ipinfo&&(
                  <div style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#2dd4bf',marginBottom:'6px',letterSpacing:'0.1em'}}>📍 IP GEOLOCATION</div>
                    <div style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid rgba(45,212,191,0.2)',borderRadius:'3px',fontSize:'9px',color:'var(--t3)'}}>
                      <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                        <span className="mono" style={{color:'var(--t1)'}}>{ipinfo.ip}</span>
                        {ipinfo.city&&<span>{ipinfo.city}, {ipinfo.region}</span>}
                        {ipinfo.country&&<span style={{color:'var(--t2)'}}>{ipinfo.country}</span>}
                        {ipinfo.org&&<span>{ipinfo.org}</span>}
                      </div>
                      {ipinfo.hostname&&<div style={{marginTop:'3px',fontSize:'8px',color:'var(--t4)'}}>Hostname: {ipinfo.hostname}</div>}
                    </div>
                  </div>
                )}

                {/* EmailRep */}
                {emailrep&&(
                  <div style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color:emailrep.suspicious?'#f97316':'#4ade80',marginBottom:'6px',letterSpacing:'0.1em'}}>
                      📧 EMAIL REPUTATION — {emailrep.reputation?.toUpperCase()}{emailrep.suspicious?' · ⚠ SUSPICIOUS':''}
                    </div>
                    <div style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',fontSize:'9px',color:'var(--t3)'}}>
                      <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                        {emailrep.references!=null&&<span>References: <span style={{color:'var(--t1)'}}>{emailrep.references}</span></span>}
                        {emailrep.details?.maliciousActivity&&<span style={{color:'#ef4444'}}>⚠ Malicious Activity Detected</span>}
                        {emailrep.details?.profiles&&<span>Profiles: {emailrep.details.profiles.join(', ')}</span>}
                        {emailrep.details?.firstSeen&&<span style={{color:'var(--t4)'}}>First seen: {emailrep.details.firstSeen}</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* SecurityTrails subdomains */}
                {sectrailsSubs.length>0&&(
                  <div style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#818cf8',marginBottom:'6px',letterSpacing:'0.1em'}}>🔍 SECURITYTRAILS — {sectrailsSubs.length} SUBDOMAINS</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:'3px'}}>
                      {sectrailsSubs.slice(0,40).map((s,i)=>(
                        <span key={i} className="mono" style={{fontSize:'8px',padding:'1px 6px',background:'var(--panel)',border:'1px solid rgba(129,140,248,0.2)',borderRadius:'2px',color:'var(--t3)'}}>{s}</span>
                      ))}
                      {sectrailsSubs.length>40&&<span style={{fontSize:'8px',color:'var(--t4)'}}>+{sectrailsSubs.length-40} more</span>}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ── DIGITAL / SOCIAL / DARK WEB ── */}
            {activeTab==='digital'&&(
              <div style={{padding:'12px 14px'}}>

                {/* Pastebin / leak dump mentions */}
                {pastes.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',padding:'6px 10px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'3px'}}>
                      <AlertTriangle size={11} style={{color:'#ef4444'}}/>
                      <span className="mono" style={{fontSize:'8px',color:'#ef4444',letterSpacing:'0.1em'}}>⚠ PASTE / LEAK DUMPS — {pastes.length} MENTIONS FOUND</span>
                    </div>
                    {pastes.map((p,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'rgba(239,68,68,0.04)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:'3px',marginBottom:'3px',display:'flex',gap:'10px',alignItems:'center'}}>
                        <span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{p.date?.slice(0,10)}</span>
                        <span style={{fontSize:'9px',color:'var(--t3)',flex:1}}>{p.tags||`Paste ID: ${p.id}`}</span>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'9px',color:'#ef4444'}}>↗ Paste</a>
                      </div>
                    ))}
                  </div>
                )}

                {/* Social media profiles */}
                {socialProfiles.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#38bdf8',marginBottom:'8px',letterSpacing:'0.1em'}}>👤 SOCIAL MEDIA PROFILES — {socialProfiles.length} FOUND</div>
                    {socialProfiles.map((s,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'var(--panel)',border:'1px solid rgba(56,189,248,0.2)',borderRadius:'3px',marginBottom:'3px',display:'flex',gap:'10px',alignItems:'center'}}>
                        <span className="mono" style={{fontSize:'9px',color:'#38bdf8',minWidth:'80px',flexShrink:0}}>{s.platform}</span>
                        <span style={{fontSize:'10px',color:'var(--t2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.handle} · {s.url?.replace('https://','')?.slice(0,60)}</span>
                        {s.url&&<a href={s.url} target="_blank" rel="noopener noreferrer" style={{color:'#38bdf8',fontSize:'9px',flexShrink:0}}>↗</a>}
                      </div>
                    ))}
                  </div>
                )}

                {/* DDG Social signals */}
                {ddgSocial?.relatedTopics?.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#60a5fa',marginBottom:'6px',letterSpacing:'0.1em'}}>WEB SOCIAL SIGNALS ({ddgSocial.relatedTopics.length})</div>
                    {ddgSocial.relatedTopics.slice(0,25).map((t,i)=>(
                      <div key={i} style={{padding:'5px 8px',background:'var(--panel)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:'3px',marginBottom:'3px',fontSize:'10px',color:'var(--t2)'}}>
                        {t.text?.slice(0,200)}
                        {t.url&&<a href={t.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'6px',color:'#60a5fa',fontSize:'9px'}}>↗</a>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Wayback Machine */}
                {wayback.length>0&&(
                  <div>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'6px',letterSpacing:'0.1em'}}>🕰 WAYBACK MACHINE — {wayback.length} ARCHIVED PAGES</div>
                    {wayback.map((w,i)=>(
                      <div key={i} style={{padding:'5px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'3px',display:'flex',gap:'10px',alignItems:'center'}}>
                        <span className="mono" style={{fontSize:'8px',color:'var(--t4)',flexShrink:0}}>{w.timestamp?.slice(0,8)}</span>
                        <span style={{fontSize:'9px',color:'var(--t3)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.url}</span>
                        <a href={w.archiveUrl} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent)',fontSize:'9px',flexShrink:0}}>↗ Archive</a>
                      </div>
                    ))}
                  </div>
                )}

                {/* IntelX breach/dark-web results */}
                {intelxResults.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div style={{padding:'6px 10px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'3px',marginBottom:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
                      <span className="mono" style={{fontSize:'8px',color:'#ef4444',letterSpacing:'0.1em'}}>⚠ INTEL X — {intelxResults.length} DARK WEB / BREACH RECORDS</span>
                    </div>
                    {intelxResults.map((r,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'rgba(239,68,68,0.04)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:'3px',marginBottom:'3px',display:'flex',gap:'10px',alignItems:'center'}}>
                        <span className="mono" style={{fontSize:'8px',color:'var(--t4)',flexShrink:0}}>{r.date||''}</span>
                        <span style={{fontSize:'9px',color:'var(--t2)',flex:1}}>{r.name} <span style={{color:'var(--t4)'}}>({r.bucket||r.type})</span></span>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'9px',color:'#ef4444',flexShrink:0}}>↗ IntelX</a>
                      </div>
                    ))}
                  </div>
                )}

                {/* HaveIBeenPwned breach history */}
                {hibpBreaches.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#f97316',marginBottom:'8px',letterSpacing:'0.1em'}}>🔓 HAVEIBEENPWNED — {hibpBreaches.length} BREACHES</div>
                    {hibpBreaches.map((b,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'rgba(249,115,22,0.05)',border:'1px solid rgba(249,115,22,0.2)',borderRadius:'3px',marginBottom:'3px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                          <span style={{fontSize:'10px',fontWeight:600,color:'var(--t1)'}}>{b.name}</span>
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{b.date}</span>
                          <span className="mono" style={{fontSize:'8px',color:'#f97316'}}>{b.count?.toLocaleString()} records</span>
                        </div>
                        {b.types&&<div style={{fontSize:'9px',color:'var(--t3)',marginTop:'2px'}}>{b.types.join(', ')}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* DeHashed credential leaks */}
                {dehashed.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div style={{padding:'6px 10px',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.4)',borderRadius:'3px',marginBottom:'8px'}}>
                      <span className="mono" style={{fontSize:'8px',color:'#ef4444',letterSpacing:'0.1em'}}>⚠ DEHASHED — {dehashed.length} CREDENTIAL RECORDS</span>
                    </div>
                    {dehashed.map((d,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'rgba(239,68,68,0.04)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:'3px',marginBottom:'3px'}}>
                        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                          {d.email&&<span style={{fontSize:'10px',color:'var(--t1)'}}>{d.email}</span>}
                          {d.username&&<span className="mono" style={{fontSize:'9px',color:'var(--t3)'}}>@{d.username}</span>}
                          {d.hashedPassword&&<span className="mono" style={{fontSize:'8px',color:'#f97316'}}>{d.hashedPassword}</span>}
                          {d.database&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>DB: {d.database}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Hunter.io email addresses */}
                {hunterEmails.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#38bdf8',marginBottom:'8px',letterSpacing:'0.1em'}}>📧 HUNTER.IO — {hunterEmails.length} PROFESSIONAL EMAILS {hunterOrg?.organization?`(${hunterOrg.organization})`:''}</div>
                    {hunterEmails.map((e,i)=>(
                      <div key={i} style={{padding:'5px 10px',background:'var(--panel)',border:'1px solid rgba(56,189,248,0.15)',borderRadius:'3px',marginBottom:'3px',display:'flex',gap:'10px',alignItems:'center'}}>
                        <span style={{fontSize:'10px',color:'var(--t1)',flex:1}}>{e.email}</span>
                        {e.position&&<span className="mono" style={{fontSize:'8px',color:'var(--t3)'}}>{e.position}</span>}
                        <span className="mono" style={{fontSize:'8px',color:e.confidence>75?'#4ade80':'#f59e0b'}}>{e.confidence}%</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* VirusTotal threat intel */}
                {virustotal&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:virustotal.malicious>0?'#ef4444':'#4ade80',marginBottom:'6px',letterSpacing:'0.1em'}}>
                      🛡 VIRUSTOTAL — {virustotal.malicious>0?virustotal.malicious+' MALICIOUS DETECTIONS':'CLEAN'} ({virustotal.malicious||0}M/{virustotal.suspicious||0}S/{virustotal.harmless||0}H)
                    </div>
                    <div style={{padding:'7px 10px',background:virustotal.malicious>0?'rgba(239,68,68,0.06)':'var(--panel)',border:'1px solid '+(virustotal.malicious>0?'rgba(239,68,68,0.3)':'var(--border)'),borderRadius:'3px'}}>
                      <div style={{display:'flex',gap:'8px',flexWrap:'wrap',fontSize:'9px',color:'var(--t3)'}}>
                        {virustotal.country&&<span>Country: <span style={{color:'var(--t1)'}}>{virustotal.country}</span></span>}
                        {virustotal.asOwner&&<span>ASN: <span style={{color:'var(--t1)'}}>{virustotal.asOwner}</span></span>}
                        {virustotal.reputation!=null&&<span>Rep: <span style={{color:virustotal.reputation<0?'#ef4444':'#4ade80'}}>{virustotal.reputation}</span></span>}
                        {virustotal.lastAnalysis&&<span>Last: <span style={{color:'var(--t4)'}}>{virustotal.lastAnalysis.toString().slice(0,10)}</span></span>}
                      </div>
                      {virustotal.tags?.length>0&&<div style={{marginTop:'4px',display:'flex',gap:'3px',flexWrap:'wrap'}}>{virustotal.tags.slice(0,8).map((t,i)=><span key={i} className="mono" style={{fontSize:'7px',padding:'1px 5px',background:'rgba(239,68,68,0.1)',color:'#f87171',borderRadius:'2px'}}>{t}</span>)}</div>}
                      {virustotal.url&&<a href={virustotal.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'9px',color:'var(--accent)',marginTop:'4px',display:'block'}}>↗ VirusTotal report</a>}
                    </div>
                  </div>
                )}

                {/* AbuseIPDB */}
                {abuseipdb&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:abuseipdb.score>25?'#ef4444':'#4ade80',marginBottom:'6px',letterSpacing:'0.1em'}}>
                      🚫 ABUSEIPDB — {abuseipdb.score}% ABUSE CONFIDENCE · {abuseipdb.totalReports} REPORTS
                    </div>
                    <div style={{padding:'7px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',fontSize:'9px',color:'var(--t3)'}}>
                      <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                        <span>ISP: <span style={{color:'var(--t1)'}}>{abuseipdb.isp}</span></span>
                        <span>Usage: <span style={{color:'var(--t2)'}}>{abuseipdb.usageType}</span></span>
                        {abuseipdb.isTor&&<span style={{color:'#a78bfa'}}>● TOR EXIT NODE</span>}
                        {abuseipdb.isProxy&&<span style={{color:'#f59e0b'}}>● PROXY</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* URLScan results */}
                {urlscan.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#60a5fa',marginBottom:'6px',letterSpacing:'0.1em'}}>🔎 URLSCAN.IO — {urlscan.length} SCANS</div>
                    {urlscan.map((s,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'var(--panel)',border:'1px solid '+(s.malicious?'rgba(239,68,68,0.3)':'var(--border)'),borderRadius:'3px',marginBottom:'3px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                          <span style={{fontSize:'9px',color:s.malicious?'#ef4444':'var(--t2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.url||s.domain}</span>
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)',flexShrink:0}}>{s.date}</span>
                          {s.scanUrl&&<a href={s.scanUrl} target="_blank" rel="noopener noreferrer" style={{color:'#60a5fa',flexShrink:0,fontSize:'9px'}}>↗</a>}
                        </div>
                        {s.tags?.length>0&&<div style={{marginTop:'2px',display:'flex',gap:'2px'}}>{s.tags.slice(0,5).map((t,j)=><span key={j} className="mono" style={{fontSize:'7px',padding:'1px 4px',background:'rgba(239,68,68,0.1)',color:'#f87171',borderRadius:'2px'}}>{t}</span>)}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* LeakIX exposed services */}
                {leakix.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#f97316',marginBottom:'6px',letterSpacing:'0.1em'}}>⚠ LEAKIX — {leakix.length} EXPOSED SERVICES</div>
                    {leakix.map((e,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'rgba(249,115,22,0.05)',border:'1px solid rgba(249,115,22,0.2)',borderRadius:'3px',marginBottom:'3px'}}>
                        <div style={{display:'flex',gap:'8px',fontSize:'9px'}}>
                          <span className="mono" style={{color:'var(--t1)'}}>{e.host||e.ip}:{e.port}</span>
                          <span style={{color:'var(--t3)'}}>{e.protocol} · {e.service}</span>
                          <span style={{color:'var(--t4)',marginLeft:'auto'}}>{e.country} · {e.date}</span>
                        </div>
                        {e.summary&&<div style={{fontSize:'9px',color:'var(--t3)',marginTop:'2px'}}>{e.summary}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {!pastes.length&&!socialProfiles.length&&!ddgSocial?.relatedTopics?.length&&!wayback.length&&!intelxResults.length&&!hibpBreaches.length&&!dehashed.length&&!virustotal&&!urlscan.length&&!leakix.length&&!loadMain&&(
                  <div style={{padding:'20px',textAlign:'center',color:'var(--t4)',fontSize:'11px'}}>No digital footprint found. Add API keys in Settings (IntelX configured ✅ · HIBP · Hunter · VirusTotal · URLScan · AbuseIPDB) for deeper results.</div>
                )}
                {loadMain&&<div style={{color:'var(--t4)',fontSize:'11px',display:'flex',gap:'6px',alignItems:'center'}}><Loader size={12} className="spin"/>Searching social profiles and paste archives…</div>}
              </div>
            )}

            {/* ── OSINT/DARK WEB ── */}
            {activeTab==='osint'&&(
              <div style={{padding:'12px 14px'}}>
                <div style={{padding:'8px 10px',background:'rgba(148,163,184,0.06)',border:'1px solid rgba(148,163,184,0.2)',borderRadius:'3px',marginBottom:'12px',fontSize:'10px',color:'var(--t3)'}}>
                  ⚠ Results from DuckDuckGo web index — shows publicly indexed references. Does not directly access dark web infrastructure.
                </div>
                {[
                  {data:ddgLeaks,     label:'LEAK / BREACH SIGNALS',          color:'#f97316'},
                  {data:ddgDarkweb,   label:'DARK WEB INDEXED REFERENCES',    color:'#a78bfa'},
                  {data:ddgCriminal,  label:'CRIMINAL / ARREST SIGNALS',      color:'#ef4444'},
                  {data:ddgSocial,    label:'SOCIAL MEDIA PRESENCE',          color:'#38bdf8'},
                  {data:ddgFinancial, label:'FINANCIAL WEB SIGNALS',          color:'#fbbf24'},
                ].map(({data,label,color})=>data?.relatedTopics?.length>0&&(
                  <div key={label} style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color,marginBottom:'6px',letterSpacing:'0.1em'}}>{label} ({data.relatedTopics.length})</div>
                    {data.relatedTopics.slice(0,30).map((t,i)=>(
                      <div key={i} style={{padding:'5px 8px',background:'var(--panel)',border:`1px solid ${color}22`,borderRadius:'3px',marginBottom:'3px',fontSize:'10px',color:'var(--t2)'}}>
                        {t.text?.slice(0,250)}
                        {t.url&&<a href={t.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'6px',color,fontSize:'9px'}}>↗</a>}
                      </div>
                    ))}
                  </div>
                ))}
                                {/* Criminal signals */}
                {ddgCriminal?.relatedTopics?.length>0&&(
                  <div style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#ef4444',marginBottom:'6px',letterSpacing:'0.1em'}}>🚔 CRIMINAL / ARREST SIGNALS ({ddgCriminal.relatedTopics.length})</div>
                    {ddgCriminal.relatedTopics.slice(0,25).map((t,i)=>(
                      <div key={i} style={{padding:'5px 8px',background:'rgba(239,68,68,0.04)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:'3px',marginBottom:'3px',fontSize:'10px',color:'var(--t2)'}}>
                        {t.text?.slice(0,200)}
                        {t.url&&<a href={t.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'6px',color:'#ef4444',fontSize:'9px'}}>↗</a>}
                      </div>
                    ))}
                  </div>
                )}
                {/* URLScan.io results */}
                {urlscan.length>0&&(
                  <div style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#a78bfa',marginBottom:'6px',letterSpacing:'0.1em'}}>🔍 URLSCAN.IO — {urlscan.length} SCANS</div>
                    {urlscan.map((r,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'var(--panel)',border:`1px solid ${r.malicious?'rgba(239,68,68,0.3)':'var(--border)'}`,borderRadius:'3px',marginBottom:'3px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                          <span style={{fontSize:'10px',color:r.malicious?'#ef4444':'var(--t1)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.url}</span>
                          {r.malicious&&<span className="mono" style={{fontSize:'8px',color:'#ef4444',flexShrink:0}}>⚠ MALICIOUS</span>}
                          <span className="mono" style={{fontSize:'8px',color:'var(--t4)',flexShrink:0}}>{r.date}</span>
                          {r.reportUrl&&<a href={r.reportUrl} target="_blank" rel="noopener noreferrer" style={{color:'#a78bfa',flexShrink:0,fontSize:'9px'}}>↗</a>}
                        </div>
                        <div style={{display:'flex',gap:'8px',marginTop:'2px'}}>
                          {r.ip&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>IP: {r.ip}</span>}
                          {r.country&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{r.country}</span>}
                          {r.server&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{r.server}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* VirusTotal */}
                {virustotal&&(
                  <div style={{marginBottom:'14px'}}>
                    <div style={{padding:'8px 10px',background:virustotal.malicious>0?'rgba(239,68,68,0.08)':'rgba(74,222,128,0.06)',border:`1px solid ${virustotal.malicious>0?'rgba(239,68,68,0.3)':'rgba(74,222,128,0.2)'}`,borderRadius:'3px',marginBottom:'6px'}}>
                      <div className="mono" style={{fontSize:'9px',color:virustotal.malicious>0?'#ef4444':'#4ade80',letterSpacing:'0.1em',marginBottom:'4px'}}>
                        🛡 VIRUSTOTAL — {virustotal.malicious>0?virustotal.malicious+' MALICIOUS DETECTIONS':'CLEAN'}
                      </div>
                      <div style={{display:'flex',gap:'12px'}}>
                        <span style={{fontSize:'10px',color:'#ef4444'}}>❌ {virustotal.malicious} malicious</span>
                        <span style={{fontSize:'10px',color:'#f59e0b'}}>⚠ {virustotal.suspicious} suspicious</span>
                        <span style={{fontSize:'10px',color:'#4ade80'}}>✅ {virustotal.harmless} clean</span>
                      </div>
                      {virustotal.categories?.length>0&&<div style={{fontSize:'9px',color:'var(--t3)',marginTop:'4px'}}>Categories: {virustotal.categories.join(', ')}</div>}
                      {virustotal.asOwner&&<div className="mono" style={{fontSize:'9px',color:'var(--t4)',marginTop:'2px'}}>{virustotal.asOwner} · {virustotal.country}</div>}
                      {virustotal.url&&<a href={virustotal.url} target="_blank" rel="noopener noreferrer" style={{fontSize:'9px',color:'#a78bfa',marginTop:'4px',display:'block'}}>↗ View on VirusTotal</a>}
                    </div>
                  </div>
                )}

                {/* AbuseIPDB */}
                {abuseipdb&&(
                  <div style={{marginBottom:'14px'}}>
                    <div style={{padding:'8px 10px',background:abuseipdb.score>50?'rgba(239,68,68,0.08)':'rgba(74,222,128,0.06)',border:`1px solid ${abuseipdb.score>50?'rgba(239,68,68,0.3)':'rgba(74,222,128,0.2)'}`,borderRadius:'3px'}}>
                      <div className="mono" style={{fontSize:'9px',color:abuseipdb.score>50?'#ef4444':'#4ade80',letterSpacing:'0.1em',marginBottom:'4px'}}>
                        🚨 ABUSEIPDB — CONFIDENCE SCORE: {abuseipdb.score}%
                      </div>
                      <div style={{display:'flex',gap:'10px',flexWrap:'wrap',fontSize:'10px',color:'var(--t2)'}}>
                        <span>{abuseipdb.isp}</span>
                        <span className="mono" style={{color:'var(--t4)'}}>{abuseipdb.country}</span>
                        <span className="mono" style={{color:'var(--t4)'}}>{abuseipdb.usageType}</span>
                        <span className="mono" style={{color:'var(--t4)'}}>{abuseipdb.totalReports} reports</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* LeakIX exposed services */}
                {leakix.length>0&&(
                  <div style={{marginBottom:'14px'}}>
                    <div style={{padding:'6px 10px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'3px',marginBottom:'6px'}}>
                      <span className="mono" style={{fontSize:'8px',color:'#ef4444',letterSpacing:'0.1em'}}>⚠ LEAKIX — {leakix.length} EXPOSED SERVICES</span>
                    </div>
                    {leakix.map((e,i)=>(
                      <div key={i} style={{padding:'5px 10px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',marginBottom:'3px',display:'flex',gap:'10px',alignItems:'center'}}>
                        <span className="mono" style={{fontSize:'9px',color:'var(--accent)',flexShrink:0}}>{e.port}/{e.protocol}</span>
                        <span style={{fontSize:'9px',color:'var(--t2)',flex:1}}>{e.service}</span>
                        {e.leak&&<span className="mono" style={{fontSize:'8px',color:'#ef4444',flexShrink:0}}>LEAK: {e.leak.type}</span>}
                        <span className="mono" style={{fontSize:'8px',color:'var(--t4)',flexShrink:0}}>{e.date}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* SecurityTrails subdomains */}
                {sectrailsSubs.length>0&&(
                  <div style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#38bdf8',marginBottom:'6px',letterSpacing:'0.1em'}}>🌐 SECURITYTRAILS — {sectrailsSubs.length} SUBDOMAINS</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
                      {sectrailsSubs.slice(0,50).map((s,i)=>(
                        <span key={i} className="mono" style={{fontSize:'8px',padding:'2px 6px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'3px',color:'var(--t3)'}}>{s}</span>
                      ))}
                      {sectrailsSubs.length>50&&<span style={{fontSize:'8px',color:'var(--t4)'}}>+{sectrailsSubs.length-50} more</span>}
                    </div>
                  </div>
                )}

                {/* Username profiles (Maigret-style) */}
                {usernameProfiles.length>0&&(
                  <div style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#38bdf8',marginBottom:'6px',letterSpacing:'0.1em'}}>👤 USERNAME PROFILES — {usernameProfiles.length} FOUND</div>
                    {usernameProfiles.map((p,i)=>(
                      <div key={i} style={{padding:'6px 10px',background:'var(--panel)',border:'1px solid rgba(56,189,248,0.2)',borderRadius:'3px',marginBottom:'3px',display:'flex',gap:'10px',alignItems:'center'}}>
                        <span className="mono" style={{fontSize:'9px',color:'#38bdf8',minWidth:'80px',flexShrink:0}}>{p.platform}</span>
                        <span style={{fontSize:'10px',color:'var(--t2)',flex:1}}>{p.name||p.url}</span>
                        {p.karma!=null&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{p.karma} karma</span>}
                        {p.followers!=null&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{p.followers} followers</span>}
                        <a href={p.url} target="_blank" rel="noopener noreferrer" style={{color:'#38bdf8',fontSize:'9px',flexShrink:0}}>↗</a>
                      </div>
                    ))}
                  </div>
                )}

                {!loadMain&&!ddgLeaks?.relatedTopics?.length&&!ddgDarkweb?.relatedTopics?.length&&!ddgCriminal?.relatedTopics?.length&&!urlscan.length&&!virustotal&&!leakix.length&&(
                  <div style={{padding:'20px',textAlign:'center',color:'var(--t4)',fontSize:'11px'}}>No leak, dark web, or criminal signals found. Add VirusTotal/URLScan/AbuseIPDB/LeakIX keys in Settings.</div>
                )}

                {hunterEmails.length>0&&(
                  <div style={{marginBottom:'14px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#38bdf8',marginBottom:'6px',letterSpacing:'0.1em'}}>📧 HUNTER.IO — {hunterEmails.length} PROFESSIONAL EMAILS</div>
                    {hunterEmails.map((e,i)=>(
                      <div key={i} style={{padding:'5px 10px',background:'var(--panel)',border:'1px solid rgba(56,189,248,0.15)',borderRadius:'3px',marginBottom:'3px',display:'flex',gap:'10px',alignItems:'center'}}>
                        <span style={{fontSize:'10px',color:'var(--t1)',flex:1}}>{e.email}</span>
                        {e.position&&<span className="mono" style={{fontSize:'8px',color:'var(--t3)'}}>{e.position}</span>}
                        <span className="mono" style={{fontSize:'8px',color:e.confidence>75?'#4ade80':'#f59e0b'}}>{e.confidence}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{padding:'20px',textAlign:'center',color:'var(--t4)',fontSize:'11px'}}>No leak, dark web, or criminal signals found. Add VirusTotal/URLScan/AbuseIPDB/LeakIX keys in Settings.</div>
              </div>
            )}

            {/* ── DOCUMENTS ── */}
            {activeTab==='documents'&&(
              <div style={{padding:'12px 14px'}}>
                {documents.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#60a5fa',marginBottom:'8px',letterSpacing:'0.1em'}}>📄 DOCUMENTCLOUD — {documents.length} INVESTIGATIVE DOCUMENTS</div>
                    {documents.map((d,i)=>(
                      <div key={i} style={{padding:'8px 10px',background:'var(--panel)',border:'1px solid rgba(96,165,250,0.2)',borderRadius:'3px',marginBottom:'4px'}}>
                        <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'3px'}}>
                          <span style={{fontSize:'11px',fontWeight:600,color:'var(--t1)',flex:1}}>{d.title}</span>
                          {d.url&&<a href={d.url} target="_blank" rel="noopener noreferrer" style={{color:'#60a5fa',flexShrink:0}}><ExternalLink size={10}/></a>}
                        </div>
                        {d.source&&<div className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{d.source} · {d.created} · {d.pages} pages</div>}
                        {d.description&&<p style={{fontSize:'10px',color:'var(--t3)',margin:'3px 0 0',lineHeight:1.5}}>{d.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {wikiCategories.length>0&&(
                  <div style={{marginBottom:'16px'}}>
                    <div className="mono" style={{fontSize:'8px',color:'var(--t4)',marginBottom:'6px',letterSpacing:'0.1em'}}>WIKIPEDIA CATEGORIES ({wikiCategories.length})</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
                      {wikiCategories.map((c,i)=>(
                        <button key={i} onClick={()=>doSearch(c)}
                          style={{fontSize:'9px',padding:'2px 8px',borderRadius:'3px',background:'var(--panel)',border:'1px solid var(--border)',color:'var(--t3)',cursor:'pointer'}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--t3)'}}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {ddgCrypto?.relatedTopics?.length>0&&(
                  <div>
                    <div className="mono" style={{fontSize:'8px',color:'#f59e0b',marginBottom:'6px',letterSpacing:'0.1em'}}>₿ CRYPTO / BLOCKCHAIN SIGNALS ({ddgCrypto.relatedTopics.length})</div>
                    {ddgCrypto.relatedTopics.slice(0,25).map((t,i)=>(
                      <div key={i} style={{padding:'5px 8px',background:'rgba(245,158,11,0.04)',border:'1px solid rgba(245,158,11,0.15)',borderRadius:'3px',marginBottom:'3px',fontSize:'10px',color:'var(--t2)'}}>
                        {t.text?.slice(0,200)}
                        {t.url&&<a href={t.url} target="_blank" rel="noopener noreferrer" style={{marginLeft:'6px',color:'#f59e0b',fontSize:'9px'}}>↗</a>}
                      </div>
                    ))}
                  </div>
                )}
                {!documents.length&&!wikiCategories.length&&!ddgCrypto?.relatedTopics?.length&&!loadMain&&(
                  <div style={{padding:'20px',textAlign:'center',color:'var(--t4)',fontSize:'11px'}}>No documents or categorizations found for this entity.</div>
                )}
              </div>
            )}

            {/* ── AI PROFILE ── */}
            {activeTab==='report'&&(
              <div style={{padding:'14px'}}>
                {!groqKey&&<div style={{padding:'10px',background:'rgba(167,139,250,0.06)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:'3px',fontSize:'10px',color:'var(--t3)'}}>⚠ Add Groq API key in Settings to enable AI intelligence profile synthesis.</div>}
                {loadGroq&&!aiProfile&&<div style={{display:'flex',alignItems:'center',gap:'8px',color:'var(--t4)',fontSize:'11px'}}><Loader size={12} className="spin" style={{color:'#c084fc'}}/>Building full intelligence profile from all sources…</div>}
                {aiProfile&&(
                  <div style={{padding:'14px',background:'var(--panel)',border:'1px solid rgba(192,132,252,0.3)',borderRadius:'4px',borderLeft:'3px solid #c084fc'}}>
                    <div className="mono" style={{fontSize:'8px',color:'#c084fc',marginBottom:'8px',letterSpacing:'0.1em'}}>GROQ AI INTELLIGENCE PROFILE — {query.toUpperCase()}</div>
                    <div style={{fontSize:'11px',color:'var(--t1)',lineHeight:1.85,whiteSpace:'pre-wrap'}}
                      dangerouslySetInnerHTML={{__html:aiProfile.replace(/\*\*(.*?)\*\*/g,'<strong style="color:var(--t1)">$1</strong>')}}>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
          </div>

        </div>
        )}
        </div>{/* end always-visible outer flex row */}
    </div>
  )
}


// Quick "→ Board" button — adds any intel item as a node on the research board
function BoardBtn({ label, type, detail, source, url, color }) {
  const [added, setAdded] = React.useState(false)
  const add = () => {
    const store = window.__nexusStore?.getState?.() || null
    if (!store?.addNode) return
    store.addNode({
      type: type || 'event',
      label: (label || '').slice(0, 55),
      detail: (detail || '').slice(0, 300),
      source: source || 'Intel Search',
      url: url || '',
      color: color || '#94a3b8',
      x: 300 + Math.random() * 500,
      y: 200 + Math.random() * 400,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }
  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); add() }}
      title="Add to Research Board"
      style={{ flexShrink:0, padding:'1px 6px', fontSize:'8px', fontWeight:700, border:'1px solid rgba(45,212,191,0.3)', background: added ? 'rgba(45,212,191,0.2)' : 'transparent', borderRadius:'3px', color: added ? 'var(--accent)' : 'var(--t4)', cursor:'pointer', whiteSpace:'nowrap' }}>
      {added ? '✓ Board' : '+ Board'}
    </button>
  )
}


// Dismiss button — shown on each financial/legal card
function DismissBtn({ onDismiss }) {
  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); onDismiss() }}
      title="Dismiss this item"
      style={{ flexShrink:0, width:'16px', height:'16px', border:'none', background:'rgba(148,163,184,0.15)', borderRadius:'3px', cursor:'pointer', color:'var(--t4)', fontSize:'9px', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, padding:0 }}
    >✕</button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT SEARCH PANEL — always-visible left sidebar, fully independent
// Tabs: DocumentCloud (restored OG) · IntelX (server-side) · Archive.org · CourtListener
// AND/OR logic toggle for multi-word queries
// ─────────────────────────────────────────────────────────────────────────────
function DocSearchPanel() {
  const { keys } = useStore()
  const [docQuery, setDocQuery] = React.useState('')
  const [logic,    setLogic]    = React.useState('AND')
  const [loading,  setLoading]  = React.useState(false)
  const [results,  setResults]  = React.useState(null)
  const [tab,      setTab]      = React.useState('docs')
  const [dcPage,   setDcPage]   = React.useState(1)
  const inputRef = React.useRef(null)

  // Build query term respecting AND/OR
  const buildTerm = (raw, logicMode) => {
    const words = raw.trim().split(/\s+/).filter(Boolean)
    if (words.length <= 1) return raw.trim()
    return logicMode === 'OR' ? words.join(' OR ') : words.join(' ')
  }

  // DocumentCloud — original working endpoint
  const searchDC = React.useCallback(async (term, page) => {
    const r = await fetch(
      'https://api.www.documentcloud.org/api/documents/search/?q=' +
      encodeURIComponent(term) + '&per_page=50&page=' + page,
      { signal: AbortSignal.timeout(15000) }
    )
    if (!r.ok) return null
    return r.json()
  }, [])

  const search = React.useCallback(async (q, page) => {
    const raw = (q || docQuery).trim()
    if (!raw) return
    const pg = page || 1
    const term = buildTerm(raw, logic)
    setLoading(true)
    if (pg === 1) setResults(null)

    try {
      // Run DC + IntelX + Archive in parallel
      const dcPromise = searchDC(term, pg)

      // IntelX — server-side to bypass CORS
      const ixPromise = pg === 1 ? (async () => {
        try {
          const ixKey = keys?.intelx_key || ''
          const r = await fetch(
            `/api/intel?name=${encodeURIComponent(raw)}&docSearch=1&intelx_key=${encodeURIComponent(ixKey)}`,
            { signal: AbortSignal.timeout(30000) }
          )
          if (!r.ok) return null
          return r.json()
        } catch { return null }
      })() : Promise.resolve(null)

      // Archive.org full-text search — billions of public docs
      const archivePromise = pg === 1 ? (async () => {
        try {
          const r = await fetch(
            `https://archive.org/advancedsearch.php?q=${encodeURIComponent(term)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=date&fl%5B%5D=description&fl%5B%5D=mediatype&fl%5B%5D=subject&rows=30&page=1&output=json&mediatype=texts`,
            { signal: AbortSignal.timeout(12000) }
          )
          if (!r.ok) return null
          return r.json()
        } catch { return null }
      })() : Promise.resolve(null)

      // CourtListener PACER opinions
      const courtPromise = pg === 1 ? (async () => {
        try {
          const r = await fetch(
            `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(term)}&type=o&order_by=score+desc&stat_Precedential=on&format=json&page_size=20`,
            { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } }
          )
          if (!r.ok) return null
          return r.json()
        } catch { return null }
      })() : Promise.resolve(null)

      const [dc, ixData, archiveData, courtData] = await Promise.all([
        dcPromise, ixPromise, archivePromise, courtPromise
      ])

      const docItems = (dc?.results || []).map(d => ({
        id: d.id, title: d.title,
        source: d.source || d.organization?.name || '',
        date:  d.created_at?.slice(0,10),
        pages: d.page_count,
        description: d.description?.slice(0,150),
        url: d.canonical_url || 'https://www.documentcloud.org/documents/' + d.id,
      }))

      const archiveItems = (archiveData?.response?.docs || []).map(doc => ({
        title:  doc.title || doc.identifier || 'Archive Document',
        author: Array.isArray(doc.creator) ? doc.creator[0] : doc.creator || '',
        date:   doc.date?.slice(0,10) || '',
        url:    `https://archive.org/details/${doc.identifier}`,
        description: (Array.isArray(doc.description) ? doc.description[0] : doc.description || '').slice(0,150),
        subject: Array.isArray(doc.subject) ? doc.subject.slice(0,3).join(', ') : '',
      }))

      const courtItems = (courtData?.results || []).slice(0,20).map(r => ({
        title: r.caseName || r.case_name || 'Case',
        court: r.court_citation_string || r.court || '',
        date:  r.dateFiled || r.date_filed || '',
        url:   'https://www.courtlistener.com' + (r.absolute_url || ''),
        docketNumber: r.docketNumber || '',
      }))

      setResults(prev => ({
        query: raw, logicUsed: logic,
        docs:     pg === 1 ? docItems : [...(prev?.docs || []), ...docItems],
        docTotal: dc?.count || (pg > 1 ? prev?.docTotal : 0) || 0,
        docPage:  pg,
        docPages: dc?.count ? Math.ceil(dc.count / 50) : (pg > 1 ? prev?.docPages : 1),
        intelx:   pg === 1 ? (ixData?.intelx || []) : (prev?.intelx || []),
        archive:  pg === 1 ? archiveItems : (prev?.archive || []),
        courts:   pg === 1 ? courtItems   : (prev?.courts || []),
      }))
      setDcPage(pg)
    } catch(e) {
      setResults(prev => ({ ...(prev || {}), error: e.message }))
    }
    setLoading(false)
  }, [docQuery, logic, searchDC, keys])

  const TABS = [
    { id:'docs',    label:'📄 DocumentCloud', color:'#60a5fa', count: r => r.docTotal },
    { id:'archive', label:'🗄 Archive.org',    color:'#f59e0b', count: r => r.archive?.length },
    { id:'intelx',  label:'🕵 IntelX',         color:'#a78bfa', count: r => r.intelx?.length },
    { id:'courts',  label:'⚖️ PACER',           color:'#34d399', count: r => r.courts?.length },
  ]
  const bucket_colors = { pastes:'#f97316', darkweb:'#a78bfa', documents:'#60a5fa', leaks:'#ef4444', socialnetworks:'#38bdf8' }

  return (
    <div style={{ width:'280px', flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--base)', overflow:'hidden', order:-1 }}>

      {/* Header */}
      <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)', background:'var(--void)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' }}>
          <span className="mono" style={{ fontSize:'8px', color:'var(--accent)', letterSpacing:'0.1em', flex:1 }}>📄 DOCUMENT SEARCH</span>
          <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:'3px', overflow:'hidden' }}>
            {['AND','OR'].map(l => (
              <button key={l} onClick={() => setLogic(l)}
                style={{ padding:'2px 7px', fontSize:'8px', fontWeight:700, border:'none', cursor:'pointer',
                  background: logic===l ? 'var(--accent)' : 'transparent',
                  color:      logic===l ? '#000' : 'var(--t3)' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display:'flex', gap:'5px' }}>
          <input ref={inputRef} value={docQuery} onChange={e => setDocQuery(e.target.value)}
            onKeyDown={e => e.key==='Enter' && (setDcPage(1), search(docQuery, 1))}
            placeholder={logic==='AND' ? 'all words required…' : 'any word matches…'}
            style={{ flex:1, fontSize:'10px', padding:'4px 8px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'3px', color:'var(--t1)', outline:'none' }}
          />
          <button onClick={() => { setDcPage(1); search(docQuery, 1) }} disabled={loading || !docQuery.trim()}
            style={{ padding:'4px 8px', fontSize:'9px', fontWeight:700, background:'var(--accent)', border:'none', borderRadius:'3px', color:'#000', cursor:loading||!docQuery.trim()?'not-allowed':'pointer', opacity:loading||!docQuery.trim()?0.6:1 }}>
            {loading ? '…' : '↵'}
          </button>
        </div>
        {results && (
          <div style={{ display:'flex', gap:'3px', marginTop:'6px', flexWrap:'wrap' }}>
            {TABS.map(t => {
              const cnt = t.count(results)
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ flex:'1 0 auto', padding:'2px 4px', fontSize:'7px', fontWeight:700,
                    background: tab===t.id ? t.color+'22' : 'transparent',
                    border:'1px solid', borderColor: tab===t.id ? t.color : 'var(--border)',
                    borderRadius:'3px', color: tab===t.id ? t.color : 'var(--t4)', cursor:'pointer', whiteSpace:'nowrap' }}>
                  {t.label.split(' ').slice(1).join(' ')}{cnt ? ` (${cnt > 999 ? '999+' : cnt})` : ''}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Results */}
      <div style={{ flex:1, overflowY:'auto', padding:'8px 10px' }}>
        {!results && !loading && (
          <div style={{ textAlign:'center', padding:'24px 8px', color:'var(--t4)', fontSize:'9px', lineHeight:1.7 }}>
            Search across 4 document sources.<br/><br/>
            <span style={{ color:'#60a5fa' }}>DocumentCloud</span> — 10M+ investigative docs<br/>
            <span style={{ color:'#f59e0b' }}>Archive.org</span> — billions of public texts<br/>
            <span style={{ color:'#a78bfa' }}>IntelX</span> — dark web, breaches, pastes<br/>
            <span style={{ color:'#34d399' }}>PACER</span> — US federal court records
          </div>
        )}
        {loading && (
          <div style={{ textAlign:'center', padding:'24px 8px', color:'var(--t4)', fontSize:'9px' }}>
            <div style={{ marginBottom:'8px', fontSize:'20px' }}>🔍</div>
            Searching all sources in parallel…<br/>
            <span style={{ fontSize:'8px', opacity:0.6 }}>IntelX may take ~5–10s</span>
          </div>
        )}
        {results?.error && !loading && (
          <div style={{ padding:'8px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'3px', fontSize:'9px', color:'#ef4444', marginBottom:'8px' }}>
            {results.error}
          </div>
        )}

        {/* ── DocumentCloud ── */}
        {results && tab==='docs' && (
          <div>
            {results.docTotal > 0 && (
              <div className="mono" style={{ fontSize:'7px', color:'#60a5fa', marginBottom:'7px', letterSpacing:'0.1em' }}>
                📄 {results.docTotal.toLocaleString()} DOCUMENTS
              </div>
            )}
            {results.docs.length === 0 && !loading && (
              <div style={{ fontSize:'9px', color:'var(--t4)', textAlign:'center', padding:'16px 0' }}>No documents found.</div>
            )}
            {results.docs.map((d, i) => (
              <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                style={{ display:'block', textDecoration:'none', padding:'7px 8px', background:'var(--panel)', border:'1px solid rgba(96,165,250,0.2)', borderRadius:'4px', marginBottom:'4px' }}>
                <div style={{ fontSize:'9px', fontWeight:600, color:'var(--t1)', marginBottom:'2px', lineHeight:1.4 }}>{d.title}</div>
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                  {d.source && <span className="mono" style={{ fontSize:'7px', color:'#60a5fa' }}>{d.source}</span>}
                  {d.date   && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{d.date}</span>}
                  {d.pages  && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{d.pages}p</span>}
                </div>
                {d.description && <div style={{ fontSize:'8px', color:'var(--t3)', marginTop:'2px', lineHeight:1.5 }}>{d.description}</div>}
              </a>
            ))}
            {results.docTotal > 50 && (
              <div style={{ padding:'6px 0', display:'flex', alignItems:'center', gap:'5px' }}>
                <span style={{ fontSize:'8px', color:'var(--t4)', flex:1 }}>
                  {results.docPage}/{results.docPages} · {results.docTotal.toLocaleString()}
                </span>
                <button disabled={!results.docPage || results.docPage<=1 || loading}
                  onClick={() => search(docQuery, (results.docPage||1)-1)}
                  style={{ padding:'2px 7px', fontSize:'8px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'3px', color:'var(--t3)', cursor:'pointer', opacity:(!results.docPage||results.docPage<=1)?0.3:1 }}>← Prev</button>
                <button disabled={loading || (results.docPage||1) >= (results.docPages||1)}
                  onClick={() => search(docQuery, (results.docPage||1)+1)}
                  style={{ padding:'2px 7px', fontSize:'8px', background:'var(--accent)', border:'none', borderRadius:'3px', color:'#000', cursor:'pointer', opacity:((results.docPage||1)>=(results.docPages||1))?0.3:1 }}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ── Archive.org ── */}
        {results && tab==='archive' && (
          <div>
            {results.archive?.length > 0 ? (
              <>
                <div className="mono" style={{ fontSize:'7px', color:'#f59e0b', marginBottom:'7px', letterSpacing:'0.1em' }}>
                  🗄 {results.archive.length} ARCHIVE.ORG DOCUMENTS
                </div>
                {results.archive.map((d, i) => (
                  <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                    style={{ display:'block', textDecoration:'none', padding:'7px 8px', background:'rgba(245,158,11,0.04)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'4px', marginBottom:'4px' }}>
                    <div style={{ fontSize:'9px', fontWeight:600, color:'var(--t1)', marginBottom:'2px', lineHeight:1.4 }}>{d.title}</div>
                    <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                      {d.author && <span className="mono" style={{ fontSize:'7px', color:'#f59e0b' }}>{d.author}</span>}
                      {d.date   && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{d.date}</span>}
                    </div>
                    {d.subject && <div style={{ fontSize:'7px', color:'var(--t4)', marginTop:'2px' }}>{d.subject}</div>}
                    {d.description && <div style={{ fontSize:'8px', color:'var(--t3)', marginTop:'2px', lineHeight:1.5 }}>{d.description}</div>}
                  </a>
                ))}
              </>
            ) : !loading && (
              <div style={{ fontSize:'9px', color:'var(--t4)', textAlign:'center', padding:'16px 0', lineHeight:1.5 }}>
                No Archive.org results.<br/>
                <a href={`https://archive.org/search?query=${encodeURIComponent(results?.query||'')}`} target="_blank" rel="noopener noreferrer"
                  style={{ color:'#f59e0b', fontSize:'8px' }}>Search Archive.org directly ↗</a>
              </div>
            )}
          </div>
        )}

        {/* ── IntelX ── */}
        {results && tab==='intelx' && (
          <div>
            {results.intelx?.length > 0 ? (
              <>
                <div className="mono" style={{ fontSize:'7px', color:'#a78bfa', marginBottom:'7px', letterSpacing:'0.1em' }}>
                  ⚠ {results.intelx.length} BREACH / DARK WEB RECORDS
                </div>
                {results.intelx.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                    style={{ display:'block', textDecoration:'none', padding:'6px 8px', background:'rgba(167,139,250,0.05)', border:'1px solid rgba(167,139,250,0.25)', borderRadius:'4px', marginBottom:'3px' }}>
                    <div style={{ fontSize:'9px', fontWeight:600, color:'var(--t1)', marginBottom:'2px', wordBreak:'break-all' }}>{r.name}</div>
                    <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                      {r.bucket && (
                        <span className="mono" style={{ fontSize:'7px', padding:'1px 4px',
                          background:(bucket_colors[r.bucket?.toLowerCase()]||'#6b7280')+'22',
                          color:bucket_colors[r.bucket?.toLowerCase()]||'#6b7280', borderRadius:'2px' }}>
                          {r.bucket}
                        </span>
                      )}
                      {r.type !== undefined && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>type:{r.type}</span>}
                      {r.date && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{r.date}</span>}
                    </div>
                  </a>
                ))}
              </>
            ) : !loading && (
              <div style={{ fontSize:'9px', color:'var(--t4)', textAlign:'center', padding:'16px 0', lineHeight:1.6 }}>
                No IntelX records.<br/>
                <span style={{ fontSize:'8px', opacity:0.6 }}>Free tier has limited coverage.<br/>Results come via server-side.</span>
              </div>
            )}
          </div>
        )}

        {/* ── CourtListener / PACER ── */}
        {results && tab==='courts' && (
          <div>
            {results.courts?.length > 0 ? (
              <>
                <div className="mono" style={{ fontSize:'7px', color:'#34d399', marginBottom:'7px', letterSpacing:'0.1em' }}>
                  ⚖️ {results.courts.length} COURT RECORDS
                </div>
                {results.courts.map((c, i) => (
                  <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                    style={{ display:'block', textDecoration:'none', padding:'7px 8px', background:'rgba(52,211,153,0.04)', border:'1px solid rgba(52,211,153,0.2)', borderRadius:'4px', marginBottom:'4px' }}>
                    <div style={{ fontSize:'9px', fontWeight:600, color:'var(--t1)', marginBottom:'2px', lineHeight:1.4 }}>{c.title}</div>
                    <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                      {c.court && <span className="mono" style={{ fontSize:'7px', color:'#34d399' }}>{c.court}</span>}
                      {c.date  && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{c.date}</span>}
                    </div>
                    {c.docketNumber && <div className="mono" style={{ fontSize:'7px', color:'var(--t4)', marginTop:'1px' }}>Docket: {c.docketNumber}</div>}
                  </a>
                ))}
              </>
            ) : !loading && (
              <div style={{ fontSize:'9px', color:'var(--t4)', textAlign:'center', padding:'16px 0' }}>No court records found.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


function InfoRow({label,val}) {
  return(
    <div style={{padding:'3px 0'}}>
      <div className="mono" style={{fontSize:'7px',color:'var(--t4)',marginBottom:'1px'}}>{label.toUpperCase()}</div>
      <div style={{fontSize:'10px',color:'var(--t2)'}}>{val}</div>
    </div>
  )
}

function ArticleRow({article,expanded,onToggle,saved,onSave,onUnsave,onAddNode,onPivot}) {
  const color = SEV_C[article.severity]||'var(--accent)'
  const ago = (()=>{ try { return formatDistanceToNow(article.pub,{addSuffix:true}) } catch { return '' }})()
  return(
    <div onClick={onToggle} style={{padding:'8px 14px',borderBottom:'1px solid var(--border)',cursor:'pointer',borderLeft:`3px solid ${color}`}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'3px',flexWrap:'wrap'}}>
        <a href={article.url!=='#'?article.url:undefined} target="_blank" rel="noopener noreferrer"
          onClick={e=>e.stopPropagation()} style={{fontFamily:'JetBrains Mono',fontSize:'10px',fontWeight:600,color:'var(--accent)',textDecoration:'underline',textDecorationColor:'rgba(45,212,191,0.35)'}}>
          ↗ {article.source}
        </a>
        <span className="mono" style={{fontSize:'8px',color}}>{article.severity}</span>
        {article.region&&article.region!=='Global'&&<span className="mono" style={{fontSize:'8px',color:'var(--t4)'}}>{article.region}</span>}
        {article.tags?.slice(0,2).map(t=><span key={t} className="chip" style={{fontSize:'7px'}}>{t}</span>)}
        <span className="mono" style={{fontSize:'8px',color:'var(--t4)',marginLeft:'auto'}}>{ago}</span>
      </div>
      <div style={{fontSize:'12px',fontWeight:500,color:'var(--t1)',lineHeight:1.4}}>{article.title}</div>
      {expanded&&(
        <div onClick={e=>e.stopPropagation()} className="fade-in" style={{marginTop:'8px',display:'flex',gap:'5px',flexWrap:'wrap'}}>
          <button className={`btn ${saved?'btn-accent':''}`} style={{fontSize:'9px',padding:'3px 8px'}} onClick={()=>saved?onUnsave():onSave()}>
            {saved?<><BookmarkCheck size={9}/> saved</>:<><Bookmark size={9}/> save</>}
          </button>
          <button className="btn" style={{fontSize:'9px',padding:'3px 8px'}} onClick={onAddNode}><Plus size={9}/> board</button>
          {article.url!=='#'&&<a href={article.url} target="_blank" rel="noopener noreferrer" className="btn" style={{fontSize:'9px',padding:'3px 8px'}} onClick={e=>e.stopPropagation()}><ExternalLink size={9}/> read</a>}
        </div>
      )}
    </div>
  )
}
