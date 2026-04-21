// /api/rss — NEXUS RSS Proxy
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'FeedBurner/1.0 (http://www.FeedBurner.com)',
]
const randUA = () => UAS[Math.floor(Math.random() * UAS.length)]
const getXMLTag = (str, tag) => str?.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.replace(/<[^>]+>/g, '').trim() || ''
function parseRSS(txt, sourceUrl) {
  const host = (() => { try { return new URL(sourceUrl).hostname.replace(/^(www\\.|feeds\\.)/, '') } catch { return sourceUrl.slice(0, 30) } })()
  if (txt.trimStart().startsWith('{')) {
    try {
      const j = JSON.parse(txt)
      return (j.items || j.entries || []).slice(0, 30).map(item => ({
        title: (item.title || item.summary || '').replace(/<[^>]+>/g, '').trim(),
        link: item.url || item.external_url || item.id || '',
        pubDate: item.date_published || item.date_modified || '',
        description: (item.content_text || item.content_html || item.summary || '').replace(/<[^>]+>/g, '').slice(0, 400),
        source: host
      })).filter(Boolean)
    } catch {}
  }
  const isAtom = /<feed[\s>]/i.test(txt)
  const itemRe = isAtom ? /<entry[^>]*>([\s\S]*?)<\/entry>/gi : /<item>([\s\S]*?)<\/item>/gi
  return [...txt.matchAll(itemRe)].map(m => {
    const b = m[1]
    const title = getXMLTag(b, 'title') || getXMLTag(b, 'summary')
    if (!title || title.length < 3) return null
    const linkMatch = b.match(/<link[^>]*href="([^"]+)"/i) || b.match(/<link[^>]*>\s*([^<]{10,})<\/link>/i)
    const link = linkMatch?.[1]?.trim() || getXMLTag(b, 'guid') || getXMLTag(b, 'id') || ''
    return {
      title, link,
      pubDate: getXMLTag(b, 'pubDate') || getXMLTag(b, 'published') || getXMLTag(b, 'updated') || '',
      description: (getXMLTag(b, 'content:encoded') || getXMLTag(b, 'description') || getXMLTag(b, 'content') || getXMLTag(b, 'summary') || '').replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').trim().slice(0, 400),
      source: host
    }
  }).filter(Boolean)
}
async function fetchURL(url) {
  for (const ua of UAS) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': ua, 'Accept': 'application/rss+xml,application/xml,text/xml,application/atom+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9', 'Cache-Control': 'no-cache' },
        redirect: 'follow', signal: AbortSignal.timeout(12000),
      })
      if (!r.ok) continue
      const txt = await r.text().catch(() => '')
      if (txt && txt.length > 100) return txt
    } catch {}
  }
  return null
}
export default async (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  if (c.req.query('mode') === 'tme') {
    const handle = c.req.query('handle')
    const cnt = parseInt(c.req.query('count') || '20')
    if (!handle) return c.json({ error: 'handle required' }, 400)
    try {
      const r = await fetch('https://t.me/s/' + handle, {
        headers: { 'User-Agent': UAS[0], 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
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
  try {
    const txt = await fetchURL(url)
    if (!txt) return c.json({ error: 'All fetch attempts failed for ' + url, items: [] }, 502)
    const parsed = parseRSS(txt, url).slice(0, count)
    return c.json({ status: 'ok', items: parsed, count: parsed.length })
  } catch (e) { return c.json({ error: e.message, items: [] }, 500) }
}
