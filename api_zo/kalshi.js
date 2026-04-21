// /api/kalshi — NEXUS Kalshi Markets Proxy
export default async (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=60')
  try {
    const r = await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?limit=500&status=open', {
      headers: { 'Accept': 'application/json' }
    })
    if (!r.ok) throw new Error(`Kalshi API: ${r.status}`)
    const data = await r.json()
    const markets = data?.markets || data?.data || []
    return c.json({ markets, count: markets.length })
  } catch (e) {
    return c.json({ error: e.message, markets: [] }, 500)
  }
}
