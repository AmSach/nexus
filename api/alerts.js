/**
 * /api/alerts v3 — All live alert sources, server-side
 * NWS, GDACS, USNI, Oref, GPSJam, WHO, ProMED
 */

const TIMEOUT = 12000

async function get(url, timeoutOrHeaders = {}, extraHeaders = {}) {
  const ms = typeof timeoutOrHeaders === 'number' ? timeoutOrHeaders : TIMEOUT
  const hdrs = typeof timeoutOrHeaders === 'object' ? timeoutOrHeaders : extraHeaders
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 NEXUS-Intel/1.0', ...hdrs },
      signal: AbortSignal.timeout(ms),
      redirect: 'follow'
    })
    if (!r.ok) return null
    return r
  } catch { return null }
}

async function fetchNWS() {
  try {
    const r = await get('https://api.weather.gov/alerts/active?status=actual&severity=Extreme&severity=Severe&urgency=Immediate&urgency=Expected', { 'Accept': 'application/geo+json', 'User-Agent': '(NEXUS Intelligence Platform, nexus@intelligence.app)' })
    if (!r) return []
    const d = await r.json().catch(() => null)
    return (d?.features || []).map(f => {
      const p = f.properties || {}
      return {
        id: 'nws-' + (p.id || Math.random().toString(36).slice(2)),
        type: 'weather', icon: '⛈️',
        title: (p.event || 'Weather Alert') + ' — ' + (p.areaDesc || '').slice(0, 60),
        detail: (p.headline || p.description || '').slice(0, 200),
        severity: p.severity === 'Extreme' ? 'critical' : 'high',
        source: 'NWS', url: p.web || 'https://www.weather.gov',
        ts: p.sent || new Date().toISOString(), region: 'N. America'
      }
    })
  } catch { return [] }
}

async function fetchGDACS() {
  try {
    const r = await get('https://www.gdacs.org/xml/rss.xml')
    if (!r) return []
    const txt = await r.text()
    const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    return items.slice(0, 15).map(m => {
      const b = m[1]
      const title = (b.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim()
      const link = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim()
      const lat = parseFloat(b.match(/<geo:lat>(.*?)<\/geo:lat>/i)?.[1] || '')
      const lng = parseFloat(b.match(/<geo:long>(.*?)<\/geo:long>/i)?.[1] || '')
      const lvl = b.toLowerCase().includes('red') ? 'critical' : b.toLowerCase().includes('orange') ? 'high' : 'medium'
      if (!title) return null
      return {
        id: 'gdacs-' + title.slice(0, 20).replace(/\s/g, '-'),
        type: 'disaster', icon: '⚠️', title,
        detail: b.match(/<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/i)?.[1]?.replace(/<[^>]+>/g,'').slice(0,200) || '',
        severity: lvl, source: 'GDACS', url: link,
        ts: new Date().toISOString(), region: 'Global',
        ...(lat && lng && !isNaN(lat) && !isNaN(lng) ? { lat, lng } : {})
      }
    }).filter(Boolean)
  } catch { return [] }
}

// Known carrier/major warship home port fallback positions
const USNI_SHIP_POSITIONS = {
  'gerald r. ford': {lat:36.9,lng:-76.3}, 'ford': {lat:36.9,lng:-76.3},
  'abraham lincoln': {lat:47.6,lng:-122.7}, 'lincoln': {lat:47.6,lng:-122.7},
  'harry s. truman': {lat:36.9,lng:-76.3}, 'truman': {lat:36.9,lng:-76.3},
  'nimitz': {lat:47.6,lng:-122.7}, 'carl vinson': {lat:47.6,lng:-122.7},
  'theodore roosevelt': {lat:32.7,lng:-117.2}, 'ronald reagan': {lat:35.3,lng:139.7},
  'george washington': {lat:36.9,lng:-76.3}, 'john c. stennis': {lat:32.7,lng:-117.2},
  'dwight d. eisenhower': {lat:36.9,lng:-76.3}, 'george h.w. bush': {lat:36.9,lng:-76.3},
  'queen elizabeth': {lat:50.8,lng:-1.1}, 'prince of wales': {lat:50.8,lng:-1.1},
  'charles de gaulle': {lat:43.1,lng:5.9}, 'liaoning': {lat:38.9,lng:121.6},
  'shandong': {lat:22.3,lng:114.2}, 'fujian': {lat:31.3,lng:121.5},
  'izumo': {lat:35.4,lng:139.6}, 'vikrant': {lat:15.3,lng:73.9},
  // Destroyer/cruiser keywords
  'mediterranean': {lat:35.0,lng:18.0}, 'persian gulf': {lat:26.0,lng:51.0},
  'south china sea': {lat:15.0,lng:115.0}, 'arabian sea': {lat:15.0,lng:65.0},
  'red sea': {lat:20.0,lng:38.0}, 'black sea': {lat:43.0,lng:33.0},
  'pacific': {lat:20.0,lng:160.0}, 'atlantic': {lat:30.0,lng:-45.0},
  'indian ocean': {lat:-10.0,lng:70.0}, 'strait of hormuz': {lat:26.6,lng:56.3},
}
async function fetchUSNI() {
  try {
    const r = await get('https://news.usni.org/category/fleet-tracker/feed')
    if (!r) return []
    const txt = await r.text()
    const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    return items.slice(0, 15).map(m => {
      const b = m[1]
      const title = (b.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g,'').trim()
      const link = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim()
      const pub = b.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]
      const desc = (b.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]||'').replace(/<[^>]+>/g,'').trim()
      if (!title) return null
      // Infer position from title/desc keywords
      const combined = (title + ' ' + desc).toLowerCase()
      let lat = null, lng = null
      for (const [kw, pos] of Object.entries(USNI_SHIP_POSITIONS)) {
        if (combined.includes(kw)) { lat = pos.lat; lng = pos.lng; break }
      }
      // Extract coords if article mentions them (rare but possible)
      const coordMatch = combined.match(/([0-9]{1,2})°([ns])[^0-9]*([0-9]{1,3})°([ew])/)
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]) * (coordMatch[2]==='s'?-1:1)
        lng = parseFloat(coordMatch[3]) * (coordMatch[4]==='w'?-1:1)
      }
      return {
        id: 'usni-' + title.slice(0, 20).replace(/\s/g, '-'),
        type: 'naval', icon: '⚓', title,
        detail: desc.slice(0,300),
        severity: 'medium', source: 'USNI Fleet Tracker', url: link,
        ts: pub || new Date().toISOString(), region: 'Global',
        ...(lat !== null ? { lat, lng } : {}),
      }
    }).filter(Boolean)
  } catch { return [] }
}

async function fetchOref() {
  const today = new Date().toISOString().slice(0,10)
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10)
  // Try multiple Oref endpoints - API changed multiple times in 2024-2025
  const endpoints = [
    // Current active API (2025)
    { url: 'https://www.oref.org.il/warningMessages/alert/alerts.json', headers: { 'Referer': 'https://www.oref.org.il/', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } },
    { url: 'https://www.oref.org.il/WarningMessages/alert/alerts.json', headers: { 'Referer': 'https://www.oref.org.il/', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' } },
    // History endpoints (returns recent alerts even when no active alert)
    { url: `https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=en&fromDate=${today}&toDate=${today}&mode=0`, headers: { 'Referer': 'https://www.oref.org.il/' } },
    { url: `https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=en&fromDate=${yesterday}&toDate=${today}&mode=0`, headers: { 'Referer': 'https://www.oref.org.il/' } },
    // Legacy endpoints
    { url: 'https://www.oref.org.il/Shared/Ajax/GetAlerts.aspx?lang=en', headers: { 'Referer': 'https://www.oref.org.il/' } },
    // Proxy fallbacks via allorigins
    { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.oref.org.il/WarningMessages/alert/alerts.json'), headers: {} },
    { url: 'https://corsproxy.io/?' + encodeURIComponent('https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=en&fromDate=' + today + '&toDate=' + today + '&mode=0'), headers: {} },
  ]
  for (const { url, headers } of endpoints) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, signal: AbortSignal.timeout(8000) })
      if (!r.ok) continue
      const text = await r.text()
      if (!text || text.trim().startsWith('<') || text.trim() === '') continue
      const data = JSON.parse(text)
      const arr = Array.isArray(data) ? data : (data?.data || [])
      if (!arr.length) return [] // No active alerts right now (not an error)
      return arr.map(a => ({
        id: 'oref-' + (a.id || a.alertDate || Math.random().toString(36).slice(2)),
        type: 'red_alert', icon: '🚨',
        title: '🚨 RED ALERT — ' + (a.name || a.data || 'Israel'),
        detail: 'Zone: ' + (a.name || a.data || '') + ' | Cat: ' + (a.cat || 'missile/rocket'),
        severity: 'critical', source: 'Israel HFC (Oref)',
        ts: a.alertDate || new Date().toISOString(), region: 'Middle East'
      }))
    } catch {}
  }
  return [] // All endpoints failed - no active alerts or API down
}

async function fetchGPSJam() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    // Try direct first, then allorigins fallback
    let data = null
    const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10)
    for (const url of [
      'https://gpsjam.org/data/gpsjam_' + today + '.json',
      'https://gpsjam.org/data/gpsjam_' + yesterday + '.json',
      'https://corsproxy.io/?' + encodeURIComponent('https://gpsjam.org/data/gpsjam_' + today + '.json'),
      'https://corsproxy.io/?' + encodeURIComponent('https://gpsjam.org/data/gpsjam_' + yesterday + '.json'),
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://gpsjam.org/data/gpsjam_' + today + '.json'),
      'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://gpsjam.org/data/gpsjam_' + yesterday + '.json'),
    ]) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (r.ok) { data = await r.json(); break }
      } catch {}
    }
    if (!Array.isArray(data)) return []
    return data.filter(d => d.jamming > 0.45).slice(0, 80).map(d => ({
      id: 'gps-' + d.lat + '_' + d.lon,
      type: 'gps_jam', icon: '📡',
      title: 'GPS Jamming ' + Math.round(d.jamming * 100) + '% @ ' + Number(d.lat).toFixed(1) + '°, ' + Number(d.lon).toFixed(1) + '°',
      detail: 'Intensity: ' + Math.round(d.jamming * 100) + '% — likely military EW. Level ' + (d.jamming > 0.85 ? 3 : 2) + '/3',
      severity: d.jamming > 0.8 ? 'high' : 'medium',
      source: 'GPSJam.org', ts: new Date().toISOString(), region: 'Global',
      lat: d.lat, lng: d.lon
    }))
  } catch { return [] }
}

async function fetchWHO() {
  try {
    const r = await get('https://www.who.int/csr/don/en/rss.xml')
    if (!r) return []
    const txt = await r.text()
    const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    return items.slice(0, 8).map(m => {
      const b = m[1]
      const title = (b.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g,'').trim()
      const link = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim()
      const pub = b.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]
      if (!title) return null
      return {
        id: 'who-' + title.slice(0, 20).replace(/\s/g, '-'),
        type: 'disease', icon: '🦠', title: '🦠 WHO: ' + title,
        detail: b.match(/<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/i)?.[1]?.replace(/<[^>]+>/g,'').slice(0,200) || '',
        severity: 'high', source: 'WHO Disease Outbreak', url: link,
        ts: pub || new Date().toISOString(), region: 'Global'
      }
    }).filter(Boolean)
  } catch { return [] }
}

async function fetchProMED() {
  try {
    const results = []

    // 0a. rss2json.com — free RSS-to-JSON proxy, different IP range than Vercel
    try {
      const rss2R = await get(
        'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent('https://promedmail.org/feed/') + '&count=20',
        10000, { 'Accept': 'application/json' }
      )
      if (rss2R) {
        const rss2D = await rss2R.json().catch(()=>null)
        const items = rss2D?.items || []
        if (items.length > 0) {
          items.forEach((p, i) => {
            const title = (p.title||'').replace(/<[^>]+>/g,'').trim()
            if (!title || title.length < 5) return
            results.push({
              id: 'promed-rss2-' + i,
              type:'disease', icon:'🦠',
              title: '🦠 ProMED: ' + title.slice(0,120),
              detail: (p.description||p.content||'').replace(/<[^>]+>/g,'').slice(0,200),
              severity:'medium', source:'ProMED RSS',
              url: p.link || 'https://promedmail.org',
              ts: p.pubDate || new Date().toISOString(),
              region:'Global',
            })
          })
          if (results.length > 0) {
            console.log('[ProMED] rss2json proxy returned', results.length, 'items')
            return results
          }
        }
      }
    } catch {}

    // 0b. ProMED WordPress REST API
    try {
      const wpR = await get('https://promedmail.org/wp-json/wp/v2/posts?per_page=20&_fields=id,title,link,date,excerpt', 12000, {
        'Accept': 'application/json',
      })
      if (wpR) {
        const wpD = await wpR.json().catch(()=>null)
        if (Array.isArray(wpD) && wpD.length > 0) {
          wpD.forEach((p, i) => {
            const title = (p.title?.rendered || p.title || '').replace(/<[^>]+>/g,'').trim()
            if (!title || title.length < 5) return
            results.push({
              id: 'promed-wp-' + (p.id||i),
              type:'disease', icon:'🦠',
              title: '🦠 ProMED: ' + title.slice(0,120),
              detail: (p.excerpt?.rendered||'').replace(/<[^>]+>/g,'').trim().slice(0,200),
              severity:'medium', source:'ProMED',
              url: p.link || 'https://promedmail.org',
              ts: p.date || new Date().toISOString(),
              region:'Global',
            })
          })
          if (results.length > 0) return results
        }
      }
    } catch {}

    // 0b. ISID ProMED mirror RSS
    try {
      const isidR = await get('https://www.isid.org/feed/', 8000)
      if (isidR) {
        const xml = await isidR.text().catch(()=>'')
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
        items.slice(0,15).forEach((m,i) => {
          const title = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?([^<\]]+)/i)?.[1]||'').trim()
          const link = (m[1].match(/<link[^>]*>([^<]+)/i)?.[1]||'').trim()
          const pub = (m[1].match(/<pubDate>([^<]+)/i)?.[1]||'').trim()
          if (!title || title.length < 5) return
          if (!/disease|outbreak|virus|infect|fever|cholera|plague|mpox|ebola|dengue|measles|flu|covid|sars|mers|polio|anthrax|botulism/i.test(title)) return
          results.push({ id:'promed-isid-'+i, type:'disease', icon:'🦠',
            title:'🦠 ProMED/ISID: '+title.slice(0,120), detail:'', severity:'medium',
            source:'ISID/ProMED', url:link||'https://www.isid.org',
            ts:pub?new Date(pub).toISOString():new Date().toISOString(), region:'Global' })
        })
        if (results.length > 0) return results
      }
    } catch {}

    // 0c. Outbreak News Today - reliable ProMED aggregator
    try {
      const ontR = await get('https://outbreaknewstoday.com/feed/', 8000)
      if (ontR) {
        const xml = await ontR.text().catch(()=>'')
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
        items.slice(0,15).forEach((m,i) => {
          const title = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?([^<\]]+)/i)?.[1]||'').trim()
          const link = (m[1].match(/<link[^>]*>([^<]+)/i)?.[1]||'').trim()
          const pub = (m[1].match(/<pubDate>([^<]+)/i)?.[1]||'').trim()
          if (!title || title.length < 5) return
          results.push({ id:'promed-ont-'+i, type:'disease', icon:'🦠',
            title:'🦠 Outbreak News: '+title.slice(0,120), detail:'', severity:'medium',
            source:'Outbreak News Today', url:link||'https://outbreaknewstoday.com',
            ts:pub?new Date(pub).toISOString():new Date().toISOString(), region:'Global' })
        })
        if (results.length > 0) return results
      }
    } catch {}

    // 1. ProMED RSS feed (may be Vercel-blocked but worth trying)
    const rssR = await get('https://promedmail.org/feed/', 12000, {
      'Accept': 'application/rss+xml, application/xml, text/xml',
    })
    if (rssR) {
      const xml = await rssR.text().catch(() => '')
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      items.slice(0, 15).forEach(m => {
        const b = m[1]
        const title = (b.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]||'').trim()
        const link  = (b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]||'').trim()
        const desc  = (b.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]||'').replace(/<[^>]+>/g,'').trim().slice(0,200)
        const pub   = (b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]||'').trim()
        if (!title) return
        results.push({ id:'promed-rss-'+title.slice(0,20).replace(/\W/g,'-'),
          type:'disease', icon:'🦠', title:'🦠 ProMED: '+title.slice(0,120),
          detail:desc, severity:'medium', source:'ProMED RSS',
          url:link||'https://promedmail.org', ts:pub?new Date(pub).toISOString():new Date().toISOString(), region:'Global' })
      })
      if (results.length) return results
    }

    // 2. Scrape promedmail.org homepage — top 100 posts in table
    const homeR = await get('https://promedmail.org/', 15000, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    })
    if (homeR) {
      const html = await homeR.text().catch(() => '')
      // ProMED homepage has a post list - extract href + title from anchor tags
      // Pattern: links to /promed-post/?id=NNNN with post title text
      const postLinks = [...html.matchAll(/href="(https?:\/\/promedmail\.org\/promed-post\/\?(?:p|id)=[\d]+)"[^>]*>([^<]{10,})<\/a>/gi)]
      postLinks.slice(0, 20).forEach((m, i) => {
        const url = m[1], rawTitle = m[2].replace(/\s+/g,' ').trim()
        if (!rawTitle||rawTitle.length < 8) return
        results.push({ id:'promed-home-'+i,
          type:'disease', icon:'🦠', title:'🦠 ProMED: '+rawTitle.slice(0,120),
          detail:'', severity:'medium', source:'ProMED',
          url, ts:new Date().toISOString(), region:'Global' })
      })
      // Also try: table rows with class post-row or similar
      if (!results.length) {
        const tableRows = [...html.matchAll(/<tr[^>]*>[\s\S]{0,500}?href="([^"]*promed[^"]*)"[^>]*>([\s\S]{1,200}?)<\/a>/gi)]
        tableRows.slice(0, 20).forEach((m, i) => {
          const title = m[2].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()
          if (title.length < 8) return
          results.push({ id:'promed-tr-'+i, type:'disease', icon:'🦠',
            title:'🦠 ProMED: '+title.slice(0,120), detail:'', severity:'medium',
            source:'ProMED', url:m[1].startsWith('http')?m[1]:'https://promedmail.org'+m[1],
            ts:new Date().toISOString(), region:'Global' })
        })
      }
      if (results.length) return results
    }

    // 3. HealthMap (Harvard School of Public Health) - aggregates global disease alerts
    try {
      const hmR = await get('https://healthmap.org/genapi/en/alert/rss/30', 10000)
      if (hmR) {
        const xml = await hmR.text().catch(()=>'')
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
        items.slice(0,15).forEach((m,i) => {
          const title = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?([^\]<]+)/i)?.[1]||'').trim()
          const link  = (m[1].match(/<link[^>]*>([^<]+)/i)?.[1]||'').trim()
          const pub   = (m[1].match(/<pubDate>([^<]+)/i)?.[1]||'').trim()
          if (!title || title.length < 5) return
          results.push({ id:'hm-'+i, type:'disease', icon:'🦠',
            title:'🦠 HealthMap: '+title.slice(0,120), detail:'', severity:'medium',
            source:'HealthMap', url:link||'https://healthmap.org',
            ts:pub?new Date(pub).toISOString():new Date().toISOString(), region:'Global' })
        })
        if (results.length > 0) return results
      }
    } catch {}

    // 4. ECDC (European CDC) epidemic intelligence
    try {
      const ecdcR = await get('https://www.ecdc.europa.eu/en/rss-feed/all', 8000)
      if (ecdcR) {
        const xml = await ecdcR.text().catch(()=>'')
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
        items.filter(m=>/disease|outbreak|alert|epidemic|virus|infection/i.test(m[1]))
          .slice(0,10).forEach((m,i) => {
          const title = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?([^\]<]+)/i)?.[1]||'').trim()
          const link  = (m[1].match(/<link[^>]*>([^<]+)/i)?.[1]||'').trim()
          const pub   = (m[1].match(/<pubDate>([^<]+)/i)?.[1]||'').trim()
          if (!title) return
          results.push({ id:'ecdc-'+i, type:'disease', icon:'🦠',
            title:'🦠 ECDC: '+title.slice(0,120), detail:'', severity:'medium',
            source:'ECDC', url:link||'https://www.ecdc.europa.eu',
            ts:pub?new Date(pub).toISOString():new Date().toISOString(), region:'Europe' })
        })
        if (results.length > 0) return results
      }
    } catch {}

    // 5. WHO Disease Outbreak News RSS as final fallback
    const whoR = await get('https://www.who.int/rss-feeds/news-english.xml')
    if (whoR) {
      const xml = await whoR.text().catch(()=>'')
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      items.filter(m=>/disease|outbreak|virus|epidemic|cholera|measles|dengue/i.test(m[1]))
        .slice(0,8).forEach(m=>{
          const title=(m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]||'').trim()
          const link=(m[1].match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]||'').trim()
          if(!title) return
          results.push({id:'who-disease-'+title.slice(0,16).replace(/\W/g,'-'),type:'disease',icon:'🦠',
            title:'🦠 WHO Disease: '+title.slice(0,120),detail:'',severity:'medium',
            source:'WHO Disease Outbreak News',
            url:link,ts:new Date().toISOString(),region:'Global'})
        })
    }
    return results
  } catch { return [] }
}

async function fetchCloudflare() {
  const CF_TOKEN = process.env.CF_TOKEN || ''
  if (!CF_TOKEN) return []
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/radar/outages/latest?format=json', {
      headers: { 'Authorization': 'Bearer ' + CF_TOKEN, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    })
    if (!r.ok) return []
    const d = await r.json()
    return (d?.result?.outages || []).slice(0, 6).map(o => ({
      id: 'cf-' + (o.id || Math.random().toString(36).slice(2)),
      type: 'cyber', icon: '🌐',
      title: 'Internet Disruption: ' + (o.location || o.country || 'Unknown'),
      detail: 'Traffic drop: ' + (o.value ? Math.round(o.value) + '%' : '?') + ' | ' + (o.type || 'outage'),
      severity: 'medium', source: 'Cloudflare Radar',
      ts: o.startTime || new Date().toISOString(), region: o.country || 'Global'
    }))
  } catch { return [] }
}

async function fetchBNONews() {
  try {
    // BNO News - fastest breaking news aggregator, SAMDesk equivalent
    const feeds = [
      'https://bnonews.com/index.php/feed/',
      'https://feeds.feedburner.com/bnonews/wLyv',
    ]
    for (const url of feeds) {
      const r = await get(url)
      if (!r) continue
      const txt = await r.text()
      const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      if (!items.length) continue
      return items.map(m => {
        const b = m[1]
        const title = (b.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g,'').trim()
        const link  = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim()
        const pub   = b.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]
        if (!title || title.length < 5) return null
        const isConflict = /killed|dead|attack|explosion|missile|airstrike|shot|fire|crash|protest|blast|bomb/i.test(title)
        return {
          id: 'bno-' + title.slice(0,20).replace(/\s/g,'-'),
          type: isConflict ? 'conflict' : 'news', icon: isConflict ? '⚔️' : '📰',
          title: (isConflict ? '⚔️ ' : '📰 ') + title,
          detail: '', severity: isConflict ? 'high' : 'medium',
          source: 'BNO News', url: link,
          ts: pub || new Date().toISOString(), region: 'Global'
        }
      }).filter(Boolean)
    }
    return []
  } catch { return [] }
}

async function fetchLiveuamap() {
  try {
    // Liveuamap RSS - conflict zone maps with event feeds
    const feeds = [
      { url: 'https://liveuamap.com/rss', region: 'Ukraine' },
      { url: 'https://israelpalestine.liveuamap.com/rss', region: 'Middle East' },
      { url: 'https://syria.liveuamap.com/rss', region: 'Syria' },
    ]
    const all = []
    await Promise.allSettled(feeds.map(async ({ url, region }) => {
      const r = await get(url)
      if (!r) return
      const txt = await r.text()
      const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      items.slice(0, 6).forEach(m => {
        const b = m[1]
        const title = (b.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g,'').trim()
        const link  = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim()
        const lat   = parseFloat(b.match(/latitude[^>]*>([\d.-]+)/i)?.[1] || '')
        const lng   = parseFloat(b.match(/longitude[^>]*>([\d.-]+)/i)?.[1] || '')
        if (!title) return
        all.push({
          id: 'luam-' + region + '-' + title.slice(0,15).replace(/\s/g,'-'),
          type: 'conflict', icon: '⚔️',
          title: '⚔️ ' + region + ': ' + title,
          detail: '', severity: 'high',
          source: 'Liveuamap (' + region + ')', url: link,
          ts: new Date().toISOString(), region,
          ...(lat && lng && !isNaN(lat) && !isNaN(lng) ? { lat, lng } : {})
        })
      })
    }))
    return all
  } catch { return [] }
}

async function fetchCrisis24() {
  try {
    // Crisis24 / OSAC - US State Dept security alerts
    const r = await get('https://www.osac.gov/api/v1/reports?format=rss&limit=10')
    if (!r) return []
    const txt = await r.text()
    const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    return items.slice(0, 8).map(m => {
      const b = m[1]
      const title = (b.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g,'').trim()
      const link  = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim()
      if (!title) return null
      return {
        id: 'osac-' + title.slice(0,20).replace(/\s/g,'-'),
        type: 'conflict', icon: '🛡️',
        title: '🛡️ OSAC: ' + title,
        detail: '', severity: 'medium',
        source: 'US OSAC Security', url: link,
        ts: new Date().toISOString(), region: 'Global'
      }
    }).filter(Boolean)
  } catch { return [] }
}


async function fetchNewsdataConflict() {
  try {
    const key = process.env.NEWSDATA_KEY || ''
    const r = await fetch(
      `https://newsdata.io/api/1/latest?apikey=${key}&q=conflict+OR+attack+OR+explosion+OR+airstrike&language=en&category=world&size=10`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!r.ok) return []
    const d = await r.json()
    return (d?.results||[]).map(a => ({
      id: 'nd-' + (a.article_id||a.link||'').slice(-12),
      type: 'conflict', icon: '⚔️',
      title: '⚔️ ' + (a.title||'').slice(0,120),
      detail: (a.description||'').slice(0,200),
      severity: /killed|dead|attack|explosion|missile/i.test(a.title||'') ? 'high' : 'medium',
      source: 'Newsdata.io',
      url: a.link||'',
      ts: a.pubDate||new Date().toISOString(),
      region: (a.country||[]).join(', ')||'Global',
      lat: a.latitude ? parseFloat(a.latitude) : null,
      lng: a.longitude ? parseFloat(a.longitude) : null,
    })).filter(Boolean)
  } catch { return [] }
}

async function fetchRedditConflict() {
  try {
    // Reddit JSON API - no auth needed for public subreddits
    const subs = ['worldnews','UkrainianConflict','israel','geopolitics','CredibleDefense']
    const all = []
    await Promise.allSettled(subs.map(async sub => {
      const r = await fetch(
        `https://www.reddit.com/r/${sub}/new.json?limit=10`,
        { headers: {'User-Agent':'NEXUS-Intel/5.0 (research)'}, signal: AbortSignal.timeout(8000) }
      ).catch(() => null)
      if (!r?.ok) return
      const d = await r.json().catch(() => null)
      ;(d?.data?.children||[]).forEach(p => {
        const pd = p.data
        if (!pd?.title) return
        all.push({
          id: 'reddit-' + pd.id,
          type: 'news', icon: '📡',
          title: `📡 r/${sub}: ${pd.title.slice(0,100)}`,
          detail: (pd.selftext||pd.url||'').slice(0,200),
          severity: 'low',
          source: `Reddit r/${sub}`,
          url: 'https://reddit.com' + (pd.permalink||''),
          ts: new Date((pd.created_utc||0)*1000).toISOString(),
          region: 'Global',
        })
      })
    }))
    return all
  } catch { return [] }
}

async function fetchWikiConflictEdits() {
  try {
    const conflictPages = [
      'Russian_invasion_of_Ukraine','2024_Israel%E2%80%93Hamas_war','War_in_Sudan',
      'Myanmar_civil_war','Yemeni_civil_war','2025','2026',
    ]
    const all = []
    await Promise.allSettled(conflictPages.map(page =>
      fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${page}&prop=revisions&rvprop=timestamp|comment|user&rvlimit=3&format=json&origin=*`,
        { signal: AbortSignal.timeout(6000) })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return
          Object.values(d?.query?.pages||{}).forEach(p => {
            ;(p.revisions||[]).forEach(rev => {
              const age = Date.now() - new Date(rev.timestamp).getTime()
              if (age > 3600000) return
              all.push({
                id: 'wiki-' + p.pageid + '-' + rev.timestamp,
                type: 'news', icon: '📝',
                title: `📝 Wikipedia: ${p.title} edited`,
                detail: `By ${rev.user}: ${rev.comment?.slice(0,200)||'(no comment)'}`,
                severity: 'low',
                source: 'Wikipedia Edits',
                url: `https://en.wikipedia.org/wiki/${page}`,
                ts: rev.timestamp,
                region: 'Global',
              })
            })
          })
        }).catch(()=>{})
    ))
    return all
  } catch { return [] }
}

async function fetchNOTAMs() {
  try {
    const all = []
    // Bellingcat/OSINT: ADS-B exchange NOTAM-adjacent data
    // FAA NOTAM API public endpoint — no key needed for basic query
    const r = await fetch(
      'https://external-api.faa.gov/notamapi/v1/notams?responseFormat=geoJson&pageNum=1&pageSize=100',
      { headers:{'accept':'application/json'}, signal: AbortSignal.timeout(10000) }
    ).catch(() => null)
    if (r?.ok) {
      const d = await r.json().catch(() => null)
      ;(d?.items||[]).forEach(n => {
        const text = n.properties?.coreNOTAMData?.notam?.text || n.properties?.notamText || ''
        if (!text) return
        const isMil = /\bR\d{3,}\b|MILITARY|RESTRICTED|TFR|PROHIBITED/i.test(text)
        if (!isMil) return
        const lat = n.geometry?.coordinates?.[1]
        const lng = n.geometry?.coordinates?.[0]
        all.push({
          id: 'notam-' + (n.properties?.coreNOTAMData?.notam?.notamID || Math.random().toString(36).slice(2)),
          type: 'notam', icon: '🚫',
          title: `🚫 NOTAM: ${text.slice(0,80)}`,
          detail: text.slice(0,300),
          severity: 'high',
          source: 'FAA NOTAM',
          url: 'https://notams.faa.gov',
          ts: new Date().toISOString(),
          region: 'N. America',
          lat, lng,
        })
      })
    }
    return all.slice(0, 30)
  } catch { return [] }
}

async function fetchBGP() {
  try {
    const r = await fetch(
      'https://bgpstream.crosswork.cisco.com/api/v1/data/hijacks?limit=10&format=json',
      { headers:{'Accept':'application/json'}, signal: AbortSignal.timeout(8000) }
    ).catch(() => null)
    if (!r?.ok) return []
    const d = await r.json().catch(() => null)
    return (d?.data||d?.results||[]).slice(0,10).map(e => ({
      id: 'bgp-' + (e.id||Math.random().toString(36).slice(2)),
      type: 'cyber', icon: '🌐',
      title: `🌐 BGP Hijack: ${e.prefix||e.announced_prefix||'?'} via AS${e.hijacker_asn||'?'}`,
      detail: `Routing anomaly: ${e.type||'hijack'}. Prefix: ${e.prefix||'?'}. Hijacker AS: ${e.hijacker_asn||'?'}`,
      severity: 'medium',
      source: 'BGP Stream',
      url: 'https://bgpstream.crosswork.cisco.com',
      ts: e.start_time||new Date().toISOString(),
      region: 'Global',
    }))
  } catch { return [] }
}

async function fetchPlanetLabs() {
  // Satellite imagery from: Copernicus EMS (real crisis maps), NASA EONET imagery,
  // Sentinel Hub public imagery, and Planet Labs blog
  const items = []
  const getTag = (str, tag) => str?.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\s\S]*?)(?:\\]\\]>)?<\/${tag}>`, 'i'))?.[1]?.replace(/<[^>]+>/g,'')?.trim() || ''

  // 1. Copernicus Emergency Management Service — REAL crisis satellite maps
  // These are actual SAR/optical satellite activations for disasters & conflicts
  try {
    const r = await get('https://emergency.copernicus.eu/mapping/list-of-activations-rapid/rss', 10000)
    if (r) {
      const xml = await r.text().catch(()=>'')
      ;[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 12).forEach(m => {
        const title = getTag(m[1],'title')
        const link  = getTag(m[1],'link') || 'https://emergency.copernicus.eu'
        const desc  = getTag(m[1],'description')
        const pub   = getTag(m[1],'pubDate')
        if (!title) return
        // Extract activation code (e.g. EMSR750) for thumbnail URL
        const code  = title.match(/EMSR\d+/)?.[0] || ''
        // Copernicus preview image URL pattern
        const thumb = code
          ? `https://emergency.copernicus.eu/mapping/system/files/ems_images/${code.toLowerCase()}_01epf_00overview_r1_rtp01.jpg`
          : null
        const sev = /flood|fire|earthquake|conflict|explosion|war|attack/i.test(title+desc) ? 'high' : 'medium'
        items.push({
          id: 'cops-' + (code || title.slice(0,20).replace(/\W/g,'')),
          type: 'satellite_imagery', icon: '🛰',
          title: '🛰 Copernicus: ' + title.slice(0, 100),
          detail: desc.replace(/<[^>]+>/g,'').slice(0, 200),
          severity: sev,
          source: 'Copernicus EMS',
          url: link,
          thumbnail: thumb,
          ts: pub ? new Date(pub).toISOString() : new Date().toISOString(),
          region: title.replace(/EMSR\d+\s*-?\s*/,'').slice(0,40),
        })
      })
    }
  } catch {}

  // 2. NASA EONET imagery events — fires, storms, ice, dust
  try {
    const r = await get('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20&days=3', 8000)
    if (r) {
      const d = await r.json().catch(()=>null)
      ;(d?.events||[]).filter(e => e.geometry?.[0]).slice(0,8).forEach(e => {
        const geo = e.geometry[0]
        const cat = e.categories?.[0]?.title || ''
        const isCrisis = /wildfire|flood|severe|hurricane|tornado/i.test(cat+e.title)
        // NASA Worldview thumbnail for the event location
        const lat = geo.coordinates?.[1] || 0
        const lng = geo.coordinates?.[0] || 0
        const thumb = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${new Date().toISOString().slice(0,10)}/250m/${Math.floor((90-lat)/0.072)},${Math.floor((lng+180)/0.072)}.jpg`
        items.push({
          id: 'eonet-img-' + e.id,
          type: 'satellite_imagery', icon: '🌍',
          title: `🌍 NASA: ${e.title}`,
          detail: `Category: ${cat} · Last update: ${geo.date?.slice(0,10)||''}`,
          severity: isCrisis ? 'high' : 'medium',
          source: 'NASA EONET',
          url: `https://earthobservatory.nasa.gov`,
          thumbnail: thumb,
          ts: geo.date || new Date().toISOString(),
          region: cat,
          lat, lng,
        })
      })
    }
  } catch {}

  // 3. Planet Labs blog — latest imagery announcements
  try {
    const r = await get('https://www.planet.com/pulse/feed/', 8000)
    if (r) {
      const xml = await r.text().catch(()=>'')
      ;[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,6).forEach(m => {
        const title = getTag(m[1],'title')
        const link  = getTag(m[1],'link')
        const desc  = getTag(m[1],'description').replace(/<[^>]+>/g,'').slice(0,200)
        const pub   = getTag(m[1],'pubDate')
        // Extract first image from description
        const imgMatch = m[1].match(/<img[^>]+src="([^"]+)"/i)
        const thumb = imgMatch?.[1] || null
        if (!title) return
        items.push({
          id: 'planet-' + (link||title).slice(-20).replace(/\W/g,''),
          type: 'satellite_imagery', icon: '🛰',
          title: '🛰 Planet Labs: ' + title.slice(0, 100),
          detail: desc, severity: 'low',
          source: 'Planet Labs',
          url: link || 'https://www.planet.com',
          thumbnail: thumb,
          ts: pub ? new Date(pub).toISOString() : new Date().toISOString(),
          region: 'Global',
        })
      })
    }
  } catch {}

  // 4. ReliefWeb crisis maps — UN humanitarian imagery
  try {
    const r = await get('https://api.reliefweb.int/v1/reports?appname=nexus&filter[field]=format.name&filter[value]=Map&sort[]=date:desc&limit=8&fields[include][]=title&fields[include][]=url_alias&fields[include][]=date&fields[include][]=file', 10000)
    if (r) {
      const d = await r.json().catch(()=>null)
      ;(d?.data||[]).forEach(rep => {
        const title = rep.fields?.title
        const url   = 'https://reliefweb.int' + (rep.fields?.url_alias||'')
        const thumb = rep.fields?.file?.[0]?.preview?.url || null
        const pub   = rep.fields?.date?.created
        if (!title) return
        items.push({
          id: 'rw-map-' + rep.id,
          type: 'satellite_imagery', icon: '🗺',
          title: '🗺 UN ReliefWeb: ' + title.slice(0,100),
          detail: 'UN humanitarian crisis map',
          severity: 'medium',
          source: 'UN ReliefWeb',
          url, thumbnail: thumb,
          ts: pub || new Date().toISOString(),
          region: 'Global',
        })
      })
    }
  } catch {}

  return items
}


async function fetchTelegram() {
  // Public Telegram OSINT channels via RSS.app and rsshub mirrors — no auth needed
  // Telegram public channels via t.me/s/ web scraping (no auth needed)
  // Bot API only works if bot is a member - t.me/s/ works for any public channel
  const TG_HANDLES = [
    // Ukraine/Russia conflict - primary sources
    { handle:'intelslava',           name:'Intel Slava Z',        icon:'📡' },
    { handle:'wartranslated',        name:'War Translated',       icon:'📡' },
    { handle:'UkraineNow',           name:'Ukraine Now',          icon:'🇺🇦' },
    { handle:'militarylandnews',     name:'Military Land',        icon:'⚔️' },
    { handle:'nexta_tv',             name:'NEXTA TV',             icon:'📡' },
    { handle:'rybar',                name:'Rybar (RU)',           icon:'📡' },
    { handle:'flash_news_ua',        name:'Flash News UA',        icon:'⚡' },
    { handle:'ukraineweapon',        name:'Ukraine Weapons',      icon:'🔫' },
    { handle:'DeepStateUA',          name:'DeepState UA',         icon:'🗺' },
    { handle:'trokhymchuk',          name:'Trokhymchuk Intel',    icon:'🔍' },
    // OSINT & Intelligence
    { handle:'osintdefender',        name:'OSINT Defender',       icon:'🔍' },
    { handle:'WarMonitor3',          name:'War Monitor',          icon:'⚠️' },
    { handle:'GeoConfirmed',         name:'GeoConfirmed',         icon:'📍' },
    { handle:'IntelRepublic',        name:'Intel Republic',       icon:'🔍' },
    { handle:'operativnoZSU',        name:'ZSU Operative',        icon:'🪖' },
    // Middle East
    { handle:'Middle_East_Spectator',name:'ME Spectator',         icon:'🌍' },
    { handle:'QudsNen',              name:'Quds News Network',    icon:'📰' },
    { handle:'arabicosint',          name:'Arabic OSINT',         icon:'🔍' },
    // Global security
    { handle:'warmonitor1',          name:'War Monitor 1',        icon:'⚠️' },
    { handle:'conflictupdates',      name:'Conflict Updates',     icon:'⚔️' },
    { handle:'geopolitics_live',     name:'Geopolitics Live',     icon:'🌐' },
    { handle:'breakingmilitary',     name:'Breaking Military',    icon:'🪖' },
    { handle:'worldwarnews',         name:'World War News',       icon:'🌍' },
    // Naval/Maritime
    { handle:'navalintel',           name:'Naval Intel',          icon:'⚓' },
    { handle:'HouthiMilitary',       name:'Houthi Military',      icon:'⚓' },
    // Africa/Sahel
    { handle:'OSINTtechnical',       name:'OSINT Technical',      icon:'🔍' },
    { handle:'SahelIntelligence',    name:'Sahel Intel',          icon:'🌍' },
    // Asia-Pacific
    { handle:'indopacificsecurity',  name:'Indo-Pacific Security',icon:'🌏' },
    { handle:'TaiwanAlert',          name:'Taiwan Alert',         icon:'🇹🇼' },
    // Breaking / global
    { handle:'disclosetv',           name:'Disclose TV',          icon:'📡' },
    { handle:'sentdefender',         name:'Sentinel Defender',    icon:'🛡' },
    { handle:'CombatFootage',        name:'Combat Footage',       icon:'🎥' },
    { handle:'InformNapalm',         name:'InformNapalm',         icon:'🔥' },
    { handle:'ukraine_911',          name:'Ukraine 911',          icon:'🚨' },
  ]
  const CHANNELS = [
    // Mix: t.me/s/ scrape + RSS fallbacks for direct OSINT feeds
    ...TG_HANDLES.map(ch => ({ url:'https://t.me/s/'+ch.handle, name:ch.name, icon:ch.icon, isTme:true })),
    { url:'https://www.bellingcat.com/feed/', name:'Bellingcat OSINT', icon:'🔍' },
    { url:'https://warontherocks.com/feed/', name:'War on the Rocks', icon:'⚔️' },
  ]
  const all = []
  const getXML = (xml, tag) => xml.match(new RegExp('<' + tag + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + tag + '>', 'i'))?.[1]?.trim() || ''
  const CONFLICT_KW = /strike|attack|explos|missile|drone|shell|artill|troops|forces|kill|wound|destroy|hit|fire|launch|captur|occupy|bomb|offensive|advance|retreat/i
  await Promise.allSettled(CHANNELS.map(async ch => {
    try {
      const r = await fetch(ch.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36', 'Accept': ch.isTme ? 'text/html' : '*/*' },
        signal: AbortSignal.timeout(9000)
      }).catch(()=>null)
      if (!r?.ok) return
      const body = await r.text().catch(()=>'')

      if (ch.isTme) {
        // Parse t.me/s/ public channel page
        const dateMatches = [...body.matchAll(/datetime="([^"]+)"/g)]
        const msgStarts = [...body.matchAll(/class="tgme_widget_message_text[^"]*"/g)]
        const msgTexts = []
        msgStarts.forEach(m => {
          const openTag = body.indexOf('>', m.index + m[0].length) + 1
          if (openTag < 1) return
          const raw = body.slice(openTag, openTag+1200)
          const text = raw.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()
          if (text.length > 20) msgTexts.push(text)
        })
        msgTexts.slice(0, 6).forEach((text, i) => {
          if (text.length < 20 || !CONFLICT_KW.test(text)) return
          const isCritical = /airstrike|explosion|missile|killed|bombing/i.test(text)
          all.push({
            id: 'tg-' + ch.handle + '-' + i + '-' + Date.now(),
            type: 'news', icon: ch.icon,
            title: ch.icon + ' ' + ch.name + ': ' + text.slice(0, 100),
            detail: text.slice(0, 200),
            severity: isCritical ? 'high' : 'medium',
            source: ch.name,
            url: ch.url,
            ts: dateMatches[i] ? dateMatches[i][1] : new Date().toISOString(),
            region: 'Global',
          })
        })
      } else {
        // RSS feed
        const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
        items.slice(0, 5).forEach(m => {
          const title = getXML(m[1], 'title')
          const link  = getXML(m[1], 'link')
          const desc  = getXML(m[1], 'description').replace(/<[^>]+>/g, '').slice(0, 200)
          const pub   = getXML(m[1], 'pubDate')
          if (!title || title.length < 5) return
          if (!CONFLICT_KW.test(title + ' ' + desc)) return
          all.push({
            id: 'tg-' + (link||title).slice(-16).replace(/\W/g,''),
            type: 'news', icon: ch.icon,
            title: ch.icon + ' ' + ch.name + ': ' + title.slice(0, 100),
            detail: desc, severity: /missile strike|explosion|killed|airstrike/i.test(title) ? 'high' : 'medium',
            source: ch.name, url: link || '',
            ts: pub ? new Date(pub).toISOString() : new Date().toISOString(),
            region: 'Global',
          })
        })
      }
    } catch {}
  }))
  return all
}


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')

  const [nws, gdacs, usni, oref, gps, who, promed, cf, bno, luam, osac, nd, rdt, wiki, notam, bgp, tg, planet] = await Promise.allSettled([
    fetchNWS(), fetchGDACS(), fetchUSNI(), fetchOref(),
    fetchGPSJam(), fetchWHO(), fetchProMED(), fetchCloudflare(),
    fetchBNONews(), fetchLiveuamap(), fetchCrisis24(),
    fetchNewsdataConflict(), fetchRedditConflict(),
    fetchWikiConflictEdits(), fetchNOTAMs(), fetchBGP(), fetchTelegram(), fetchPlanetLabs()
  ])

  const g = r => r.status === 'fulfilled' ? (r.value || []) : []
  const SORD = { critical:0, high:1, medium:2, low:3 }
  // NWS and GDACS excluded from alerts — they are on the map directly via satellite.js
  // and create noise in the alerts tab (weather alerts are not intelligence alerts)
  const all = [
    ...g(oref), ...g(usni),
    ...g(gps), ...g(who), ...g(promed), ...g(cf),
    ...g(bno), ...g(luam), ...g(osac), ...g(nd), ...g(rdt),
    ...g(wiki), ...g(notam), ...g(bgp), ...g(tg), ...g(planet)
  ].sort((a, b) => (SORD[a.severity]||3) - (SORD[b.severity]||3))

  res.status(200).json({
    alerts: all,
    counts: {
      oref: g(oref).length, nws: g(nws).length, gdacs: g(gdacs).length,
      usni: g(usni).length, gps: g(gps).length, who: g(who).length,
      promed: g(promed).length, cloudflare: g(cf).length,
      bno: g(bno).length, liveuamap: g(luam).length, osac: g(osac).length,
      newsdata: g(nd).length, reddit: g(rdt).length,
      wiki: g(wiki).length, notam: g(notam).length, bgp: g(bgp).length,
      telegram: g(tg).length,
    },
    ts: new Date().toISOString()
  })
}
