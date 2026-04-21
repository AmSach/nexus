/**
 * useConflictMarkets — Financial conflict intelligence
 * Defense stocks, war currencies, crypto capital flight, conflict commodities
 * All derived from free public APIs, cached 10min.
 */
import { useState, useEffect, useCallback } from 'react'
import { cacheRead, cacheWrite } from '../utils/cache'

const CACHE_KEY = 'conflict-markets-v1'
const CACHE_TTL = 10 * 60 * 1000  // 10 minutes

export function useConflictMarkets() {
  const [data, setData] = useState(() => {
    const c = cacheRead(CACHE_KEY, CACHE_TTL)
    return c?.data || null
  })
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/fred?mode=conflict', { signal: AbortSignal.timeout(20000) })
      if (r.ok) {
        const d = await r.json()
        setData(d)
        setLastFetch(new Date())
        cacheWrite(CACHE_KEY, d)
      }
    } catch (e) {
      console.warn('[ConflictMarkets]', e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const cached = cacheRead(CACHE_KEY, CACHE_TTL)
    if (!cached?.data) fetch_()
    const iv = setInterval(fetch_, 10 * 60 * 1000)  // every 10min
    return () => clearInterval(iv)
  }, [fetch_])

  return { data, loading, lastFetch, refresh: fetch_ }
}
