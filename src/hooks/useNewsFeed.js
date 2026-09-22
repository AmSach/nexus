import { useSupabaseData, isSupabaseConfigured } from './useSupabase'

function useNewsFeedFromSupabase() {
  const { articles } = useSupabaseData()
  return { articles, loading: false, lastFetch: new Date() }
}
/**
 * useNewsFeed — maximum throughput live feed
 *
 * Architecture:
 *   - 157 RSS feeds batched in parallel groups of 12
 *   - GDELT background refresh (4 topic queries, proxied)
 *   - Paid APIs (NewsAPI / GNews / AlphaVantage) throttled — 30-60min intervals
 *   - Dedup by title hash + URL hash
 *   - 2000 article cap (newest first)
 *   - Watchlist alerting on every refresh
 *
 * Refresh schedule:
 *   - RSS + GDELT: every 90 seconds
 *   - Paid APIs: every 30-60 min (via useApiQuota)
 */

import { cacheWrite, cacheRead, mergeArticles } from '../utils/cache'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { RSS_FEEDS } from '../data/rss_feeds'
import { SEED_NEWS_ARTICLES } from '../data/newsSeed'
import { classifyCat, classifySev, classifyRegion, extractTags, extractEntities, hashId } from '../utils/classify'
import { useStore } from '../store'
import { shouldRefreshApi, markApiCalled } from './useApiQuota'

// Re-export so App can import


// Env key resolver
export function getEnvKeys() {
  return {
    groq:         import.meta.env.VITE_GROQ_KEY         || '',
    newsapi:      import.meta.env.VITE_NEWSAPI_KEY       || '',
    gnews:        import.meta.env.VITE_GNEWS_KEY         || '',
    alphavantage: import.meta.env.VITE_ALPHAVANTAGE_KEY  || '',
    exchangerate: import.meta.env.VITE_EXCHANGERATE_KEY  || '',
    newsdata:     import.meta.env.VITE_NEWSDATA_KEY      || '',
  }
}

const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
]

// ── RSS parser ────────────────────────────────────────────────────────────────
function parseXML(xmlStr, src, defaultCat) {
  try {
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml')
    const items = doc.querySelectorAll('item, entry')
    return Array.from(items).slice(0, 15).map(el => {
      const g = (...sels) => {
        for (const s of sels) {
          const n = el.querySelector(s)
          if (n) return (n.textContent || n.getAttribute('href') || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim()
        }
        return ''
      }
      const title   = g('title')
      const desc    = g('description', 'summary', 'content\\:encoded', 'content')
      const link    = g('link', 'id', 'guid')
      const pubDate = g('pubDate', 'published', 'updated', 'dc\\:date')
      if (!title || title.length < 6) return null
      const clean = desc.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').slice(0, 600).trim()
      const combo = (title + ' ' + clean).toLowerCase()
      let pub; try { pub = pubDate ? new Date(pubDate) : new Date() } catch { pub = new Date() }
      if (isNaN(pub)) pub = new Date()
      return {
        id:       hashId(link || title) + src.slice(0, 3),
        title:    title.slice(0, 220),
        summary:  clean,
        source:   src,
        url:      link || '#',
        category: classifyCat(combo, defaultCat),
        severity: classifySev(combo),
        region:   classifyRegion(combo),
        tags:     extractTags(combo),
        entities: extractEntities(title, clean),
        pub:      pub,
        _live:    true,
      }
    }).filter(Boolean)
  } catch { return [] }
}


// ── Auto-translate non-English titles ────────────────────────────────────
// RATE-SAFE: MyMemory free = 1000 req/day. We ONLY translate non-ASCII titles.
// Budget: ~5% of RSS titles are non-Latin = ~300/day, well under limit.
const translationCache = new Map()
let translateCallsThisSession = 0
const MAX_TRANSLATE_PER_SESSION = 8  // strict cap per page load to avoid connection pool exhaustion

function detectLang(text) {
  // Detect script from char ranges — more reliable than MyMemory autodetect
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return 'zh'     // CJK
  if (/[\u0600-\u06ff\u0750-\u077f]/.test(text)) return 'ar'     // Arabic
  if (/[\u0400-\u04ff]/.test(text)) return 'ru'                    // Cyrillic
  if (/[\u0900-\u097f]/.test(text)) return 'hi'                    // Devanagari
  if (/[\u3040-\u30ff]/.test(text)) return 'ja'                    // Japanese
  if (/[\uac00-\ud7af]/.test(text)) return 'ko'                    // Korean
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th'                    // Thai
  if (/[\u0370-\u03ff]/.test(text)) return 'el'                    // Greek
  if (/[\u05d0-\u05ea]/.test(text)) return 'he'                    // Hebrew
  return null
}

async function autoTranslate(text) {
  // Preserve original title immediately; avoid unprompted network translation socket exhaustion
  return text
}

async function fetchFeed(feed) {
  // Primary: server-side /api/rss endpoint with fast 6s timeout
  try {
    const r = await fetch('/api/rss?url=' + encodeURIComponent(feed.url) + '&count=25', {
      signal: AbortSignal.timeout(6000)
    })
    if (r.ok) {
      const resp = await r.json().catch(() => null)
      const items = Array.isArray(resp) ? resp : (resp?.items || resp?.data || [])
      if (Array.isArray(items) && items.length > 0) {
        return items.map(item => {
          const rawTitle = (item.title || '').replace(/<[^>]+>/g, '').trim()
          if (!rawTitle || rawTitle.length < 5) return null
          let pub; try { pub = item.pubDate ? new Date(item.pubDate) : new Date() } catch { pub = new Date() }
          if (isNaN(pub)) pub = new Date()
          const combo = (rawTitle + ' ' + (item.description || '')).toLowerCase()
          return {
            id: hashId(rawTitle + (item.link || '')),
            title: rawTitle,
            summary: (item.description || '').replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').slice(0, 400),
            source: feed.src,
            url: item.link || '#',
            category: classifyCat(combo, feed.cat),
            severity: classifySev(combo),
            region: classifyRegion(combo),
            tags: extractTags(combo),
            pub,
            _live: true,
          }
        }).filter(Boolean)
      }
    }
  } catch {}

  // Single fast CORS proxy fallback with 4s timeout (no cascading 32s delay!)
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(feed.url)}`
    const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) return []
    const j = await r.json().catch(() => null)
    const rawContent = j?.contents || j?.body || j?.data || ''
    if (rawContent && rawContent.length > 100 && !rawContent.trim().startsWith('<html')) {
      return parseXML(rawContent, feed.src, feed.cat)
    }
  } catch {}
  return []
}

// ── GDELT background — bundled single query to prevent HTTP 429 rate limit ──
async function fetchGDELTBackground() {
  const query = 'conflict OR war OR military OR airstrike OR missile OR sanctions OR cyberattack'
  try {
    const url = `/api/gdelt?q=${encodeURIComponent(query)}&maxrecords=50&timespan=24h&sort=DateDesc`
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return []
    const d = await r.json().catch(() => null)
    if (!d?.articles?.length) return []
    return d.articles.map(a => {
      if (!a?.title) return null
      const combo = ((a.title || '') + ' ' + (a.domain || '')).toLowerCase()
      const pubStr = (a.seendate || '').replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z')
      let pub; try { pub = pubStr ? new Date(pubStr) : new Date() } catch { pub = new Date() }
      return {
        id: hashId((a.url || a.title || '') + 'gd'),
        title: (a.title || '').slice(0, 220),
        summary: a.socialimage || '',
        source: a.domain || 'GDELT',
        url: a.url || '#',
        category: classifyCat(combo, 'conflict'),
        severity: classifySev(combo),
        region: classifyRegion(combo),
        tags: extractTags(combo),
        pub,
        _live: true, _gdelt: true,
      }
    }).filter(Boolean)
  } catch { return [] }
}

// ── Paid API fetchers (throttled) ─────────────────────────────────────────────
async function fetchNewsAPI(key) {
  if (!key) return []
  try {
    const queries = [
      `https://newsapi.org/v2/top-headlines?language=en&pageSize=40&apiKey=${key}`,
      `https://newsapi.org/v2/everything?q=war+conflict+military+sanctions+coup&sortBy=publishedAt&pageSize=30&language=en&apiKey=${key}`,
      `https://newsapi.org/v2/everything?q=election+diplomacy+nuclear+espionage&sortBy=publishedAt&pageSize=20&language=en&apiKey=${key}`,
      `https://newsapi.org/v2/everything?q=pandemic+earthquake+climate+disaster&sortBy=publishedAt&pageSize=20&language=en&apiKey=${key}`,
    ]
    const results = await Promise.allSettled(queries.map(u => fetch(u, { signal: AbortSignal.timeout(8000) }).then(r => r.json())))
    return results.flatMap(r => {
      if (r.status !== 'fulfilled' || !r.value?.articles) return []
      return r.value.articles.map(a => {
        const combo = ((a.title || '') + ' ' + (a.description || '')).toLowerCase()
        let pub; try { pub = a.publishedAt ? new Date(a.publishedAt) : new Date() } catch { pub = new Date() }
        return {
          id: hashId(a.url || a.title || '') + 'na',
          title: (a.title || '').slice(0, 220),
          summary: a.description || '',
          source: a.source?.name || 'NewsAPI',
          url: a.url || '#',
          category: classifyCat(combo, 'politics'),
          severity: classifySev(combo),
          region:   classifyRegion(combo),
          tags:     extractTags(combo),
          entities: extractEntities(a.title || '', a.description || ''),
          pub:      isNaN(pub) ? new Date() : pub,
          _live: true,
        }
      }).filter(a => a.title.length > 6)
    })
  } catch { return [] }
}

async function fetchGNews(key) {
  if (!key) return []
  try {
    const topics = ['world', 'nation', 'business', 'technology', 'health']
    const results = await Promise.allSettled(
      topics.map(t => fetch(`https://gnews.io/api/v4/top-headlines?topic=${t}&lang=en&max=15&token=${key}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()))
    )
    return results.flatMap(r => {
      if (r.status !== 'fulfilled' || !r.value?.articles) return []
      return r.value.articles.map(a => {
        const combo = ((a.title || '') + ' ' + (a.description || '')).toLowerCase()
        let pub; try { pub = a.publishedAt ? new Date(a.publishedAt) : new Date() } catch { pub = new Date() }
        return {
          id: hashId(a.url || '') + 'gn',
          title: (a.title || '').slice(0, 220),
          summary: a.description || '',
          source: a.source?.name || 'GNews',
          url: a.url || '#',
          category: classifyCat(combo, 'politics'),
          severity: classifySev(combo),
          region:   classifyRegion(combo),
          tags:     extractTags(combo),
          entities: extractEntities(a.title || '', a.description || ''),
          pub:      isNaN(pub) ? new Date() : pub,
          _live: true,
        }
      }).filter(a => a.title.length > 6)
    })
  } catch { return [] }
}

async function fetchNewsData(key) {
  if (!key) return []
  try {
    const queries = ['war military conflict', 'election coup sanctions', 'nuclear missile Iran', 'cyber attack hack']
    const results = await Promise.allSettled(
      queries.map(q => fetch(`https://newsdata.io/api/1/latest?apikey=${key}&q=${encodeURIComponent(q)}&language=en&size=10`, { signal: AbortSignal.timeout(9000) }).then(r => r.json()))
    )
    return results.flatMap(r => {
      if (r.status !== 'fulfilled' || !r.value?.results) return []
      return r.value.results.map(a => {
        const body  = a.content || a.full_description || a.description || ''
        const combo = ((a.title || '') + ' ' + body).toLowerCase()
        let pub; try { pub = a.pubDate ? new Date(a.pubDate) : new Date() } catch { pub = new Date() }
        return {
          id: hashId(a.link || a.title || '') + 'nd',
          title: (a.title || '').slice(0, 220),
          summary: body.slice(0, 600),
          source: a.source_id ? a.source_id.replace(/_/g, ' ') : 'NewsData',
          url: a.link || '#',
          category: classifyCat(combo, 'politics'),
          severity: classifySev(combo),
          region:   classifyRegion(combo),
          tags:     extractTags(combo),
          entities: extractEntities(a.title || '', body),
          pub:      isNaN(pub) ? new Date() : pub,
          _live: true,
        }
      }).filter(a => a.title.length > 6)
    })
  } catch { return [] }
}

// ── Dedup ─────────────────────────────────────────────────────────────────────
function dedup(arts) {
  const ids     = new Set()
  const seenNgrams = new Set()
  const countryCounts = {}
  
  // Extract key noun phrases (3-gram fingerprint)
  const fingerprint = (title) => {
    const words = title.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 3 && !/^(that|this|with|from|have|been|they|will|were|more|than|when|also|into|over|after|before|about|their|there|these|those|could|would|should|which|while|where|other|first|being|since|until|within|during|against)$/.test(w))
    // Create 3-grams as fingerprint
    const grams = []
    for (let i = 0; i < words.length - 2; i++) grams.push(words.slice(i,i+3).join('_'))
    return grams
  }

  return arts.filter(a => {
    if (!a?.title) return false
    if (ids.has(a.id)) return false
    
    const grams = fingerprint(a.title)
    // Check if 2+ trigrams already seen = likely same story
    const matches = grams.filter(g => seenNgrams.has(g)).length
    if (matches >= 2) return false
    
    // Geographic diversity cap: max 8 articles per country/region
    const region = (a.region || a.source || 'Global').slice(0, 20)
    countryCounts[region] = (countryCounts[region] || 0) + 1
    if (countryCounts[region] > 50) return false  // generous cap for global coverage
    
    ids.add(a.id)
    grams.forEach(g => seenNgrams.add(g))
    return true
  })
}

// ── Main hook ─────────────────────────────────────────────────────────────────

// ── GDELT Geo-focused query — bundled query via /api/gdelt to prevent HTTP 429 rate limit ──
async function fetchGDELTGeo() {
  try {
    const q = '(Ukraine OR Kyiv OR Kharkiv) OR (Gaza OR Rafah OR Hamas OR IDF) OR (Yemen OR Houthi OR "Red Sea") OR (Sudan OR RSF) OR (Lebanon OR Hezbollah) OR (Taiwan OR PLA) OR (Iran OR IRGC)'
    const url = `/api/gdelt?q=${encodeURIComponent(q)}&maxrecords=50&timespan=24h&sort=DateDesc`
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return []
    const d = await r.json().catch(() => null)
    if (!d?.articles?.length) return []
    return d.articles.map(a => {
      if (!a?.title) return null
      const combo = ((a.title || '') + ' ' + (a.domain || '')).toLowerCase()
      const pubStr = (a.seendate || '').replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z')
      let pub; try { pub = pubStr ? new Date(pubStr) : new Date() } catch { pub = new Date() }
      return {
        id:       hashId((a.url || a.title || '') + 'geo'),
        title:    (a.title || '').slice(0, 220),
        summary:  a.socialimage || '',
        source:   a.domain || 'GDELT/Geo',
        url:      a.url || '#',
        category: 'conflict',
        severity: classifySev(combo),
        region:   classifyRegion(combo),
        tags:     extractTags(combo),
        pub,
        _live: true, _gdelt: true, _geo: true,
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}

function useNewsFeedLegacy() {
  const { keys, watchlist, pushAlert } = useStore()
  const envKeys = getEnvKeys()
  const resolvedKeys = {
    newsapi:      envKeys.newsapi      || keys.newsapi      || '',
    gnews:        envKeys.gnews        || keys.gnews        || '',
    alphavantage: envKeys.alphavantage || keys.alphavantage || '',
    newsdata:     envKeys.newsdata     || keys.newsdata     || '',
  }

  // Initialize immediately from cache or verified fresh seed news — zero empty screen!
  const [articles, setArticles] = useState(() => {
    const cached = cacheRead('articles')
    if (cached?.data?.length) {
      return cached.data.map(a => ({ ...a, pub: a.pub ? new Date(a.pub) : new Date() }))
    }
    return (SEED_NEWS_ARTICLES || []).map(a => ({ ...a, pub: a.pub ? new Date(a.pub) : new Date() }))
  })

  const [loading,  setLoading]  = useState(false)
  const [synced,   setSynced]   = useState(null)
  const [status,   setStatus]   = useState({})
  const prevHits   = useRef(new Set())
  const mounted    = useRef(true)
  const busy       = useRef(false)

  useEffect(() => () => { mounted.current = false }, [])

  const fetchAll = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    const st = {}

    try {
      // ── 1. RSS feeds — prioritized progressive loading ─────────────────────
      // Top 12 priority global feeds (Reuters, AP, BBC, NYT, Al Jazeera, etc.)
      const PRIORITY_FEEDS = RSS_FEEDS.slice(0, 12)
      const secondaryFeeds = RSS_FEEDS.slice(12, 30)
      const rotatingFeeds  = RSS_FEEDS.slice(30)
      const rotateStart    = (Math.floor(Date.now() / (3 * 60 * 1000)) * 20) % Math.max(1, rotatingFeeds.length)
      const extra          = rotatingFeeds.slice(rotateStart, rotateStart + 20)
      const thisRound      = [...secondaryFeeds, ...extra]

      const rssArts = []

      // BATCH 1 (Instant): Fetch top 12 priority feeds in parallel (~1.2s total)
      const p1Results = await Promise.allSettled(PRIORITY_FEEDS.map(f => fetchFeed(f)))
      p1Results.forEach((r, j) => {
        if (r.status === 'fulfilled' && r.value?.length > 0) {
          st[PRIORITY_FEEDS[j].src] = r.value.length
          rssArts.push(...r.value)
        }
      })

      // PROGRESSIVE COMMIT: Commit first 12 feeds IMMEDIATELY (< 1.5s total time!)
      if (rssArts.length > 0 && mounted.current) {
        const cached = cacheRead('articles')
        const cachedArts = cached?.data?.map(a => ({...a, pub: a.pub ? new Date(a.pub) : new Date()})) || []
        const interim = dedup(mergeArticles(rssArts, cachedArts.length ? cachedArts : SEED_NEWS_ARTICLES, 10000))
          .sort((a, b) => new Date(b.pub||0) - new Date(a.pub||0))
          .slice(0, 10000)
        setArticles(interim)
        setLoading(false)
        setSynced(new Date())
      }

      // BATCH 2: Remaining secondary & rotating feeds in background
      const BATCH = 12
      for (let i = 0; i < thisRound.length; i += BATCH) {
        const batch = thisRound.slice(i, i + BATCH)
        const batchResults = await Promise.allSettled(batch.map(f => fetchFeed(f)))
        batchResults.forEach((r, j) => {
          if (r.status === 'fulfilled' && r.value?.length > 0) {
            st[batch[j].src] = r.value.length
            rssArts.push(...r.value)
          }
        })
        if (i + BATCH < thisRound.length) await new Promise(r => setTimeout(r, 150))
      }

      // ── 2. GDELT — 6 topic queries, always runs ──────────────────────────
      const [gdeltArts, gdeltGeoArts] = await Promise.all([fetchGDELTBackground(), fetchGDELTGeo()])
      if (gdeltArts.length) st['GDELT'] = gdeltArts.length
      if (gdeltGeoArts.length) st['GDELT-GEO'] = gdeltGeoArts.length

      // ── 3. Paid APIs — throttled ─────────────────────────────────────────
      let naArts = [], gnArts = [], ndArts = []

      if (resolvedKeys.newsapi && shouldRefreshApi('newsapi')) {
        naArts = await fetchNewsAPI(resolvedKeys.newsapi)
        if (naArts.length) { markApiCalled('newsapi'); st['NewsAPI'] = naArts.length }
      }
      if (resolvedKeys.gnews && shouldRefreshApi('gnews')) {
        gnArts = await fetchGNews(resolvedKeys.gnews)
        if (gnArts.length) { markApiCalled('gnews'); st['GNews'] = gnArts.length }
      }
      if (resolvedKeys.newsdata && shouldRefreshApi('newsdata')) {
        ndArts = await fetchNewsData(resolvedKeys.newsdata)
        if (ndArts.length) { markApiCalled('newsdata'); st['NewsData'] = ndArts.length }
      }

      // ── 4. Merge, dedup, sort, cap ───────────────────────────────────────
      // Note: ACLED data is fetched separately in useACLED hook for the map view.
      // It does not belong in the news feed pipeline (different data format + no import here).
      const acledArts = []  // placeholder — never populated here
      // Pull new intelligence sources from satellite cache and convert to articles
      let intelArts = []
      try {
        const satCache = cacheRead('satellite')
        const sat = satCache?.data
        if (sat) {
          // Telegram OSINT posts
          ;(sat.telegramPosts||[]).forEach(p => {
            intelArts.push({
              id: hashId((p.url||p.title||'') + 'tg'),
              title: p.title || '[Telegram]',
              summary: p.description || '',
              source: p.source || 'Telegram OSINT',
              url: p.url || '',
              pub: p.date ? new Date(p.date) : new Date(),
              category: 'conflict', severity: p.severity || 'high',
              region: 'Global', tags: ['telegram','osint','conflict'],
              lat: p.lat, lng: p.lng, _telegram: true,
            })
          })
          // Wikipedia conflict page edits
          ;(sat.wikiEdits||[]).forEach(w => {
            intelArts.push({
              id: hashId((w.url||w.page||'') + 'wiki'),
              title: `Wikipedia edited: ${w.page}`,
              summary: `Edit by ${w.user}: ${w.comment?.slice(0,200)||''}`,
              source: 'Wikipedia Edits',
              url: w.url || '',
              pub: w.timestamp ? new Date(w.timestamp) : new Date(),
              category: 'conflict', severity: 'low',
              region: 'Global', tags: ['wikipedia','osint'],
              _wiki: true,
            })
          })
          // BGP routing anomalies
          ;(sat.bgpAnomalies||[]).forEach(b => {
            intelArts.push({
              id: hashId((b.url||b.title||'') + 'bgp'),
              title: b.title || '[BGP Anomaly]',
              summary: b.description || '',
              source: b.source || 'BGP Stream',
              url: b.url || '',
              pub: b.date ? new Date(b.date) : new Date(),
              category: 'cyber', severity: b.severity || 'medium',
              region: 'Global', tags: ['bgp','routing','cyber'],
              _bgp: true,
            })
          })
          // Military NOTAMs
          ;(sat.notams||[]).filter(n=>n.isMilitary).forEach(n => {
            intelArts.push({
              id: hashId((n.title||'') + 'notam'),
              title: n.title || '[NOTAM]',
              summary: n.description || '',
              source: n.source || 'FAA NOTAM',
              url: n.url || 'https://notams.faa.gov',
              pub: n.date ? new Date(n.date) : new Date(),
              category: 'conflict', severity: 'high',
              region: 'Global', tags: ['notam','military','airspace'],
              lat: n.lat, lng: n.lng, _notam: true,
            })
          })
        }
      } catch {}

      const all = dedup([...rssArts, ...gdeltArts, ...gdeltGeoArts, ...naArts, ...gnArts, ...ndArts, ...acledArts, ...intelArts])
        .filter(a => a.title.length > 6)
        .sort((a, b) => b.pub - a.pub)
        .slice(0, 10000)  // 10000 article cap

      if (!mounted.current) return

      if (all.length > 0) {
        // Merge new articles with existing cached ones - never lose old news
        const cached = cacheRead('articles')
        const cachedArts = cached?.data?.map(a => ({...a, pub: a.pub ? new Date(a.pub) : new Date()})) || []
        // Actively dedup merged cache with trigram fingerprint — prevents cache bloat
        const merged = dedup(mergeArticles(all, cachedArts, 10000))
          .sort((a, b) => new Date(b.pub||0) - new Date(a.pub||0))
          .slice(0, 10000)
        setArticles(merged)
        cacheWrite('articles', merged.map(a => ({...a, pub: a.pub instanceof Date ? a.pub.toISOString() : a.pub})), 10000)
        setSynced(new Date())

        // Watchlist alerts
        all.slice(0, 500).forEach(art => {
          const combo = (art.title + ' ' + art.summary).toLowerCase()
          watchlist.forEach(term => {
            const key = `${art.id}:${term}`
            if (combo.includes(term.toLowerCase()) && !prevHits.current.has(key)) {
              prevHits.current.add(key)
              pushAlert?.({ term, title: art.title, source: art.source, severity: art.severity })
            }
          })
        })
      }
      setStatus(st)
    } catch (e) {
      console.warn('fetchAll error:', e)
    } finally {
      if (mounted.current) setLoading(false)
      busy.current = false
    }
  }, [resolvedKeys.newsapi, resolvedKeys.gnews, resolvedKeys.newsdata, watchlist, pushAlert])

  // Initial fetch + 90-second interval
  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 3 * 60 * 1000)   // 3min refresh — balanced for live coverage
    return () => clearInterval(iv)
  }, [fetchAll])

  // ── Twitter breaking news (only if backend proxy configured) ─────────────────
  const [twitterArts, setTwitterArts] = useState([])
  const fetchTwitter = useCallback(async () => {
    // Twitter v2 API strictly blocks client-side browser requests via CORS (no Access-Control-Allow-Origin).
    // Avoid firing failing preflight requests that consume network thread cycles.
  }, [])

  useEffect(() => {
    fetchTwitter()
  }, [fetchTwitter])

  const allArticles = useMemo(() => {
    const seen = new Set(articles.map(a => a.id))
    const fresh = twitterArts.filter(a => !seen.has(a.id))
    return [...fresh, ...articles].sort((a,b) => (b.pub||0) - (a.pub||0))
  }, [articles, twitterArts])

  return { articles: allArticles, loading, synced, status, refetch: fetchAll, translating: loading && translateCallsThisSession > 0, translateCount: translateCallsThisSession }
}

// FX rates
export function useFX(key) {
  const [rates, setRates] = useState(null)
  const envKey = import.meta.env.VITE_EXCHANGERATE_KEY || key
  useEffect(() => {
    if (!envKey) return
    fetch(`https://v6.exchangerate-api.com/v6/${envKey}/latest/USD`)
      .then(r => r.json())
      .then(d => { if (d?.conversion_rates) setRates(d.conversion_rates) })
      .catch(() => {})
    const iv = setInterval(() => {
      fetch(`https://v6.exchangerate-api.com/v6/${envKey}/latest/USD`)
        .then(r => r.json())
        .then(d => { if (d?.conversion_rates) setRates(d.conversion_rates) })
        .catch(() => {})
    }, 60 * 60 * 1000)
    return () => clearInterval(iv)
  }, [envKey])
  return rates
}

export function useNewsFeed() {
  // Always call both hooks (React rules require unconditional calls)
  // isSupabaseConfigured() is constant at module load time (env vars don't change)
  const sbResult  = useNewsFeedFromSupabase()
  const legResult = useNewsFeedLegacy()
  if (isSupabaseConfigured() && sbResult.articles && sbResult.articles.length > 0) {
    return {
      ...legResult,
      ...sbResult,
      articles: sbResult.articles,
      refetch: legResult.refetch,
    }
  }
  return legResult
}
