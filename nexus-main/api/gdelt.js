// api/gdelt.js — NEXUS GDELT proxy
// Handles both passthrough (pre-built URL) and direct search modes
// GDELT sourcelang:english must be appended UNENCODED — handled here server-side

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const get = async (url, ms = 18000) => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NEXUS-GDELT/5.0)' }
      })
      clearTimeout(t)
      if (!r.ok) return null
      return r
    } catch { return null }
  }

  // ── MODE 1: Passthrough — frontend sends query params, we build the URL here ──
  // This avoids any double-encoding of sourcelang:english
  const q        = req.query?.q        || req.url?.match(/[?&]q=([^&]+)/)?.[1]        || ''
  const mode     = req.query?.mode     || req.url?.match(/[?&]mode=([^&]+)/)?.[1]     || 'artlist'
  const maxr     = req.query?.maxrecords || req.url?.match(/[?&]maxrecords=([^&]+)/)?.[1] || '250'
  const timespan = req.query?.timespan  || req.url?.match(/[?&]timespan=([^&]+)/)?.[1]  || '3months'
  const sort     = req.query?.sort      || req.url?.match(/[?&]sort=([^&]+)/)?.[1]      || 'DateDesc'

  if (q) {
    // URLSearchParams encodes spaces as '+' — decodeURIComponent won't decode those
    // Must replace '+' → ' ' BEFORE decoding
    const query = decodeURIComponent(q.replace(/\+/g, ' ')).trim()
    const words = query.split(/\s+/).filter(w => w.length > 0)

    // Build all search angles — all parallel
    const variants = [
      { vq: query,                                        n: 250, angle: 'general' },
      words.length > 1 ? { vq: `"${query}"`,             n: 100, angle: 'exact' } : null,
      words.length > 1 ? { vq: words.join(' OR '),        n: 100, angle: 'broad' } : null,
      { vq: `${query} crime fraud corruption`,            n: 50,  angle: 'crime' },
      { vq: `${query} court arrested charged convicted`,  n: 50,  angle: 'legal' },
      { vq: `${query} sanction indicted investigation`,   n: 50,  angle: 'sanctions' },
      { vq: `${query} offshore money laundering shell`,   n: 40,  angle: 'financial' },
      { vq: `${query} associate partner ally network`,    n: 40,  angle: 'network' },
      { vq: `${query} military weapons attack strike`,    n: 40,  angle: 'military' },
      { vq: `${query} death dead killed died`,            n: 30,  angle: 'death' },
      { vq: `${query} nuclear weapons missile biological`,n: 30,  angle: 'wmd' },
      { vq: `${query} hacked leak breach cyber attack`,   n: 30,  angle: 'cyber' },
    ].filter(Boolean)

    const seen = new Set()
    const articles = []
    let timeline = null

    // Build GDELT URL correctly — sourcelang:english appended WITHOUT encoding
    const buildUrl = (vq, n, m, ts, s) => {
      const enc = encodeURIComponent(vq)
      return `https://api.gdeltproject.org/api/v2/doc/doc?query=${enc}+sourcelang:english&mode=${m}&maxrecords=${n}&sort=${s}&timespan=${ts}&format=json`
    }

    await Promise.allSettled([
      ...variants.map(({ vq, n, angle }) =>
        get(buildUrl(vq, n, mode, timespan, sort), 18000).then(async r => {
          if (!r) return
          const d = await r.json().catch(() => null)
          ;(d?.articles || []).forEach(a => {
            if (!a?.title) return
            const k = (a.url || a.title).slice(0, 80)
            if (seen.has(k)) return
            seen.add(k)
            articles.push({ ...a, _angle: angle })
          })
        }).catch(() => {})
      ),
      // Timeline volume
      get(buildUrl(query, 1, 'timelinevol', timespan, sort), 15000).then(async r => {
        if (r) timeline = await r.json().catch(() => null)
      }).catch(() => {}),
      // Tone-sorted (controversy signal)
      get(buildUrl(query, 50, 'artlist', timespan, 'ToneAsc'), 15000).then(async r => {
        if (!r) return
        const d = await r.json().catch(() => null)
        ;(d?.articles || []).forEach(a => {
          if (!a?.title) return
          const k = (a.url || a.title).slice(0, 80)
          if (seen.has(k)) return
          seen.add(k)
          articles.push({ ...a, _angle: 'negative_tone' })
        })
      }).catch(() => {}),
    ])

    // If all variants timed out, try one simple fallback query
    if (articles.length === 0) {
      const fallbackR = await get(
        `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}+sourcelang:english&mode=artlist&maxrecords=100&sort=DateDesc&timespan=${timespan}&format=json`,
        14000
      )
      if (fallbackR) {
        const fd = await fallbackR.json().catch(() => null)
        ;(fd?.articles || []).forEach(a => {
          if (!a?.title) return
          const k = (a.url || a.title).slice(0, 80)
          if (seen.has(k)) return
          seen.add(k)
          articles.push({ ...a, _angle: 'fallback' })
        })
      }
    }

    return res.status(200).json({
      articles,
      timeline,
      count: articles.length,
      angles: [...new Set(articles.map(a => a._angle))],
      fetchedAt: new Date().toISOString(),
    })
  }

  // ── MODE 2: Passthrough — legacy support for pre-built URLs ──
  const passthrough = req.query?.passthrough || req.url?.match(/[?&]passthrough=([^&]+)/)?.[1]
  if (passthrough) {
    try {
      const targetUrl = decodeURIComponent(passthrough.replace(/\+/g, ' '))
      const r = await get(targetUrl, 20000)
      if (!r) return res.status(502).json({ error: 'GDELT upstream unreachable' })
      const d = await r.json()
      return res.status(200).json(d)
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  res.status(400).json({ error: 'q or passthrough param required' })
}
