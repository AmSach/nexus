/**
 * useKalshi v5 - Uses /api/kalshi server endpoint (no CORS)
 * Seeds always shown as fallback
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { cacheWrite, cacheRead } from '../utils/cache'

const GEO = /ukraine|russia|china|taiwan|iran|israel|korea|nato|nuclear|election|war|conflict|military|sanction|recession|oil|fed|gaza|hamas|houthi|coup|ceasefire|trump|congress/i

const SEEDS = [
  { id:'ks1', title:'Will there be a ceasefire in Ukraine in 2025?', probability:0.42, volume:980000, isGeo:true, url:'https://kalshi.com', source:'Kalshi' },
  { id:'ks2', title:'Will the US enter a recession in 2025?', probability:0.27, volume:2100000, isGeo:true, url:'https://kalshi.com', source:'Kalshi' },
  { id:'ks3', title:'Will Iran develop a nuclear weapon in 2025?', probability:0.08, volume:620000, isGeo:true, url:'https://kalshi.com', source:'Kalshi' },
  { id:'ks4', title:'Will NATO invoke Article 5 in 2025?', probability:0.05, volume:750000, isGeo:true, url:'https://kalshi.com', source:'Kalshi' },
  { id:'ks5', title:'Will oil price exceed $100/barrel in 2025?', probability:0.18, volume:430000, isGeo:true, url:'https://kalshi.com', source:'Kalshi' },
  { id:'ks6', title:'Will there be a US-China military conflict in 2025?', probability:0.07, volume:540000, isGeo:true, url:'https://kalshi.com', source:'Kalshi' },
  { id:'ks7', title:'How many Fed rate cuts in 2025?', probability:null, volume:1800000, isGeo:true, url:'https://kalshi.com', source:'Kalshi' },
  { id:'ks8', title:'Will Trump be impeached in 2025?', probability:0.09, volume:890000, isGeo:true, url:'https://kalshi.com', source:'Kalshi' },
]

export function useKalshi() {
  const [markets, setMarkets] = useState(SEEDS)
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(false)
  const [lastFetch, setLastFetch] = useState(null)

  useEffect(() => {
    const cached = cacheRead('kalshi-markets', 15 * 60 * 1000)
    if (cached?.data?.length) { setMarkets(cached.data); setLive(true) }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/kalshi', { signal: AbortSignal.timeout(15000) })
      if (r.ok) {
        const data = await r.json()
        const mkts = (data.markets || []).map(m => {
          const prob = m.yes_bid != null ? m.yes_bid/100 : m.last_price != null ? m.last_price/100 : null
          return {
            id: m.ticker || m.market_id,
            title: (m.title || m.subtitle || '').trim(),
            probability: prob, volume: parseFloat(m.volume || 0),
            url: 'https://kalshi.com/markets/' + (m.ticker || ''),
            isGeo: GEO.test(m.title || ''), source: 'Kalshi'
          }
        }).filter(m => m.title.length > 3).sort((a,b) => b.volume-a.volume)
        
        if (mkts.length) {
          setMarkets(mkts); setLive(true)
          cacheWrite('kalshi-markets', mkts, 300)
        }
      }
    } catch {}
    setLoading(false)
    setLastFetch(new Date())
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [refresh])

  const geoMarkets = useMemo(() => markets.filter(m => m.isGeo), [markets])
  return { markets, geoMarkets, loading, live, lastFetch, refresh }
}
