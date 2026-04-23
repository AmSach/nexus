/**
 * useTelegram — Singleton Telegram OSINT feed
 * Module-level state: only ONE fetch cycle runs globally.
 * All components share the same data — no duplicate fetching.
 * Polls every 90s. 51 verified channels via /api/rss?mode=tme proxy.
 */
import { useState, useEffect } from 'react'

// ── Auto-translate non-English posts via MyMemory (free, no key) ─────────────
const translateCache = new Map()
async function autoTranslate(text) {
  if (!text || text.length < 5) return text
  // Detect non-English scripts: Cyrillic, Arabic, CJK, Hebrew, Persian
  const hasCyrillic = /[\u0400-\u04FF]/.test(text)
  const hasArabic   = /[\u0600-\u06FF\u0750-\u077F]/.test(text)
  const hasCJK      = /[\u4E00-\u9FFF\u3040-\u30FF]/.test(text)
  const hasHebrew   = /[\u0590-\u05FF]/.test(text)
  if (!hasCyrillic && !hasArabic && !hasCJK && !hasHebrew) return text  // already English/Latin
  const key = text.slice(0, 80)
  if (translateCache.has(key)) return translateCache.get(key)
  try {
    const r = await fetch(
      'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 500)) + '&langpair=auto|en',
      { signal: AbortSignal.timeout(5000) }
    )
    if (!r.ok) return text
    const d = await r.json()
    const t = d?.responseData?.translatedText
    if (t && t !== text && !t.includes('MYMEMORY WARNING')) {
      translateCache.set(key, t)
      if (translateCache.size > 500) translateCache.delete(translateCache.keys().next().value)
      return t
    }
  } catch {}
  return text
}

export const TG_CHANNELS = [
  { handle:'intelslava',           name:'Intel Slava Z',        region:'UA/RU', priority:1 },
  { handle:'wartranslated',        name:'War Translated',       region:'UA/RU', priority:1 },
  { handle:'UkraineNow',           name:'Ukraine Now',          region:'UA/RU', priority:1 },
  { handle:'militarylandnews',     name:'Military Land',        region:'UA/RU', priority:1 },
  { handle:'nexta_tv',             name:'NEXTA TV',             region:'UA/RU', priority:1 },
  { handle:'rybar',                name:'Rybar (RU)',           region:'UA/RU', priority:1 },
  { handle:'flash_news_ua',        name:'Flash News UA',        region:'UA/RU', priority:1 },
  { handle:'DeepStateUA',          name:'DeepState UA',         region:'UA/RU', priority:1 },
  { handle:'trokhymchuk',          name:'Trokhymchuk Intel',    region:'UA/RU', priority:1 },
  { handle:'ukraine_911',          name:'Ukraine 911',          region:'UA/RU', priority:1 },
  { handle:'operativnoZSU',        name:'ZSU Operative',        region:'UA/RU', priority:1 },
  { handle:'InformNapalm',         name:'InformNapalm',         region:'UA/RU', priority:1 },
  { handle:'ukraineweapon',        name:'Ukraine Weapons',      region:'UA/RU', priority:2 },
  { handle:'legitimniy',           name:'Legitimny',            region:'UA/RU', priority:2 },
  { handle:'ZelenskyyUa',          name:'Zelensky Official',    region:'UA/RU', priority:1 },
  { handle:'ukrarmy',              name:'Ukraine Army',         region:'UA/RU', priority:1 },
  { handle:'osintdefender',        name:'OSINT Defender',       region:'OSINT', priority:1 },
  { handle:'GeoConfirmed',         name:'GeoConfirmed',         region:'OSINT', priority:1 },
  { handle:'WarMonitor3',          name:'War Monitor 3',        region:'OSINT', priority:1 },
  { handle:'IntelRepublic',        name:'Intel Republic',       region:'OSINT', priority:1 },
  { handle:'OSINTtechnical',       name:'OSINT Technical',      region:'OSINT', priority:1 },
  { handle:'warcimintel',          name:'War Crime Intel',      region:'OSINT', priority:1 },
  { handle:'CombatFootage',        name:'Combat Footage',       region:'OSINT', priority:1 },
  { handle:'sentdefender',         name:'Sentinel Defender',    region:'OSINT', priority:1 },
  { handle:'MilOSINT',             name:'Mil OSINT',            region:'OSINT', priority:1 },
  { handle:'disclosetv',           name:'Disclose TV',          region:'OSINT', priority:2 },
  { handle:'Intel_collection',     name:'Intel Collection',     region:'OSINT', priority:2 },
  { handle:'Middle_East_Spectator',name:'ME Spectator',         region:'MENA',  priority:1 },
  { handle:'QudsNen',              name:'Quds News',            region:'MENA',  priority:1 },
  { handle:'ArabicOSINT',          name:'Arabic OSINT',         region:'MENA',  priority:1 },
  { handle:'israelintelligence',   name:'Israel Intel',         region:'MENA',  priority:1 },
  { handle:'HouthiMilitary',       name:'Houthi Military',      region:'MENA',  priority:1 },
  { handle:'IranIntl',             name:'Iran International',   region:'MENA',  priority:1 },
  { handle:'MEE_Palestine',        name:'MEE Palestine',        region:'MENA',  priority:1 },
  { handle:'AlMayadeenEnglish',    name:'Al Mayadeen EN',       region:'MENA',  priority:2 },
  { handle:'MiddleEastMonitor',    name:'ME Monitor',           region:'MENA',  priority:2 },
  { handle:'SahelIntelligence',    name:'Sahel Intel',          region:'AFR',   priority:1 },
  { handle:'sahel_osint',          name:'Sahel OSINT',          region:'AFR',   priority:1 },
  { handle:'sudan_war_monitor',    name:'Sudan War Monitor',    region:'AFR',   priority:2 },
  { handle:'AfricanDefence',       name:'African Defence',      region:'AFR',   priority:2 },
  { handle:'taiwan_strait_news',   name:'Taiwan Strait News',   region:'APAC',  priority:1 },
  { handle:'NKNews_org',           name:'NK News',              region:'APAC',  priority:1 },
  { handle:'SCMP_News',            name:'SCMP Breaking',        region:'APAC',  priority:2 },
  { handle:'conflictupdates',      name:'Conflict Updates',     region:'GLOBAL',priority:1 },
  { handle:'geopolitics_live',     name:'Geopolitics Live',     region:'GLOBAL',priority:1 },
  { handle:'breakingmilitary',     name:'Breaking Military',    region:'GLOBAL',priority:1 },
  { handle:'navalintel',           name:'Naval Intel',          region:'GLOBAL',priority:1 },
  { handle:'warmonitor1',          name:'War Monitor 1',        region:'GLOBAL',priority:1 },
  { handle:'specialopsmagazine',   name:'Special Ops Magazine', region:'GLOBAL',priority:2 },
  { handle:'worldwarnews',         name:'World War News',       region:'GLOBAL',priority:2 },
]

const GEO = {
  ukraine:[49,31],kyiv:[50.4,30.5],kharkiv:[50,36.3],zaporizhzhia:[47.8,35.1],
  kherson:[46.6,32.6],odesa:[46.5,30.7],mariupol:[47.1,37.5],donbas:[48.2,38.2],
  donetsk:[48,37.8],bakhmut:[48.6,38],avdiivka:[48.1,37.7],kupiansk:[49.7,37.6],
  belgorod:[50.6,36.6],kursk:[51.7,36.2],bryansk:[53.3,34.4],crimea:[45,34],
  sevastopol:[44.6,33.5],russia:[55.7,37.6],moscow:[55.7,37.6],
  gaza:[31.4,34.4],rafah:[31.3,34.2],'khan yunis':[31.3,34.3],
  israel:[31.8,35.2],'tel aviv':[32.1,34.8],jerusalem:[31.8,35.2],
  'west bank':[31.9,35.2],jenin:[32.5,35.3],ramallah:[31.9,35.2],
  lebanon:[33.9,35.5],beirut:[33.9,35.5],hezbollah:[33.5,35.6],
  syria:[34.8,38.9],damascus:[33.5,36.3],aleppo:[36.2,37.2],
  iran:[32.4,53.7],tehran:[35.7,51.4],iraq:[33.2,43.7],baghdad:[33.3,44.4],
  yemen:[15.5,48.5],houthi:[15,43.5],sanaa:[15.4,44.2],
  sudan:[15,30.2],khartoum:[15.6,32.5],darfur:[13,24],
  ethiopia:[9,40],somalia:[5,46],mogadishu:[2.1,45.3],
  mali:[17,-4],burkina:[12.4,-1.6],niger:[13.5,2.1],sahel:[15,5],
  taiwan:[23.7,121],strait:[24,122],china:[35.8,104.2],beijing:[39.9,116.4],
  'south china sea':[12,115],'north korea':[40,127],pyongyang:[39,125.8],
  myanmar:[19,96.9],pakistan:[30,69],afghanistan:[33.9,67.7],
  'red sea':[20,38],hormuz:[26.5,56.5],'persian gulf':[26.5,52],
  nato:[50,15],europe:[50,15],
}

function geoPost(text) {
  const lower = text.toLowerCase()
  for (const [kw, coords] of Object.entries(GEO)) {
    if (lower.includes(kw)) return coords
  }
  return null
}

function severityPost(text) {
  if (/airstrike|ballistic|explosion|killed|dead|casualties|bombed|destroyed|aircraft.*down|ship.*sunk/i.test(text)) return 'critical'
  if (/attack|strike|fire|launch|troops|offensive|advance|retreat|captured|shelling|drone.*hit/i.test(text)) return 'high'
  if (/military|forces|soldiers|convoy|artillery|clashes|combat|operation/i.test(text)) return 'medium'
  return 'low'
}

// ── Module-level singleton state — shared across ALL hook instances ───────────
let _recent = []
let _archive = []
let _loading = false
let _lastFetch = null
let _channelStatus = {}
let _listeners = new Set()
let _interval = null
// _seenIds removed — deduplication is per-poll only (withinPollSeen) so channels stay live
let _fetchPromise = null

function notify() {
  _listeners.forEach(cb => cb({ recent: _recent, archive: _archive, loading: _loading, lastFetch: _lastFetch, channelStatus: _channelStatus }))
}

async function scrapeChannel(handle) {
  try {
    const r = await fetch('/api/rss?mode=tme&handle=' + encodeURIComponent(handle) + '&count=20', {
      signal: AbortSignal.timeout(14000),
    })
    if (!r.ok) return []
    const d = await r.json()
    return (d.posts || []).map(p => ({ handle, msgId: p.msgId, text: p.text, ts: p.ts, url: p.url }))
  } catch { return [] }
}

async function fetchAll() {
  if (_fetchPromise) return _fetchPromise  // deduplicate concurrent calls
  _loading = true
  notify()

  _fetchPromise = (async () => {
    const now = Date.now()
    const cut24h = now - 86400000
    const cut7d  = now - 7 * 86400000
    const status = {}
    const allPosts = []

    // Batch channels in groups of 15 to stay within Vercel concurrency
    const BATCH = 15
    // Within-poll dedup set (not cross-poll — same posts appear every fetch from same channel)
    const withinPollSeen = new Set()
    for (let i = 0; i < TG_CHANNELS.length; i += BATCH) {
      const batch = TG_CHANNELS.slice(i, i + BATCH)
      const results = await Promise.allSettled(batch.map(ch => scrapeChannel(ch.handle)))
      for (let j = 0; j < results.length; j++) {
        const ch = batch[j]
        const posts = results[j].status === 'fulfilled' ? results[j].value : []
        status[ch.handle] = posts.length > 0
        // Translate non-English posts in parallel within this batch
        const translated = await Promise.all(posts.map(p =>
          autoTranslate(p.text).catch(() => p.text)
        ))
        for (let k = 0; k < posts.length; k++) {
          const p = posts[k]
          const id = ch.handle + '_' + p.msgId
          if (withinPollSeen.has(id)) continue  // dedup within single poll only
          withinPollSeen.add(id)
          const ts = new Date(p.ts).getTime()
          if (ts < cut7d) continue  // older than 7 days
          const geo = geoPost(p.text)
          const sev = severityPost(p.text)
          const displayText = translated[k]
          allPosts.push({
            id, channel: ch.handle, channelName: ch.name, region: ch.region,
            text: displayText,
            originalText: displayText !== p.text ? p.text : undefined,
            title: ch.name + ': ' + displayText.slice(0, 100),
            ts: p.ts, date: new Date(p.ts), severity: sev,
            url: p.url || ('https://t.me/' + ch.handle),
            lat: geo ? geo[0] + (Math.random() - 0.5) * 0.6 : null,
            lng: geo ? geo[1] + (Math.random() - 0.5) * 0.6 : null,
            geoKnown: !!geo, source: ch.name, priority: ch.priority,
          })
        }
      }
      if (i + BATCH < TG_CHANNELS.length) await new Promise(r => setTimeout(r, 100))
    }

    allPosts.sort((a, b) => b.date - a.date)

    _recent  = allPosts.filter(p => p.date.getTime() >= cut24h)
    _archive = allPosts.filter(p => p.date.getTime() < cut24h)
    _channelStatus = status
    _lastFetch = new Date()
    _loading = false
    _fetchPromise = null
    notify()
  })()

  return _fetchPromise
}

function startPolling() {
  if (_interval) return
  fetchAll()
  _interval = setInterval(fetchAll, 120000)  // 2min — still very fresh
}

// ── Hook — just subscribes to singleton state ─────────────────────────────────
export function useTelegram() {
  const [state, setState] = useState({
    recent: _recent, archive: _archive,
    loading: _loading, lastFetch: _lastFetch,
    channelStatus: _channelStatus,
  })

  useEffect(() => {
    _listeners.add(setState)
    startPolling()  // no-op if already running
    // Immediately sync current state
    setState({ recent: _recent, archive: _archive, loading: _loading, lastFetch: _lastFetch, channelStatus: _channelStatus })
    return () => { _listeners.delete(setState) }
  }, [])

  return {
    recent: state.recent,
    archive: state.archive,
    loading: state.loading,
    lastFetch: state.lastFetch,
    channelStatus: state.channelStatus,
    refresh: fetchAll,
    allChannels: TG_CHANNELS,
  }
}
