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
const MAX_TRANSLATE_PER_SESSION = 200  // hard cap per page load

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
  if (!text || text.length < 5) return text
  // Fast path: skip if mostly ASCII (English/French/German/Spanish etc.)
  const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length
  if (nonAscii / text.length < 0.25) return text  // only CJK/Arabic/Cyrillic/etc.
  if (translateCallsThisSession >= MAX_TRANSLATE_PER_SESSION) return text
  const cacheKey = text.slice(0, 60)
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)
  const srcLang = detectLang(text) || 'ru'  // default Cyrillic if undetected
  translateCallsThisSession++
  try {
    const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 200)) + '&langpair=' + srcLang + '|en', { signal: AbortSignal.timeout(2000) })
    if (!r.ok) return text
    const d = await r.json()
    const t = d?.responseData?.translatedText
    if (t && t.length > 5 && t !== text && !t.includes('MYMEMORY')) {
      translationCache.set(cacheKey, t + ' [tr]')
      return t + ' [tr]'
    }
  } catch {}
  return text
}

async function fetchFeed(feed, proxyIdx = 0) {
  // Primary: server-side /api/rss endpoint — no CORS restrictions on Vercel
  // This is the ONLY reliable path. Public proxies (allorigins, corsproxy) are
  // blocked by most news sites and frequently rate-limited.
  try {
    const r = await fetch('/api/rss?url=' + encodeURIComponent(feed.url) + '&count=30', {
      signal: AbortSignal.timeout(12000)
    })
    if (r.ok) {
      const resp = await r.json().catch(() => null)
      if (!resp) throw new Error('bad json')
      // /api/rss returns {status, items, count} — items is the array we need
      const items = Array.isArray(resp) ? resp : (resp.items || resp.data || [])
      if (Array.isArray(items) && items.length > 0) {
        const parsed = await Promise.all(items.map(async item => {
          const rawTitle = (item.title || '').replace(/<[^>]+>/g, '').trim()
          if (!rawTitle || rawTitle.length < 5) return null
          const title = await autoTranslate(rawTitle)
          let pub; try { pub = item.pubDate ? new Date(item.pubDate) : new Date() } catch { pub = new Date() }
          if (isNaN(pub)) pub = new Date()
          const combo = (title + ' ' + (item.description || '')).toLowerCase()
          return {
            id: hashId(rawTitle + (item.link || '')),
            title,
            originalTitle: rawTitle !== title ? rawTitle : undefined,
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
        }))
        return parsed.filter(Boolean)
      }
      // /api/rss returned empty — feed is dead or currently empty, don't try proxies
      // (proxy would hit same dead endpoint from browser = worse result)
      return []
    }
    // /api/rss returned non-OK status (502 = upstream failed) — try client-side proxy
    if (r.status !== 502) return []
  } catch { /* timeout or network error — fall through to proxy */ }

  // Proxy fallback: only for feeds where /api/rss timed out or had a network error
  // allorigins.win is most reliable for XML feeds; corsproxy.io for others
  if (proxyIdx >= PROXIES.length) return []
  try {
    const proxyUrl = PROXIES[proxyIdx](feed.url)
    const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json().catch(() => null)
    if (!j) throw new Error('bad json')
    const rawContent = j.contents || j.body || j.data || ''
    if (!rawContent || rawContent.length < 100) throw new Error('empty')
    // Validate it's XML, not an HTML error page
    if (rawContent.trim().startsWith('<html') || rawContent.trim().startsWith('<!DOCTYPE')) throw new Error('got html')
    return parseXML(rawContent, feed.src, feed.cat)
  } catch {
    return proxyIdx < PROXIES.length - 1 ? fetchFeed(feed, proxyIdx + 1) : []
  }
}

// ── GDELT background — routed through /api/gdelt (server-side, no CORS issues) ──
// Old version called gdeltproject.org directly from browser → CORS blocked on most queries.
// Now: all GDELT calls go server-side via /api/gdelt which has no CORS restrictions.
// Queries cover all major hotspots and event categories for maximum coverage.
async function fetchGDELTBackground() {
  // Priority queries — most important conflict/geo topics first
  const queries = [
    // Active war zones (highest priority)
    'Ukraine Russia Donbas Kursk Kharkiv frontline',
    'Gaza Rafah West Bank IDF Hamas ceasefire',
    'Yemen Houthi Red Sea shipping attack',
    'Lebanon Hezbollah Israeli airstrike',
    'Sudan Khartoum RSF civil war',
    'Myanmar junta resistance army offensive',
    'Sahel Mali Burkina Niger coup junta',
    // WMD + nuclear
    'Iran nuclear IRGC sanctions enrichment',
    'North Korea DPRK missile launch test',
    'nuclear warhead missile proliferation',
    // Conflict / military
    'airstrike missile strike killed destroyed',
    'war conflict troops offensive assault',
    'drone strike UAV attack',
    'coup insurgency junta rebellion',
    'ceasefire siege shelling frontline casualties',
    // Geopolitics
    'NATO alliance military exercise deployment',
    'Taiwan Strait China PLA military',
    'sanctions embargo treaty diplomatic',
    'election fraud protest crackdown',
    // Intelligence / cyber
    'cyberattack ransomware infrastructure breach',
    'espionage spy intelligence covert',
    // Humanitarian / disasters
    'refugee displacement famine atrocity',
    'earthquake flood disaster emergency',
    'disease outbreak pandemic epidemic',
    // Economy
    'inflation recession currency crisis debt default',
    'oil price energy supply disruption',
  ]

  const results = []
  // Route through /api/gdelt — server-side fetch, no CORS, no rate limits from browser
  // Batch 4 at a time to avoid overwhelming the serverless function
  const BATCH = 4
  for (let gi = 0; gi < queries.length; gi += BATCH) {
    const batch = queries.slice(gi, gi + BATCH)
    await Promise.allSettled(batch.map(async q => {
      try {
        const url = `/api/gdelt?q=${encodeURIComponent(q)}&maxrecords=75&timespan=24h&sort=DateDesc`
        const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
        if (!r.ok) return
        const d = await r.json().catch(() => null)
        if (!d?.articles) return
        d.articles.forEach(a => {
          if (!a?.title) return
          const combo = ((a.title || '') + ' ' + (a.domain || '')).toLowerCase()
          const pubStr = (a.seendate || '').replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z')
          let pub; try { pub = pubStr ? new Date(pubStr) : new Date() } catch { pub = new Date() }
          results.push({
            id:       hashId((a.url || a.title || '') + 'gd'),
            title:    (a.title || '').slice(0, 220),
            summary:  a.socialimage || '',
            source:   a.domain || 'GDELT',
            url:      a.url || '#',
            category: classifyCat(combo, 'conflict'),
            severity: classifySev(combo),
            region:   classifyRegion(combo),
            tags:     extractTags(combo),
            pub,
            _live: true, _gdelt: true,
          })
        })
      } catch {}
    }))
    if (gi + BATCH < queries.length) await new Promise(r => setTimeout(r, 300))
  }
  return results
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

// ── GDELT Geo-focused queries — country-specific conflict articles via /api/gdelt ──
// Note: GDELT v2 does NOT have a /geo/geo endpoint — that was a bug.
// The correct approach is /api/v2/doc/doc with location-specific search terms,
// routed through our /api/gdelt server endpoint to avoid browser CORS blocks.
async function fetchGDELTGeo() {
  // Country + region specific queries — GDELT doc API with location keywords
  const queries = [
    { q: 'Ukraine Kyiv Kharkiv Donbas military', label: 'Ukraine', region: 'Europe' },
    { q: 'Gaza Rafah Hamas IDF Palestinian', label: 'Gaza', region: 'Middle East' },
    { q: 'Yemen Houthi Sanaa Red Sea attack', label: 'Yemen', region: 'Middle East' },
    { q: 'Sudan Khartoum RSF Darfur war', label: 'Sudan', region: 'Africa' },
    { q: 'Lebanon Hezbollah Beirut Israeli', label: 'Lebanon', region: 'Middle East' },
    { q: 'Myanmar Burma junta Tatmadaw resistance', label: 'Myanmar', region: 'Southeast Asia' },
    { q: 'Iran Tehran IRGC nuclear Khamenei', label: 'Iran', region: 'Middle East' },
    { q: 'Taiwan Strait PLA China military exercises', label: 'Taiwan', region: 'East Asia' },
    { q: 'Sahel Mali Burkina Faso Niger junta coup', label: 'Sahel', region: 'Africa' },
    { q: 'North Korea DPRK Kim missile launch', label: 'North Korea', region: 'East Asia' },
    { q: 'Red Sea shipping Bab el-Mandeb Strait Hormuz maritime', label: 'Maritime', region: 'Global' },
    { q: 'Syria Idlib Assad HTS rebel offensive', label: 'Syria', region: 'Middle East' },
  ]

  const results = []
  const BATCH = 4
  for (let i = 0; i < queries.length; i += BATCH) {
    const batch = queries.slice(i, i + BATCH)
    await Promise.allSettled(batch.map(async ({ q, label, region }) => {
      try {
        const url = `/api/gdelt?q=${encodeURIComponent(q)}&maxrecords=30&timespan=24h&sort=DateDesc`
        const r = await fetch(url, { signal: AbortSignal.timeout(18000) })
        if (!r.ok) return
        const d = await r.json().catch(() => null)
        if (!d?.articles) return
        d.articles.forEach(a => {
          if (!a?.title) return
          const combo = ((a.title || '') + ' ' + (a.domain || '') + ' ' + label).toLowerCase()
          const pubStr = (a.seendate || '').replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z')
          let pub; try { pub = pubStr ? new Date(pubStr) : new Date() } catch { pub = new Date() }
          results.push({
            id:       hashId((a.url || a.title || '') + 'geo'),
            title:    (a.title || '').slice(0, 220),
            summary:  '',
            source:   a.domain || `GDELT/${label}`,
            url:      a.url || '#',
            category: 'conflict',
            severity: classifySev(combo),
            region:   label,
            tags:     extractTags(combo),
            pub,
            _live: true, _gdelt: true, _geo: true,
          })
        })
      } catch {}
    }))
    if (i + BATCH < queries.length) await new Promise(r => setTimeout(r, 250))
  }
  return results
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

  const [articles, setArticles] = useState([])

  // Load cached articles immediately so feed never starts empty
  useEffect(() => {
    const cached = cacheRead('articles')
    if (cached?.data?.length) {
      setArticles(cached.data.map(a => ({ ...a, pub: a.pub ? new Date(a.pub) : new Date() })))
    }
  }, [])

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
      // ── 1. RSS feeds — rotated 60/cycle for full coverage every ~22min at 3min intervals
      // 434 total feeds: 30 priority (always fetched) + 30 rotating = 60/run
      const PRIORITY_FEEDS = RSS_FEEDS.slice(0, 30)
      const rotatingFeeds  = RSS_FEEDS.slice(30)
      const rotateStart    = (Math.floor(Date.now() / (3 * 60 * 1000)) * 30) % Math.max(1, rotatingFeeds.length)
      const extra = rotatingFeeds.slice(rotateStart, rotateStart + 30)
      const overflow = extra.length < 30 ? rotatingFeeds.slice(0, 30 - extra.length) : []
      const thisRound = [...PRIORITY_FEEDS, ...extra, ...overflow]
      const BATCH = 12  // 12 concurrent feed requests per batch
      const rssArts = []
      for (let i = 0; i < thisRound.length; i += BATCH) {
        const batch = thisRound.slice(i, i + BATCH)
        const batchResults = await Promise.allSettled(batch.map(f => fetchFeed(f)))
        batchResults.forEach((r, j) => {
          if (r.status === 'fulfilled' && r.value?.length > 0) {
            st[batch[j].src] = r.value.length
            rssArts.push(...r.value)
          }
        })
        if (i + BATCH < thisRound.length) await new Promise(r => setTimeout(r, 200))
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

  // ── Twitter breaking news (live, every 45s) ─────────────────────────────
  const [twitterArts, setTwitterArts] = useState([])
  const fetchTwitter = useCallback(async () => {
    const BEARER = import.meta.env.VITE_TWITTER_BEARER || 'AAAAAAAAAAAAAAAAAAAAAPJg8QEAAAAAUUWJ3liqzZ%2FXVKROnzN5Rhca9Vc%3DVHDlV5peFdE8yv34pO0maVHalb3EZOuu9P9Mg1cybKqwm2nTW4'
    if (!BEARER) return
    const queries = [
      'breaking news lang:en -is:retweet',
      '(war OR conflict OR attack OR explosion OR strike) lang:en -is:retweet min_faves:50',
      '(earthquake OR hurricane OR tsunami OR eruption) lang:en -is:retweet min_faves:20',
    ]
    const all = []
    await Promise.allSettled(queries.map(async q => {
      try {
        const r = await fetch(
          `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=20&tweet.fields=created_at,author_id,public_metrics&expansions=author_id&user.fields=name,username`,
          { headers: { Authorization: `Bearer ${decodeURIComponent(BEARER)}` }, signal: AbortSignal.timeout(10000) }
        )
        if (!r.ok) return
        const d = await r.json()
        const users = {}
        ;(d?.includes?.users||[]).forEach(u => { users[u.id] = u })
        ;(d?.data||[]).forEach(t => {
          const author = users[t.author_id]
          const combo = t.text.toLowerCase()
          all.push({
            id: 'tw-' + t.id,
            title: t.text.slice(0, 200).replace(/https?:\/\/\S+/g, '').trim(),
            source: author ? `@${author.username}` : 'Twitter',
            url: author ? `https://twitter.com/${author.username}/status/${t.id}` : '#',
            category: classifyCat(combo, 'politics'),
            severity: classifySev(combo),
            region: classifyRegion(combo),
            tags: extractTags(combo),
            pub: new Date(t.created_at || Date.now()),
            _twitter: true,
          })
        })
      } catch {}
    }))
    if (all.length) setTwitterArts(all)
  }, [])

  useEffect(() => {
    fetchTwitter()
    const iv = setInterval(fetchTwitter, 5 * 60 * 1000) // 5min — was 60s, slashed to save Vercel CPU
    return () => clearInterval(iv)
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
  return isSupabaseConfigured() ? sbResult : legResult
}
