// NEXUS Unified API — single route, all endpoints
// /api/nexus?endpoint=satellite|alerts|signals|intel|threats|ingest|fred
export default async (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Cache-Control', 's-maxage=180')
  const ep = c.req.query('endpoint')
  const get = async (u, ms = 10000) => {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'NEXUS/1.0' } }); return r.ok ? r : null } catch { return null }
  }

  if (ep === 'satellite' || !ep) {
    const [eqR, hR, vR, gR] = await Promise.all([
      get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson'),
      get('https://www.nhc.noaa.gov/CurrentStorms.json'),
      get('https://volcanoes.usgs.gov/vhp/volc_activity.geojson'),
      get('https://www.gdacs.org/xml/rss.xml'),
    ])
    let earthquakes = [], hurricanes = [], volcanoes = [], gdacs = []
    if (eqR) { const d = await eqR.json().catch(() => null); earthquakes = (d?.features || []).slice(0, 80).map(f => ({ lat: f.geometry?.coordinates?.[1], lng: f.geometry?.coordinates?.[0], mag: f.properties?.mag, place: f.properties?.place, severity: (f.properties?.mag || 0) >= 5 ? 'high' : 'medium' })).filter(e => e.lat) }
    if (hR) { const d = await hR.json().catch(() => null); hurricanes = (d?.activeStorms || []).map(s => ({ name: s.name, lat: parseFloat(s.latitudeNumeric || 0), lng: parseFloat(s.longitudeNumeric || 0), classification: s.classification, intensity: s.intensity, severity: s.intensity >= 96 ? 'critical' : s.intensity >= 64 ? 'high' : 'medium' })).filter(s => s.lat) }
    if (vR) { const d = await vR.json().catch(() => null); volcanoes = (d?.features || []).slice(0, 30).map(f => ({ name: f.properties?.name, lat: f.geometry?.coordinates?.[1], lng: f.geometry?.coordinates?.[0], alert: f.properties?.alert_level, severity: f.properties?.alert_level === 'warning' ? 'critical' : f.properties?.alert_level === 'watch' ? 'high' : 'medium' })).filter(v => v.lat && v.name) }
    if (gR) { const xml = await gR.text().catch(() => ''); gdacs = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 15).map(m => { const t = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim(); if (!t) return null; const lat = parseFloat(m[1].match(/geo:lat[^>]*>([^<]+)/i)?.[1] || '0'); const lng = parseFloat(m[1].match(/geo:long[^>]*>([^<]+)/i)?.[1] || '0'); return { title: t, lat, lng, severity: m[1].toLowerCase().includes('red') ? 'critical' : m[1].toLowerCase().includes('orange') ? 'high' : 'medium' } }).filter(Boolean) }
    return c.json({ earthquakes, hurricanes, volcanoes, gdacs, count: earthquakes.length + hurricanes.length + volcanoes.length + gdacs.length, ts: new Date().toISOString() })
  }

  if (ep === 'alerts') {
    const [nwsR, gdR, wR] = await Promise.all([
      get('https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe'),
      get('https://www.gdacs.org/xml/rss.xml'),
      get('https://www.who.int/csr/don/en/rss.xml'),
    ])
    let nws = [], gdacs = [], who = []
    if (nwsR) { const d = await nwsR.json().catch(() => null); nws = (d?.features || []).slice(0, 8).map(f => ({ id: 'nws-' + (f.properties?.id || Math.random()), type: 'weather', icon: '⛈', title: (f.properties?.event || 'Alert') + ' — ' + (f.properties?.areaDesc || '').slice(0, 60), severity: f.properties?.severity === 'Extreme' ? 'critical' : 'high', source: 'NWS', ts: f.properties?.sent })) }
    if (gdR) { const xml = await gdR.text().catch(() => ''); gdacs = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8).map(m => { const t = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim(); if (!t) return null; return { id: 'gdacs-' + t.slice(0, 20).replace(/\s/g, '-'), type: 'disaster', icon: '⚠', title: t, severity: m[1].toLowerCase().includes('red') ? 'critical' : m[1].toLowerCase().includes('orange') ? 'high' : 'medium', source: 'GDACS' } }).filter(Boolean) }
    if (wR) { const xml = await wR.text().catch(() => ''); who = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 5).map(m => { const t = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim(); if (!t) return null; return { id: 'who-' + t.slice(0, 20).replace(/\s/g, '-'), type: 'disease', icon: '🦠', title: '🦠 WHO: ' + t, severity: 'high', source: 'WHO' } }).filter(Boolean) }
    const all = [...nws, ...gdacs, ...who]; const S = { critical: 0, high: 1, medium: 2 }; all.sort((a, b) => (S[a.severity] || 3) - (S[b.severity] || 3))
    return c.json({ alerts: all, counts: { nws: nws.length, gdacs: gdacs.length, who: who.length }, ts: new Date().toISOString() })
  }

  if (ep === 'fred') {
    const mode = c.req.query('mode')
    if (mode === 'quote') {
      const syms = (c.req.query('symbols') || '').split(',').filter(Boolean).slice(0, 15); const quotes = []
      for (const s of syms) { try { const r = await fetch(`https://stooq.com/q/l/?s=${s.toLowerCase()}.us&f=sd2t2ohlcv&e=json`, { signal: AbortSignal.timeout(5000) }); if (r?.ok) { const d = await r.json().catch(() => null); const q = d?.symbols?.[0]; if (q?.Close) quotes.push({ symbol: s, price: +q.Close, change: q.Change || 0 }) } } catch {} }
      return c.json({ quotes, ts: new Date().toISOString() })
    }
    const items = []
    for (const [sym, label] of [['SPY', 'S&P 500'], ['TLT', '20Y Treasury'], ['GLD', 'Gold'], ['USO', 'Oil'], ['FXE', 'Euro'], ['EWZ', 'Brazil']]) { try { const r = await fetch(`https://stooq.com/q/l/?s=${sym.toLowerCase()}.us&f=sd2t2ohlcv&e=json`, { signal: AbortSignal.timeout(5000) }); if (r?.ok) { const d = await r.json().catch(() => null); const q = d?.symbols?.[0]; if (q?.Close) items.push({ symbol: sym, label, price: +q.Close, change: q.Change || 0, changePct: q['Change %'] || 0 }) } } catch {} }
    return c.json({ items, ts: new Date().toISOString() })
  }

  if (ep === 'signals') {
    const results = { signals: [], ts: new Date().toISOString() }
    const rR = await get('https://www.reddit.com/r/worldnews/new.json?limit=15&raw_json=1')
    if (rR) { const d = await rR.json().catch(() => null); (d?.data?.children || []).forEach(p => { const post = p.data; if (!post?.title) return; results.signals.push({ id: post.id, title: post.title, score: post.score, source: 'r/worldnews', url: 'https://reddit.com' + post.permalink, ts: new Date(post.created_utc * 1000).toISOString(), severity: post.score > 3000 ? 'high' : 'medium' }) }) }
    const sdR = await get('https://www.state.gov/rss-feeds/press-releases/')
    if (sdR) { const xml = await sdR.text().catch(() => ''); [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 10).forEach(m => { const t = (m[1].match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim(); const l = (m[1].match(/<link[^>]*>([^<]+)<\/link>/i)?.[1] || '').trim(); if (t) results.signals.push({ id: 'state-' + t.slice(0, 20).replace(/\W/g, ''), title: t, source: 'US State Dept', url: l, ts: new Date().toISOString(), severity: 'medium' }) }) }
    return c.json(results)
  }

  if (ep === 'intel') {
    const q = c.req.query('q') || c.req.query('name') || ''
    if (!q) return c.json({ error: 'q required' })
    const query = decodeURIComponent(q).trim()
    let wiki = null
    try { const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, '_'))}`, { signal: AbortSignal.timeout(6000) }); if (r?.ok) { const d = await r.json().catch(() => null); if (d && d.type !== 'disambiguation') wiki = { title: d.title, description: d.description || '', extract: d.extract || '', url: d.content_urls?.desktop?.page || null } } } catch {}
    let articles = []
    try { const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}+sourcelang:english&mode=artlist&maxrecords=50&sort=DateDesc&format=json`; const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); if (r?.ok) { const d = await r.json().catch(() => null); articles = (d?.articles || []).map(a => ({ title: a.title, url: a.url, domain: a.domain, pubDate: a.seendate, tone: a.tone })).filter(a => a.title) } } catch {}
    return c.json({ wiki, articles, count: articles.length, ts: new Date().toISOString() })
  }

  if (ep === 'threats') {
    let kev = [], botnet = [], cves = []
    const [kR, fR, nvR] = await Promise.all([
      get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 12000),
      get('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', 12000),
      get('https://services.nvd.nist.gov/rest/json/cves/2.0/?pubStartDate=2026-03-01T00:00:00.000&pubEndDate=2026-04-16T00:00:00.000&cvssV3Severity=CRITICAL&resultsPerPage=50', 15000),
    ])
    if (kR) { const d = await kR.json().catch(() => null); kev = (d?.vulnerabilities || []).slice(0, 50).map(v => ({ cveID: v.cveID, vendor: v.vendorProject, product: v.product, description: v.shortDescription?.slice(0, 200), severity: 'critical', dueDate: v.dueDate, url: `https://nvd.nist.gov/vuln/detail/${v.cveID}` })) }
    if (fR) { const d = await fR.json().catch(() => null); botnet = (d || []).slice(0, 50).map(h => ({ ip: h.ip_address || h, malware: h.malware, country: h.country, severity: 'high' })) }
    if (nvR) { const nd = await nvR.json().catch(() => null); cves = (nd?.vulnerabilities || []).slice(0, 30).map(item => { const cve = item.cve; const m = cve?.metrics?.cvssMetricV31?.[0]; return { id: cve?.id, description: cve?.descriptions?.find(d => d.lang === 'en')?.value?.slice(0, 200), cvss: m?.cvssData?.baseScore, severity: (m?.cvssData?.baseSeverity || 'HIGH').toLowerCase(), published: cve?.published?.slice(0, 10) } }).filter(v => v.id) }
    return c.json({ kev, botnetC2: botnet, recentCVEs: cves, ts: new Date().toISOString() })
  }

  if (ep === 'ingest') {
    let crises = []
    const rwR = await get('https://api.reliefweb.int/v1/disasters?appname=nexus&query[value]=status:current&limit=50&format=json')
    if (rwR) { const d = await rwR.json().catch(() => null); crises = (d?.data || []).map(item => ({ id: item.id, name: item.fields?.name || '', country: (item.fields?.country || []).map(c => c.name).join(', '), type: (item.fields?.type || []).map(t => t.name).join(', '), url: `https://reliefweb.int/disaster/${item.id}` })).filter(v => v.name) }
    return c.json({ crises, count: crises.length, ts: new Date().toISOString() })
  }

  return c.json({ error: 'unknown endpoint', help: '?endpoint=satellite|alerts|signals|intel|threats|ingest|fred', ts: new Date().toISOString() })
}