import { useSupabaseData, isSupabaseConfigured } from './useSupabase'

function useLiveAlertsFromSupabase() {
  const { signals } = useSupabaseData()
  const alerts = signals
    .filter(s => ['alert','gdacs','hurricane','disease'].includes(s.type))
    .map(s => ({ id: s.name, title: s.name, desc: s.desc, severity: s.severity,
      type: s.type, url: s.url, source: s.source, lat: s.lat, lng: s.lng,
      pub: s.pub, date: s.date }))
  return { alerts, loading: false }
}
/**
 * useLiveAlerts v5 - Uses /api/alerts server endpoint (no CORS issues)
 * Falls back to direct browser calls if server unavailable
 */
import { useState, useEffect, useCallback } from 'react'
import { cacheWrite, cacheRead } from '../utils/cache'

const SORD = { critical:0, high:1, medium:2, low:3 }

function useLiveAlertsLegacy() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const [counts, setCounts] = useState({})

  // Load cache immediately
  useEffect(() => {
    const cached = cacheRead('alerts', 10 * 60 * 1000)
    if (cached?.data?.length) setAlerts(cached.data)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      // Primary: use our server-side /api/alerts endpoint (no CORS)
      const r = await fetch('/api/alerts', { signal: AbortSignal.timeout(15000) })
      if (r.ok) {
        const data = await r.json()
        const all = (data.alerts || []).sort((a,b) => (SORD[a.severity]||3)-(SORD[b.severity]||3))
        setAlerts(all)
        setCounts(data.counts || {})
        setLastFetch(new Date())
        cacheWrite('alerts', all, 200)
        setLoading(false)
        return
      }
    } catch {}

    // Fallback: NWS is native CORS, try directly
    try {
      const r = await fetch('https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe&urgency=Immediate,Expected&limit=20', {
        signal: AbortSignal.timeout(10000),
        headers: { Accept: 'application/geo+json' }
      })
      if (r.ok) {
        const d = await r.json()
        const nws = (d?.features || []).slice(0,12).map(f => {
          const p = f.properties || {}
          return {
            id: 'nws-'+(p.id||Math.random().toString(36).slice(2)),
            type:'weather', icon:'⛈️',
            title: (p.event||'Weather Alert')+' — '+(p.areaDesc||'').slice(0,50),
            detail: (p.headline||'').slice(0,200),
            severity: p.severity==='Extreme'?'critical':'high',
            source:'NWS', url:p.web,
            ts: p.sent||new Date().toISOString(), region:'N. America'
          }
        })
        if (nws.length) {
          setAlerts(nws)
          setCounts({ nws: nws.length })
          setLastFetch(new Date())
          cacheWrite('alerts', nws, 200)
        }
      }
    } catch {}

    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 3 * 60 * 1000)  // 90s — alerts cached 60s on edge
    return () => clearInterval(iv)
  }, [refresh])

  return { alerts, loading, lastFetch, counts, refresh }
}

export function useLiveAlerts() {
  // Always call both hooks (React rules require unconditional calls)
  // isSupabaseConfigured() is constant at module load time (env vars don't change)
  const sbResult  = useLiveAlertsFromSupabase()
  const legResult = useLiveAlertsLegacy()
  return isSupabaseConfigured() ? sbResult : legResult
}
