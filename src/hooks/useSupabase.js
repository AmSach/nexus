/**
 * useSupabase v2 — fixed QueryBuilder, proper REST API calls, realtime
 *
 * BUG FIXES from v1:
 * 1. sb.from() was async — removed, QueryBuilder created synchronously
 * 2. URLSearchParams.set() for filter cols clobbers duplicates — fixed to append
 * 3. neq() used wrong PostgREST syntax — fixed
 * 4. useSupabaseSatellite was not exported — fixed
 * 5. Promise.allSettled was getting QueryBuilder objects not promises — fixed
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { cacheWrite, cacheRead } from '../utils/cache'

const SB_URL  = import.meta.env.VITE_SUPABASE_URL  || ''
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// ── PostgREST query builder ───────────────────────────────────────────────────
// PostgREST filter format: ?col=eq.val&col2=gte.val2
// Multiple filters on DIFFERENT cols: separate &-params (not same key)
class QB {
  constructor(table) {
    this._table   = table
    this._select  = '*'
    this._filters = []   // [{col, op, val}] — not URLSearchParams to avoid collisions
    this._order   = null
    this._limit   = null
  }
  select(cols) { this._select = cols; return this }
  eq(col, val)  { this._filters.push({ col, op: 'eq',  val }); return this }
  neq(col, val) { this._filters.push({ col, op: 'neq', val }); return this }
  gte(col, val) { this._filters.push({ col, op: 'gte', val }); return this }
  lte(col, val) { this._filters.push({ col, op: 'lte', val }); return this }
  gt(col, val)  { this._filters.push({ col, op: 'gt',  val }); return this }
  in(col, vals) { this._filters.push({ col, op: 'in',  val: `(${vals.join(',')})` }); return this }
  order(col, { ascending = true } = {}) { this._order = `${col}.${ascending?'asc':'desc'}`; return this }
  limit(n) { this._limit = n; return this }

  _buildUrl() {
    const params = new URLSearchParams()
    params.set('select', this._select)
    // Each filter is a separate key (PostgREST supports duplicate keys via &)
    this._filters.forEach(f => params.append(f.col, `${f.op}.${f.val}`))
    if (this._order) params.set('order', this._order)
    if (this._limit) params.set('limit', this._limit)
    return `${SB_URL}/rest/v1/${this._table}?${params.toString()}`
  }

  async execute() {
    if (!SB_URL || !SB_ANON) return { data: null, error: 'Supabase not configured' }
    const url = this._buildUrl()
    try {
      const r = await fetch(url, {
        headers: {
          apikey: SB_ANON,
          Authorization: `Bearer ${SB_ANON}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) {
        const text = await r.text()
        return { data: null, error: `${r.status}: ${text}` }
      }
      const data = await r.json()
      return { data, error: null }
    } catch (e) {
      return { data: null, error: e.message }
    }
  }

  // Convenience: single row
  single() { this._limit = 1; return this }
}

function from(table) { return new QB(table) }

// Check if Supabase is configured
export const isSupabaseConfigured = () => !!(SB_URL && SB_ANON)

// ── Main data hook ────────────────────────────────────────────────────────────
export function useSupabaseData() {
  const active = isSupabaseConfigured()
  const [signals,   setSignals]   = useState([])
  const [articles,  setArticles]  = useState([])
  const [markets,   setMarkets]   = useState([])
  const [calibration, setCal]     = useState(null)
  const [ingestStatus, setIngest] = useState(null)
  const [loading,   setLoading]   = useState(active)
  const [lastFetch, setLastFetch] = useState(null)
  const [error,     setError]     = useState(null)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const CACHE_KEY = 'sb-data-v2'

  const fetchAll = useCallback(async () => {
    if (!active) { setLoading(false); return }

    // Instant cache serve
    const cached = cacheRead(CACHE_KEY, 3 * 60 * 1000)
    if (cached?.data && !signals.length) {
      setSignals(cached.data.signals || [])
      setArticles(cached.data.articles || [])
      setMarkets(cached.data.markets || [])
      if (cached.age < 90_000) { setLoading(false); return }
    }

    setLoading(true)
    const sixH  = new Date(Date.now() - 6 * 3600_000).toISOString()
    const twH   = new Date(Date.now() - 12 * 3600_000).toISOString()

    const [sigRes, artRes, mktRes, calRes, logRes] = await Promise.allSettled([
      from('signals')
        .select('id,type,severity,lat,lng,name,description,url,source,meta,fetched_at,event_date,acpl_action,acpl_ce,acpl_risk_w')
        .neq('acpl_action', 'suppress')
        .gte('fetched_at', sixH)
        .order('fetched_at', { ascending: false })
        .limit(3000)
        .execute(),

      from('articles')
        .select('id,title,url,source,category,severity,region,pub,fetched_at')
        .gte('fetched_at', twH)
        .order('pub', { ascending: false })
        .limit(500)
        .execute(),

      from('markets')
        .select('id,platform,title,probability,volume,url,category,is_geo,meta,updated_at')
        .order('updated_at', { ascending: false })
        .limit(1000)
        .execute(),

      from('vox_calibration').select('*').eq('id', 1).single().execute(),

      from('ingest_log').select('run_at,signals_new,errors').order('run_at', { ascending: false }).limit(1).execute(),
    ])

    if (!mounted.current) return

    const sigs = sigRes.status === 'fulfilled' && sigRes.value.data ? sigRes.value.data : []
    const arts = artRes.status === 'fulfilled' && artRes.value.data ? artRes.value.data : []
    const mkts = mktRes.status === 'fulfilled' && mktRes.value.data ? mktRes.value.data : []
    const cal  = calRes.status === 'fulfilled'  && calRes.value.data?.[0] ? calRes.value.data[0] : null
    const log  = logRes.status === 'fulfilled'  && logRes.value.data?.[0] ? logRes.value.data[0] : null

    setSignals(sigs)
    setArticles(arts)
    setMarkets(mkts)
    setCal(cal)
    setIngest(log)
    setLastFetch(new Date())
    setError(null)
    setLoading(false)
    cacheWrite(CACHE_KEY, { signals: sigs, articles: arts, markets: mkts })
  }, [active])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 90_000)
    return () => clearInterval(iv)
  }, [fetchAll])

  // ── Realtime — instant push from ingest Edge Function ──────────────────
  useEffect(() => {
    if (!active || !SB_URL) return
    const wsUrl = SB_URL.replace(/^https?/, 'wss') + '/realtime/v1/websocket?apikey=' + SB_ANON + '&vsn=1.0.0'
    let ws, heartbeat
    try {
      ws = new WebSocket(wsUrl)
      ws.onopen = () => {
        ws.send(JSON.stringify({ topic: 'realtime:public:signals', event: 'phx_join', payload: {}, ref: '1' }))
        ws.send(JSON.stringify({ topic: 'realtime:public:articles', event: 'phx_join', payload: {}, ref: '2' }))
        heartbeat = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null })), 30000)
      }
      ws.onmessage = ev => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.event !== 'INSERT' && msg.event !== 'UPDATE') return
          const rec = msg.payload?.record
          if (!rec) return
          if (msg.topic.includes('signals') && rec.acpl_action !== 'suppress') {
            setSignals(prev => {
              const deduped = prev.filter(s => s.id !== rec.id)
              return [rec, ...deduped].slice(0, 3000)
            })
          }
          if (msg.topic.includes('articles')) {
            setArticles(prev => {
              const deduped = prev.filter(a => a.id !== rec.id)
              return [rec, ...deduped].slice(0, 500)
            })
          }
        } catch {}
      }
    } catch {}
    return () => { try { clearInterval(heartbeat); ws?.close() } catch {} }
  }, [active])

  // ── Convert DB rows → satelliteToPoints-compatible shape ──────────────
  const signalPoints = useMemo(() => signals.map(s => ({
    lat: s.lat, lng: s.lng,
    type: s.type, severity: s.severity,
    name: s.name, desc: s.description, url: s.url,
    source: s.source,
    meta: typeof s.meta === 'string' ? (() => { try { return JSON.parse(s.meta) } catch { return {} } })() : (s.meta || {}),
    pub: s.event_date || s.fetched_at,
    date: s.event_date || s.fetched_at,
    _fromSupabase: true,
    _acpl: {
      action: s.acpl_action || 'surface_low',
      ceScore: s.acpl_ce || 0,
      riskW: s.acpl_risk_w || 0,
      shouldSurface: (s.acpl_action || 'surface_low') !== 'suppress',
      shouldEscalate: s.acpl_action === 'escalate',
      suppressed: s.acpl_action === 'suppress',
    }
  })), [signals])

  // ── Report ACPL outcome to Edge Function ──────────────────────────────
  const reportOutcome = useCallback(async (signalSnap, action, wasNegative, delayMin = 0) => {
    if (!active) return
    try {
      await fetch(`${SB_URL}/functions/v1/acpl-engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON}` },
        body: JSON.stringify({ mode: 'outcome', signalSnap, action, wasNegative, delayMin }),
        signal: AbortSignal.timeout(5000),
      })
    } catch {}
  }, [active])

  return {
    signals: signalPoints, articles, markets, calibration, ingestStatus,
    loading, lastFetch, error, isActive: active,
    refresh: fetchAll, reportOutcome, rawSignals: signals,
  }
}

// ── Drop-in replacement for useSatellite ────────────────────────────────────
export function useSupabaseSatellite() {
  const { signals, loading, lastFetch, error, refresh, isActive } = useSupabaseData()

  const data = useMemo(() => {
    if (!signals.length && !isActive) return null
    const byType = {}
    signals.forEach(s => { if (!byType[s.type]) byType[s.type] = []; byType[s.type].push(s) })
    return {
      earthquakes:      byType.earthquake   || [],
      aircraft:         byType.aircraft     || [],
      milaircraft:      byType.milaircraft  || [],
      ships:            byType.ship         || [],
      warships:         byType.warship      || [],
      conflictEvents:   byType.conflict     || [],
      gdacs:            byType.gdacs        || [],
      hurricanes:       byType.hurricane    || [],
      volcanoes:        byType.volcano      || [],
      floods:           byType.flood        || [],
      diseaseOutbreaks: byType.disease      || [],
      nuclear:          byType.nuclear      || [],
      maritime:         byType.maritime     || [],
      globalFires:      byType.firms        || [],
      telegramPosts:    byType.telegram     || [],
      notams:           byType.notam        || [],
      cyber:            byType.cyber        || [],
      sigmets:          byType.sigmet       || [],
      iss:              byType.iss?.[0]     || null,
      ucdpFull:         byType.conflict?.filter(s => s.source === 'UCDP') || [],
      _fromSupabase: true,
      summary: { total: signals.length, fetchedAt: lastFetch?.toISOString() },
    }
  }, [signals, isActive, lastFetch])

  return { data, loading, lastFetch, error, refresh }
}
