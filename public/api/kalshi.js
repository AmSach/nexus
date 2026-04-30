/**
 * /api/kalshi — Server-side Kalshi proxy
 * Fetches live markets from Kalshi API (CORS blocked in browser)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=60')
  
  try {
    const r = await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?limit=500&status=open', {
      headers: { 'Accept': 'application/json' }
    })
    if (!r.ok) throw new Error(`Kalshi API: ${r.status}`)
    const data = await r.json()
    const markets = data?.markets || data?.data || []
    res.status(200).json({ markets, count: markets.length })
  } catch (e) {
    res.status(500).json({ error: e.message, markets: [] })
  }
}
