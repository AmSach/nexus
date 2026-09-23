/**
 * /api/polymarket — Server-side Polymarket proxy
 * Fetches active markets + recently resolved markets for calibration ground truth
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=60')

  // Resolved mode: fetch recently resolved for ground truth calibration
  if (req.query.mode === 'resolved') {
    try {
      const pages = await Promise.allSettled([
        fetch('https://gamma-api.polymarket.com/markets?closed=true&limit=100&offset=0&order=volume24hr&ascending=false'),
        fetch('https://gamma-api.polymarket.com/markets?closed=true&limit=100&offset=100&order=volume24hr&ascending=false'),
      ])
      const all = []
      for (const p of pages) {
        if (p.status === 'fulfilled' && p.value.ok) {
          const data = await p.value.json()
          const list = Array.isArray(data) ? data : (data.markets || [])
          all.push(...list)
        }
      }
      const seen = new Set()
      const resolved = all.filter(m => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      }).map(m => {
        // Parse resolution: outcomePrices close to [1,0] or [0,1] = resolved
        let resOutcome = null
        try {
          const prices = JSON.parse(m.outcomePrices || '[]')
          if (Array.isArray(prices) && prices.length >= 2) {
            const p0 = parseFloat(prices[0])
            if (p0 > 0.95) resOutcome = 1
            else if (p0 < 0.05) resOutcome = 0
          }
        } catch {}
        if (m.resolutionSource != null) resOutcome = parseFloat(m.resolutionSource) > 0.5 ? 1 : 0
        return { id: m.id, question: m.question || m.title, volume: m.volume, resolvedOutcome: resOutcome }
      }).filter(m => m.resolvedOutcome != null && m.question)
      return res.status(200).json({ markets: resolved, count: resolved.length })
    } catch(e) {
      return res.status(500).json({ error: e.message, markets: [] })
    }
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
      if (p.status === 'fulfilled' && p.value?.ok) {
        try {
          const data = await p.value.json()
          const list = Array.isArray(data) ? data : (data.markets || [])
          all.push(...list)
        } catch {}
      }
    }

    const seen = new Set()
    let deduped = all.filter(m => {
      if (!m || !m.id || seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    // If Polymarket gamma API is rate-limited, blocked, or timed out, query open prediction market fallbacks (Manifold)
    if (deduped.length === 0) {
      try {
        const terms = ['war', 'geopolitics', 'sanctions', 'economy', 'oil', 'taiwan']
        const mfResults = await Promise.allSettled(
          terms.map(term =>
            fetch(`https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(term)}&limit=25`, {
              signal: AbortSignal.timeout(6000)
            }).then(r => r.ok ? r.json() : [])
          )
        )
        const mfAll = []
        for (const r of mfResults) {
          if (r.status === 'fulfilled' && Array.isArray(r.value)) {
            mfAll.push(...r.value)
          }
        }
        const mfSeen = new Set()
        deduped = mfAll.filter(m => {
          if (!m || !m.id || mfSeen.has(m.id)) return false
          mfSeen.add(m.id)
          return true
        }).map(m => ({
          id: 'mf-' + m.id,
          slug: m.slug || m.id,
          question: m.question,
          title: m.question,
          outcomePrices: JSON.stringify([m.probability != null ? m.probability : 0.5, 1 - (m.probability != null ? m.probability : 0.5)]),
          volume: m.volume || 10000,
          volume24hr: m.volume24Hours || 2500,
          endDateIso: m.closeTime ? new Date(m.closeTime).toISOString() : null,
          source: 'Manifold (Live Alt)'
        }))
      } catch {}
    }

    res.status(200).json({ markets: deduped, count: deduped.length })
  } catch (e) {
    res.status(500).json({ error: e.message, markets: [] })
  }
}

