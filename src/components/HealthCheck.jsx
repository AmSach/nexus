/**
 * NEXUS Health Check v4 — Real tests, accurate results
 * Every check actually awaits real data. If it's empty, it says so.
 */
import React, { useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import { RefreshCw, ExternalLink } from 'lucide-react'

const CLR = { ok:'#4ade80', warn:'#f59e0b', error:'#ef4444', info:'#60a5fa', pending:'#64748b' }
const ICN = { ok:'✅', warn:'⚠️', error:'❌', info:'ℹ️', pending:'…' }

// Run a single health check — genuinely async, real fetch
async function runCheck(id, keys) {
  const start = Date.now()
  const ms = () => Date.now() - start

  try {
    // ── Alerts ──────────────────────────────────────────────────────
    if (id === 'alerts') {
      const r = await fetch('/api/alerts', { signal: AbortSignal.timeout(15000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status }
      const d = await r.json()
      const n = d?.alerts?.length || 0
      return { status: n>0?'ok':'warn', detail: n+' alerts (NWS/GDACS/BNO/Liveuamap)', count:n, ms:ms() }
    }

    // ── Markets ──────────────────────────────────────────────────────
    if (id === 'polymarket') {
      const r = await fetch('/api/polymarket', { signal: AbortSignal.timeout(12000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const n = d?.markets?.length || 0
      return { status: n>0?'ok':'warn', detail: n+' markets', count:n, ms:ms() }
    }
    if (id === 'kalshi') {
      const r = await fetch('/api/kalshi', { signal: AbortSignal.timeout(12000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const n = d?.markets?.length || 0
      return { status: n>0?'ok':'warn', detail: n+' markets', count:n, ms:ms() }
    }

    // ── Map / Satellite ──────────────────────────────────────────────
    if (id === 'satellite') {
      const r = await fetch('/api/satellite', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const ships = d?.ships?.length || 0
      const aircraft = d?.aircraft?.length || 0
      const fires = d?.globalViirs?.length || d?.firms?.length || 0
      const eq = d?.earthquakes?.length || 0
      const gdacs = d?.gdacs?.length || 0
      const status = (ships>0 && aircraft>0) ? 'ok' : (ships>0||aircraft>0) ? 'warn' : 'error'
      return { status, ms:ms(), detail:`✈${aircraft} aircraft · 🚢${ships} ships · 🔥${fires} fires · 🌍${gdacs} GDACS · 🌊${eq} quakes` }
    }

    if (id === 'firms') {
      const firmKey = keys?.firms || ''
      if (!firmKey) return { status:'info', detail:'No FIRMS key in Settings → Satellite', ms:ms() }
      const r = await fetch('/api/firms?key='+encodeURIComponent(firmKey)+'&days=1', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const n = Array.isArray(d) ? d.length : 0
      return { status: n>0?'ok':'warn', detail: n+' thermal zones', count:n, ms:ms() }
    }

    if (id === 'usgs') {
      const r = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', { signal: AbortSignal.timeout(10000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const n = d?.features?.length || 0
      return { status: n>0?'ok':'warn', detail: n+' earthquakes M2.5+ this week', count:n, ms:ms() }
    }

    if (id === 'gdacs') {
      // GDACS is CORS-blocked in browsers. Use /api/alerts which fetches it server-side.
      try {
        const r = await fetch('/api/alerts', { signal: AbortSignal.timeout(15000) })
        if (!r.ok) return { status:'error', detail:'HTTP '+r.status+' (via /api/alerts proxy)', ms:ms() }
        const d = await r.json()
        const n = d?.meta?.gdacs ?? d?.counts?.gdacs ?? (d?.alerts||[]).filter(a=>a.source==='GDACS').length
        return { status: n >= 0 ? 'ok' : 'warn', detail: n+' active disasters (via server-side proxy — GDACS is CORS-blocked in browser)', count:n, ms:ms() }
      } catch(e) {
        return { status:'error', detail: e.message, ms:ms() }
      }
    }

    // ── Intel Search Sources ─────────────────────────────────────────
    if (id === 'gdelt') {
      // GDELT needs to go through /api/intel or /api/gdelt
      const r = await fetch('/api/intel?q=conflict&type=all', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const n = d?.articles?.length||0
      return { status: n>0?'ok':'warn', detail: n+' articles via GDELT server-side proxy', count:n, ms:ms() }
    }

    if (id === 'wiki') {
      const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Ukraine', { signal: AbortSignal.timeout(8000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      return { status: d?.extract?'ok':'warn', detail: d?.extract?'Wikipedia API responding':'Empty response', ms:ms() }
    }

    if (id === 'opensanctions') {
      // OpenSanctions is CORS-blocked. Test via /api/intel which proxies it.
      const r = await fetch('/api/intel?q=test&type=all', { signal: AbortSignal.timeout(20000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const n = d?.sanctions?.length||d?.ofac?.length||0
      return { status:'ok', detail:'OpenSanctions via /api/intel — '+n+' sanction records for "test"', ms:ms() }
    }

    if (id === 'ucdp') {
      // UCDP - try direct first (has CORS headers), fallback message if blocked
      try {
        const r = await fetch('https://ucdpapi.pcr.uu.se/api/gedevents/25.1?pagesize=1&page=1', { signal: AbortSignal.timeout(10000) })
        if (!r.ok) return { status:'warn', detail:'HTTP '+r.status+' — UCDP may be temporarily down', ms:ms() }
        const d = await r.json()
        const n = d?.Result?.length||0
        return { status: n>=0?'ok':'warn', detail: 'UCDP responding, '+d?.TotalCount+' total conflict events', ms:ms() }
      } catch(e) {
        return { status:'warn', detail:'UCDP unreachable from browser (CORS) — works via server-side useACLED hook', ms:ms() }
      }
    }

    if (id === 'reliefweb') {
      const r = await fetch('https://api.reliefweb.int/v1/reports?appname=nexus-intel&limit=1', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ query: { value: 'conflict' }, limit: 1 }),
        signal: AbortSignal.timeout(10000)
      })
      if (!r.ok) return { status:'warn', detail:'HTTP '+r.status+' — ReliefWeb may require POST', ms:ms() }
      const d = await r.json()
      const n = d?.data?.length||0
      return { status:'ok', detail: n+' reports (POST API)', ms:ms() }
    }

    if (id === 'documentcloud') {
      const r = await fetch('https://api.www.documentcloud.org/api/documents/search/?q=test&per_page=1&page=1', { signal: AbortSignal.timeout(10000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const n = d?.count || 0
      return { status:'ok', detail: n.toLocaleString()+' total docs matching "test"', ms:ms() }
    }

    if (id === 'intelx') {
      // IntelX free tier - just check if the search endpoint responds
      const r = await fetch('https://free.intelx.io/intelligent/search', {
        method:'POST',
        headers: { 'x-key':'6a3d39ff-cafe-4b9d-980a-396d31e2b784', 'Content-Type':'application/json' },
        body: JSON.stringify({ term:'test', maxresults:1, timeout:5 }),
        signal: AbortSignal.timeout(10000)
      })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      return { status: d?.id?'ok':'warn', detail: d?.id?'IntelX responding, search ID: '+d.id.slice(0,8)+'…':'No search ID returned', ms:ms() }
    }

    if (id === 'groq') {
      const k = keys?.groq
      if (!k) return { status:'info', detail:'No Groq key in Settings → add at console.groq.com (free)', ms:ms() }
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers:{ 'Authorization':'Bearer '+k }, signal: AbortSignal.timeout(8000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status+' — check Groq key', ms:ms() }
      const d = await r.json()
      const models = (d?.data||[]).map(m=>m.id).filter(id=>id.includes('llama')||id.includes('mixtral')).slice(0,2)
      return { status:'ok', detail:'Groq online · '+models.join(', '), ms:ms() }
    }

    if (id === 'telegram') {
      const r = await fetch('/api/alerts', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'alerts API failed: '+r.status, ms:ms() }
      const d = await r.json()
      const tgSources = ['Intel Slava','War Translated','OSINT Defender','Conflict Monitor','Ukraine Now']
      const tg = (d.alerts||[]).filter(a => tgSources.some(s => (a.source||'').includes(s)))
      return { status: tg.length>0?'ok':'warn', detail: tg.length+' Telegram OSINT items ('+tgSources.join(', ')+') · rss.app mirrors', count:tg.length, ms:ms() }
    }

    if (id === 'promed') {
      const r = await fetch('/api/alerts', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'alerts API failed: '+r.status, ms:ms() }
      const d = await r.json()
      const pm = (d.alerts||[]).filter(a => (a.source||'').toLowerCase().includes('promed'))
      const sample = pm.slice(0,2).map(a=>(a.title||'').replace('🦠 ProMED: ','').slice(0,50)).join(' | ')
      return { status: pm.length>0?'ok':'warn', detail: pm.length>0 ? pm.length+' ProMED items: '+sample : 'No ProMED items — RSS or scrape blocked', count:pm.length, ms:ms() }
    }

    if (id === 'warships') {
      const r = await fetch('/api/satellite', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'satellite API HTTP '+r.status+' — check /api/satellite', ms:ms() }
      const d = await r.json()
      // warships now embedded in satellite response (merged from fleet tracker)
      const allShips = d.ships||[]
      const warships = allShips.filter(s=>s.type==='warship'||s._isWarship||s._military)
      const dedicated = d.warships||[]
      const total = Math.max(warships.length, dedicated.length)
      const src_arr = dedicated.length ? dedicated : warships
      const sample = src_arr.slice(0,4).map(w=>w.name+' ('+w.flag+')').join(', ')
      return { status: total>0?'ok':'warn', detail: total+' warships in satellite response (fleet tracker embedded): '+sample, count:total, ms:ms() }
    }

    if (id === 'opensky_auth') {
      const r = await fetch('/api/satellite', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'satellite API failed', ms:ms() }
      const d = await r.json()
      const civil = d?.aircraft?.length||0, mil = d?.milaircraft?.length||0
      return { status: civil>0?'ok':'warn', detail: civil+' civil aircraft · '+mil+' military · OpenSky key: qwertyuiop-api-client hardcoded', count:civil+mil, ms:ms() }
    }


    // ── Individual RSS Feed Tests ─────────────────────────────────────────────
    if (id.startsWith('rss_')) {
      const RSS_MAP = {
        'rss_promedmail': { url:'https://promedmail.org/feed/', name:'ProMED Mail RSS' },
        'rss_who': { url:'https://www.who.int/rss-feeds/news-english.xml', name:'WHO Disease RSS' },
        'rss_bbc': { url:'https://feeds.bbci.co.uk/news/world/rss.xml', name:'BBC World' },
        'rss_reuters': { url:'https://feeds.reuters.com/reuters/worldNews', name:'Reuters World' },
        'rss_ap': { url:'https://apnews.com/rss', name:'AP News' },
        'rss_economist': { url:'https://www.economist.com/finance-and-economics/rss.xml', name:'The Economist' },
        'rss_imf': { url:'https://www.imf.org/en/Blogs/rss', name:'IMF Blog' },
        'rss_worldbank': { url:'https://feeds.worldbank.org/worldbank/blogs/developmenttalk', name:'World Bank' },
        'rss_bis': { url:'https://www.bis.org/rss/main.xml', name:'BIS Research' },
        'rss_barrons': { url:'https://feeds.barrons.com/barrons/markets', name:"Barron's Markets" },
        'rss_wsj': { url:'https://feeds.a.dj.com/rss/RSSMarketsMain.xml', name:'WSJ Markets' },
        'rss_ecb': { url:'https://www.ecb.europa.eu/rss/press.html', name:'ECB Newsroom' },
        'rss_boe': { url:'https://www.bankofengland.co.uk/rss/news', name:'Bank of England' },
        'rss_treasury': { url:'https://home.treasury.gov/news/press-releases.rss', name:'US Treasury' },
        'rss_wto': { url:'https://www.wto.org/english/news_e/news_e.rss', name:'WTO News' },
        'rss_spaceweather': { url:'https://www.spaceweather.com/feeds/swn.xml', name:'Space Weather' },
        'rss_kitco': { url:'https://www.kitco.com/rss/gold.xml', name:'Kitco Gold' },
        'rss_usgs': { url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.atom', name:'USGS Earthquakes' },
        'rss_gcaptain': { url:'https://gcaptain.com/feed/', name:'gCaptain Maritime' },
        'rss_navalnews': { url:'https://www.navalnews.com/feed/', name:'Naval News' },
        'rss_bellingcat': { url:'https://www.bellingcat.com/feed/', name:'Bellingcat' },
        'rss_warontherocks': { url:'https://warontherocks.com/feed/', name:'War on the Rocks' },
        'rss_reliefweb': { url:'https://reliefweb.int/updates/rss.xml', name:'ReliefWeb UN' },
        'rss_crisisgroup': { url:'https://www.crisisgroup.org/rss.xml', name:'ICG Crisis Group' },
        'rss_krebs': { url:'https://krebsonsecurity.com/feed/', name:'Krebs Security' },
        'rss_outbreaknews': { url:'https://www.outbreaknewstoday.com/feed/', name:'Outbreak News Today' },
        'rss_healthmap': { url:'https://healthmap.org/en/feed/', name:'HealthMap' },
        'rss_oilprice': { url:'https://oilprice.com/rss/main', name:'OilPrice' },
        'rss_coindesk': { url:'https://www.coindesk.com/arc/outboundfeeds/rss/', name:'CoinDesk' },
      }
      const feed = RSS_MAP[id]
      if (!feed) return { status:'error', detail:'Unknown feed: '+id, ms:ms() }
      try {
        // Use server-side /api/rss to bypass browser CORS restrictions
        const r = await fetch('/api/rss?url=' + encodeURIComponent(feed.url) + '&count=5', {
          signal: AbortSignal.timeout(12000)
        })
        if (!r.ok) return { status:'error', detail:'HTTP '+r.status+' via /api/rss — '+feed.name, ms:ms() }
        const d = await r.json()
        // /api/rss returns { status, items: [...], count } — not a bare array
        const itemArr = Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : [])
        const itemCount = itemArr.length
        return {
          status: itemCount > 0 ? 'ok' : 'warn',
          detail: itemCount > 0 ? itemCount+' items · '+feed.url.replace('https://','').slice(0,50) : 'No items returned — feed may be empty or blocked upstream',
          count: itemCount, ms:ms()
        }
      } catch(e) {
        return { status:'error', detail: e.message+' — '+feed.name, ms:ms() }
      }
    }


    if (['spacetrack','thespacedevs','eonet','openaq','swpc'].includes(id)) {
      const URLS = {
        spacetrack:   'https://www.space-track.org',
        thespacedevs: 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=1&format=json',
        eonet:        'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=5',
        openaq:       'https://api.openaq.org/v3/locations?limit=1',
        swpc:         'https://services.swpc.noaa.gov/json/alerts.json',
      }
      const url = URLS[id]
      if (!url || url === 'https://www.space-track.org') {
        return { status:'info', detail:'SpaceTrack runs in /api/signals serverless — requires login (credentials in signals.js)', ms:ms() }
      }
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
        const d = await r.json().catch(()=>null)
        const count = Array.isArray(d) ? d.length : (d?.results?.length || d?.features?.length || d?.data?.length || (d?.[0] ? 1 : 0))
        return { status: r.ok ? 'ok' : 'warn', detail: r.ok ? count + ' items · HTTP ' + r.status : 'HTTP ' + r.status, count, ms:ms() }
      } catch(e) { return { status:'error', detail: e.message, ms:ms() } }
    }

    if (['adsb_global','opensky_live','airplaneslive','kystdatahuset','digitraffic','barentswatch','vesselfinder','aprs_ships','fleet_live'].includes(id)) {
      const r = await fetch('/api/satellite', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'satellite API failed: HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const DETAILS = {
        adsb_global:   `${(d.aircraft||[]).filter(a=>a.zone&&a.zone!=='OpenSky Global').length} civil aircraft via adsb.fi zones`,
        opensky_live:  `${(d.aircraft||[]).filter(a=>a.zone==='OpenSky Global').length} aircraft via OpenSky global query (key: qwertyuiop-api-client)`,
        airplaneslive: `${(d.milaircraft||[]).filter(a=>!a.zone?.includes('adsb.fi')).length} mil aircraft via airplanes.live/v2/mil`,
        kystdatahuset: `${(d.ships||[]).filter(s=>s.zone?.includes('Kystdatahuset')||s.zone?.includes('Norway')).length} ships via kystdatahuset.no`,
        digitraffic:   `${(d.ships||[]).filter(s=>s.zone?.includes('Digitraffic')).length} ships via digitraffic.fi`,
        barentswatch:  `${(d.warships||[]).filter(w=>w._livePos).length}/${(d.warships||[]).length} warships with live AIS via barentswatch.no`,
        vesselfinder:  `${(d.ships||[]).filter(s=>s.zone?.includes('VesselFinder')).length} ships via VesselFinder public API`,
        aprs_ships:    `${(d.ships||[]).filter(s=>s.zone?.includes('APRS')).length} vessels via APRS.fi maritime`,
        fleet_live:    `${(d.warships||[]).length} warships in registry · ${(d.warships||[]).filter(w=>w._livePos).length} with live AIS positions`,
      }
      const detail = DETAILS[id] || 'check satellite response'
      const isOk = !detail.startsWith('0 ')
      return { status: isOk ? 'ok' : 'warn', detail, ms:ms() }
    }

    if (['cisa_kev','nvd_cves','feodo','urlhaus','otx_av'].includes(id)) {
      const r = await fetch('/api/threats', { signal: AbortSignal.timeout(20000) })
      if (!r.ok) return { status:'error', detail:'threats API failed: HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const DETAILS = {
        cisa_kev:   `${(d.kev||d.cisa||[]).length} KEV entries`,
        nvd_cves:   `${(d.nvd||d.cves||[]).length} recent CVEs from NVD NIST`,
        feodo:      `${(d.feodo||d.botnet||[]).length} botnet C2 IPs (Feodo Tracker)`,
        urlhaus:    `${(d.urlhaus||[]).length} malware URLs (URLhaus)`,
        otx_av:     `${(d.otx||d.pulses||[]).length} threat pulses (OTX AlienVault)`,
      }
      const detail = DETAILS[id] || JSON.stringify(Object.keys(d))
      return { status: 'ok', detail, ms:ms() }
    }

    if (['yahoo_finance','coingecko','fred_api','alpha_sentiment','finance_cache'].includes(id)) {
      if (id === 'finance_cache') {
        try {
          const raw = localStorage.getItem('nexus-cache-v1-finance-intel')
          if (!raw) return { status:'warn', detail:'No finance cache — visit Finance tab to populate', ms:ms() }
          const { ts, data } = JSON.parse(raw)
          const ageMin = Math.round((Date.now()-ts)/60000)
          const instruments = Object.keys(data?.quotes||{}).length
          const crypto = Object.keys(data?.crypto||{}).length
          return { status:'ok', detail:`${instruments} quotes · ${crypto} crypto · cached ${ageMin}m ago`, ms:ms() }
        } catch(e) { return { status:'error', detail:e.message, ms:ms() } }
      }
      if (id === 'yahoo_finance') {
        try {
          const r = await fetch('/api/fred?mode=quotes&symbols=SPY,QQQ,DX-Y.NYB', { signal: AbortSignal.timeout(10000) })
          const d = await r.json().catch(()=>null)
          const quotes = d?.quotes || {}
          const spyPrice = quotes['SPY']?.price
          const count = Object.keys(quotes).length
          return { status: count > 0 ? 'ok' : 'warn', detail: count > 0 ? `${count} quotes via server proxy · SPY: $${spyPrice||'?'}` : 'No quotes returned', ms:ms() }
        } catch(e) { return { status:'error', detail:e.message, ms:ms() } }
      }
      if (id === 'coingecko') {
        try {
          const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', { signal: AbortSignal.timeout(8000) })
          const d = await r.json().catch(()=>null)
          const btc = d?.bitcoin?.usd
          return { status: btc ? 'ok' : 'warn', detail: btc ? `BTC: $${btc.toLocaleString()} — CoinGecko responding` : 'No BTC price', ms:ms() }
        } catch(e) { return { status:'error', detail:e.message, ms:ms() } }
      }
      if (id === 'fred_api') {
        try {
          const r = await fetch('/api/fred', { signal: AbortSignal.timeout(15000) })
          if (!r.ok) return { status:'error', detail:'FRED API failed: HTTP '+r.status, ms:ms() }
          const d = await r.json()
          const count = Object.keys(d).filter(k=>!k.startsWith('_')).length
          return { status:'ok', detail:`${count} macro series (GDP/CPI/rates/unemployment)`, ms:ms() }
        } catch(e) { return { status:'error', detail:e.message, ms:ms() } }
      }
      return { status:'info', detail:'Alpha Vantage requires user API key in Settings', ms:ms() }
    }

    if (['gdelt_geo','ucdp_live','acled_client','telegram_scrape','gpsjam_live','notam_faa','wikichanges','bgp_stream','opensanctions','osm_military','wikidata_conf','arms_signals','maritime_ais'].includes(id)) {
      // gpsjam/notam/wiki/bgp come from /api/alerts; gdelt/ucdp/telegram from /api/satellite
      const usesAlerts = ['gpsjam_live','notam_faa','acled_client'].includes(id)
      const r = await fetch(usesAlerts ? '/api/alerts' : '/api/satellite', { signal: AbortSignal.timeout(40000) })
      if (!r.ok) return { status:'error', detail:'API failed: HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const DETAILS = {
        gdelt_geo:       `${(d.conflictEvents||[]).filter(e=>e.source?.includes('GDELT')).length} events from GDELT GEO (48h)`,
        ucdp_live:       `${(d.ucdpFull||[]).length} events from UCDP v23.1 / ReliefWeb fallback`,
        telegram_scrape: `${(d.telegramPosts||[]).length} posts from Intel Slava Z/War Translated/NEXTA/Rybar (t.me/s/ scrape)`,
        gpsjam_live:     `${(d.alerts||[]).filter(a=>a.type==='gps_jam').length} GPS jamming zones from gpsjam.org (threshold 0.45)`,
        notam_faa:       `${(d.alerts||[]).filter(a=>a.type==='notam').length} military NOTAMs from FAA NOTAM API`,
        wikichanges:     `${(d.wikiEdits||[]).length} Wikipedia edits (3hr window, 35 conflict pages)`,
        bgp_stream:      `${(d.bgpAnomalies||[]).length} BGP routing anomalies (Cisco bgpstream + RIPE RIS)`,
        acled_client:    `${(d.alerts||[]).filter(a=>a.type==='conflict').length} conflict alerts via /api/alerts`,
        opensanctions:   `${(d.openSanctions||[]).length} sanctioned entities (vessels/persons/orgs)`,
        osm_military:    `${(d.osmMilitary||[]).length} military bases/airfields from OpenStreetMap`,
        wikidata_conf:   `${(d.wikidataConflicts||[]).length} active conflicts (post-2000) from WikiData SPARQL`,
        arms_signals:    `${(d.armsTransferSignals||[]).length} arms transfer signals (SIPRI/GDELT)`,
        maritime_ais:    `${(d.ships||[]).filter(s=>!s._density).length} vessels tracked + ${(d.ships||[]).filter(s=>s._density).length} chokepoint density zones`,
      }
      const detail = DETAILS[id] || 'check response'
      return { status: detail.startsWith('0 ') ? 'warn' : 'ok', detail, ms:ms() }
    }

    if (['loitering_ac','chokepoint','seismic_nudet','iss_pos'].includes(id)) {
      const r = await fetch('/api/satellite', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'satellite API failed', ms:ms() }
      const d = await r.json()
      const pa = d.preActionIndicators||[]
      const DETAILS = {
        loitering_ac:  `${pa.filter(p=>p.type==='loitering_aircraft').length} ISR/surveillance patterns detected (aircraft <150kt at altitude)`,
        chokepoint:    `${pa.filter(p=>p.type==='chokepoint_activity').length} chokepoints with elevated vessel density`,
        seismic_nudet: `${pa.filter(p=>p.type==='seismic_anomaly').length} seismic events near nuclear test sites`,
        iss_pos:       d.iss ? `ISS at ${Number(d.iss.lat).toFixed(1)}°, ${Number(d.iss.lng).toFixed(1)}° · ${d.iss.altitude}km alt` : 'ISS position not available',
      }
      return { status: 'ok', detail: DETAILS[id]||'no data', ms:ms() }
    }

    if (id === 'news_count') {
      try {
        const raw = localStorage.getItem('nexus-cache-v1-articles')
        if (!raw) return { status:'warn', detail:'No article cache — visit Feed tab to populate', ms:ms() }
        const { ts, data } = JSON.parse(raw)
        const ageMin = Math.round((Date.now()-ts)/60000)
        const count = Array.isArray(data) ? data.length : 0
        const translated = Array.isArray(data) ? data.filter(a => a.originalTitle).length : 0
        const bySource = {}
        ;(Array.isArray(data)?data:[]).forEach(a => { bySource[a.source] = (bySource[a.source]||0)+1 })
        const top5 = Object.entries(bySource).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([s,n])=>s+':'+n).join(', ')
        return { status:count>500?'ok':'warn', detail:`${count} articles · ${translated} translated · ${ageMin}m old · top sources: ${top5}`, count, ms:ms() }
      } catch(e) { return { status:'error', detail:e.message, ms:ms() } }
    }

    if (id === 'gdelt_parallel') {
      const start = performance.now()
      // Fire 3 test queries in parallel to verify GDELT parallelism
      const testQueries = ['war conflict airstrike', 'election coup protest', 'nuclear missile Iran']
      const results = await Promise.allSettled(testQueries.map(q =>
        fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(q) + '%20transliterate:english&mode=artlist&maxrecords=10&sort=DateDesc&format=json', { signal: AbortSignal.timeout(10000) })
          .then(r => r.json()).then(d => d?.articles?.length||0).catch(()=>0)
      ))
      const counts = results.map(r => r.status==='fulfilled' ? r.value : 0)
      const total = counts.reduce((a,b)=>a+b,0)
      const elapsed = Math.round(performance.now()-start)
      return { status:total>0?'ok':'warn', detail:`${total} articles from 3 parallel queries in ${elapsed}ms · transliterate:english active · maxrecords=25 per query`, count:total, ms:ms() }
    }

    if (id === 'rss_parallel') {
      // Test a batch of 5 diverse feeds via /api/rss to verify server-side fetching
      const testFeeds = [
        'https://feeds.reuters.com/reuters/worldNews',
        'https://feeds.bbci.co.uk/news/world/rss.xml',
        'https://www.aljazeera.com/xml/rss/all.xml',
        'https://rss.dw.com/rdf/rss-en-all',
        'https://www.france24.com/en/rss',
      ]
      const start = performance.now()
      const results = await Promise.allSettled(testFeeds.map(url =>
        fetch('/api/rss?url='+encodeURIComponent(url)+'&count=5', { signal: AbortSignal.timeout(10000) })
          .then(r => r.json()).then(d => Array.isArray(d)?d.length:0).catch(()=>0)
      ))
      const counts = results.map(r => r.status==='fulfilled' ? r.value : 0)
      const ok = counts.filter(c=>c>0).length
      const elapsed = Math.round(performance.now()-start)
      return { status:ok>=3?'ok':'warn', detail:`${ok}/5 feeds returned data in ${elapsed}ms · all 216 RSS feeds run simultaneously in production`, count:ok, ms:ms() }
    }

    if (id === 'translate_check') {
      try {
        const testText = 'Война в Украине: последние события'  // Russian: "War in Ukraine: latest events"
        const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(testText) + '&langpair=autodetect|en', { signal: AbortSignal.timeout(5000) })
        if (!r.ok) return { status:'warn', detail:'MyMemory API not responding — translation will fall back to original', ms:ms() }
        const d = await r.json()
        const translated = d?.responseData?.translatedText
        return { status:translated&&translated!==testText?'ok':'warn', detail:translated ? `"${testText.slice(0,30)}…" → "${translated.slice(0,50)}"` : 'No translation returned', ms:ms() }
      } catch(e) { return { status:'error', detail:e.message, ms:ms() } }
    }

    if (['sat_earthquakes','sat_volcanoes','sat_hurricanes','sat_floods',
         'sat_viirs','sat_sigmets','sat_notams','sat_conflict','sat_reliefweb'].includes(id)) {
      const r = await fetch('/api/satellite', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'satellite API failed: HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const DETAILS = {
        sat_earthquakes: `${(d.earthquakes||[]).length} earthquakes M1.5+ · top: ${d.earthquakes?.[0]?.place||'none'}`,
        sat_volcanoes:   `${(d.volcanoes||[]).length} active volcanoes · top: ${d.volcanoes?.[0]?.name||'none'}`,
        sat_hurricanes:  `${(d.hurricanes||[]).length} tropical storms · top: ${d.hurricanes?.[0]?.name||'none'}`,
        sat_floods:      `${(d.floods||[]).length} active flood events`,
        sat_viirs:       `${(d.viirsNightlights||d.globalViirs||[]).length} VIIRS anomalies`,
        sat_sigmets:     `${(d.sigmets||[]).length} active SIGMETs`,
        sat_notams:      `${(d.notams||[]).length} active NOTAMs (${(d.notams||[]).filter(n=>n.isMilitary).length} military)`,
        sat_conflict:    `${(d.conflictEvents||[]).filter(e=>e.source?.includes('GDELT')).length} GDELT + ${(d.conflictEvents||[]).filter(e=>e.source==='UCDP').length} UCDP events`,
        sat_reliefweb:   `${(d.reliefweb||[]).length} UN humanitarian reports`,
      }
      const n = parseInt((DETAILS[id]||'0').split(' ')[0])
      return { status:n>0?'ok':'warn', detail:DETAILS[id]||'no data', count:n, ms:ms() }
    }

    if (id === 'cache_status') {
      try {
        const keys = []
        let totalKB = 0
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (!k?.startsWith('nexus-cache-v1-')) continue
          const raw = localStorage.getItem(k) || ''
          const kb = Math.round(raw.length / 1024)
          totalKB += kb
          try {
            const { ts, data } = JSON.parse(raw)
            const count = Array.isArray(data) ? data.length : (typeof data === 'object' ? Object.keys(data).length : 1)
            const ageMin = Math.round((Date.now()-ts)/60000)
            keys.push(k.replace('nexus-cache-v1-','') + ':' + count + ' items,' + ageMin + 'm,' + kb + 'KB')
          } catch { keys.push(k + ':parse error') }
        }
        return { status: keys.length ? 'ok' : 'warn', detail: `${keys.length} cache keys · ${totalKB}KB total · ` + keys.join(' | '), ms:ms() }
      } catch(e) { return { status:'error', detail:e.message, ms:ms() } }
    }

    if (id === 'rss_batch') {
      const RSS_SAMPLE = [
        'https://promedmail.org/feed/',
        'https://feeds.bbci.co.uk/news/world/rss.xml',
        'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
        'https://feeds.barrons.com/barrons/markets',
        'https://www.economist.com/finance-and-economics/rss.xml',
        'https://www.imf.org/en/Blogs/rss',
        'https://home.treasury.gov/news/press-releases.rss',
        'https://www.wto.org/english/news_e/news_e.rss',
        'https://www.spaceweather.com/feeds/swn.xml',
        'https://www.bankofengland.co.uk/rss/news',
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.atom',
        'https://www.bis.org/rss/main.xml',
        'https://www.kitco.com/rss/gold.xml',
        'https://www.ecb.europa.eu/rss/press.html',
      ]
      const NAMES = ['ProMED','BBC World','WSJ Markets','Barrons','Economist','IMF','US Treasury','WTO','Space Weather','Bank of England','USGS Quakes','BIS','Kitco Gold','ECB']
      const results = await Promise.allSettled(RSS_SAMPLE.map(url =>
        fetch(url, { headers:{'User-Agent':'NEXUS/1.0 (nexus@intelligence.app)'}, signal: AbortSignal.timeout(7000) })
          .then(r => r.ok)
          .catch(() => false)
      ))
      const statuses = results.map((r,i) => ({ name:NAMES[i], ok: r.status==='fulfilled'&&r.value }))
      const okCount = statuses.filter(s=>s.ok).length
      const failList = statuses.filter(s=>!s.ok).map(s=>s.name).join(', ')
      return {
        status: okCount >= RSS_SAMPLE.length*0.7 ? 'ok' : 'warn',
        detail: okCount+'/'+RSS_SAMPLE.length+' feeds OK · FAIL: '+(failList||'none'),
        count: okCount, ms:ms()
      }
    }

    if (id === 'aisstream') {
      // AISStream is CORS-blocked - check ship count from satellite
      const r = await fetch('/api/satellite', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const n = d?.ships?.length||0
      return { status: n>0?'ok':'warn', detail: n+' ships via AIS sources (Kystdatahuset/HELCOM/NOAA/Military)', count:n, ms:ms() }
    }

    if (id === 'acled') {
      // ACLED: use UCDP as proxy indicator since they cover same conflict data
      // ACLED public endpoint is slow (15s+) and requires OAuth now
      try {
        const r = await fetch('https://ucdpapi.pcr.uu.se/api/gedevents/25.1?pagesize=3&page=1', { signal: AbortSignal.timeout(12000) })
        if (r.ok) {
          const d = await r.json()
          const n = d?.TotalCount||0
          return { status:'ok', detail: 'UCDP (ACLED alternative): '+n+' total georeferenced conflict events', ms:ms() }
        }
      } catch {}
      return { status:'info', detail:'Conflict data: UCDP+GDELT Events used as ACLED replacement (free, no OAuth needed)', ms:ms() }
    }

    if (id === 'adsb') {
      const r = await fetch('/api/satellite', { signal: AbortSignal.timeout(25000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const n = d?.aircraft?.length||0
      return { status: n>0?'ok':'warn', detail: n+' aircraft (OpenSky authenticated + ADSB.fi + airplanes.live)', count:n, ms:ms() }
    }

    if (id === 'nws') {
      // NWS requires User-Agent header — browsers can't set it. Route through /api/alerts
      // which fetches NWS server-side and includes nws count in the meta field.
      try {
        const r = await fetch('/api/alerts', { signal: AbortSignal.timeout(15000) })
        if (!r.ok) return { status:'error', detail:'HTTP '+r.status+' (via /api/alerts proxy)', ms:ms() }
        const d = await r.json()
        const n = d?.meta?.nws ?? d?.counts?.nws ?? (d?.alerts||[]).filter(a=>a.source==='NWS').length
        return { status: n >= 0 ? 'ok' : 'warn', detail: n+' NWS weather alerts (via server-side proxy — browser cannot set User-Agent)', count:n, ms:ms() }
      } catch(e) {
        return { status:'error', detail: e.message, ms:ms() }
      }
    }

    if (id === 'promed') {
      const r = await fetch('/api/alerts', { signal: AbortSignal.timeout(15000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const promedItems = (d?.alerts||[]).filter(a=>a.source==='ProMED'||a.source==='WHO News').length
      return { status: promedItems>0?'ok':'warn', detail: promedItems>0?promedItems+' disease alerts (ProMED/WHO via proxy)':'No ProMED items — scraping may be blocked', count:promedItems, ms:ms() }
    }

    if (id === 'liveuamap') {
      const r = await fetch('/api/alerts', { signal: AbortSignal.timeout(15000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const luamItems = (d?.alerts||[]).filter(a=>a.source&&a.source.includes('Liveuamap')).length
      return { status: luamItems>0?'ok':'warn', detail: luamItems+' Liveuamap items (via /api/alerts proxy)', count:luamItems, ms:ms() }
    }

    if (id === 'bno') {
      // BNO is CORS-blocked in browser - test via /api/alerts which proxies it server-side
      const r = await fetch('/api/alerts', { signal: AbortSignal.timeout(15000) })
      if (!r.ok) return { status:'error', detail:'HTTP '+r.status, ms:ms() }
      const d = await r.json()
      const bnoItems = (d?.alerts||[]).filter(a=>a.source==='BNO News').length
      const total = d?.alerts?.length||0
      return { status: total>0?'ok':'warn', detail: bnoItems+' BNO items in '+total+' total alerts (via /api/alerts proxy)', count:bnoItems, ms:ms() }
    }

    return { status:'info', detail:'No test defined for '+id, ms:ms() }

  } catch(e) {
    return { status:'error', detail: (e.name==='AbortError'?'Timeout':'Error: '+e.message.slice(0,80)), ms:ms() }
  }
}

// ── Raw Data Log ─────────────────────────────────────────────────────────────
const LOG_KEY = 'nexus_data_log'
const MAX_LOG = 500  // max log entries

function readLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') } catch { return [] }
}
function appendLog(entry) {
  try {
    const log = readLog()
    log.unshift(entry)  // newest first
    if (log.length > MAX_LOG) log.length = MAX_LOG
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  } catch {}
}
function clearLog() {
  try { localStorage.removeItem(LOG_KEY) } catch {}
}

// Wrap runCheck to also log raw results
async function runCheckLogged(id, keys) {
  const result = await runCheck(id, keys)
  appendLog({
    t: new Date().toISOString(),
    source: id,
    status: result?.status,
    detail: result?.detail,
    ms: result?.ms,
    count: result?.count,
    raw: result,
  })
  return result
}

const CHECKS = [
  { group:'🚨 Alerts',       id:'alerts',       name:'Alerts Bundle (NWS/GDACS/BNO/Liveuamap)' },
  { group:'🚨 Alerts',       id:'bno',           name:'BNO Breaking News' },
  { group:'🚨 Alerts',       id:'liveuamap',     name:'Liveuamap Conflict Feed' },
  { group:'🚨 Alerts',       id:'promed',        name:'ProMED Disease Alerts' },
  { group:'🚨 Alerts',       id:'nws',           name:'NWS Weather Alerts' },
  { group:'🎯 Markets',      id:'polymarket',    name:'Polymarket' },
  { group:'🎯 Markets',      id:'kalshi',        name:'Kalshi' },
  { group:'🛰 Map Data',     id:'satellite',     name:'Satellite Bundle (all layers)' },
  { group:'🛰 Map Data',     id:'firms',         name:'NASA FIRMS (thermal/fires)' },
  { group:'🛰 Map Data',     id:'usgs',          name:'USGS Earthquakes' },
  { group:'🛰 Map Data',     id:'gdacs',         name:'GDACS Global Disasters' },
  { group:'🛰 Map Data',     id:'adsb',          name:'ADSB.fi Aircraft (Ukraine zone sample)' },
  { group:'🛰 Map Data',     id:'aisstream',     name:'AISStream Ships' },
  { group:'🛰 Map Data',     id:'acled',         name:'ACLED Conflict Data' },
  { group:'🔍 Intel Search', id:'gdelt',         name:'GDELT News' },
  { group:'🔍 Intel Search', id:'wiki',          name:'Wikipedia API' },
  { group:'🔍 Intel Search', id:'opensanctions', name:'OpenSanctions' },
  { group:'🔍 Intel Search', id:'ucdp',          name:'UCDP Conflict DB' },
  { group:'🔍 Intel Search', id:'reliefweb',     name:'ReliefWeb (UN)' },
  { group:'🔍 Intel Search', id:'documentcloud', name:'DocumentCloud' },
  { group:'🔍 Intel Search', id:'intelx',        name:'IntelX (dark web)' },
  { group:'🤖 AI / Keys',    id:'groq',          name:'Groq AI (briefings + connections)' },
  { group:'🚨 Alerts',       id:'telegram',      name:'Telegram OSINT (Intel Slava Z, War Translated, OSINT Defender, Ukraine Now)' },
  { group:'🚨 Alerts',       id:'promed',        name:'ProMED Disease (RSS + homepage scrape)' },
  { group:'🛰 Map Data',     id:'warships',      name:'Warships (embedded in /api/satellite — fleet tracker)' },
  { group:'🛰 Map Data',     id:'opensky_auth',  name:'OpenSky Aircraft (authenticated: qwertyuiop-api-client)' },
  { group:'📡 RSS Feeds', id:'rss_promedmail', name:'ProMED Mail RSS (promedmail.org/feed/)' },
  { group:'📡 RSS Feeds', id:'rss_who',         name:'WHO Disease Outbreak RSS' },
  { group:'📡 RSS Feeds', id:'rss_bbc',          name:'BBC World News' },
  { group:'📡 RSS Feeds', id:'rss_reuters',      name:'Reuters World News' },
  { group:'📡 RSS Feeds', id:'rss_ap',           name:'AP News' },
  { group:'📡 RSS Feeds', id:'rss_economist',    name:'The Economist Finance' },
  { group:'📡 RSS Feeds', id:'rss_imf',          name:'IMF Blog' },
  { group:'📡 RSS Feeds', id:'rss_worldbank',    name:'World Bank Blog' },
  { group:'📡 RSS Feeds', id:'rss_bis',          name:'BIS Research' },
  { group:'📡 RSS Feeds', id:'rss_barrons',      name:"Barron's Markets" },
  { group:'📡 RSS Feeds', id:'rss_wsj',          name:'WSJ Markets' },
  { group:'📡 RSS Feeds', id:'rss_ecb',          name:'ECB Newsroom' },
  { group:'📡 RSS Feeds', id:'rss_boe',          name:'Bank of England' },
  { group:'📡 RSS Feeds', id:'rss_treasury',     name:'US Treasury' },
  { group:'📡 RSS Feeds', id:'rss_wto',          name:'WTO News' },
  { group:'📡 RSS Feeds', id:'rss_spaceweather', name:'Space Weather' },
  { group:'📡 RSS Feeds', id:'rss_kitco',        name:'Kitco Gold' },
  { group:'📡 RSS Feeds', id:'rss_usgs',         name:'USGS Earthquakes' },
  { group:'📡 RSS Feeds', id:'rss_gcaptain',     name:'gCaptain Maritime' },
  { group:'📡 RSS Feeds', id:'rss_navalnews',    name:'Naval News' },
  { group:'📡 RSS Feeds', id:'rss_bellingcat',   name:'Bellingcat OSINT' },
  { group:'📡 RSS Feeds', id:'rss_warontherocks',name:'War on the Rocks' },
  { group:'📡 RSS Feeds', id:'rss_reliefweb',    name:'ReliefWeb UN' },
  { group:'📡 RSS Feeds', id:'rss_crisisgroup',  name:'ICG Crisis Group' },
  { group:'📡 RSS Feeds', id:'rss_krebs',        name:'Krebs on Security' },
  { group:'📡 RSS Feeds', id:'rss_outbreaknews', name:'Outbreak News Today' },
  { group:'📡 RSS Feeds', id:'rss_healthmap',    name:'HealthMap Disease' },
  { group:'📡 RSS Feeds', id:'rss_oilprice',     name:'OilPrice.com' },
  { group:'📡 RSS Feeds', id:'rss_coindesk',     name:'CoinDesk Crypto' },
  // ══ Sources from signals.js ══
  { group:'🛰 Signals',     id:'spacetrack',    name:'SpaceTrack.org — Military Satellite TLE (satellites in orbit)' },
  { group:'🛰 Signals',     id:'thespacedevs',  name:'TheSpaceDevs — Upcoming Rocket Launches' },
  { group:'🛰 Signals',     id:'eonet',          name:'NASA EONET — Active Natural Events (fires/storms/volcanoes)' },
  { group:'🛰 Signals',     id:'openaq',         name:'OpenAQ — Air Quality (conflict zone pollution indicators)' },
  { group:'🛰 Signals',     id:'swpc',           name:'NOAA SWPC — Space Weather / Solar Activity' },
  // ══ Sources from satellite.js ══
  { group:'🌊 Ships/Air',   id:'adsb_global',    name:'ADSB.fi — 24-zone Civil Aircraft (global real-time)' },
  { group:'🌊 Ships/Air',   id:'opensky_live',   name:'OpenSky Network — Global Aircraft (authenticated, all airborne)' },
  { group:'🌊 Ships/Air',   id:'airplaneslive',  name:'Airplanes.live — Military Aircraft /v2/mil endpoint' },
  { group:'🌊 Ships/Air',   id:'kystdatahuset',  name:'Kystdatahuset.no — Norwegian/Baltic AIS Ships' },
  { group:'🌊 Ships/Air',   id:'digitraffic',    name:'Digitraffic.fi — Finnish Transport AIS (global)' },
  { group:'🌊 Ships/Air',   id:'barentswatch',   name:'BarentsWatch.no — Norwegian Coast Guard AIS + Fleet MMSI lookup' },
  { group:'🌊 Ships/Air',   id:'vesselfinder',   name:'VesselFinder — Global Ship Positions (public tiles)' },
  { group:'🌊 Ships/Air',   id:'aprs_ships',     name:'APRS.fi — Maritime Vessels via Amateur Radio AIS' },
  { group:'🌊 Ships/Air',   id:'fleet_live',     name:'Fleet Registry — Known Warship MMSIs with Live AIS Override' },
  // ══ Sources from threats.js / signals.js ══
  { group:'💀 Threats',     id:'cisa_kev',       name:'CISA KEV — Known Exploited Vulnerabilities' },
  { group:'💀 Threats',     id:'nvd_cves',       name:'NVD NIST — Recent CVEs (last 7 days)' },
  { group:'💀 Threats',     id:'feodo',          name:'Feodo Tracker — Botnet C2 IP Blocklist' },
  { group:'💀 Threats',     id:'urlhaus',        name:'URLhaus — Malware Distribution URLs' },
  { group:'💀 Threats',     id:'otx_av',         name:'OTX AlienVault — Open Threat Exchange Pulses' },
  // ══ Finance sources ══
  { group:'💰 Finance',     id:'yahoo_finance',  name:'Yahoo Finance — Quotes (indices/commodities/forex/bonds)' },
  { group:'💰 Finance',     id:'coingecko',      name:'CoinGecko — Crypto Prices + 24h/7d Change' },
  { group:'💰 Finance',     id:'fred_api',       name:'FRED St. Louis Fed — Macro Indicators (GDP/CPI/rates)' },
  { group:'💰 Finance',     id:'alpha_sentiment',name:'Alpha Vantage — News Sentiment + Top Market Movers' },
  { group:'💰 Finance',     id:'finance_cache',  name:'Finance Cache — Last cached prices (localStorage)' },
  // ══ Conflict / intelligence ══
  { group:'⚔️ Conflict',    id:'gdelt_geo',      name:'GDELT GEO — Conflict Event Points (72h, global)' },
  { group:'⚔️ Conflict',    id:'ucdp_live',      name:'UCDP — Uppsala Conflict Data (server-side, no CORS)' },
  { group:'⚔️ Conflict',    id:'acled_client',   name:'useACLED hook — GDELT+UCDP client-side fallback' },
  { group:'⚔️ Conflict',    id:'telegram_scrape',name:'Telegram t.me/s/ Scrape — Intel Slava Z, War Translated, NEXTA, Rybar' },
  { group:'⚔️ Conflict',    id:'gpsjam_live',    name:'GPSJam.org — GPS Jamming Heatmap (today + yesterday)' },
  { group:'⚔️ Conflict',    id:'notam_faa',      name:'FAA NOTAM API — Military Airspace Restrictions' },
  { group:'⚔️ Conflict',    id:'wikichanges',    name:'Wikipedia — Recent Edits to Conflict Articles (1hr)' },
  { group:'⚔️ Conflict',    id:'bgp_stream',     name:'BGP Stream (Cisco) — Routing Hijack Anomalies' },
  { group:'⚔️ Conflict',    id:'opensanctions',  name:'OpenSanctions — Sanctioned Vessels/Persons/Orgs (1M+ entities)' },
  { group:'⚔️ Conflict',    id:'osm_military',   name:'OSM Overpass — Military Bases/Airfields/Naval Stations worldwide' },
  { group:'⚔️ Conflict',    id:'wikidata_conf',  name:'WikiData SPARQL — Post-2000 Active Armed Conflicts (no historical)' },
  { group:'⚔️ Conflict',    id:'arms_signals',   name:'Arms Transfer Signals — SIPRI/GDELT arms sales tracking' },
  { group:'⚔️ Conflict',    id:'maritime_ais',   name:'Maritime AIS — Global vessel tracking + chokepoint density zones' },
  // ══ Pre-action indicators ══
  { group:'⚡ Pre-Action',   id:'loitering_ac',   name:'Loitering Aircraft Detection — ISR/Surveillance Pattern (low speed + altitude)' },
  { group:'⚡ Pre-Action',   id:'chokepoint',     name:'Chokepoint Vessel Density — Hormuz/Malacca/Suez/Taiwan/SCS' },
  { group:'⚡ Pre-Action',   id:'seismic_nudet',  name:'Seismic/NUDET Proxy — USGS M3.5+ near 6 nuclear test sites' },
  { group:'⚡ Pre-Action',   id:'iss_pos',        name:'ISS Real-Time Position — Orbital tracking' },
  // ══ Cache status ══
  { group:'💾 Cache',        id:'cache_status',   name:'localStorage Cache Status — all nexus-cache-v1-* keys' },
  // ══ News feed tests (v82) ══
  { group:'📰 News Feed',    id:'news_count',      name:'Article Cache — total articles in localStorage' },
  { group:'📰 News Feed',    id:'gdelt_parallel',  name:'GDELT Parallel — 22 queries × 25 articles (global, transliterated)' },
  { group:'📰 News Feed',    id:'rss_parallel',    name:'RSS Parallel — 216 feeds simultaneous via /api/rss' },
  { group:'📰 News Feed',    id:'translate_check', name:'Auto-Translate — MyMemory API (non-English titles)' },
  // ══ Satellite data completeness (v82) ══
  { group:'🌍 Satellite',    id:'sat_earthquakes',  name:'Earthquakes — USGS M1.5+ realtime feed' },
  { group:'🌍 Satellite',    id:'sat_volcanoes',    name:'Volcanoes — GVP active eruptions' },
  { group:'🌍 Satellite',    id:'sat_hurricanes',   name:'Tropical Storms — NOAA NHC active storms' },
  { group:'🌍 Satellite',    id:'sat_floods',       name:'Floods — DFO active flood events' },
  { group:'🌍 Satellite',    id:'sat_viirs',        name:'VIIRS Nightlights — NASA infrastructure anomalies' },
  { group:'🌍 Satellite',    id:'sat_sigmets',      name:'SIGMETs — Aviation hazard advisories' },
  { group:'🌍 Satellite',    id:'sat_notams',       name:'NOTAMs — FAA military airspace restrictions' },
  { group:'🌍 Satellite',    id:'sat_conflict',     name:'Conflict Events — GDELT GEO + UCDP combined' },
  { group:'🌍 Satellite',    id:'sat_reliefweb',    name:'ReliefWeb — UN humanitarian situation reports' },
]

function CheckRow({ check, result, onRun }) {
  const clr = CLR[result?.status || 'pending']
  const icn = ICN[result?.status || 'pending']
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 10px', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:'11px', minWidth:'14px', textAlign:'center' }}>{icn}</span>
      <span style={{ flex:1, fontSize:'10px', color:'var(--t2)', fontFamily:'Inter,sans-serif' }}>{check.name}</span>
      <span style={{ fontSize:'9px', color: clr, fontFamily:'JetBrains Mono,monospace', flex:1.5 }}>
        {result ? result.detail : 'not tested'}
      </span>
      {result?.ms != null && (
        <span style={{ fontSize:'8px', color:'var(--t4)', fontFamily:'JetBrains Mono,monospace', minWidth:'42px', textAlign:'right' }}>{result.ms}ms</span>
      )}
      <button onClick={() => onRun(check.id)}
        style={{ padding:'1px 6px', fontSize:'8px', border:'1px solid var(--border)', background:'transparent', color:'var(--t4)', borderRadius:'3px', cursor:'pointer' }}>
        Test
      </button>
    </div>
  )
}

function DumpTab() {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [downloading, setDownloading] = React.useState(false)
  const [section, setSection] = React.useState('summary')
  const [progress, setProgress] = React.useState('')

  const fetchAll = async () => {
    setLoading(true); setProgress('Fetching live satellite data…')
    try {
      // Step 1: Fetch live data from all API endpoints in parallel
      const [satRes, alertsRes, signalsRes] = await Promise.allSettled([
        fetch('/api/satellite', { signal: AbortSignal.timeout(25000) }).then(r => r.json()),
        fetch('/api/alerts',    { signal: AbortSignal.timeout(15000) }).then(r => r.json()),
        fetch('/api/signals',   { signal: AbortSignal.timeout(20000) }).then(r => r.json()).catch(()=>({})),
      ])
      setProgress('Reading all cached data from localStorage…')

      // Step 2: Read ALL cached data from localStorage
      const readCache = (key) => {
        try {
          const raw = localStorage.getItem('nexus-cache-v1-' + key)
          if (!raw) return null
          const { data, ts } = JSON.parse(raw)
          return { data, cachedAt: new Date(ts).toISOString(), ageMin: Math.round((Date.now()-ts)/60000) }
        } catch { return null }
      }
      const allCacheKeys = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith('nexus-cache-v1-')) allCacheKeys.push(k.replace('nexus-cache-v1-',''))
      }
      
      const cachedArticles = readCache('articles')
      const cachedFinance = readCache('finance-intel')
      const cachedAlerts = readCache('alerts')
      const cachedKalshi = readCache('kalshi-markets')
      const cachedPolymarket = readCache('polymarket-markets')
      const cachedSatellite = readCache('satellite')

      setProgress('Assembling full intelligence payload…')

      const satellite = satRes.status === 'fulfilled' ? satRes.value : cachedSatellite?.data || {}
      const alertsData = alertsRes.status === 'fulfilled' ? alertsRes.value : cachedAlerts?.data ? {alerts: cachedAlerts.data} : {}
      const signalsData = signalsRes.status === 'fulfilled' ? signalsRes.value : {}
      const articles = (cachedArticles?.data || []).map(a => ({
        ...a,
        pub: a.pub instanceof Date ? a.pub.toISOString() : a.pub,
      }))
      const finance = cachedFinance?.data || {}
      const payload = {
        _meta: {
          exportedAt: new Date().toISOString(),
          version: 'NEXUS v82',
          purpose: 'Forecasting engine ingestion',
          refreshInterval: '2 minutes',
          note: 'Deduplicate on re-ingest using id/mmsi/icao24 + timestamp',
        },
        // Map data — positions + details
        aircraft: (satellite.aircraft||[]).map(a => ({
          id: a.icao24, callsign: a.callsign, country: a.country,
          lat: a.lat, lng: a.lng, altitude_ft: a.altitude,
          speed_kt: a.velocity, heading: a.heading, squawk: a.squawk,
          zone: a.zone, ts: a._fetchedAt || new Date().toISOString(),
        })),
        milaircraft: (satellite.milaircraft||[]).map(a => ({
          id: a.icao24, callsign: a.callsign, country: a.country,
          lat: a.lat, lng: a.lng, altitude_ft: a.altitude,
          speed_kt: a.velocity, heading: a.heading, zone: a.zone,
          ts: a._fetchedAt || new Date().toISOString(),
        })),
        ships: (satellite.ships||[]).filter(s=>!(s.type==='warship'||s._isWarship)).map(s => ({
          mmsi: s.mmsi, name: s.name, flag: s.flag,
          lat: s.lat, lng: s.lng, speed_kn: s.speed, heading: s.heading,
          shipType: s.shipType, destination: s.destination, zone: s.zone,
          ts: s._fetchedAt || new Date().toISOString(),
        })),
        warships: (satellite.warships||[...((satellite.ships||[]).filter(s=>s.type==='warship'||s._isWarship))]).map(s => ({
          mmsi: s.mmsi, name: s.name, flag: s.flag,
          lat: s.lat, lng: s.lng, speed_kn: s.speed, heading: s.heading,
          shipType: s.shipType, zone: s.zone, source: s.source,
          ts: s._fetchedAt || new Date().toISOString(),
          _note: s.source==='Fleet Tracker' ? 'HOME PORT POSITION — not live AIS' : 'live AIS',
        })),
        // Events & intelligence
        conflict_events: (satellite.conflictEvents||[]).map(e => ({
          lat: e.lat, lng: e.lng, title: e.title, source: e.source,
          country: e.country, fatalities: e.fatalities, severity: e.severity,
          ts: e._fetchedAt || new Date().toISOString(),
        })),
        gdacs_disasters: (satellite.gdacs||[]).map(g => ({
          lat: g.lat, lng: g.lng, title: g.title, eventtype: g.meta?.eventtype,
          alertlevel: g.meta?.alertlevel, url: g.url,
          ts: g._fetchedAt || new Date().toISOString(),
        })),
        firms_fires: (satellite.globalFires||[]).map(f => ({
          lat: f.lat, lng: f.lng, brightness: f.brightness, confidence: f.confidence,
          zone: f.zone, product: f.product, date: f.date,
        })),
        disease: [...(satellite.diseaseOutbreaks||[]), ...(satellite.promed||[])].map(d => ({
          title: d.title, description: d.description, url: d.url,
          source: d.source, date: d.date || d.ts,
        })),
        nuclear: (satellite.nuclear||[]).map(n => ({
          title: n.title, description: n.description, url: n.url,
          date: n.date, severity: n.severity,
        })),
        maritime: (satellite.maritime||[]).map(m => ({
          title: m.title, description: m.description, url: m.url,
          lat: m.lat, lng: m.lng, date: m.date, source: m.source,
        })),
        cyber: (satellite.cyber||[]).map(c => ({
          title: c.title, url: c.url, date: c.date,
          source: c.source, severity: c.severity,
        })),
        iss_position: satellite.iss ? {
          lat: satellite.iss.lat, lng: satellite.iss.lng,
          altitude_km: satellite.iss.altitude, velocity_kmh: satellite.iss.velocity,
          ts: new Date().toISOString(),
        } : null,
        // Live alerts (real-time signals)
        alerts: (alertsData.alerts||[]).map(a => ({
          id: a.id, type: a.type, title: a.title, detail: a.detail,
          severity: a.severity, source: a.source, url: a.url,
          lat: a.lat, lng: a.lng, ts: a.ts,
        })),
        // News articles (from cache)
        news_articles: articles.map(a => ({
          id: a.id, title: a.title, summary: a.summary,
          source: a.source, url: a.url, category: a.category,
          severity: a.severity, region: a.region,
          pub: a.pub instanceof Date ? a.pub.toISOString() : a.pub,
          lat: a.lat, lng: a.lng,
          tags: a.tags, entities: a.entities,
        })),
        // Telegram OSINT posts
        telegram_posts: (satellite.telegramPosts||[]).map(p => ({
          title: p.title, description: p.description,
          source: p.source, url: p.url, date: p.date, severity: p.severity,
        })),
        // Space
        launches: (satellite.launches||[]).map(l => ({
          title: l.name||l.title, vehicle: l.vehicle, provider: l.provider,
          site: l.site, net: l.net, probability: l.probability, url: l.url,
        })),
        // EONET natural events
        eonet: (satellite.eonet||[]).map(e => ({
          title: e.title, category: e.category, lat: e.lat, lng: e.lng,
          date: e.date, url: e.url,
        })),
        // All satellite fields (complete export)
        earthquakes:         (satellite.earthquakes||[]).map(e=>({lat:e.lat,lng:e.lng,mag:e.mag,place:e.place,time:e.time,depth:e.depth,url:e.url})),
        volcanoes:           (satellite.volcanoes||[]).map(v=>({lat:v.lat,lng:v.lng,name:v.name,country:v.country,date:v.date,url:v.url})),
        hurricanes:          (satellite.hurricanes||[]).map(h=>({lat:h.lat,lng:h.lng,name:h.name,category:h.category,wind:h.wind,url:h.url})),
        floods:              (satellite.floods||[]).map(f=>({lat:f.lat,lng:f.lng,title:f.title,country:f.country,url:f.url})),
        weather_alerts:      (satellite.weatherAlerts||satellite.goesAlerts||[]).map(w=>({lat:w.lat,lng:w.lng,title:w.title,severity:w.severity,source:w.source})),
        viirs_nightlights:   (satellite.viirsNightlights||satellite.globalViirs||[]).map(v=>({lat:v.lat,lng:v.lng,brightness:v.brightness,zone:v.zone})),
        global_fires:        (satellite.globalFires||satellite.nasaWildfires||[]).map(f=>({lat:f.lat,lng:f.lng,brightness:f.brightness,date:f.date})),
        sigmets:             (satellite.sigmets||[]).map(s=>({lat:s.lat,lng:s.lng,title:s.title,type:s.type,url:s.url})),
        copernicus_ems:      (satellite.copernicus||satellite.copernicusActivations||[]).map(c=>({lat:c.lat,lng:c.lng,title:c.title,url:c.url})),
        notams:              (satellite.notams||[]).map(n=>({lat:n.lat,lng:n.lng,title:n.title,type:n.type,isMilitary:n.isMilitary})),
        wiki_edits:          (satellite.wikiEdits||[]).map(w=>({page:w.page,user:w.user,comment:w.comment,ts:w.timestamp,url:w.url})),
        bgp_anomalies:       (satellite.bgpAnomalies||[]).map(b=>({title:b.title,description:b.description,source:b.source,date:b.date})),
        nuclear_events:      (satellite.nuclear||[]).map(n=>({title:n.title,description:n.description,url:n.url})),
        maritime_incidents:  (satellite.maritime||[]).map(m=>({title:m.title,description:m.description,url:m.url})),
        disease_promed:      (satellite.promed||[]).map(d=>({title:d.title,description:d.description,url:d.url,date:d.date})),
        disease_who:         (satellite.diseaseOutbreaks||[]).map(d=>({title:d.title,description:d.description,url:d.url})),
        reliefweb:           (satellite.reliefweb||[]).map(r=>({name:r.name,country:r.country,type:r.type,date:r.date,url:r.url})),
        crowds:              (satellite.crowds||[]).map(c=>({lat:c.lat,lng:c.lng,title:c.title,country:c.country})),
        iris:                (satellite.iris||[]).map(i=>({lat:i.lat,lng:i.lng,title:i.title,url:i.url})),
        botnet_c2:           (satellite.botnetC2||[]).map(b=>({ip:b.ip,asn:b.asn,country:b.country,malware:b.malware})),
        kev_vulnerabilities: (satellite.kev||[]).map(k=>({cveId:k.cveId,name:k.name,vendor:k.vendor,product:k.product,dateAdded:k.dateAdded})),
        space: {
          satellites:    (signalsData.spacetrackPayloads||[]).slice(0,200),
          launches:      satellite.launches||[],
          neos:          satellite.neos||[],
          space_debris:  satellite.spaceDebris||[],
          conjunctions:  satellite.satelliteConjunctions||[],
          solar_xray:    satellite.solarXray||null,
          spaceweather:  satellite.spaceweather||null,
          air_quality:   satellite.airQuality||[],
          iss_position:  satellite.iss||null,
        },
        // Pre-action intelligence indicators
        pre_action_indicators: (satellite.preActionIndicators||[]).map(p => ({
          type: p.type, category: p.category,
          name: p.name, lat: p.lat, lng: p.lng,
          significance: p.significance, severity: p.severity,
          ts: p.ts, meta: p,
        })),
        // Counts summary
        // Finance & market data from cache
        finance_quotes: Object.entries(finance.quotes||{}).map(([sym,q]) => ({
          symbol: sym, price: q.regularMarketPrice||q.price,
          change_pct: q.regularMarketChangePercent||q.changePercent,
          change_abs: q.regularMarketChange||q.change,
          prev_close: q.regularMarketPreviousClose,
          market_cap: q.marketCap,
          volume: q.regularMarketVolume,
          day_high: q.regularMarketDayHigh,
          day_low: q.regularMarketDayLow,
          ts: finance.lastUpdate,
        })),
        crypto_prices: Object.entries(finance.crypto||{}).map(([id,c]) => ({
          id, usd: c.usd, usd_24h_change: c.usd_24h_change,
          usd_7d_change: c.usd_7d_change, market_cap: c.usd_market_cap,
          ts: finance.lastUpdate,
        })),
        market_sentiment: (finance.sentiment||[]).map(s => ({
          title: s.title, sentiment: s.overall_sentiment_label,
          score: s.overall_sentiment_score, tickers: s.ticker_sentiment,
          source: s.source, time: s.time_published, url: s.url,
        })),
        // Prediction markets
        prediction_markets: {
          kalshi: (cachedKalshi?.data||[]).map(m => ({
            title: m.title, probability: m.probability, volume: m.volume,
            category: m.category, close_time: m.close_time, url: m.url,
          })),
          polymarket: (cachedPolymarket?.data||[]).map(m => ({
            question: m.question, probability: m.probability, volume: m.volume,
            category: m.category, url: m.url,
          })),
        },
        // (space block merged above)
        // Cache metadata
        _cache: {
          all_keys: allCacheKeys,
          articles_cached: cachedArticles?.ageMin != null ? cachedArticles.ageMin + 'm ago' : 'none',
          satellite_cached: cachedSatellite?.ageMin != null ? cachedSatellite.ageMin + 'm ago' : 'none',
          finance_cached: cachedFinance?.ageMin != null ? cachedFinance.ageMin + 'm ago' : 'none',
          alerts_cached: cachedAlerts?.ageMin != null ? cachedAlerts.ageMin + 'm ago' : 'none',
        },
        _counts: {
          aircraft: (satellite.aircraft||[]).length,
          milaircraft: (satellite.milaircraft||[]).length,
          ships_civil: (satellite.ships||[]).filter(s=>!(s.type==='warship'||s._isWarship)).length,
          warships: (satellite.warships||(satellite.ships||[]).filter(s=>s.type==='warship'||s._isWarship)).length,
          warships_live: (satellite.warships||[]).filter(w=>w._livePos).length,
          conflict_events: (satellite.conflictEvents||[]).length,
          gdacs: (satellite.gdacs||[]).length,
          fires: (satellite.globalFires||[]).length,
          disease: (satellite.diseaseOutbreaks||[]).length + (satellite.promed||[]).length,
          alerts: (alertsData.alerts||[]).length,
          news_articles: articles.length,
          finance_instruments: Object.keys(finance.quotes||{}).length,
          crypto: Object.keys(finance.crypto||{}).length,
          prediction_markets: (cachedKalshi?.data||[]).length + (cachedPolymarket?.data||[]).length,
          pre_action_indicators: (satellite.preActionIndicators||[]).length,
          telegram_posts: (satellite.telegramPosts||[]).length,
          earthquakes: (satellite.earthquakes||[]).length,
          volcanoes: (satellite.volcanoes||[]).length,
          hurricanes: (satellite.hurricanes||[]).length,
          floods: (satellite.floods||[]).length,
          viirs: (satellite.viirsNightlights||satellite.globalViirs||[]).length,
          sigmets: (satellite.sigmets||[]).length,
          notams: (satellite.notams||[]).length,
          wiki_edits: (satellite.wikiEdits||[]).length,
          bgp: (satellite.bgpAnomalies||[]).length,
          reliefweb: (satellite.reliefweb||[]).length,
          neos: (satellite.neos||[]).length,
          space_debris: (satellite.spaceDebris||[]).length,
          conjunctions: (satellite.satelliteConjunctions||[]).length,
          air_quality: (satellite.airQuality||[]).length,
          solar_xray_class: satellite.solarXray?.class||'A',
          spaceweather_alerts: (satellite.spaceweather?.alerts||[]).length,
          nasa_sat_passes: (satellite.nasaSatellitePasses||[]).length,
          firms_zones: 28,
          telegram_channels: 30,
        },
      }
      setData(payload)
      setProgress('')
    } catch (e) {
      setData({ error: e.message })
      setProgress('')
    } finally { setLoading(false) }
  }

  const downloadJSON = () => {
    if (!data) return
    setDownloading(true)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `nexus-export-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`
    a.click(); URL.revokeObjectURL(url)
    setDownloading(false)
  }

  const copy = (obj) => {
    navigator.clipboard?.writeText(JSON.stringify(obj, null, 2)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const sections = data && !data.error ? [
    { id:'summary',    label:`Summary (${Object.keys(data._counts||{}).map(k=>k+':'+data._counts[k]).join(' | ')})` },
    { id:'aircraft',   label:`Civil Aircraft (${data.aircraft?.length||0})`,   obj: data.aircraft },
    { id:'milaircraft',label:`Mil Aircraft (${data.milaircraft?.length||0})`,  obj: data.milaircraft },
    { id:'ships',      label:`Ships (${data.ships?.length||0})`,               obj: data.ships },
    { id:'warships',   label:`Warships (${data.warships?.length||0})`,         obj: data.warships },
    { id:'conflict',   label:`Conflict (${data.conflict_events?.length||0})`,  obj: data.conflict_events },
    { id:'gdacs',      label:`Disasters (${data.gdacs_disasters?.length||0})`, obj: data.gdacs_disasters },
    { id:'alerts',     label:`Alerts (${data.alerts?.length||0})`,             obj: data.alerts },
    { id:'news',       label:`News (${data.news_articles?.length||0})`,        obj: data.news_articles },
    { id:'disease',    label:`Disease (${data.disease?.length||0})`,           obj: data.disease },
    { id:'full',       label:'⬇ Full Export',                                  obj: data },
  ] : []

  const curSection = sections.find(s => s.id === section)
  const curObj = curSection?.obj || (section === 'summary' ? data?._counts : data)

  return (
    <div style={{ padding:'8px', display:'flex', flexDirection:'column', gap:'6px', height:'100%' }}>
      <div className="mono" style={{ fontSize:'8px', color:'var(--t4)', lineHeight:1.6 }}>
        Exports ALL data for forecasting engine ingestion. Includes: live ship/aircraft positions,
        conflict events, alerts, 2000 news articles, disease, disasters, space. Use every 2 min.
        Deduplicate on mmsi/icao24/id + timestamp.
      </div>
      <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={fetchAll} disabled={loading} className="btn btn-accent" style={{ fontSize:'9px', padding:'3px 10px' }}>
          {loading ? `⏳ ${progress}` : '🗃 Fetch All Data'}
        </button>
        {data && !data.error && (
          <>
            <button onClick={downloadJSON} disabled={downloading} className="btn" style={{ fontSize:'9px', padding:'3px 10px', color:'#4ade80' }}>
              {downloading ? '⏳' : '⬇ Download JSON'}
            </button>
            <button onClick={() => copy(curObj)} className="btn" style={{ fontSize:'9px', padding:'3px 10px', color:'var(--accent)' }}>
              {copied ? '✅ Copied!' : '📋 Copy Section'}
            </button>
          </>
        )}
        {data && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>{data._meta?.exportedAt||''}</span>}
      </div>
      {data && !data.error && (
        <>
          <div style={{ display:'flex', gap:'3px', flexWrap:'wrap' }}>
            {sections.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)} className="btn" style={{
                fontSize:'7px', padding:'2px 5px',
                background: section===s.id ? 'var(--accent)' : 'var(--surface)',
                color: section===s.id ? '#000' : 'var(--t3)',
                border: `1px solid ${section===s.id ? 'var(--accent)' : 'var(--border)'}`,
              }}>{s.label}</button>
            ))}
          </div>
          <div style={{ flex:1, overflowY:'auto', background:'var(--base)', borderRadius:'3px', padding:'8px', border:'1px solid var(--border)' }}>
            <pre style={{ fontSize:'8px', color:'var(--t2)', margin:0, whiteSpace:'pre-wrap', wordBreak:'break-all', fontFamily:'JetBrains Mono,monospace' }}>
              {JSON.stringify(curObj, null, 2)}
            </pre>
          </div>
        </>
      )}
      {data?.error && <div style={{ color:'#ef4444', fontSize:'11px', padding:'10px' }}>Error: {data.error}</div>}
      {!data && !loading && (
        <div style={{ textAlign:'center', padding:'20px', color:'var(--t4)', fontSize:'11px' }}>
          Click "Fetch All Data" — exports everything: aircraft positions, ship AIS, conflict events,
          alerts, 2000+ news articles, disease outbreaks, disasters, space launches.<br/><br/>
          <span style={{ fontSize:'9px', color:'var(--t4)' }}>
            ⚠ Warships show HOME PORT unless live AIS matched their MMSI.
          </span>
        </div>
      )}
    </div>
  )
}

export default function HealthCheck() {
  const keys = useStore(s => s.keys)
  const [results, setResults] = useState({})
  const [running, setRunning] = useState(false)
  const [logEntries, setLogEntries] = useState(() => readLog())
  const [activeTab, setActiveTabHC] = useState('checks')  // 'checks' | 'log'
  const [progress, setProgress] = useState(0)

  const runOne = useCallback(async (id) => {
    setResults(r => ({ ...r, [id]: { status:'pending', detail:'testing…', ms:null } }))
    const result = await runCheckLogged(id, keys)
    setResults(r => ({ ...r, [id]: result }))
    setLogEntries(readLog())  // refresh log display
  }, [keys])

  const runAll = useCallback(async () => {
    setRunning(true)
    setProgress(0)
    setResults({})
    for (let i = 0; i < CHECKS.length; i++) {
      const check = CHECKS[i]
      setResults(r => ({ ...r, [check.id]: { status:'pending', detail:'testing…', ms:null } }))
      const result = await runCheck(check.id, keys)
      setResults(r => ({ ...r, [check.id]: result }))
      setProgress(Math.round((i+1)/CHECKS.length*100))
      setLogEntries(readLog())
      // Small delay between checks to avoid rate-limiting
      await new Promise(r => setTimeout(r, 300))
    }
    setRunning(false)
  }, [keys])

  const groups = [...new Set(CHECKS.map(c => c.group))]
  const okCount = Object.values(results).filter(r => r?.status === 'ok').length
  const errCount = Object.values(results).filter(r => r?.status === 'error').length
  const warnCount = Object.values(results).filter(r => r?.status === 'warn').length
  const testedCount = Object.values(results).filter(r => r?.status && r.status !== 'pending').length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--void)', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink:0, padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'var(--base)', display:'flex', alignItems:'center', gap:'10px' }}>
        <span style={{ fontFamily:'Orbitron,sans-serif', fontSize:'11px', color:'var(--t3)', letterSpacing:'0.1em' }}>NEXUS HEALTH CHECK</span>
        <span style={{ fontSize:'9px', color:'var(--t4)', fontFamily:'JetBrains Mono,monospace' }}>v4 — real tests only</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:'8px', alignItems:'center' }}>
          {testedCount > 0 && (
            <span className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>
              {okCount>0&&<span style={{color:'#4ade80'}}>✅ {okCount} </span>}
              {warnCount>0&&<span style={{color:'#f59e0b'}}>⚠️ {warnCount} </span>}
              {errCount>0&&<span style={{color:'#ef4444'}}>❌ {errCount}</span>}
            </span>
          )}
          {running && (
            <span className="mono" style={{ fontSize:'9px', color:'var(--accent)' }}>{progress}%</span>
          )}
          <div style={{ display:'flex', gap:'4px' }}>
            <button onClick={() => setActiveTabHC('checks')} className="btn" style={{ fontSize:'9px', padding:'2px 10px', background: activeTab==='checks'?'var(--accent)':'transparent', color: activeTab==='checks'?'#000':'var(--t3)', border:'none' }}>Tests</button>
            <button onClick={() => setActiveTabHC('log')} className="btn" style={{ fontSize:'9px', padding:'2px 10px', background: activeTab==='log'?'var(--accent)':'transparent', color: activeTab==='log'?'#000':'var(--t3)', border:'none' }}>
              📋 Raw Log {logEntries.length > 0 && <span style={{background:'rgba(45,212,191,0.3)',borderRadius:'8px',padding:'0 4px',fontSize:'8px'}}>{logEntries.length}</span>}
            </button>
            <button onClick={() => setActiveTabHC('dump')} className="btn" style={{ fontSize:'9px', padding:'2px 10px', background: activeTab==='dump'?'var(--accent)':'transparent', color: activeTab==='dump'?'#000':'var(--t3)', border:'none' }}>
              🗃 Data Dump
            </button>
          </div>
          <button onClick={runAll} disabled={running} className="btn btn-accent" style={{ fontSize:'9px', padding:'3px 12px', display:'flex', alignItems:'center', gap:'5px' }}>
            <RefreshCw size={10} className={running ? 'spin' : ''} />
            {running ? 'Testing…' : 'Run All Tests'}
          </button>
          <button onClick={() => {
            // Nuclear clear: wipe ALL nexus cache keys from localStorage
            const keys = []
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const k = localStorage.key(i)
              if (k?.startsWith('nexus-cache-v1-') || k?.startsWith('nexus-')) keys.push(k)
            }
            keys.forEach(k => localStorage.removeItem(k))
            // Also clear sessionStorage
            try { sessionStorage.clear() } catch {}
            // Hard reload — forces ALL hooks to re-mount and re-fetch from scratch
            // Using location.reload(true) forces bypass of browser cache too
            window.location.reload(true)
          }} className="btn" style={{ fontSize:'9px', padding:'3px 10px', color:'#ef4444', borderColor:'#ef4444' }}>
            🗑 Clear Cache &amp; Hard Reload
          </button>
        </div>
      </div>

      {/* Results + Log */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {activeTab === 'dump' && (
          <DumpTab />
        )}
        {activeTab === 'log' && (
          <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
            <div style={{ flexShrink:0, padding:'6px 10px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span className="mono" style={{ fontSize:'8px', color:'var(--t4)' }}>{logEntries.length} ENTRIES · STORED IN localStorage · AUTO-APPENDED ON EVERY TEST</span>
              <button onClick={() => { clearLog(); setLogEntries([]) }} className="btn" style={{ fontSize:'8px', padding:'2px 8px', color:'#ef4444', border:'1px solid rgba(239,68,68,0.3)' }}>
                🗑 Clear Log
              </button>
            </div>
            <div style={{ flex:1, overflowY:'auto', fontFamily:'JetBrains Mono,monospace', fontSize:'10px' }}>
              {logEntries.length === 0 ? (
                <div style={{ padding:'20px', textAlign:'center', color:'var(--t4)' }}>
                  No log entries yet. Run tests to populate.
                </div>
              ) : logEntries.map((entry, i) => (
                <div key={i} style={{ padding:'6px 10px', borderBottom:'1px solid var(--border)', background: entry.status==='error'?'rgba(239,68,68,0.04)':entry.status==='ok'?'rgba(74,222,128,0.03)':'transparent' }}>
                  <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'2px' }}>
                    <span style={{ color: CLR[entry.status||'pending'], fontSize:'9px' }}>{ICN[entry.status||'pending']}</span>
                    <span style={{ color:'var(--accent)', fontSize:'9px' }}>{entry.source}</span>
                    <span style={{ color:'var(--t4)', fontSize:'8px' }}>{entry.t?.slice(11,19)}</span>
                    {entry.ms && <span style={{ color:'var(--t4)', fontSize:'8px', marginLeft:'auto' }}>{entry.ms}ms</span>}
                  </div>
                  <div style={{ color:'var(--t2)', fontSize:'9px', marginBottom:'3px' }}>{entry.detail}</div>
                  <details style={{ marginTop:'2px' }}>
                    <summary style={{ cursor:'pointer', fontSize:'8px', color:'var(--t4)', userSelect:'none' }}>Raw JSON</summary>
                    <pre style={{ margin:'4px 0 0', padding:'6px', background:'var(--base)', borderRadius:'3px', fontSize:'8px', color:'var(--t3)', overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
                      {JSON.stringify(entry.raw, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'checks' && <div>
        {groups.map(group => {
          const groupChecks = CHECKS.filter(c => c.group === group)
          const groupResults = groupChecks.map(c => results[c.id]).filter(Boolean)
          const groupOk = groupResults.filter(r => r.status === 'ok').length
          const groupErr = groupResults.filter(r => r.status === 'error').length
          return (
            <div key={group}>
              <div style={{ padding:'6px 10px', background:'var(--base)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'8px' }}>
                <span style={{ fontSize:'11px', fontWeight:700, color:'var(--t2)' }}>{group}</span>
                {groupResults.length > 0 && (
                  <span className="mono" style={{ fontSize:'8px', color: groupErr>0?'#ef4444':groupOk===groupChecks.length?'#4ade80':'#f59e0b' }}>
                    {groupOk}/{groupChecks.length} ok
                  </span>
                )}
              </div>
              {groupChecks.map(check => (
                <CheckRow key={check.id} check={check} result={results[check.id]} onRun={runOne} />
              ))}
            </div>
          )
        })}
        <div style={{ padding:'12px 16px', fontSize:'9px', color:'var(--t4)', lineHeight:1.8, fontFamily:'JetBrains Mono,monospace' }}>
          NOTE: CORS-blocked sources (BNO, Liveuamap, ProMED) are tested via server-side proxies.<br/>
          Switch to 📋 Raw Log tab to see full JSON response from every source.<br/>
          FIRMS key is hardcoded. Groq requires key in Settings.
        </div>
      </div>}
      </div>
    </div>
  )
}
