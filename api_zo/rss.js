// /api/rss — zo.space serverless RSS/Atom parser
// Handles RSS 2.0, Atom 1.0, and t.me/s/ Telegram scraping.
// Direct fetch — no allorigins, no proxy needed from server-side.
export default async (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')

  // ── Telegram t.me/s/ scrape mode ─────────────────────────────────────────
  if (c.req.query('mode') === 'tme') {
    const handle = c.req.query('handle')
    const cnt = parseInt(c.req.query('count') || '20')
    if (!handle) return c.json({ error: 'handle required' }, 400)
    try {
      const r = await fetch('https://t.me/s/' + handle, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'follow', signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) return c.json({ error: 'Telegram ' + r.status, posts: [] }, r.status)
      const html = await r.text()
      const dateMatches = [...html.matchAll(/datetime="([^"]+)"/g)]
      const msgIdMatches = [...html.matchAll(/data-post="[^"\/]*\/(\d+)"/g)]
      const msgStarts = [...html.matchAll(/class="tgme_widget_message_text[^"]*"/g)]
      const posts = []
      msgStarts.forEach((m, i) => {
        const openTag = html.indexOf('>', m.index + m[0].length) + 1
        if (openTag < 1) return
        const raw = html.slice(openTag, openTag + 2000)
        const text = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
        if (text.length < 10) return
        posts.push({ msgId: msgIdMatches[i]?.[1] || String(i), text, ts: dateMatches[i]?.[1] || new Date().toISOString(), url: 'https://t.me/' + handle + '/' + (msgIdMatches[i]?.[1] || '') })
      })
      return c.json({ status: 'ok', handle, posts: posts.slice(0, cnt), count: posts.length })
    } catch (e) { return c.json({ error: e.message, posts: [] }, 500) }
  }

  const url = c.req.query('url')
  const count = parseInt(c.req.query('count') || '30')
  if (!url) return c.json({ error: 'url param required' }, 400)

  // ── Fetch with rotating UA ────────────────────────────────────────────────
  const UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    'Feedly/1.0 (+http://www.feedly.com/fetcher.html; like FeedFetcher-Google)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  ]

  let txt = null
  for (const ua of UAS) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': ua, 'Accept': 'application/rss+xml,application/xml,text/xml,application/atom+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9', 'Cache-Control': 'no-cache' },
        redirect: 'follow', signal: AbortSignal.timeout(12000),
      })
      if (!r.ok) continue
      const t = await r.text().catch(() => '')
      if (t && t.length > 100) { txt = t; break }
    } catch {}
  }
  if (!txt) return c.json({ error: 'All fetch attempts failed for ' + url, items: [] }, 502)

  // ── Parse ─────────────────────────────────────────────────────────────────
  const host = (() => { try { return new URL(url).hostname.replace(/^(www\.|feeds\.)/, '') } catch { return url.slice(0, 30) } })()

  // FIXED: use string concatenation for regex (avoids template literal escaping bug)
  function xmlTag(str, tag) {
    const re = new RegExp('<' + tag + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + tag + '>', 'i')
    const m = str?.match(re)
    return m?.[1]?.replace(/<[^>]+>/g, '').trim() || ''
  }

  // JSON Feed (RFC 7265)
  if (txt.trimStart().startsWith('{')) {
    try {
      const j = JSON.parse(txt)
      const feedItems = j.items || j.entries || []
      const items = feedItems.slice(0, count).map(item => {
        const title = (item.title || item.summary || '').replace(/<[^>]+>/g, '').trim()
        if (!title || title.length < 3) return null
        return {
          title, url: item.url || item.external_url || item.id || '',
          date: item.date_published || item.date_modified || '',
          description: (item.content_text || item.content_html || item.summary || '').replace(/<[^>]+>/g, '').slice(0, 400),
          source: host,
        }
      }).filter(Boolean)
      return c.json({ status: 'ok', items, count: items.length })
    } catch {}
  }

  // XML (RSS or Atom)
  const isAtom = /<feed[\s>]/i.test(txt)
  const itemRe = isAtom ? /<entry[^>]*>([\s\S]*?)<\/entry>/gi : /<item>([\s\S]*?)<\/item>/gi
  const matches = [...txt.matchAll(itemRe)]

  // Handle self-closing <link>URL</link> vs <link href="URL"/>
  function extractLink(b) {
    // Attribute形式: <link href="URL" ...>
    const href = b.match(/<link[^>]*href="([^"]+)"/i)?.[1]
    if (href) return href.trim()
    // Text content: <link>URL</link> or self-closing <link/>
    const m = b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)
    if (m?.[1]) {
      const val = m[1].replace(/<[^>]+>/g, '').trim()
      if (val && val.length > 3) return val
    }
    // Self-closing or empty: try content after > until newline or <
    const after = b.match(/<link[^>]*>\s*([^\n\r<]{5,})/i)?.[1]
    if (after) return after.trim()
    return ''
  }

  const items = []
  for (const m of matches.slice(0, count)) {
    const b = m[1]
    const title = xmlTag(b, 'title') || xmlTag(b, 'summary')
    if (!title || title.length < 3) continue
    const link = extractLink(b) || xmlTag(b, 'guid') || xmlTag(b, 'id')
    const date = xmlTag(b, 'pubDate') || xmlTag(b, 'published') || xmlTag(b, 'updated') || xmlTag(b, 'dc:date') || ''
    const descRaw = xmlTag(b, 'content:encoded') || xmlTag(b, 'description') || xmlTag(b, 'content') || xmlTag(b, 'summary') || ''
    const description = descRaw.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim().slice(0, 400)
    items.push({ title, url: link, date, description, source: host })
  }

  return c.json({ status: 'ok', items, count: items.length })
}