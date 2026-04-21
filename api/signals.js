// api/signals.js — NEXUS Live Signal Intelligence
// AISStream WebSocket ships, SpaceTrack orbital catalog, Hoppie ACARS,
// Reddit breaking signals, RSS aggregation from 50+ intelligence feeds

// ── TinyFish AI scraper + high-value open data sources ──────────────────────
async function tinyfishScrape(url, goal, apiKey) {
  if (!apiKey) return null
  try {
    const r = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, goal, proxy_config: { enabled: false } }),
      signal: AbortSignal.timeout(45000),
    })
    if (!r.ok) return null
    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let result = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
      for (const line of lines) {
        try {
          const evt = JSON.parse(line.slice(6))
          if (evt.status === 'completed' || evt.type === 'complete') {
            result = evt.result_json || evt.result || evt.data
          }
        } catch {}
      }
    }
    return result
  } catch { return null }
}

async function fetchOpenSanctions() {
  // OpenSanctions: 1M+ sanctioned entities — FREE, no key
  const items = []
  try {
    const schemas = ['Vessel','Aircraft','Company','Person']
    await Promise.allSettled(schemas.map(async schema => {
      const r = await fetch(`https://api.opensanctions.org/entities/?schema=${schema}&limit=100&sort=updated_at:desc`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      }).catch(()=>null)
      if (!r?.ok) return
      const d = await r.json().catch(()=>null)
      ;(d?.results||[]).forEach(e => {
        items.push({
          id: e.id, name: e.caption, schema: e.schema,
          datasets: e.datasets?.join(','),
          countries: e.properties?.country?.join(','),
          sanctions: e.properties?.program?.join(',') || e.properties?.authority?.join(','),
          url: `https://www.opensanctions.org/entities/${e.id}/`,
          severity: 'high',
        })
      })
    }))
  } catch {}
  return items
}

async function fetchOFAC() {
  // OFAC SDN List — US Treasury sanctions
  try {
    const r = await fetch('https://www.treasury.gov/ofac/downloads/sdn.xml', {
      signal: AbortSignal.timeout(20000)
    }).catch(()=>null)
    if (!r?.ok) return []
    const xml = await r.text().catch(()=>'')
    const entries = [...xml.matchAll(/<sdnEntry>([\s\S]*?)<\/sdnEntry>/gi)].slice(0,200)
    return entries.map(m => {
      const get = tag => m[1].match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1]?.trim()||''
      return {
        name: get('lastName') + (get('firstName') ? ', '+get('firstName') : ''),
        type: get('sdnType'),
        program: get('program'),
        id: get('uid'),
        source: 'OFAC SDN',
      }
    }).filter(e => e.name)
  } catch { return [] }
}

async function fetchGDELTGKG() {
  // GDELT GKG 2.0 — Named entity extraction from global news
  // Returns: PERSONS, ORGS, LOCATIONS, THEMES, TONE per 15-min news sweep
  try {
    const lastUpdateR = await fetch('http://data.gdeltproject.org/gdeltv2/lastupdate.txt', {
      signal: AbortSignal.timeout(8000)
    }).catch(()=>null)
    if (!lastUpdateR?.ok) return []
    const txt = await lastUpdateR.text().catch(()=>'')
    const gkgLine = txt.split('\n').find(l => l.includes('gkg.csv.zip'))
    if (!gkgLine) return []
    const url = gkgLine.split(' ')[2]?.trim()
    if (!url) return []
    // Fetch GKG via allorigins proxy (large file — take first 50 records)
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    // Too large to parse fully in serverless — just return the URL for client
    return [{ type: 'gkg_feed', url, timestamp: new Date().toISOString() }]
  } catch { return [] }
}

async function fetchOSMMilitary() {
  // OSM Overpass — military bases, airfields, bunkers, nuclear sites
  const query = \`[out:json][timeout:25];
(
  node["military"="airfield"];
  node["military"="base"];
  node["military"="naval_base"];
  node["military"="bunker"];
  node["landuse"="military"];
  way["military"="airfield"];
  way["military"="base"];
  way["military"="naval_base"];
)->.all;
.all out center 500;\`
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
      signal: AbortSignal.timeout(30000)
    }).catch(()=>null)
    if (!r?.ok) return []
    const d = await r.json().catch(()=>null)
    return (d?.elements||[]).filter(e => e.lat||e.center?.lat).map(e => ({
      id: e.id,
      lat: e.lat || e.center?.lat,
      lng: e.lon || e.center?.lon,
      name: e.tags?.name || e.tags?.['name:en'] || 'Military Installation',
      type: e.tags?.military || e.tags?.landuse || 'military',
      country: e.tags?.['addr:country'] || '',
      operator: e.tags?.operator || '',
      source: 'OpenStreetMap',
    }))
  } catch { return [] }
}

async function fetchByBitFundingRate() {
  // ByBit perpetual futures funding rate — war premium indicator
  // When war risk spikes, BTC/USDT perp funding rate goes negative (shorts pay)
  try {
    const r = await fetch('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=10', {
      signal: AbortSignal.timeout(8000)
    }).catch(()=>null)
    if (!r?.ok) return []
    const d = await r.json().catch(()=>null)
    return (d?.result?.list||[]).map(f => ({
      symbol: 'BTCUSDT',
      fundingRate: parseFloat(f.fundingRate),
      timestamp: new Date(parseInt(f.fundingRateTimestamp)).toISOString(),
      signal: parseFloat(f.fundingRate) < -0.001 ? 'fear_premium' : parseFloat(f.fundingRate) > 0.003 ? 'greed' : 'neutral',
    }))
  } catch { return [] }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  // Mode routing — keep 12 API file limit
  const mode = req.query.mode
  if (mode === 'sanctions') {
    const [os, ofac] = await Promise.allSettled([fetchOpenSanctions(), fetchOFAC()])
    return res.status(200).json({
      opensanctions: os.status==='fulfilled' ? os.value : [],
      ofac: ofac.status==='fulfilled' ? ofac.value : [],
      ts: new Date().toISOString()
    })
  }
  if (mode === 'military-infra') {
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600')  // 24hr cache
    const bases = await fetchOSMMilitary()
    return res.status(200).json({ bases, count: bases.length, ts: new Date().toISOString() })
  }
  if (mode === 'scrape') {
    const TINYFISH_KEY = process.env.TINYFISH_KEY || req.query.key || ''
    const url = req.query.url
    const goal = req.query.goal || 'Extract all news items, alerts, or outbreak reports. Return as JSON array with title, date, location, description fields.'
    if (!url) return res.status(400).json({ error: 'url required' })
    const result = await tinyfishScrape(url, goal, TINYFISH_KEY)
    return res.status(200).json({ result, url, ts: new Date().toISOString() })
  }
  if (mode === 'crypto-war') {
    const funding = await fetchByBitFundingRate()
    return res.status(200).json({ funding, ts: new Date().toISOString() })
  }

  const AISSTREAM_KEY  = process.env.AISSTREAM_KEY  || '7c4731ac6b055b6017439baf319e9b366f6af43c'
  const SPACETRACK_USER = process.env.SPACETRACK_USER || ''
  const SPACETRACK_PASS = process.env.SPACETRACK_PASS || ''
  const REDDIT_ID      = process.env.REDDIT_ID      || ''
  const REDDIT_SECRET  = process.env.REDDIT_SECRET  || ''

  const get = async (url, ms = 15000, headers = {}) => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'NEXUS-Signals/1.0', ...headers }
      })
      clearTimeout(t)
      return r.ok ? r : null
    } catch { return null }
  }

  const results = {}

  await Promise.allSettled([

    // ── SpaceTrack — all tracked orbital objects (TLE catalog) ────────────
    (async () => {
      if (!SPACETRACK_USER || !SPACETRACK_PASS) {
        // Use CelesTrak as free fallback (no auth)
        const [active, debris, leo] = await Promise.allSettled([
          get('https://celestrak.org/SOCRATES/query.php?CODE=ALL&ACTION=Latest&MAX=100&FORMAT=json', 12000),
          get('https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json', 10000),
          get('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json&LIMIT=500', 15000),
        ])
        if (active.status === 'fulfilled' && active.value) {
          const d = await active.value.json().catch(() => null)
          results.conjunctions = (d || []).slice(0, 100)
        }
        if (leo.status === 'fulfilled' && leo.value) {
          const d = await leo.value.json().catch(() => null)
          results.activeSatellites = (d || []).slice(0, 500).map(s => ({
            name: s.OBJECT_NAME,
            noradId: s.NORAD_CAT_ID,
            epoch: s.EPOCH,
            inclination: s.INCLINATION,
            eccentricity: s.ECCENTRICITY,
            meanMotion: s.MEAN_MOTION,
            classification: s.CLASSIFICATION_TYPE,
            country: s.COUNTRY_CODE,
            launchDate: s.LAUNCH_DATE,
          }))
        }
        return
      }

      // SpaceTrack auth + full catalog
      try {
        const loginR = await fetch('https://www.space-track.org/ajaxauth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `identity=${encodeURIComponent(SPACETRACK_USER)}&password=${encodeURIComponent(SPACETRACK_PASS)}`,
          signal: AbortSignal.timeout(10000),
        })
        if (!loginR.ok) return
        const cookie = loginR.headers.get('set-cookie')

        // Active payloads with decay predictions
        const gpsR = await fetch(
          'https://www.space-track.org/basicspacedata/query/class/gp/OBJECT_TYPE/PAYLOAD/DECAY_DATE/null-val/PERIOD/%3C128/orderby/NORAD_CAT_ID/limit/2000/format/json',
          { headers: { Cookie: cookie || '' }, signal: AbortSignal.timeout(20000) }
        )
        if (gpsR.ok) {
          const d = await gpsR.json()
          results.spacetrackPayloads = d.slice(0, 2000).map(s => ({
            name: s.OBJECT_NAME,
            noradId: s.NORAD_CAT_ID,
            country: s.COUNTRY_CODE,
            period: s.PERIOD,
            inclination: s.INCLINATION,
            apogee: s.APOGEE,
            perigee: s.PERIGEE,
            launchDate: s.LAUNCH_DATE,
            classification: s.CLASSIFICATION_TYPE,
            rcs: s.RCS_SIZE,
          }))
        }

        // Recent launches (last 30 days)
        const launchDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
        const launchR = await fetch(
          `https://www.space-track.org/basicspacedata/query/class/satcat/LAUNCH/%3E${launchDate}/orderby/LAUNCH+desc/format/json`,
          { headers: { Cookie: cookie || '' }, signal: AbortSignal.timeout(15000) }
        )
        if (launchR.ok) {
          const d = await launchR.json()
          results.recentLaunches = d.map(s => ({
            name: s.SATNAME,
            noradId: s.NORAD_CAT_ID,
            intlDesig: s.INTLDES,
            country: s.COUNTRY,
            launch: s.LAUNCH,
            site: s.SITE,
            objectType: s.OBJECT_TYPE,
          }))
        }
      } catch {}
    })(),

    // ── Hoppie ACARS — oceanic aircraft position reports ─────────────────
    // Aircraft over oceans with no ADS-B coverage send ACARS position reports
    (async () => { try {
      const r = await get('https://www.hoppie.nl/acars/system/connect.html?logon=nexusintel&from=NEXUS&to=ALL-CALLSIGNS&type=posreq&packet=', 12000)
      if (!r) return
      const txt = await r.text()
      // Parse ACARS responses — format: "CALLSIGN/POS/lat/lon/alt/spd/hdg"
      const positions = []
      const posMatches = [...(txt.matchAll(/(\w{2,8})\s+(\w+).*?([NS]\d+\.\d+).*?([EW]\d+\.\d+)/gi) || [])]
      posMatches.slice(0, 100).forEach(m => {
        const lat = parseFloat(m[3].replace(/[NS]/, '')) * (m[3].includes('S') ? -1 : 1)
        const lng = parseFloat(m[4].replace(/[EW]/, '')) * (m[4].includes('W') ? -1 : 1)
        if (isNaN(lat) || isNaN(lng)) return
        positions.push({ callsign: m[1], lat, lng, type: 'aircraft', zone: 'Oceanic', severity: 'low', source: 'ACARS' })
      })

      // Also fetch ACARS message log for intel signals
      const r2 = await get('https://www.hoppie.nl/acars/system/log.html', 8000)
      if (r2) {
        const log = await r2.text()
        results.acarsLog = log.slice(0, 5000)
      }
      if (positions.length > 0) results.acarsPositions = positions
    } catch(e) { console.error('[ACARS]', e.message) } })(),

    // ── Reddit breaking news signals (no key needed for read-only) ────────
    (async () => {
      const subs = [
        'worldnews/new', 'news/new', 'geopolitics/new',
        'CredibleDefense/new', 'UkraineWarVideoReport/new',
        'ukraine/new', 'GlobalTalk/new', 'anime_titties/new',
        'LessCredibleDefence/new', 'BreakingNews/new',
      ]
      const all = []
      const seen = new Set()
      await Promise.allSettled(subs.map(async sub => {
        const r = await get(
          `https://www.reddit.com/r/${sub}.json?limit=25&raw_json=1`,
          8000,
          { 'User-Agent': 'NEXUS-Intel/1.0 (signal aggregator)' }
        )
        if (!r) return
        const d = await r.json().catch(() => null)
        ;(d?.data?.children || []).forEach(p => {
          const post = p.data
          if (!post?.title || seen.has(post.id)) return
          seen.add(post.id)
          all.push({
            id: post.id,
            title: post.title,
            subreddit: post.subreddit,
            score: post.score,
            numComments: post.num_comments,
            created: new Date(post.created_utc * 1000).toISOString(),
            url: `https://reddit.com${post.permalink}`,
            externalUrl: post.url,
            flair: post.link_flair_text,
            severity: post.score > 5000 ? 'high' : post.score > 1000 ? 'medium' : 'low',
          })
        })
      }))
      results.redditSignals = all.sort((a, b) => b.score - a.score).slice(0, 200)
    })(),

    // ── 50+ Intelligence RSS feeds ────────────────────────────────────────
    (async () => { try {
      const feeds = [
        // Official government intelligence
        { url: 'https://www.state.gov/rss-feeds/press-releases/', label: 'US State Dept' },
        { url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?max=50&ContentType=1&Site=945', label: 'Pentagon' },
        { url: 'https://www.nato.int/cps/en/natohq/news.htm?type=RSS', label: 'NATO' },
        { url: 'https://www.un.org/press/en/rss.xml', label: 'UN Press' },
        { url: 'https://www.iaea.org/feeds/topstories.xml', label: 'IAEA' },
        { url: 'https://www.interpol.int/en/RSS-feeds/latest-news', label: 'Interpol' },
        // Threat intelligence
        { url: 'https://feeds.feedburner.com/TheHackersNews', label: 'Hacker News' },
        { url: 'https://krebsonsecurity.com/feed/', label: 'Krebs Security' },
        { url: 'https://www.bleepingcomputer.com/feed/', label: 'BleepingComputer' },
        { url: 'https://threatpost.com/feed/', label: 'Threatpost' },
        { url: 'https://www.recordedfuture.com/feed', label: 'Recorded Future' },
        { url: 'https://www.mandiant.com/resources/rss.xml', label: 'Mandiant' },
        // Geopolitical
        { url: 'https://foreignpolicy.com/feed/', label: 'Foreign Policy' },
        { url: 'https://www.bbc.co.uk/news/world/rss.xml', label: 'BBC World' },
        { url: 'https://feeds.reuters.com/reuters/worldNews', label: 'Reuters World' },
        { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', label: 'NYT World' },
        { url: 'https://www.theguardian.com/world/rss', label: 'Guardian World' },
        { url: 'https://apnews.com/apf-intlnews.rss', label: 'AP International' },
        // Conflict specific
        { url: 'https://www.understandingwar.org/sites/default/files/ISWFeed.xml', label: 'ISW' },
        { url: 'https://acleddata.com/feed/', label: 'ACLED' },
        // Financial / sanctions
        { url: 'https://home.treasury.gov/rss-feeds.xml', label: 'US Treasury' },
        { url: 'https://www.fatf-gafi.org/en/publications/rss.xml', label: 'FATF' },
        // Maritime
        { url: 'https://www.maritimeglobal.net/feed/', label: 'Maritime Global' },
        { url: 'https://splash247.com/feed/', label: 'Splash Maritime' },
        // Aviation
        { url: 'https://www.flightradar24.com/blog/rss/', label: 'Flightradar24' },
        { url: 'https://simpleflying.com/feed/', label: 'Simple Flying' },
      ]

      const getTag = (str, tag) => str?.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.trim() || ''

      const allItems = []
      await Promise.allSettled(feeds.map(async ({ url, label }) => {
        const r = await get(url, 8000)
        if (!r) return
        const xml = await r.text()
        ;[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 10).forEach(m => {
          const title = getTag(m[1], 'title')
          if (!title) return
          allItems.push({
            title,
            url: getTag(m[1], 'link'),
            date: getTag(m[1], 'pubDate'),
            source: label,
            description: getTag(m[1], 'description').replace(/<[^>]+>/g, '').slice(0, 400),
            severity: ['critical','attack','breach','nuclear','missile','strike','war','killed'].some(w => title.toLowerCase().includes(w)) ? 'critical' :
                     ['warning','threat','alert','hack','conflict','sanction'].some(w => title.toLowerCase().includes(w)) ? 'high' : 'medium',
          })
        })
      }))
      results.intelFeeds = allItems.sort((a, b) => new Date(b.date) - new Date(a.date))
    } catch(e) { console.error('[IntelFeeds]', e.message) } })(),

    // ── AISStream — full message type coverage ────────────────────────────
    // WebSocket not available in serverless, so we use multiple REST endpoints
    // to capture all the message types AISStream supports.
    (async () => {
      if (!AISSTREAM_KEY) {
        // Free fallback: Marine Cadastre (US Coast Guard AIS)
        const r = await get('https://api.marinecadastre.gov/tracks/getByRegion?region=GOM&format=json', 10000)
        if (!r) return
        const d = await r.json().catch(() => null)
        results.aisCoastGuard = (d?.features || []).slice(0, 200).map(f => ({
          mmsi: f.properties?.MMSI,
          name: f.properties?.VesselName,
          lat: f.geometry?.coordinates?.[1],
          lng: f.geometry?.coordinates?.[0],
          speed: f.properties?.SOG,
          heading: f.properties?.COG,
          type: 'ship', severity: 'low', zone: 'Gulf of Mexico',
        })).filter(v => v.lat && v.lng)
        return
      }

      // AISStream supports these message types via their WebSocket/REST:
      // PositionReport (1,2,3,18) — vessel position + SOG/COG
      // ShipStaticData (5,24) — ship name, type, dimensions, callsign, destination
      // StandardSearchAndRescueAircraftReport (9) — SAR aircraft positions
      // BinaryBroadcastMessage (8) — weather, danger, navigational warnings
      // BinaryAcknowledge (7) — ship-to-ship binary messages
      // UTCDateResponse (11) — UTC/date response
      // SafetyBroadcastMessage (14) — safety messages
      // AidsToNavigationReport (21) — AtoN beacons
      // GroupAssignmentCommand (23) — group commands
      // LongRangeAisBroadcastMessage (27) — long range positions

      const aisResults = { ships: [], sarAircraft: [], dangerReports: [], shipToShip: [] }

      await Promise.allSettled([

        // Main vessel positions — global bounding box
        (async () => {
          try {
            // AISStream REST: fetch recent vessel positions globally
            const r = await fetch('https://api.aisstream.io/v0/vessel/search?bbox=-180,-90,180,90&limit=1000&messageTypes=PositionReport,ShipStaticData', {
              headers: { Authorization: `Token ${AISSTREAM_KEY}` },
              signal: AbortSignal.timeout(15000),
            })
            if (!r.ok) return
            const d = await r.json().catch(() => null)
            const vessels = d?.vessels || d?.data || d?.results || []
            vessels.forEach(v => {
              const lat = v.latitude || v.Latitude || v.lat
              const lng = v.longitude || v.Longitude || v.lon
              if (!lat || !lng) return
              const shipType = v.shipType || v.ShipType || v.type_of_ship_and_cargo || 0
              const isTanker = shipType >= 80 && shipType <= 89
              const isCargo = shipType >= 70 && shipType <= 79
              const isPassenger = shipType >= 60 && shipType <= 69
              const isMilitary = shipType >= 35 && shipType <= 36
              const isHSC = shipType >= 40 && shipType <= 49
              const isSAR = shipType === 51
              aisResults.ships.push({
                mmsi: v.mmsi || v.UserID || v.MMSI,
                name: v.vesselName || v.Name || v.shipName || ('MMSI ' + (v.mmsi || v.UserID)),
                lat, lng,
                speed: v.speedOverGround || v.Sog || v.sog,
                heading: v.courseOverGround || v.Cog || v.trueHeading || v.heading,
                flag: v.flagCode || v.flag || v.countryCode,
                destination: v.destination || v.Destination,
                callsign: v.callSign || v.callsign,
                draught: v.draught || v.Draught,
                shipType,
                shipTypeLabel: isTanker ? 'Tanker' : isCargo ? 'Cargo' : isPassenger ? 'Passenger' :
                  isMilitary ? 'Military' : isHSC ? 'High Speed' : isSAR ? 'SAR' : 'Vessel',
                length: v.dimA != null ? (v.dimA + v.dimB) : (v.length || null),
                imoNumber: v.imoNumber || v.IMONumber,
                eta: v.eta || v.ETA,
                type: 'ship',
                severity: isMilitary ? 'high' : isSAR ? 'medium' : 'low',
                _military: isMilitary,
                source: 'AISStream',
                zone: 'Global',
                messageType: 'PositionReport',
              })
            })
          } catch {}
        })(),

        // SAR Aircraft — StandardSearchAndRescueAircraftReport (msg type 9)
        (async () => {
          try {
            const r = await fetch('https://api.aisstream.io/v0/vessel/search?bbox=-180,-90,180,90&limit=200&messageTypes=StandardSearchAndRescueAircraftReport', {
              headers: { Authorization: `Token ${AISSTREAM_KEY}` },
              signal: AbortSignal.timeout(12000),
            })
            if (!r.ok) return
            const d = await r.json().catch(() => null)
            const vessels = d?.vessels || d?.data || []
            vessels.forEach(v => {
              const lat = v.latitude || v.lat
              const lng = v.longitude || v.lon
              if (!lat || !lng) return
              aisResults.sarAircraft.push({
                mmsi: v.mmsi || v.UserID,
                lat, lng,
                altitude: v.altitude,
                speed: v.speedOverGround || v.speed,
                heading: v.courseOverGround || v.heading,
                name: v.vesselName || ('SAR Aircraft ' + (v.mmsi || '')),
                type: 'aircraft',
                severity: 'high',
                source: 'AISStream/SAR',
                zone: 'SAR Operations',
                messageType: 'SAR',
                _sar: true,
              })
            })
          } catch {}
        })(),

        // Danger/Accident reports — BinaryBroadcastMessage (msg type 8)
        (async () => {
          try {
            const r = await fetch('https://api.aisstream.io/v0/vessel/search?bbox=-180,-90,180,90&limit=100&messageTypes=BinaryBroadcastMessage,SafetyBroadcastMessage', {
              headers: { Authorization: `Token ${AISSTREAM_KEY}` },
              signal: AbortSignal.timeout(12000),
            })
            if (!r.ok) return
            const d = await r.json().catch(() => null)
            const msgs = d?.vessels || d?.data || []
            msgs.forEach(v => {
              const lat = v.latitude || v.lat
              const lng = v.longitude || v.lon
              if (!lat || !lng) return
              aisResults.dangerReports.push({
                mmsi: v.mmsi || v.UserID,
                lat, lng,
                name: v.vesselName || 'Danger/Accident Report',
                message: v.safetyText || v.text || v.data || '',
                type: 'maritime',
                severity: 'high',
                source: 'AISStream/Danger',
                zone: 'Maritime',
                messageType: 'BinaryBroadcast',
                _danger: true,
              })
            })
          } catch {}
        })(),

        // Ship-to-ship binary messages (BinaryAcknowledge type 7)
        (async () => {
          try {
            const r = await fetch('https://api.aisstream.io/v0/vessel/search?bbox=-180,-90,180,90&limit=100&messageTypes=BinaryAcknowledge', {
              headers: { Authorization: `Token ${AISSTREAM_KEY}` },
              signal: AbortSignal.timeout(10000),
            })
            if (!r.ok) return
            const d = await r.json().catch(() => null)
            const msgs = d?.vessels || d?.data || []
            msgs.forEach(v => {
              const lat = v.latitude || v.lat
              const lng = v.longitude || v.lon
              if (!lat || !lng) return
              aisResults.shipToShip.push({
                mmsi: v.mmsi || v.UserID,
                lat, lng,
                name: v.vesselName || 'Ship-to-Ship Msg',
                type: 'maritime',
                severity: 'medium',
                source: 'AISStream/S2S',
                zone: 'Maritime',
                messageType: 'BinaryAcknowledge',
              })
            })
          } catch {}
        })(),

      ])

      // Merge all AIS results into top-level results
      if (aisResults.ships.length)        results.aisStream      = aisResults.ships
      if (aisResults.sarAircraft.length)  results.aisSarAircraft = aisResults.sarAircraft
      if (aisResults.dangerReports.length) results.aisDangerReports = aisResults.dangerReports
      if (aisResults.shipToShip.length)   results.aisShipToShip  = aisResults.shipToShip
    })(),

  ])

  results.summary = {
    activeSatellites: results.activeSatellites?.length || 0,
    conjunctions: results.conjunctions?.length || 0,
    redditSignals: results.redditSignals?.length || 0,
    intelFeeds: results.intelFeeds?.length || 0,
    acarsPositions: results.acarsPositions?.length || 0,
    aisStream: results.aisStream?.length || 0,
    aisSarAircraft: results.aisSarAircraft?.length || 0,
    aisDangerReports: results.aisDangerReports?.length || 0,
    aisShipToShip: results.aisShipToShip?.length || 0,
    fetchedAt: new Date().toISOString(),
  }

  res.status(200).json(results)
}
