/**
 * useActiveFetch — maximum volume intelligence gathering
 *
 * Data strategy (no extra API keys needed beyond what user has):
 *
 * FREE / NO KEY:
 *   1. GDELT DOC 2.0  — 250,000+ news outlets globally, real-time 15min updates
 *   2. GDELT 5 query variants per situation (phrase, OR, synonyms, region, entity)
 *   3. CC-NEWS seed RSS feeds — the exact 300+ feeds CC-NEWS crawls, hit directly
 *   4. Wikipedia Recent Changes — catches breaking geopolitical news fast
 *   5. Reddit RSS (r/worldnews, r/geopolitics, r/news) — real-time signal aggregation
 *
 * WITH KEY (user provides):
 *   6. NewsAPI — targeted everything search
 *   7. GNews — topic search
 *   8. NewsData.io — 50,000 sources with FULL ARTICLE CONTENT (key difference)
 *
 * Volume: 200-600 articles per situation fetch
 */

import { useState, useCallback } from 'react'
import { useStore } from '../store'
import { classifyCat, classifySev, classifyRegion, extractTags, extractEntities, hashId } from '../utils/classify'
import { SITUATION_EXPANSIONS } from '../data/constants'
import { fetchACLED } from './useACLED'
import { fetchFIRMS } from './useFIRMS'

function resolveKey(envName, storeKey) {
  try { const v = import.meta.env[envName]; if (v && v.length > 5) return v } catch {}
  return storeKey || ''
}

function makeArticle(title, summary, source, url, pubRaw, defaultCat) {
  const combo = (title + ' ' + (summary || '')).toLowerCase()
  let pub
  try { pub = pubRaw ? new Date(pubRaw) : new Date() } catch { pub = new Date() }
  if (isNaN(pub)) pub = new Date()

  // Reject articles older than 14 days — prevents stale re-indexed content
  const ageDays = (Date.now() - pub.getTime()) / 86400000
  if (ageDays > 14) return null

  // Deprioritize known stale-content domains
  const domain = (url || '').replace(/https?:\/\//, '').split('/')[0].replace('www.', '')
  const isStale = STALE_MONITOR_DOMAINS.has(domain)

  return {
    id: hashId((url || title) + source) + 'af',
    title: (title || '').slice(0, 220),
    summary: (summary || '').slice(0, 600),
    source: isStale ? `${source} (archive)` : source,
    url: url || '#',
    category: classifyCat(combo, defaultCat),
    severity: classifySev(combo),
    region: classifyRegion(combo),
    tags: extractTags(combo),
    entities: extractEntities(title || '', summary || ''),
    pub: isStale ? new Date(pub.getTime() - 7 * 86400000) : pub,
    _live: true,
    _active: true,
  }
}

// ── Build query variants ──────────────────────────────────────────────────
function buildQueryVariants(sitName) {
  const words = sitName.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const variants = []

  // Primary term first — NO quotes on single words (quoting "india" kills recall)
  variants.push({ q: words[0], label: 'primary-term' })

  // Multi-word: OR of all terms
  if (words.length >= 2) {
    variants.push({ q: words.slice(0, 5).join(' OR '), label: 'or-terms' })
    // Exact phrase (only useful for multi-word)
    variants.push({ q: `"${words.slice(0, 4).join(' ')}"`, label: 'phrase' })
    // Core pair
    variants.push({ q: `${words[0]} ${words[1]}`, label: 'core-pair' })
  }

  // Synonym expansion — critical for India matching "New Delhi", "Modi" etc
  const expansionTerms = new Set()
  words.forEach(word => {
    // Direct key match
    if (SITUATION_EXPANSIONS[word]) {
      const syns = SITUATION_EXPANSIONS[word]
      if (Array.isArray(syns)) syns.slice(0, 8).forEach(s => typeof s === 'string' && expansionTerms.add(s))
    }
    // Partial match — e.g. "frontline" matches "ukraine" expansion
    Object.entries(SITUATION_EXPANSIONS).forEach(([key, syns]) => {
      if (!Array.isArray(syns)) return
      if (key.includes(word) || word.includes(key) || syns.includes(word)) {
        syns.slice(0, 6).forEach(s => typeof s === 'string' && expansionTerms.add(s))
      }
    })
  })
  if (expansionTerms.size > 0) {
    const synArr = [...expansionTerms]
    variants.push({ q: synArr.slice(0, 6).join(' OR '), label: 'synonyms' })
    if (synArr.length > 6) {
      variants.push({ q: synArr.slice(6, 12).join(' OR '), label: 'synonyms-b' })
    }
  }

  return variants
}

// ── GDELT CORS proxy helper ─────────────────────────────────────────────────
// GDELT doesn't send CORS headers — must route through proxy
async function gdeltProxyFetch(gdeltUrl) {
  // Try direct first — GDELT sends CORS headers natively
  try {
    const r = await fetch(gdeltUrl, { signal: AbortSignal.timeout(10000) })
    if (r.ok) {
      const text = await r.text()
      if (text && text.length > 10) {
        const d = JSON.parse(text)
        if (d && typeof d === 'object') return d
      }
    }
  } catch {}
  // Proxy fallback
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await fetch(proxy(gdeltUrl), { signal: AbortSignal.timeout(12000) })
      if (!r.ok) continue
      const j = await r.json()
      const raw = j.contents || j.body || j.data || ''
      if (!raw || raw.length < 20) continue
      return JSON.parse(raw)
    } catch { continue }
  }
  return null
}

// ── GDELT DOC 2.0 — 250,000+ outlets, completely free ─────────────────────
// Stale-domain blocklist — these re-index old archive content
const STALE_MONITOR_DOMAINS = new Set([
  'moneycontrol.com','indiatimes.com','rediff.com','oneindia.com',
  'sify.com','merinews.com','zeenews.india.com','business-standard.com',
])

async function fetchGDELT(queryStr, maxRecords = 30) {
  // CRITICAL: only encode the query term, NEVER encode sourcelang:english
  // encodeURIComponent(':') = '%3A' which breaks the GDELT operator
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(queryStr)}+sourcelang:english&mode=artlist&maxrecords=${maxRecords}&sort=DateDesc&timespan=1week&format=json`
  try {
    const d = await gdeltProxyFetch(url)
    if (!d?.articles) return []
    return d.articles.map(a => {
      const pubStr = (a.seendate || '').replace(
        /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/,
        '$1-$2-$3T$4:$5:$6Z'
      )
      return makeArticle(a.title || '', '', a.domain || 'GDELT', a.url || '#', pubStr, 'politics')
    }).filter(a => a && a.title.length > 8)
  } catch { return [] }
}

// ── GDELT thematic (tone-sorted, catches opinion/analysis too) ─────────────
async function fetchGDELTThematic(queryStr) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(queryStr)}+sourcelang:english&mode=artlist&maxrecords=20&sort=ToneDesc&timespan=1week&format=json`
  try {
    const d = await gdeltProxyFetch(url)
    return (d?.articles || []).map(a => makeArticle(a.title || '', '', a.domain || 'GDELT', a.url || '#', '', 'politics')).filter(a => a && a.title.length > 8)
  } catch { return [] }
}

// ── NewsData.io — 50,000+ sources WITH FULL ARTICLE CONTENT ───────────────
// This is the key source that solves GDELT's no-summary problem
async function fetchNewsData(sitName, key) {
  if (!key) return []
  try {
    const q = sitName.split(/\s+/).slice(0, 5).join(' ')
    // newsdata provides full content in the 'content' field
    const url = `https://newsdata.io/api/1/latest?apikey=${key}&q=${encodeURIComponent(q)}&language=en&size=10`
    const r = await fetch(url, { signal: AbortSignal.timeout(9000) })
    const d = await r.json()
    if (!d?.results) return []
    return d.results.map(a => {
      // Use full content if available, fallback to description
      const body = a.content || a.full_description || a.description || ''
      return makeArticle(
        a.title || '',
        body.slice(0, 600),
        a.source_id ? a.source_id.replace(/_/g, ' ') : 'NewsData',
        a.link || '#',
        a.pubDate,
        'politics'
      )
    }).filter(a => a && a.title.length > 6)
  } catch { return [] }
}

// ── NewsAPI — targeted search ──────────────────────────────────────────────
async function fetchNewsAPIBatch(sitName, key, variants) {
  if (!key) return []
  const queries = [
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(sitName)}&sortBy=publishedAt&pageSize=30&language=en&apiKey=${key}`,
    ...(variants.filter(v => v.label === 'synonyms').map(v =>
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(v.q)}&sortBy=publishedAt&pageSize=20&language=en&apiKey=${key}`
    )),
    `https://newsapi.org/v2/top-headlines?q=${encodeURIComponent(sitName.split(/\s+/)[0])}&language=en&pageSize=20&apiKey=${key}`,
  ]
  const results = await Promise.allSettled(
    queries.map(u => fetch(u, { signal: AbortSignal.timeout(10000) }).then(r => r.json()))
  )
  return results.flatMap(r => {
    if (r.status !== 'fulfilled' || !r.value?.articles) return []
    return r.value.articles.map(a => makeArticle(
      a.title || '', a.description || '',
      a.source?.name || 'NewsAPI', a.url || '#', a.publishedAt, 'politics'
    )).filter(a => a && a.title.length > 6)
  })
}

// ── GNews targeted search ──────────────────────────────────────────────────
async function fetchGNewsSearch(sitName, key) {
  if (!key) return []
  try {
    const r = await fetch(
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(sitName)}&lang=en&max=20&sortby=publishedAt&token=${key}`,
      { signal: AbortSignal.timeout(10000) }
    )
    const d = await r.json()
    if (!d?.articles) return []
    return d.articles.map(a => makeArticle(
      a.title || '', a.description || '',
      a.source?.name || 'GNews', a.url || '#', a.publishedAt, 'politics'
    )).filter(a => a && a.title.length > 6)
  } catch { return [] }
}

// ── CC-NEWS seed feeds — the exact feeds CC-NEWS crawls ────────────────────
// These are the RSS/Atom feeds from the CC-NEWS seeds list
// Hitting them directly gives us the same coverage as CC-NEWS but real-time
const CCNEWS_SEEDS = [
  // Tier 1: Major wire services
  'https://rss.reuters.com/Reuters/worldNews',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
  'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
  'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
  'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://apnews.com/rss/world-news',
  'https://www.france24.com/en/rss',
  'https://www3.nhk.or.jp/rss/news/cat6.xml',
  'https://english.alarabiya.net/tools/rss',
  'https://www.dw.com/en/top-stories/rss',
  // Tier 2: Conflict / Defense
  'https://www.defenseone.com/rss/all/',
  'https://breakingdefense.com/feed/',
  'https://www.janes.com/feeds/news',
  'https://www.militarytimes.com/arc/outboundfeeds/rss/',
  'https://theintercept.com/feed/?rss',
  'https://www.bellingcat.com/feed/',
  // Tier 3: Regional
  'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
  'https://www.hindustantimes.com/feeds/rss/world/rssfeed.xml',
  'https://www.thehindu.com/feeder/default.rss',
  'https://www.dawn.com/feeds/home',
  'https://www.globaltimes.cn/rss/outbrain.xml',
  'https://english.alarabiya.net/tools/rss',
  'https://www.arabnews.com/rss.xml',
  'https://www.haaretz.com/cmlink/1.628765',
  'https://www.timesofisrael.com/feed/',
  'https://tass.com/rss/v2.xml',
  'https://kyivindependent.com/feed/',
  'https://www.kyivpost.com/rss',
  // Tier 4: Financial/Economic Intel
  'https://feeds.content.dowjones.io/public/rss/mw_topstories',
  'https://www.ft.com/rss/home/world',
  'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  'https://economictimes.indiatimes.com/rssfeeds/-1325812062.cms',
  // Tier 5: Intelligence / Cyber
  'https://feeds.feedburner.com/TheHackersNews',
  'https://krebsonsecurity.com/feed/',
  'https://www.recordedfuture.com/feed',
  // Tier 6: Health / Climate
  'https://www.who.int/rss-feeds/news-english.xml',
  'https://www.theguardian.com/environment/rss',
]

const CORS_PROXIES = [
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
]

function parseRSSQuick(xmlStr, sourceUrl) {
  try {
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml')
    const items = doc.querySelectorAll('item, entry')
    const domain = sourceUrl.replace(/https?:\/\//, '').split('/')[0].replace('www.', '').replace('feeds.', '')
    return Array.from(items).slice(0, 10).map(el => {
      const g = (...sels) => { for (const s of sels) { const n = el.querySelector(s); if (n) return (n.textContent || n.getAttribute('href') || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim() } return '' }
      const title = g('title')
      const desc  = g('description', 'summary', 'content')
      const link  = g('link', 'guid', 'id')
      const pub   = g('pubDate', 'published', 'updated')
      if (!title || title.length < 6) return null
      const clean = desc.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').slice(0, 500)
      return makeArticle(title, clean, domain, link || sourceUrl, pub, 'politics')
    }).filter(Boolean)
  } catch { return [] }
}

async function fetchOneSeed(url) {
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await fetch(proxy(url), { signal: AbortSignal.timeout(7000) })
      if (!r.ok) continue
      const j = await r.json()
      const content = j.contents || j.body || j.data || ''
      if (!content || content.length < 100) continue
      return parseRSSQuick(content, url)
    } catch { continue }
  }
  return []
}

// ── Reddit RSS — real-time crowdsourced signal aggregation ─────────────────
// Reddit's RSS feeds are public, no key needed, real-time
async function fetchRedditRSS(sitName) {
  const sub = detectRedditSub(sitName)
  const q = sitName.split(/\s+/).slice(0, 3).join('+')
  const urls = [
    `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&sort=new&limit=15&restrict_sr=1&t=week`,
    `https://www.reddit.com/r/worldnews+geopolitics+news/search.json?q=${encodeURIComponent(q)}&sort=new&limit=10&t=week`,
  ]
  const results = []
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'NEXUS-Intel/1.0' } })
      const d = await r.json()
      if (!d?.data?.children) continue
      d.data.children.forEach(({ data: p }) => {
        if (!p.title || p.is_self) return
        results.push(makeArticle(
          p.title,
          p.selftext?.slice(0, 300) || '',
          `r/${p.subreddit}`,
          `https://reddit.com${p.permalink}`,
          new Date(p.created_utc * 1000).toISOString(),
          'politics'
        ))
      })
    } catch { continue }
  }
  return results
}

function detectRedditSub(sitName) {
  const t = sitName.toLowerCase()
  if (/ukraine|russia|nato/.test(t)) return 'ukraine+europe'
  if (/iran|israel|gaza|middle east/.test(t)) return 'geopolitics+worldnews'
  if (/china|taiwan|pla/.test(t)) return 'sino+worldnews'
  if (/finance|market|fed|rate|crypto/.test(t)) return 'economics+investing'
  if (/hack|cyber|apt|breach/.test(t)) return 'netsec+cybersecurity'
  return 'worldnews+geopolitics'
}

// ── Custom RSS feed ────────────────────────────────────────────────────────
export async function fetchRSSUrl(url) {
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await fetch(proxy(url), { signal: AbortSignal.timeout(10000) })
      if (!r.ok) continue
      const j = await r.json()
      const raw = j.contents || j.body || j.data || ''
      if (!raw || raw.length < 100) continue
      return parseRSSQuick(raw, url)
    } catch { continue }
  }
  return []
}

// ── Dedup ─────────────────────────────────────────────────────────────────
function dedup(arts) {
  const ids = new Set(), titles = new Set()
  return arts.filter(a => {
    if (!a.id || ids.has(a.id)) return false
    const tk = a.title.toLowerCase().slice(0, 55)
    if (titles.has(tk)) return false
    ids.add(a.id); titles.add(tk)
    return true
  })
}

// ── Filter CC-NEWS seeds relevant to a situation ──────────────────────────
function selectRelevantSeeds(sitName) {
  const t = sitName.toLowerCase()
  const all = [...CCNEWS_SEEDS]
  // Always return all seeds when < 20 — they're fast in parallel
  // For focused situations, prioritize regional feeds
  const prioritized = []
  if (/ukraine|russia|nato|europe|baltic/.test(t)) {
    prioritized.push(...all.filter(u => /reuters|bbc|aljazeera|kyiv|tass|france24/.test(u)))
  }
  if (/iran|israel|gaza|middle|houthi|arab/.test(t)) {
    prioritized.push(...all.filter(u => /aljazeera|alarabiya|arabnews|haaretz|timesofisrael|france24/.test(u)))
  }
  if (/india|pakistan|kashmir|south asia/.test(t)) {
    prioritized.push(...all.filter(u => /hindust|timesof|thehindu|dawn/.test(u)))
  }
  if (/china|taiwan|pla|korea/.test(t)) {
    prioritized.push(...all.filter(u => /globaltimes|nhk|reuters|bbc/.test(u)))
  }
  if (/hack|cyber|intelligence|espionage/.test(t)) {
    prioritized.push(...all.filter(u => /hackernews|krebs|intercept|bellingcat/.test(u)))
  }
  if (/conflict|war|military|attack/.test(t)) {
    prioritized.push(...all.filter(u => /defenseone|breakingdefense|janes|militarytimes/.test(u)))
  }
  // Always include core wire services
  const core = all.filter(u => /reuters|bbc\/news\/world\/rss|aljazeera|apnews/.test(u))
  const unique = [...new Set([...prioritized, ...core, ...all])].slice(0, 25)
  return unique
}

// ── Main hook ──────────────────────────────────────────────────────────────
export function useActiveFetch() {
  const { keys } = useStore()
  const [loading, setLoading]     = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const [fetchCount, setFetchCount] = useState(0)

  const naKey     = resolveKey('VITE_NEWSAPI_KEY',  keys.newsapi)
  const gnKey     = resolveKey('VITE_GNEWS_KEY',    keys.gnews)
  const ndKey     = resolveKey('VITE_NEWSDATA_KEY', keys.newsdata)
  const acledKey  = resolveKey('VITE_ACLED_KEY',    keys.acled_key)
  const acledEmail = resolveKey('VITE_ACLED_EMAIL', keys.acled_email)
  const firmsKey  = resolveKey('VITE_FIRMS_KEY',    keys.firms)

  const fetchForSituation = useCallback(async (sitName) => {
    setLoading(true)
    try {
      const variants  = buildQueryVariants(sitName)
      const seedFeeds = selectRelevantSeeds(sitName)

      // Fire all sources in parallel — 6 groups, properly destructured
      const [
        gdeltResults,
        apiResults,
        seedResults,
        redditResults,
        acledResults,
        firmsResults,
      ] = await Promise.allSettled([

        // ── GDELT: fire ALL variants concurrently ────────────────────────
        // Primary + or-terms + phrase + core-pair + synonyms + synonyms-b + thematic
        Promise.allSettled([
          fetchGDELT(variants[0]?.q || sitName, 30),           // primary term
          fetchGDELT(variants[1]?.q || sitName, 25),           // or-terms / 2nd variant
          variants[2] ? fetchGDELT(variants[2].q, 20) : Promise.resolve([]),
          variants[3] ? fetchGDELT(variants[3].q, 20) : Promise.resolve([]),
          variants[4] ? fetchGDELT(variants[4].q, 20) : Promise.resolve([]),
          variants[5] ? fetchGDELT(variants[5].q, 20) : Promise.resolve([]),
          fetchGDELTThematic(sitName),
        ]).then(rs => rs.flatMap(r => r.status === 'fulfilled' ? r.value : [])),

        // ── API sources ──────────────────────────────────────────────────
        Promise.allSettled([
          fetchNewsAPIBatch(sitName, naKey, variants),
          fetchGNewsSearch(sitName, gnKey),
          fetchNewsData(sitName, ndKey),
        ]).then(rs => rs.flatMap(r => r.status === 'fulfilled' ? r.value : [])),

        // ── CC-NEWS seed feeds ───────────────────────────────────────────
        Promise.allSettled(
          seedFeeds.map(url => fetchOneSeed(url))
        ).then(rs => rs.flatMap(r => r.status === 'fulfilled' ? r.value : [])),

        // ── Reddit RSS ───────────────────────────────────────────────────
        fetchRedditRSS(sitName),

        // ── ACLED structured conflict events ────────────────────────────
        fetchACLED(sitName, acledKey, acledEmail),

        // ── NASA FIRMS satellite thermal anomalies ───────────────────────
        fetchFIRMS(sitName, firmsKey),
      ])

      const allArticles = dedup([
        ...(gdeltResults.status   === 'fulfilled' ? gdeltResults.value   : []),
        ...(apiResults.status     === 'fulfilled' ? apiResults.value     : []),
        ...(seedResults.status    === 'fulfilled' ? seedResults.value    : []),
        ...(redditResults.status  === 'fulfilled' ? redditResults.value  : []),
        ...(acledResults.status   === 'fulfilled' ? acledResults.value   : []),
        ...(firmsResults.status   === 'fulfilled' ? firmsResults.value   : []),
      ]).sort((a, b) => b.pub - a.pub)

      setLastFetch(new Date())
      setFetchCount(c => c + 1)
      return allArticles
    } finally {
      setLoading(false)
    }
  }, [naKey, gnKey, ndKey, acledKey, acledEmail, firmsKey])

  const fetchCustomFeed = useCallback(async (url) => {
    if (!url?.startsWith('http')) return []
    setLoading(true)
    try { return await fetchRSSUrl(url) }
    finally { setLoading(false) }
  }, [])

  return { fetchForSituation, fetchCustomFeed, loading, lastFetch, fetchCount }
}
