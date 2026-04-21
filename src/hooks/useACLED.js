/**
 * useACLED v3 - Multi-source conflict data (ACLED replaced with working alternatives)
 *
 * Sources (in priority order):
 * 1. UCDP Candidate API - Uppsala University, monthly near-realtime, FREE, no key needed
 * 2. GDELT GEO - conflict events with coordinates, real-time, FREE
 * 3. ReliefWeb - UN conflict reports, FREE
 * 4. Armed Conflict DB (ICEWS via Harvard Dataverse) - event data, FREE
 * 5. Crisis24 / OSAC RSS feeds - US Govt security alerts with geo
 */

function acledSeverity(eventType, fatalities) {
  if (fatalities > 50) return 'critical'
  if (fatalities > 10) return 'high'
  const t = (eventType || '').toLowerCase()
  if (/battle|explosion|airstrike|drone|missile|shelling|bombing/.test(t)) return fatalities > 0 ? 'high' : 'medium'
  if (/violence against civilians|massacre/.test(t)) return 'high'
  return 'medium'
}

function acledToSignal(ev) {
  const fatStr = ev.fatalities > 0 ? ` — ${ev.fatalities} fatalities` : ''
  const actors = [ev.actor1, ev.actor2].filter(Boolean).join(' vs ')
  return {
    id: `conflict-${ev.id || Math.random().toString(36).slice(2)}`,
    title: `[${ev.source || 'CONFLICT'}] ${ev.event_type || 'Event'}: ${actors || ev.location || ''} in ${ev.country || ''}${fatStr}`,
    summary: ev.notes?.slice(0, 400) || ev.description || '',
    source: ev.source || 'Conflict Monitor',
    url: ev.url || 'https://ucdp.uu.se/',
    category: 'conflict',
    severity: acledSeverity(ev.event_type, parseInt(ev.fatalities) || 0),
    region: ev.region || ev.country || 'Global',
    tags: ['conflict', ev.country, ev.event_type].filter(Boolean),
    entities: [ev.actor1, ev.actor2, ev.country].filter(Boolean).map(n => ({ name: n, type: 'org' })),
    pub: ev.event_date ? new Date(ev.event_date) : new Date(),
    fatalities: parseInt(ev.fatalities) || 0,
    eventType: ev.event_type, country: ev.country,
    lat: parseFloat(ev.latitude || ev.lat), lng: parseFloat(ev.longitude || ev.lng),
    _acled: true, _live: true,
  }
}

// 1. UCDP Candidate Events API — Uppsala University, no key, monthly near-realtime
async function fetchUCDP() {
  try {
    // UCDP Candidate: latest available version, georeferenced events
    const r = await fetch(
      'https://ucdpapi.pcr.uu.se/api/gedevents/25.1?pagesize=200&page=1',
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) }
    )
    if (!r.ok) return []
    const d = await r.json()
    return (d?.Result || []).filter(e => e.latitude && e.longitude).map(e => ({
      id: 'ucdp-' + e.id,
      event_type: e.type_of_violence === 1 ? 'State-Based Violence' : e.type_of_violence === 2 ? 'Non-State Conflict' : 'One-Sided Violence',
      actor1: e.side_a, actor2: e.side_b,
      country: e.country, region: e.region,
      location: e.source_article?.slice(0, 60),
      fatalities: e.best || e.low || 0,
      latitude: e.latitude, longitude: e.longitude,
      event_date: e.date_start?.slice(0, 10),
      notes: e.source_article?.slice(0, 300),
      source: 'UCDP',
      url: 'https://ucdp.uu.se/',
    })).map(acledToSignal)
  } catch { return [] }
}

// 2. GDELT GEO — real-time conflict events with coordinates
async function fetchGDELTConflicts() {
  try {
    const url = 'https://api.gdeltproject.org/api/v2/geo/geo?query=conflict%20OR%20battle%20OR%20airstrike%20OR%20explosion%20OR%20fighting%20OR%20attack&mode=pointdata&maxpoints=250&timespan=7d&format=json'
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return []
    const d = await r.json()
    return (d?.features || [])
      // Only keep specific city/town locations, not country centroids
      .filter(f => {
        const ft = (f.properties?.featuretype || f.properties?.feature_type || '').toLowerCase()
        // Skip if it's a country-level point (those cluster badly)
        if (ft === 'country' || ft === 'adm1' || ft === 'region') return false
        const lat = f.geometry?.coordinates?.[1]
        const lng = f.geometry?.coordinates?.[0]
        if (!lat || !lng) return false
        // Skip points at exact integer coordinates (country centroids)
        if (lat % 1 === 0 && lng % 1 === 0) return false
        return true
      })
      .slice(0, 100).map((f, i) => ({
        id: `gdelt-${i}`,
        title: `[CONFLICT] ${f.properties?.name || 'Armed Activity'} — ${f.properties?.countryname || ''}`,
        summary: f.properties?.htmlformattedurl || '',
        source: 'GDELT', url: f.properties?.url || '',
        category: 'conflict', severity: 'medium',
        region: f.properties?.countryname || 'Global',
        tags: ['conflict', f.properties?.countryname].filter(Boolean),
        entities: [{ name: f.properties?.countryname || '', type: 'location' }],
        pub: new Date(),
        lat: f.geometry?.coordinates?.[1], lng: f.geometry?.coordinates?.[0],
        _acled: true, _live: true,
      })).filter(e => e.lat && e.lng)
  } catch { return [] }
}

// 3. ReliefWeb — UN conflict situation reports
async function fetchReliefWebConflicts() {
  try {
    const body = JSON.stringify({
      query: { value: 'conflict OR violence OR fighting OR attack OR offensive' },
      filter: { field: 'type.name', value: 'Situation Report' },
      fields: { include: ['title', 'date', 'country', 'source', 'url', 'body-html'] },
      limit: 50, sort: ['date:desc']
    })
    const r = await fetch('https://api.reliefweb.int/v1/reports?appname=nexus&profile=list', {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000)
    })
    if (!r.ok) return []
    const d = await r.json()
    return (d?.data || []).map(item => ({
      id: `rw-${item.id}`,
      title: `[CONFLICT] ${item.fields?.title || ''}`,
      summary: (item.fields?.['body-html'] || '').replace(/<[^>]+>/g, '').slice(0, 300),
      source: 'ReliefWeb', url: item.fields?.url || '',
      category: 'conflict', severity: 'medium',
      region: (item.fields?.country || []).map(c => c.name).join(', '),
      tags: ['conflict', ...((item.fields?.country || []).map(c => c.name))],
      entities: (item.fields?.country || []).map(c => ({ name: c.name, type: 'location' })),
      pub: item.fields?.date?.created ? new Date(item.fields.date.created) : new Date(),
      _acled: true, _live: true,
    })).filter(e => e.title.length > 10)
  } catch { return [] }
}

// 4. GDELT News — conflict-tagged articles with geo
async function fetchGDELTNews() {
  try {
    const queries = [
      'airstrike%20OR%20shelling%20sourcelang:english',
      'battle%20OR%20offensive%20military%20sourcelang:english',
      'killed%20soldiers%20OR%20troops%20sourcelang:english',
    ]
    const seen = new Set(), results = []
    await Promise.allSettled(queries.map(q =>
      fetch(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=25&sort=DateDesc&timespan=3d&format=json`, { signal: AbortSignal.timeout(10000) })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          ;(d?.articles || []).forEach(a => {
            const k = (a.url||a.title||'').slice(0,60)
            if (seen.has(k) || !a.title) return
            seen.add(k)
            results.push({
              id: 'gdelt-news-' + Buffer.from(k).toString('base64').slice(0,8),
              title: '[CONFLICT] ' + a.title,
              summary: '',
              source: a.domain || 'GDELT News',
              url: a.url || '',
              category: 'conflict', severity: 'medium',
              region: 'Global',
              tags: ['conflict'],
              pub: new Date(),
              _acled: true, _live: true,
            })
          })
        }).catch(() => {})
    ))
    return results
  } catch { return [] }
}

// GDELT Events Database - precise city/town level conflict events with real lat/lng
async function fetchGDELTEvents() {
  try {
    // GDELT 2.0 Events API - returns events with precise Actor geo coding
    // EventCode 14* = protest, 18* = assault, 19* = fight, 20* = mass violence
    const url = 'https://api.gdeltproject.org/api/v2/events/events?QUERY=%22conflict%22%20OR%20%22attack%22%20OR%20%22killed%22&TIMESPAN=7&SORT=DateDesc&MAX=250&FORMAT=JSON'
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return []
    const d = await r.json()
    const seen = new Set()
    return (d?.events || [])
      .filter(e => {
        const lat = e.Actor2Geo_Lat || e.Actor1Geo_Lat || e.ActionGeo_Lat
        const lng = e.Actor2Geo_Long || e.Actor1Geo_Long || e.ActionGeo_Long
        if (!lat || !lng || Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return false
        // Filter out country-centroid points (integer coordinates)
        if (lat % 1 === 0 && lng % 1 === 0) return false
        const key = lat.toFixed(2) + ',' + lng.toFixed(2)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 150)
      .map(e => {
        const lat = e.ActionGeo_Lat || e.Actor2Geo_Lat || e.Actor1Geo_Lat
        const lng = e.ActionGeo_Long || e.Actor2Geo_Long || e.Actor1Geo_Long
        const location = e.ActionGeo_FullName || e.Actor2Geo_FullName || ''
        const code = parseInt(e.EventCode || '0')
        const isFight = code >= 190 || (code >= 180 && code < 190)
        const isProtest = code >= 140 && code < 150
        return {
          id: 'gde-' + (e.GlobalEventID || Math.random().toString(36).slice(2)),
          event_type: isFight ? 'Armed Conflict' : isProtest ? 'Protest' : 'Conflict Event',
          actor1: e.Actor1Name || '', actor2: e.Actor2Name || '',
          country: location.split(',').pop()?.trim() || '',
          location: location.split(',')[0]?.trim() || location,
          fatalities: 0,
          latitude: lat, longitude: lng,
          event_date: e.Day ? String(e.Day).slice(0, 4) + '-' + String(e.Day).slice(4, 6) + '-' + String(e.Day).slice(6, 8) : '',
          notes: (e.Actor1Name || '') + (e.Actor2Name ? ' vs ' + e.Actor2Name : '') + ' in ' + location,
          source: 'GDELT Events',
          url: e.SOURCEURL || '',
          numMentions: e.NumMentions || 1,
          goldsteinScale: e.GoldsteinScale || 0,
        }
      })
      .map(acledToSignal)
  } catch { return [] }
}

export async function fetchACLED(sitName, key, email, password) {
  // If ACLED key still provided, try legacy API first
  if (key && email) {
    try {
      const countryMap = {
        ukraine:'Ukraine', russia:'Russia', gaza:'Palestine', israel:'Israel',
        iran:'Iran', sudan:'Sudan', myanmar:'Myanmar', ethiopia:'Ethiopia',
        somalia:'Somalia', mali:'Mali', niger:'Niger', burkina:'Burkina Faso',
        syria:'Syria', yemen:'Yemen', pakistan:'Pakistan', nigeria:'Nigeria',
        drc:'Democratic Republic of Congo', haiti:'Haiti', iraq:'Iraq',
        libya:'Libya', lebanon:'Lebanon',
      }
      const lower = (sitName || '').toLowerCase()
      let country = null
      for (const [kw, c] of Object.entries(countryMap)) {
        if (lower.includes(kw)) { country = c; break }
      }
      const params = new URLSearchParams({
        key, email, limit: '200',
        fields: 'event_id_cnty,event_date,event_type,actor1,actor2,country,location,latitude,longitude,fatalities,notes,source,region,data_id',
        event_date_where: '>=',
        event_date: new Date(Date.now() - 30 * 24 * 3600000).toISOString().slice(0, 10),
        format: 'json',
      })
      if (country) params.set('country', country)
      const r = await fetch(`https://api.acleddata.com/acled/read?${params}`, { signal: AbortSignal.timeout(12000) })
      if (r.ok) {
        const d = await r.json()
        if (d?.data?.length) return d.data.map(e => acledToSignal({...e, source:'ACLED'})).sort((a, b) => b.pub - a.pub)
      }
    } catch {}
  }

  // Multi-source fallback: UCDP + GDELT Events (precise coords) + GDELT GEO + ReliefWeb + News
  const [ucdp, gdeltEvt, gdelt, rw, news] = await Promise.allSettled([
    fetchUCDP(),
    fetchGDELTEvents(),
    fetchGDELTConflicts(),
    fetchReliefWebConflicts(),
    fetchGDELTNews(),
  ])
  
  const all = [
    ...(ucdp.status === 'fulfilled' ? ucdp.value : []),
    ...(gdeltEvt.status === 'fulfilled' ? gdeltEvt.value : []),
    ...(gdelt.status === 'fulfilled' ? gdelt.value : []),
    ...(rw.status === 'fulfilled' ? rw.value : []),
    ...(news.status === 'fulfilled' ? news.value : []),
  ]
  
  if (sitName) {
    const lower = sitName.toLowerCase()
    const keywords = lower.split(/[/\s]+/).filter(w => w.length > 3)
    return all.filter(e => keywords.some(kw => (e.region + e.title + (e.tags||[]).join('')).toLowerCase().includes(kw)))
  }
  return all
}
