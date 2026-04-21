/**
 * usePolymarket v7 — Active markets + resolved questions for calibration
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { cacheWrite, cacheRead } from '../utils/cache'

const GEO = /ukraine|russia|china|taiwan|iran|israel|korea|nato|nuclear|election|war|conflict|military|sanction|middle.east|india|pakistan|recession|oil|fed|gaza|hamas|houthi|coup|ceasefire|trump|congress|climate|disaster|modi|netanyahu|putin|zelensky|south china sea|philippines|north korea|myanmar|sahel|sudan|houthi|hezbollah/i

function parseProb(m) {
  try {
    const arr = JSON.parse(m.outcomePrices || '[]')
    const p = parseFloat(Array.isArray(arr) ? arr[0] : arr)
    if (!isNaN(p) && p >= 0 && p <= 1) return p
    if (!isNaN(p) && p > 1) return p / 100
  } catch {}
  if (m.bestBid != null && m.bestAsk != null) return (parseFloat(m.bestBid) + parseFloat(m.bestAsk)) / 2
  if (m.lastTradePrice != null) { const p = parseFloat(m.lastTradePrice); return p > 1 ? p/100 : p }
  return null
}

export function usePolymarket() {
  const [markets, setMarkets] = useState([])
  const [resolvedMarkets, setResolvedMarkets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastFetch, setLastFetch] = useState(null)

  useEffect(() => {
    const cached = cacheRead('polymarket-markets', 15 * 60 * 1000)
    if (cached?.data?.length) setMarkets(cached.data)
    const cachedRes = cacheRead('polymarket-resolved', 60 * 60 * 1000)  // 1hr TTL
    if (cachedRes?.data?.length) setResolvedMarkets(cachedRes.data)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // Fetch active + resolved in parallel
      const [activeRes, resolvedRes] = await Promise.allSettled([
        fetch('/api/polymarket', { signal: AbortSignal.timeout(20000) }),
        fetch('/api/polymarket?mode=resolved', { signal: AbortSignal.timeout(20000) }),
      ])

      if (activeRes.status === 'fulfilled' && activeRes.value.ok) {
        const data = await activeRes.value.json()
        const raw = data.markets || []
        const seen = new Set()
        const parsed = raw.map(m => ({
          id: m.id, slug: m.slug,
          question: (m.question || m.title || '').trim(),
          probability: parseProb(m),
          volume: parseFloat(m.volume || 0),
          volume24h: parseFloat(m.volume24hr || 0),
          endDate: m.endDateIso || m.endDate,
          url: 'https://polymarket.com/event/' + (m.slug || m.id),
          isGeo: GEO.test(m.question || m.title || ''),
          source: 'Polymarket',
        })).filter(m => m.question.length > 5 && !seen.has(m.id) && seen.add(m.id))
        setMarkets(parsed)
        cacheWrite('polymarket-markets', parsed, 300)
      }

      if (resolvedRes.status === 'fulfilled' && resolvedRes.value.ok) {
        const rData = await resolvedRes.value.json()
        const resolved = (rData.markets || []).filter(m => m.resolvedOutcome != null && GEO.test(m.question || ''))
        setResolvedMarkets(resolved)
        cacheWrite('polymarket-resolved', resolved, 3600)
      }

      setLastFetch(new Date())
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 4 * 60 * 1000)
    return () => clearInterval(iv)
  }, [refresh])

  const geoMarkets = useMemo(() =>
    markets.filter(m => m.isGeo && m.probability != null)
      .sort((a,b) => (b.volume24h||0)-(a.volume24h||0)),
    [markets]
  )

  return { markets, geoMarkets, resolvedMarkets, loading, error, lastFetch, refresh }
}
