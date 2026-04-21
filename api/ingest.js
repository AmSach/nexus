/**
 * /api/ingest — Comprehensive intelligence data ingestion
 * All free/no-key sources that aren't in satellite.js or alerts.js
 * Covers: entity data, financial flows, disease, vessel intel, geospatial
 * 
 * Palantir-equivalent open sources:
 * - GLEIF: 2M+ legal entity identifiers (who owns what company)
 * - OFAC SDN: US sanctions list (free, no key)
 * - OCCRP Aleph: corruption/crime entity database
 * - UN Comtrade: global trade flows
 * - Shadowserver: internet threat telemetry
 * - ByBit: crypto as conflict capital flight proxy
 * - WorldPop: population density for casualty estimation
 * - UNOCHA: humanitarian data exchange
 * - ECDC: European disease surveillance
 * - ProMED full scrape via RSS proxies
 */

const CACHE = {}
const CACHE_TTL = { entity: 3600000, trade: 86400000, threat: 1800000, disease: 3600000, crypto: 300000 }

async function get(url, ms = 12000, headers = {}) {
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'NEXUS-Intel/6.0', ...headers }, signal: AbortSignal.timeout(ms) })
    if (!r.ok) return null
    return r
  } catch { return null }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600')

  const { type = 'all', q = '' } = req.query
  const results = {}

  await Promise.allSettled([

    // ── 1. OFAC SDN Sanctions List — US Treasury (FREE, no key, 15k+ entities) ─
    (type === 'all' || type === 'sanctions') && (async () => {
      try {
        // OFAC publishes structured JSON/XML — updated daily
        const r = await get('https://www.treasury.gov/ofac/downloads/sdn_xml.zip', 8000)
        if (!r) {
          // Fallback: OpenSanctions aggregated list (also free)
          const r2 = await get('https://api.opensanctions.org/entities/_all/?schema=Person&limit=100&target=true', 10000, { 'Authorization': 'ApiKey public' })
          if (r2) {
            const d = await r2.json().catch(()=>null)
            results.ofac_count = d?.total || 0
            results.ofac_sample = (d?.results||[]).slice(0,20).map(e => ({
              id: e.id, name: e.caption, datasets: e.datasets?.join(','),
              countries: e.properties?.country?.join(','),
              topics: e.properties?.topics?.join(','),
            }))
          }
        }
      } catch {}
    })(),

    // ── 2. OCCRP Aleph — corruption/crime entity search ─────────────────────────
    (type === 'all' || type === 'entity') && q && (async () => {
      try {
        const r = await get(`https://aleph.occrp.org/api/2/entities?q=${encodeURIComponent(q)}&limit=20&filter:schemata=Person,Company,Organization`, 12000, {
          'Authorization': 'ApiKey '  // public tier works without key
        })
        if (r) {
          const d = await r.json().catch(()=>null)
          results.aleph = (d?.results||[]).slice(0,15).map(e => ({
            id: e.id, name: e.caption,
            schema: e.schema, dataset: e.dataset?.label,
            url: `https://aleph.occrp.org/entities/${e.id}`,
            countries: e.properties?.country,
            address: e.properties?.address?.[0],
          }))
        }
      } catch {}
    })(),

    // ── 3. GLEIF Legal Entity Identifier — who owns what company ──────────────
    (type === 'all' || type === 'entity') && q && (async () => {
      try {
        const r = await get(`https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${encodeURIComponent(q)}&page[size]=10`, 8000)
        if (r) {
          const d = await r.json().catch(()=>null)
          results.gleif = (d?.data||[]).map(e => ({
            lei: e.id,
            name: e.attributes?.value,
            // Get full details
            url: `https://api.gleif.org/api/v1/lei-records/${e.id}`,
          }))
        }
      } catch {}
    })(),

    // ── 4. UN Comtrade — global trade flows (key commodities) ─────────────────
    // Track oil/weapons/grain trade as conflict proxy
    (type === 'all' || type === 'trade') && (async () => {
      try {
        // Free tier: 500 requests/day, no registration needed
        // HS code 27 = mineral fuels/oil, 87 = vehicles, 93 = weapons/ammunition
        const year = new Date().getFullYear() - 1
        const r = await get(`https://comtradeapi.un.org/public/v1/preview/C/A/HS?cmdCode=93&period=${year}&motCode=0&partner2Code=0&customsCode=C00&motCode=0&fmt=json&max=20`, 10000)
        if (r) {
          const d = await r.json().catch(()=>null)
          results.arms_trade = (d?.data||[]).slice(0,20).map(t => ({
            reporter: t.reporterDesc,
            partner: t.partnerDesc,
            tradeValue: t.primaryValue,
            netWeight: t.netWgt,
            year: t.period,
            flowDesc: t.flowDesc,
          }))
        }
      } catch {}
    })(),

    // ── 5. ByBit public market data — crypto as capital flight proxy ──────────
    // When conflict escalates, citizens in affected regions move to BTC/USDT
    // ByBit has no API key requirement for public endpoints
    (type === 'all' || type === 'crypto') && (async () => {
      try {
        const pairs = ['BTCUSDT','ETHUSDT','USDTBIDR','USDTPKR','XRPUSDT']
        const r = await get(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${pairs.join(',')}`, 8000)
        if (r) {
          const d = await r.json().catch(()=>null)
          results.bybit = (d?.result?.list||[]).map(t => ({
            symbol: t.symbol,
            lastPrice: t.lastPrice,
            price24hPcnt: t.price24hPcnt,
            volume24h: t.volume24h,
            turnover24h: t.turnover24h,
            highPrice24h: t.highPrice24h,
            lowPrice24h: t.lowPrice24h,
          }))
        }
      } catch {}
    })(),

    // ── 6. Walltime — Brazilian crypto exchange (LATAM conflict proxy) ─────────
    (type === 'all' || type === 'crypto') && (async () => {
      try {
        const r = await get('https://api.walltime.com/walltime/public/v1/tickers', 8000)
        if (r) {
          const d = await r.json().catch(()=>null)
          results.walltime = (d||[]).filter(t => ['BTCBRL','ETHBRL','USDCBRL'].includes(t.pair)).map(t => ({
            pair: t.pair, last: t.last, vol: t.vol, change: t.change
          }))
        }
      } catch {}
    })(),

    // ── 7. Shadowserver — internet threat telemetry (free, no key) ────────────
    // Shows which countries have compromised infrastructure right now
    (type === 'all' || type === 'threat') && (async () => {
      try {
        const r = await get('https://www.shadowserver.org/api/reports/types/', 8000)
        if (r) {
          const d = await r.json().catch(()=>null)
          // Get today's report stats
          const statsR = await get('https://www.shadowserver.org/api/reports/stats/?day=' + new Date().toISOString().slice(0,10), 8000)
          if (statsR) {
            const stats = await statsR.json().catch(()=>null)
            results.shadowserver = { reportTypes: (d||[]).slice(0,20), today: stats }
          }
        }
      } catch {}
    })(),

    // ── 8. UNOCHA HDX — humanitarian data exchange ────────────────────────────
    // Population displacement, food security, access constraints
    (type === 'all' || type === 'humanitarian') && (async () => {
      try {
        const r = await get('https://data.humdata.org/api/3/action/package_search?q=conflict&fq=vocab_Topics:crisis&rows=10&sort=metadata_modified+desc', 10000)
        if (r) {
          const d = await r.json().catch(()=>null)
          results.hdx_datasets = (d?.result?.results||[]).slice(0,8).map(ds => ({
            id: ds.id, name: ds.name, title: ds.title,
            organization: ds.organization?.title,
            modified: ds.metadata_modified,
            url: `https://data.humdata.org/dataset/${ds.name}`,
            tags: ds.tags?.map(t=>t.name).slice(0,5),
          }))
        }
      } catch {}
    })(),

    // ── 9. ProMED full article scrape — disease outbreak details ──────────────
    // Multiple proxy chain to bypass Vercel IP blocks
    (type === 'all' || type === 'disease') && (async () => {
      const items = []
      try {
        // Direct fetch - this runs server-side, no CORS proxy needed
        const r = await fetch('https://promedmail.org/feed/', {
          headers: { 'User-Agent': 'Mozilla/5.0 NEXUS/1.0', 'Accept': 'application/rss+xml, application/xml' },
          signal: AbortSignal.timeout(12000)
        }).catch(()=>null)
        if (r?.ok) {
          const xml = await r.text().catch(()=>'')
          ;[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,20).forEach(m => {
            const get = (tag) => m[1].match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.replace(/<[^>]+>/g,'')?.trim() || ''
            const title = get('title'), link = get('link'), pub = get('pubDate')
            const desc = get('description').replace(/<[^>]+>/g,'').slice(0,500)
            if (title && title.length > 5) items.push({ title, url: link, date: pub, description: desc, source: 'ProMED' })
          })
          if (items.length) { results.promed_ingest = items; return }
        }
      } catch {}
      try {
        // Chain 2: corsproxy.io
        const r2 = await fetch('https://corsproxy.io/?' + encodeURIComponent('https://promedmail.org/feed/'), { signal: AbortSignal.timeout(12000) }).catch(()=>null)
        if (r2?.ok) {
          const xml = await r2.text()
          ;[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,20).forEach(m => {
            const get = (tag) => m[1].match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.replace(/<[^>]+>/g,'')?.trim() || ''
            const title = get('title'), link = get('link'), pub = get('pubDate')
            const desc = get('description').replace(/<[^>]+>/g,'').slice(0,500)
            if (title && title.length > 5) items.push({ title, url: link, date: pub, description: desc, source: 'ProMED' })
          })
          if (items.length) results.promed_ingest = items
        }
      } catch {}
    })(),

    // ── 10. ECDC Threat Engine — European CDC disease surveillance ─────────────
    (type === 'all' || type === 'disease') && (async () => {
      try {
        const r = await get('https://www.ecdc.europa.eu/en/threats-and-outbreaks/threats-and-outbreaks-data', 8000)
        // ECDC has an open API for outbreak signals
        const r2 = await get('https://opendata.ecdc.europa.eu/monkeypox/casedistribution/json/', 8000)
        if (r2) {
          const d = await r2.json().catch(()=>null)
          results.ecdc = { status: 'ok', records: (d||[]).length }
        }
        // ECDC Communicable Disease Threats Report (CDTR)
        const r3 = await get('https://www.ecdc.europa.eu/sites/default/files/json/CDTR_data.json', 8000)
        if (r3) {
          const d = await r3.json().catch(()=>null)
          results.ecdc_cdtr = (d?.threats||d||[]).slice(0,10)
        }
      } catch {}
    })(),

    // ── 11. IMO GISIS — vessel registry (ownership tracking) ──────────────────
    (type === 'all' || type === 'vessel') && (async () => {
      try {
        // IMO number lookup for flagged vessels
        const r = await get('https://www.imosmember.org/index.php?option=com_imos&task=ajax&format=json&action=search&q=cargo&limit=20', 8000)
        if (r) {
          const d = await r.json().catch(()=>null)
          results.imo_vessels = (d?.data||[]).slice(0,15)
        }
      } catch {}
    })(),

    // ── 12. OpenFIGI — financial instrument ID mapping ────────────────────────
    // Maps company names → stock tickers for defense industry tracking
    (type === 'all' || type === 'finance') && (async () => {
      try {
        const defenseCompanies = [
          {query: 'Lockheed Martin'}, {query: 'Raytheon Technologies'},
          {query: 'Northrop Grumman'}, {query: 'BAE Systems'},
          {query: 'Thales Group'}, {query: 'Leonardo SpA'}
        ]
        const r = await fetch('https://api.openfigi.com/v3/search', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({query: 'Lockheed Martin', exchCode: 'US', securityType: 'Common Stock'}),
          signal: AbortSignal.timeout(8000)
        }).catch(()=>null)
        if (r?.ok) {
          const d = await r.json().catch(()=>null)
          results.openfigi = (d?.data||[]).slice(0,5)
        }
      } catch {}
    })(),

    // ── 13. Global Population Density via WorldPop (for casualty estimation) ───
    // When we know an event location, population density helps assess impact
    (type === 'population' || type === 'geo') && (async () => {
      try {
        const { lat = 0, lng = 0 } = req.query
        if (lat && lng) {
          // WorldPop REST API — population at point
          const r = await get(`https://api.worldpop.org/v1/services/stats?dataset=wpgp&year=2020&geojson={"type":"Point","coordinates":[${lng},${lat}]}`, 8000)
          if (r) {
            const d = await r.json().catch(()=>null)
            results.population_density = d?.data
          }
        }
      } catch {}
    })(),

    // ── 14. Armed Conflict Location (free API, no key required) ─────────────── 
    // Uppsala Conflict Data Program — every organized violence event since 1989
    (type === 'all' || type === 'conflict') && (async () => {
      try {
        const year = new Date().getFullYear()
        const r = await get(`https://ucdpapi.pcr.uu.se/api/gedevents/${year}?pagesize=100&page=1`, 12000)
        if (r) {
          const d = await r.json().catch(()=>null)
          results.ucdp_events = (d?.Result||[]).slice(0,30).map(e => ({
            id: e.id, date: e.date_start, country: e.country,
            conflict: e.conflict_name, dyad: e.dyad_name,
            deaths: e.best, lat: +e.latitude, lng: +e.longitude,
            source: 'UCDP',
          }))
        }
      } catch {}
    })(),

    // ── 15. ICC-CCS Piracy — live piracy report (full scrape) ─────────────────
    (type === 'all' || type === 'maritime') && (async () => {
      try {
        // ICC-CCS live piracy report
        // Direct server-side fetch - no CORS proxy needed from Vercel
        const r = await fetch('https://www.icc-ccs.org/piracy-reporting-centre/live-piracy-report', {
          headers: { 'User-Agent': 'Mozilla/5.0 NEXUS/1.0', 'Accept': 'text/html' },
          signal: AbortSignal.timeout(12000)
        }).catch(()=>null)
        if (r?.ok) {
          const html = await r.text().catch(()=>'')
          // Parse incident table from ICC-CCS
          const incidents = [...html.matchAll(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})([\s\S]{0,500}?)(?=\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|$)/gi)]
          results.piracy = incidents.slice(0,20).map(m => ({
            date: `${m[1]} ${m[2]} ${m[3]}`,
            details: m[4].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,300),
            source: 'ICC-CCS'
          }))
        }
      } catch {}
    })(),

  ])

  // Entity search queries (from former osint-db.js)
  if (type === 'entity' && q) {
    // Already handled above: GLEIF + OCCRP Aleph
    // Also add: UCDP conflict actors
    try {
      const r = await get(`https://ucdpapi.pcr.uu.se/api/actorsearch?name=${encodeURIComponent(q)}&pagesize=10`, 8000)
      if (r) {
        const d = await r.json().catch(()=>null)
        results.ucdp_actors = (d?.Result||[]).slice(0,10).map(a => ({
          id: a.ActorId, name: a.Name, type: a.ActorTypeId,
          country: a.GWNOName, active: a.Active,
        }))
      }
    } catch {}
  }

  res.status(200).json(results)
}
