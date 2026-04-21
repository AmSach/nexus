/**
 * /api/rss — Server-side RSS + Atom feed parser
 * Handles RSS 2.0, Atom 1.0, and t.me/s/ Telegram scraping.
 * Uses rotating User-Agents to avoid blocks.
 */

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Feedly/1.0 (+http://www.feedly.com/fetcher.html; like FeedFetcher-Google)',
  'FeedBurner/1.0 (http://www.FeedBurner.com)',
]
const randUA = () => UAS[Math.floor(Math.random() * UAS.length)]

function getXMLTag(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\/${tag}>`, 'i'))
  return (m?.[1] || '').replace(/<[^>]+>/g, '').trim()
}

function parseRSS(txt, sourceUrl) {
  const host = (() => { try { return new URL(sourceUrl).hostname.replace(/^(www\.|feeds\.)/, '') } catch { return sourceUrl.slice(0,30) } })()

  // ── JSON Feed format (RFC 7265) — used by some modern publishers ──────────
  if (txt.trimStart().startsWith('{')) {
    try {
      const j = JSON.parse(txt)
      const feedItems = j.items || j.entries || []
      return feedItems.slice(0, 30).map(item => {
        const title = (item.title || item.summary || '').replace(/<[^>]+>/g, '').trim()
        if (!title || title.length < 3) return null
        const link = item.url || item.external_url || item.id || ''
        const pubDate = item.date_published || item.date_modified || ''
        const description = (item.content_text || item.content_html || item.summary || '')
          .replace(/<[^>]+>/g, '').slice(0, 400)
        return { title, link, pubDate, description, source: host }
      }).filter(Boolean)
    } catch {}
  }

  // ── XML/RSS/Atom ──────────────────────────────────────────────────────────
  // Atom feeds use <entry>, RSS uses <item>
  const isAtom = /<feed[\s>]/i.test(txt)
  const itemRe = isAtom ? /<entry[^>]*>([\s\S]*?)<\/entry>/gi : /<item>([\s\S]*?)<\/item>/gi
  const items = [...txt.matchAll(itemRe)]

  return items.map(m => {
    const b = m[1]
    const title = getXMLTag(b, 'title') || getXMLTag(b, 'summary')
    if (!title || title.length < 3) return null

    // Link: try every possible format
    const linkMatch = b.match(/<link[^>]*href="([^"]+)"/i)
      || b.match(/<link[^>]*>\s*([^<]{10,})<\/link>/i)
    const link = linkMatch?.[1]?.trim()
      || getXMLTag(b, 'guid')
      || getXMLTag(b, 'id')
      || ''

    const pubDate = getXMLTag(b, 'pubDate')
      || getXMLTag(b, 'published')
      || getXMLTag(b, 'updated')
      || getXMLTag(b, 'dc:date')
      || ''

    // Description: try all common body fields including content:encoded
    const descRaw = getXMLTag(b, 'content:encoded')
      || getXMLTag(b, 'description')
      || getXMLTag(b, 'content')
      || getXMLTag(b, 'summary')
      || ''
    const description = descRaw.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').trim().slice(0, 400)

    return { title, link, pubDate, description, source: host }
  }).filter(Boolean)
}

async function fetchURL(url) {
  // This runs SERVER-SIDE on Vercel — no CORS restrictions, no need for public proxies.
  // allorigins.win and corsproxy.io are blocked at Vercel's egress network anyway.
  // Two attempts with different User-Agent strings handles most bot-detection blocks.
  const UAS_DIRECT = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    'Feedly/1.0 (+http://www.feedly.com/fetcher.html; like FeedFetcher-Google)',
    'Mozilla/5.0 (compatible; NewsBot/2.0; +https://nexus.app/bot)',
  ]
  for (const ua of UAS_DIRECT) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'application/rss+xml,application/xml,text/xml,application/atom+xml,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),  // 12s — shorter than before to fail fast
      })
      if (!r.ok) continue
      const txt = await r.text().catch(() => '')
      if (txt && txt.length > 100) return txt
    } catch {}
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')

  // ── Telegram t.me/s/ scrape mode ─────────────────────────────────────────
  if (req.query.mode === 'tme') {
    const { handle, count: cnt = 20 } = req.query
    if (!handle) return res.status(400).json({ error: 'handle required' })
    try {
      const r = await fetch('https://t.me/s/' + handle, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow', signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) return res.status(r.status).json({ error: 'Telegram ' + r.status, posts: [] })
      const html = await r.text()
      const dateMatches = [...html.matchAll(/datetime="([^"]+)"/g)]
      const msgIdMatches = [...html.matchAll(/data-post="[^"\/]*\/(\d+)"/g)]
      const msgStarts = [...html.matchAll(/class="tgme_widget_message_text[^"]*"/g)]
      const posts = []
      msgStarts.forEach((m, i) => {
        const openTag = html.indexOf('>', m.index + m[0].length) + 1
        if (openTag < 1) return
        const raw = html.slice(openTag, openTag + 2000)
        const text = raw
          .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
          .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
        if (text.length < 10) return
        const msgId = msgIdMatches[i]?.[1] || String(i)
        const ts = dateMatches[i]?.[1] || new Date().toISOString()
        posts.push({ msgId, text, ts, url: 'https://t.me/' + handle + '/' + msgId })
      })
      return res.status(200).json({ status: 'ok', handle, posts: posts.slice(0, parseInt(cnt)), count: posts.length })
    } catch (e) {
      return res.status(500).json({ error: e.message, posts: [] })
    }
  }

  // ── RSS / Atom feed mode ──────────────────────────────────────────────────
  const { url, count = 30 } = req.query
  if (!url) return res.status(400).json({ error: 'url param required' })

  try {
    const txt = await fetchURL(url)
    if (!txt) return res.status(502).json({ error: 'All fetch attempts failed for ' + url, items: [] })
    const parsed = parseRSS(txt, url).slice(0, parseInt(count))
    return res.status(200).json({ status: 'ok', items: parsed, count: parsed.length })
  } catch (e) {
    return res.status(500).json({ error: e.message, items: [] })
  }
}
