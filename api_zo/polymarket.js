// /api/polymarket — NEXUS Polymarket Proxy
export default async (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=60')
  const mode = c.req.query('mode')
  if (mode === 'resolved') {
    try {
      const pages = await Promise.allSettled([
        fetch('https://gamma-api.polymarket.com/markets?closed=true&limit=100&offset=0&order=volume24hr&ascending=false'),
        fetch('https://gamma-api.polymarket.com/markets?closed=true&limit=100&offset=100&order=volume24hr&ascending=false'),
      ])
      const all = []
      for (const p of pages) {
        if (p.status === 'fulfilled' && p.value.ok) {
          const data = await p.value.json()
          all.push(...(Array.isArray(data) ? data : data?.markets || []))
        }
      }
      const seen = new Set()
      const resolved = all.filter(m => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return m.resolvedOutcome != null && m.question
      }).map(m => ({ id: m.id, question: m.question || m.title, volume: m.volume, resolvedOutcome: m.resolvedOutcome }))
      return c.json({ markets: resolved, count: resolved.length })
    } catch (e) { return c.json({ error: e.message, markets: [] }, 500) }
  }
  try {
    const pages = await Promise.allSettled([
      fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=0&order=volume24hr&ascending=false'),
      fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=100&order=volume24hr&ascending=false'),
      fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=200&order=volume24hr&ascending=false'),
      fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=300&order=volume24hr&ascending=false'),
      fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=400&order=volume24hr&ascending=false'),
    ])
    const all = []
    for (const p of pages) {
      if (p.status === 'fulfilled' && p.value.ok) {
        const data = await p.value.json()
        all.push(...(Array.isArray(data) ? data : data?.markets || []))
      }
    }
    const seen = new Set()
    const deduped = all.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
    return c.json({ markets: deduped, count: deduped.length })
  } catch (e) { return c.json({ error: e.message, markets: [] }, 500) }
}
