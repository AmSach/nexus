// server.js — NEXUS Intelligence Platform unified server
// Ports all 12 api/*.js files to Hono handlers + serves static frontend

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'

const app = new Hono()

// ── CORS ────────────────────────────────────────────────────────────────────
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'User-Agent'],
}))

// ── HELPERS (shared across all routes) ──────────────────────────────────────
const TIMEOUT = 12000
async function safeGet(url, ms = 20000, headers = {}) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'NEXUS-GodView/3.0 (intelligence platform)', ...headers }
    })
    clearTimeout(t)
    return r.ok ? r : null
  } catch { return null }
}

function getXMLTag(str, tag) {
  return str?.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.trim() || ''
}

function parseRSSItems(xml, source, limit = 30) {
  const items = []
  const isAtom = /<feed[\t\n\r ]*>/i.test(xml)
  const itemRe = isAtom ? /<entry[^>]*>([\t\n\r ]*?)<\/entry>/gi : /<item>([\t\n\r ]*?)<\/item>/gi
  const matches = [...xml.matchAll(itemRe)]
  for (const m of matches.slice(0, limit)) {
    const b = m[1]
    const title = getXMLTag(b, 'title') || getXMLTag(b, 'summary')
    if (!title || title.length < 3) continue
    const linkMatch = b.match(/<link[^>]*href=\"([^\"]+)\"/i) || b.match(/<link[^>]*>\t*([^<\t]{10,})\t*<\/link>/i)
    const link = linkMatch?.[1]?.trim() || getXMLTag(b, 'guid') || ''
    const pubDate = getXMLTag(b, 'pubDate') || getXMLTag(b, 'published') || getXMLTag(b, 'updated') || ''
    const descRaw = getXMLTag(b, 'content:encoded') || getXMLTag(b, 'description') || getXMLTag(b, 'content') || getXMLTag(b, 'summary') || ''
    const description = descRaw.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').trim().slice(0, 400)
    items.push({ title, url: link, date: pubDate, description, source })
  }
  return items
}

function mapEarthquakes(d) {
  return (d?.features || [])
    .filter(f => f.geometry?.coordinates && f.properties?.mag >= 1.5)
    .map(f => ({
      id: f.id, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
      depth: f.geometry.coordinates[2], mag: f.properties.mag,
      place: f.properties.place,
      time: new Date(f.properties.time).toISOString().slice(0, 16),
      type: f.properties.type, tsunami: f.properties.tsunami > 0,
      felt: f.properties.felt || 0, url: f.properties.url,
      severity: f.properties.mag >= 7 ? 'critical' : f.properties.mag >= 6 ? 'high' : f.properties.mag >= 5 ? 'medium' : 'low',
    }))
    .sort((a, b) => b.mag - a.mag).slice(0, 500)
}

function parseFIRMS(csv, label, prod, arr) {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return
  const h = lines[0].split(',').map(x => x.trim().replace(/['\"]/g, ''))
  const latI = h.indexOf('latitude'), lngI = h.indexOf('longitude')
  const brightI = h.indexOf('bright_ti4') !== -1 ? h.indexOf('bright_ti4') : h.indexOf('brightness')
  const confI = h.indexOf('confidence'), dateI = h.indexOf('acq_date'), timeI = h.indexOf('acq_time')
  for (const line of lines.slice(1)) {
    const v = line.split(',').map(x => x.trim().replace(/['\"]/g, ''))
    const lat = parseFloat(v[latI]), lng = parseFloat(v[lngI])
    if (isNaN(lat) || isNaN(lng)) continue
    const bright = parseFloat(v[brightI]) || 0
    arr.push({ lat, lng, brightness: bright, confidence: v[confI] || 'n', date: v[dateI] || '', time: v[timeI] || '', zone: label, product: prod,
      severity: bright > 450 ? 'critical' : bright > 380 ? 'high' : 'medium' })
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// API ROUTES — All 12 endpoints ported from api/*.js
// ════════════════════════════════════════════════════════════════════════════════

// ── /api/satellite — GOD VIEW (3193 lines ported) ──────────────────────────
app.get('/api/satellite', async (c) => {
  const T0 = Date.now()
  const primaryDeadline = new Promise(r => setTimeout(r, 38000))
  const deadline = new Promise(r => setTimeout(r, 52000))
  const FIRMS_KEY = '08be3187f8c1526e0fd30249ee2c3374'
  const OPENSKY_USER = 'qwertyuiop-api-client'
  const OPENSKY_PASS = 'HxtqGHUEV2gR7dz8FnkhVQA88CUHalCw'
  const OPENSKY_AUTH = 'Basic ' + Buffer.from(OPENSKY_USER + ':' + OPENSKY_PASS).toString('base64')

  const get = async (url, ms = 20000, headers = {}) => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'NEXUS-GodView/3.0', ...headers } })
      clearTimeout(t)
      return r.ok ? r : null
    } catch { return null }
  }

  const getXMLTag2 = (str, tag) => str?.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.trim() || ''

  const parseRSSItems2 = (xml, source, limit = 30) => {
    const items = []
    const isAtom = /<feed[\t\n\r ]*>/i.test(xml)
    const itemRe = isAtom ? /<entry[^>]*>([\t\n\r ]*?)<\/entry>/gi : /<item>([\t\n\r ]*?)<\/item>/gi
    const matches = [...xml.matchAll(itemRe)]
    for (const m of matches.slice(0, limit)) {
      const b = m[1]
      const title = getXMLTag2(b, 'title') || getXMLTag2(b, 'summary')
      if (!title || title.length < 3) continue
      const linkMatch = b.match(/<link[^>]*href=\"([^\"]+)\"/i)
      const link = linkMatch?.[1]?.trim() || getXMLTag2(b, 'guid') || ''
      const pubDate = getXMLTag2(b, 'pubDate') || getXMLTag2(b, 'published') || getXMLTag2(b, 'updated') || ''
      const descRaw = getXMLTag2(b, 'content:encoded') || getXMLTag2(b, 'description') || getXMLTag2(b, 'content') || ''
      const description = descRaw.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').trim().slice(0, 400)
      items.push({ title, url: link, date: pubDate, description, source })
    }
    return items
  }

  const results = {}

  await Promise.race([primaryDeadline, Promise.allSettled([
    // USGS earthquakes
    (async () => {
      const r = await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/1.5_week.geojson')
      if (r) { const d = await r.json(); results.earthquakes = mapEarthquakes(d) }
      else { const r2 = await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson'); if (r2) { const d = await r2.json(); results.earthquakes = mapEarthquakes(d) } }
    })(),
    // IRIS seismic
    (async () => { const r = await get('https://service.iris.edu/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=20000&orderby=time', 8000); if (r) { const d = await r.json(); results.iris = (d?.features || []).map(f => ({ lat: f.geometry?.coordinates?.[1], lng: f.geometry?.coordinates?.[0], depth: f.geometry?.coordinates?.[2], mag: f.properties?.mag, place: f.properties?.place, time: f.properties?.time, net: f.properties?.net, severity: (f.properties?.mag || 0) >= 6.5 ? 'critical' : (f.properties?.mag || 0) >= 5.5 ? 'high' : 'medium' })).filter(e => e.lat && e.lng) } })(),
    // GVP volcanoes
    (async () => { const r = await get('https://volcano.si.edu/api/v1/eruptions?activityevidence=Eruption%20Observed&activitystatus=Confirmed&timeframe=Last%20Week&format=json', 8000); if (r) { const d = await r.json(); const arr = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : []; if (arr.length > 0) { results.volcanoes = arr.map(v => ({ id: v.volcano_number, name: v.volcano_name, lat: parseFloat(v.latitude || 0), lng: parseFloat(v.longitude || 0), country: v.country || '', type: v.primary_volcano_type || '', lastActivity: v.start_date || '', vei: v.vei, url: `https://volcano.si.edu/volcano.cfm?vn=${v.volcano_number || ''}`, severity: (v.vei || 0) >= 4 ? 'critical' : (v.vei || 0) >= 3 ? 'high' : 'medium' })).filter(v => v.lat !== 0 && v.lng !== 0 && v.name) } } })(),
    // NOAA NHC storms
    (async () => { const r = await get('https://www.nhc.noaa.gov/CurrentStorms.json'); if (r) { const d = await r.json(); results.hurricanes = (d?.activeStorms || []).map(s => ({ id: s.id, name: s.name, classification: s.classification, intensity: s.intensity, pressure: s.pressure, lat: parseFloat(s.latitudeNumeric || 0), lng: parseFloat(s.longitudeNumeric || 0), movement: s.movement, headline: s.headline, publicAdvisoryUrl: s.publicAdvisoryUrl, severity: s.intensity >= 96 ? 'critical' : s.intensity >= 64 ? 'high' : 'medium', track: (s.forecast || []).map(f => ({ lat: parseFloat(f.latitudeNumeric || 0), lng: parseFloat(f.longitudeNumeric || 0), date: f.date, intensity: f.intensity })) })).filter(s => s.lat !== 0 || s.lng !== 0) } })(),
    // NWS weather alerts
    (async () => { const r = await get('https://api.weather.gov/alerts/active?status=actual&message_type=alert&severity=Extreme,Severe,Moderate', 15000); if (r) { const d = await r.json(); results.weatherAlerts = (d?.features || []).map(f => { const p = f.properties || {}; let lat = 0, lng = 0; if (f.geometry?.type === 'Point') { lng = f.geometry.coordinates[0]; lat = f.geometry.coordinates[1] } else if (f.geometry?.type === 'Polygon') { const c = f.geometry.coordinates[0]?.[0]; if (c) { lng = c[0]; lat = c[1] } } return { id: p.id, event: p.event, headline: p.headline?.slice(0, 200), severity: p.severity, urgency: p.urgency, certainty: p.certainty, area: p.areaDesc?.slice(0, 100), onset: p.onset, expires: p.expires, lat, lng, url: p.web, mapSeverity: p.severity === 'Extreme' ? 'critical' : p.severity === 'Severe' ? 'high' : 'medium' } }).filter(a => a.lat !== 0 || a.lng !== 0) } })(),
    // GDACS disasters
    (async () => { const r = await get('https://www.gdacs.org/xml/rss.xml', 8000); if (r) { const xml = await r.text(); results.gdacs = [...xml.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)].map(m => { const lat = parseFloat(m[1]?.match(/geo:lat[^>]*>([^<]+)/i)?.[1] || '0'); const lng = parseFloat(m[1]?.match(/geo:long[^>]*>([^<]+)/i)?.[1] || '0'); const alertlevel = m[1]?.match(/gdacs:alertlevel[^>]*>([^<]+)/i)?.[1]?.toLowerCase() || 'green'; const eventtype = m[1]?.match(/gdacs:eventtype[^>]*>([^<]+)/i)?.[1] || ''; const title = getXMLTag2(m[1], 'title'); const desc = getXMLTag2(m[1], 'description').replace(/<[^>]+>/g, '').slice(0, 400); if (!title || (lat === 0 && lng === 0)) return null; return { title, description: desc, date: getXMLTag2(m[1], 'pubDate'), lat, lng, alertlevel, eventtype, severity: alertlevel === 'red' ? 'critical' : alertlevel === 'orange' ? 'high' : 'medium', url: getXMLTag2(m[1], 'link') } }).filter(Boolean) } })(),
    // ReliefWeb
    (async () => { const r = await get('https://api.reliefweb.int/v1/disasters?appname=nexus-godview&query[value]=status:current&fields[include][]=name,date,type,country,status&limit=300&sort[]=date:desc&format=json'); if (r) { const d = await r.json(); results.reliefweb = (d?.data || []).map(item => ({ id: item.id, name: item.fields?.name || '', date: item.fields?.date?.created?.slice(0, 10) || '', type: (item.fields?.type || []).map(t => t.name).join(', '), country: (item.fields?.country || []).map(c => c.name).join(', '), url: `https://reliefweb.int/disaster/${item.id}`, status: item.fields?.status || '' })).filter(d => d.name.length > 2) } })(),
    // DFO floods
    (async () => { const r = await get('https://floodobservatory.colorado.edu/tempdata/FloodArchive.geojson', 6000); if (r) { try { const d = await r.json(); results.floods = (d?.features || []).filter(f => f.properties?.Status === 'O' || f.properties?.Status === 'R').map(f => ({ id: f.properties?.ID, country: f.properties?.Country, area: f.properties?.Area || 0, displaced: f.properties?.Displaced || 0, dead: f.properties?.Dead || 0, began: f.properties?.Began, ended: f.properties?.Ended, lat: f.geometry?.coordinates?.[1] || parseFloat(f.properties?.Lat || 0), lng: f.geometry?.coordinates?.[0] || parseFloat(f.properties?.Long || 0), severity: (f.properties?.Dead || 0) > 100 ? 'critical' : (f.properties?.Displaced || 0) > 10000 ? 'high' : 'medium', status: f.properties?.Status, url: f.properties?.News })).filter(f => f.lat && f.lng) } catch {} } })(),
    // NASA FIRMS fires
    (async () => {
      const zones = [[32.0, 46.0, 40.5, 52.5, 'Ukraine/Donbas'], [34.2, 31.2, 36.0, 33.5, 'Gaza/Lebanon'], [35.0, 32.5, 43.0, 37.5, 'Syria'], [42.5, 12.5, 55.0, 19.0, 'Yemen'], [-5.5, 10.0, 5.5, 20.0, 'Sahel/Mali'], [27.0, -5.0, 32.0, 2.0, 'DRC/Congo'], [36.0, 11.0, 44.0, 17.0, 'Ethiopia/Sudan'], [94.0, 20.5, 98.5, 26.0, 'Myanmar']]
      const allFires = []
      const products = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT']
      await Promise.allSettled(zones.map(async ([minLng, minLat, maxLng, maxLat, label]) => {
        for (const prod of products) {
          const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/${prod}/${minLng},${minLat},${maxLng},${maxLat}/1`
          const r = await get(url, 6000)
          if (!r) continue
          const csv = await r.text()
          if (!csv || !csv.includes('latitude')) continue
          parseFIRMS(csv, label, prod, allFires)
          break
        }
      }))
      if (allFires.length < 20) { const r = await get(`https://firms.modaps.eosdis.nasa.gov/api/country/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/world/1`, 8000); if (r) { const csv = await r.text(); if (csv?.includes('latitude')) { const lines = csv.trim().split('\n'); const h = lines[0].split(',').map(x => x.trim().replace(/['\"]/g, '')); const latI = h.indexOf('latitude'), lngI = h.indexOf('longitude'); const brightI = h.indexOf('bright_ti4') !== -1 ? h.indexOf('bright_ti4') : h.indexOf('brightness'); const confI = h.indexOf('confidence'); for (let i = 1; i < lines.length; i++) { const v = lines[i].split(',').map(x => x.trim().replace(/['\"]/g, '')); const lat = parseFloat(v[latI]), lng = parseFloat(v[lngI]); if (isNaN(lat) || isNaN(lng)) continue; const bright = parseFloat(v[brightI]) || 0; allFires.push({ lat, lng, brightness: bright, confidence: v[confI] || 'n', date: v[h.indexOf('acq_date')] || '', zone: 'Global', product: 'VIIRS', severity: bright > 450 ? 'critical' : bright > 380 ? 'high' : 'medium' }) } } } }
      results.globalFires = allFires
    })(),
    // Aircraft — adsb.fi + airplanes.live + OpenSky
    (async () => {
      const zones = [{ name: 'Ukraine/Donbas', lat: 49, lon: 36, dist: 500 }, { name: 'Gaza/Israel', lat: 31, lon: 34, dist: 300 }, { name: 'Syria/Iraq', lat: 34, lon: 41, dist: 600 }, { name: 'Red Sea/Yemen', lat: 15, lon: 45, dist: 600 }, { name: 'Persian Gulf', lat: 26, lon: 54, dist: 400 }, { name: 'Taiwan Strait', lat: 24, lon: 121, dist: 400 }, { name: 'Korean Peninsula', lat: 37, lon: 127, dist: 400 }, { name: 'Black Sea', lat: 43, lon: 34, dist: 400 }, { name: 'Middle East', lat: 32, lon: 45, dist: 600 }, { name: 'India/Pakistan', lat: 26, lon: 73, dist: 700 }]
      const all = [], seen = new Set()
      const openSkyPromise = get('https://opensky-network.org/api/states/all', 8000, { 'Authorization': OPENSKY_AUTH })
      await Promise.allSettled(zones.map(async zone => {
        const r = await get(`https://opendata.adsb.fi/api/v2/lat/${zone.lat}/lon/${zone.lon}/dist/${zone.dist}`, 4000)
        if (!r) return
        try { const d = await r.json(); (d?.aircraft || []).forEach(a => { if (!a.lat || !a.lon || a.alt_baro === 'ground' || seen.has(a.hex)) return; seen.add(a.hex); const emerg = a.squawk === '7700' || a.squawk === '7500' || a.squawk === '7600'; all.push({ icao24: a.hex, callsign: (a.flight || '').trim().replace(/\t+/g, ''), country: a.r?.slice(0, 2) || '', lng: a.lon, lat: a.lat, altitude: typeof a.alt_baro === 'number' ? Math.round(a.alt_baro) : (a.alt_geom || 0), altMeters: typeof a.alt_baro === 'number' ? Math.round(a.alt_baro * 0.3048) : 0, velocity: a.gs ? Math.round(a.gs) : null, heading: a.track ? Math.round(a.track) : null, vertRate: a.baro_rate, squawk: a.squawk, zone: zone.name, type: 'aircraft', severity: a.squawk === '7700' ? 'critical' : emerg ? 'high' : 'low', registration: a.r, model: a.t, _glow: emerg }) }) } catch {}
      }))
      await Promise.allSettled(zones.map(async zone => {
        const r = await get(`https://api.airplanes.live/v2/point/${zone.lat}/${zone.lon}/350`, 4000)
        if (!r) return
        try { const d = await r.json(); (d?.ac || []).forEach(a => { if (!a.lat || !a.lon || seen.has(a.hex)) return; seen.add(a.hex); all.push({ icao24: a.hex, callsign: (a.flight || '').trim(), country: a.r?.slice(0, 2) || '', lng: a.lon, lat: a.lat, altitude: typeof a.alt_baro === 'number' ? Math.round(a.alt_baro) : (a.alt_geom || 0), altMeters: typeof a.alt_baro === 'number' ? Math.round(a.alt_baro * 0.3048) : 0, velocity: a.gs ? Math.round(a.gs) : null, heading: a.track ? Math.round(a.track) : null, squawk: a.squawk, zone: zone.name, type: 'aircraft', severity: 'low', registration: a.r, model: a.t }) }) } catch {}
      }))
      try { const osR = await openSkyPromise; if (osR) { const osD = await osR.json().catch(() => null); (osD?.states || []).forEach(s => { if (!s[5] || !s[6]) return; const sq = s[14] || ''; const cs = (s[1] || '').trim(); const isEmerg = sq === '7700' || sq === '7500' || sq === '7600'; const isMilCS = /^(RCH|RRR|RFR|CNV|NAVY|USMC|USAF|USN|GAF|FAF|RAF|SAF|RSAF|ROCAF|JASDF|PLAAF)/i.test(cs); if (s[8] === true && !isEmerg && !isMilCS) return; if (seen.has(s[0])) return; seen.add(s[0]); all.push({ icao24: s[0], callsign: cs, country: s[2], lng: s[5], lat: s[6], altitude: Math.round((s[7] || s[13] || 0) * 3.28084), altMeters: s[7] || s[13] || 0, velocity: s[9] ? Math.round(s[9] * 1.944) : null, heading: s[10] ? Math.round(s[10]) : null, vertRate: s[11], squawk: s[14], onGround: s[8] === true, zone: 'OpenSky Global', type: 'aircraft', severity: s[14] === '7700' ? 'critical' : isEmerg ? 'high' : 'low', _glow: isEmerg }) }) } } catch {}
      results.aircraft = all.filter(a => a.lat && a.lng !== undefined)
      results.aircraftEmergency = all.filter(a => a.severity === 'critical' || a.severity === 'high')
    })(),
    // Military aircraft
    (async () => {
      const milAc = [], milSeen = new Set()
      const addMil = (a) => { const k = a.icao24 || a.hex || (a.lat + '_' + a.lng); if (!a.lat || !a.lng || milSeen.has(k)) return; milSeen.add(k); milAc.push({ icao24: a.hex || a.icao24 || '', callsign: (a.flight || a.callsign || '').trim(), lat: +(a.lat || a.latitude || 0), lng: +(a.lon || a.lng || a.longitude || 0), altitude: a.alt_baro || a.altitude || 0, velocity: a.gs || a.groundspeed || 0, heading: a.track || a.heading || 0, squawk: a.squawk || '', zone: a.zone || 'Global Military', _military: true, country: a.r?.slice(0, 2) || a.country || '', model: a.t || a.model || '' }) }
      try { const r = await fetch('https://api.airplanes.live/v2/mil', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) }).catch(() => null); if (r?.ok) { const d = await r.json().catch(() => null); (d?.ac || d?.aircraft || []).forEach(a => addMil({ ...a, zone: 'Global Military' })) } } catch {}
      try { const r = await fetch('https://api.adsbexchange.com/api/aircraft/json/mil/', { headers: { 'api-auth': 'adsbx-open-1234567890', 'User-Agent': 'NEXUS-Intel/5.0' }, signal: AbortSignal.timeout(6000) }).catch(() => null); if (r?.ok) { const d = await r.json().catch(() => null); (d?.ac || []).forEach(a => addMil({ ...a, zone: 'ADSBx Military' })) } } catch {}
      try { const osMilR = await get('https://opensky-network.org/api/states/all', 6000, { 'Authorization': OPENSKY_AUTH }); if (osMilR) { const osD = await osMilR.json().catch(() => null); (osD?.states || []).forEach(s => { if (!s[5] || !s[6]) return; const cs = (s[1] || '').trim(), sq = s[14] || ''; const isMilCS = /^(RCH|RRR|RFR|CNV|NAVY|USMC|USAF|USN|GAF|FAF|RAF|SAF|RSAF|ROCAF|JASDF|PLAAF|VMF|VMFA|VMFAT|VMGR|HMH|HML|HMLA|VMA|VMAQ|VFA|VP|VQ|VRC|VR|VC|VT|VX|HSC|HSM|HCS|HC|HM|VAW|VW|VAQ)/i.test(cs); const isMilSq = ['7777', '7400', '7501', '6100', '6400'].includes(sq); const hex = (s[0] || '').toLowerCase(); const isMilHex = /^ae[0-9a-f]{4}|^43[0-9a-f]{4}|^3c[0-9a-f]{4}|^3d[0-9a-f]{4}/i.test(hex); if (!isMilCS && !isMilSq && !isMilHex) return; if (milSeen.has(s[0])) return; milSeen.add(s[0]); milAc.push({ icao24: s[0], callsign: cs, lat: s[6], lng: s[5], altitude: Math.round((s[7] || s[13] || 0) * 3.28084), velocity: s[9] ? Math.round(s[9] * 1.944) : null, heading: s[10] ? Math.round(s[10]) : null, squawk: sq, zone: 'OpenSky Military', _military: true, country: s[2] || '' }) } } } catch {}
      const milCallPat = /^(RCH|RRR|RFR|CNV|NAVY|USMC|USAF|USN|GAF|FAF|RAF|SAF|RSAF|ROCAF|JASDF|PLAAF|VMF|VMFA|VMA|VFA|VP|VQ|VRC|VR|HC|HM|VAW|SPAR|EXEC|DUKE|MIGHT|REACH|IRON|STEEL|VALOR|ATLAS|NINJA|GHOST)/i
      const milZones = [{ lat: 38.9, lon: -77.0, name: 'Washington DC/Bolling' }, { lat: 36.8, lon: -76.0, name: 'Norfolk/Langley AFB' }, { lat: 33.9, lon: -118.4, name: 'Los Angeles/Edwards' }, { lat: 51.5, lon: -1.8, name: 'Brize Norton/RAF' }, { lat: 52.5, lon: 13.4, name: 'Berlin/Gatow' }, { lat: 56.0, lon: 23.7, name: 'Siauliai NATO Lithuania' }, { lat: 35.5, lon: 139.8, name: 'Iruma/JASDF' }, { lat: 37.1, lon: 127.0, name: 'Osan/USAF Korea' }, { lat: 26.3, lon: 127.8, name: 'Kadena/USAF Okinawa' }, { lat: 39.9, lon: 116.4, name: 'Beijing/PLAAF' }, { lat: 24.1, lon: 56.6, name: 'Al Dhafra/UAE/USAF' }, { lat: 26.3, lon: 50.6, name: 'Bahrain/USAF CENTCOM' }]
      await Promise.allSettled(milZones.map(z => get(`https://opendata.adsb.fi/api/v2/lat/${z.lat}/lon/${z.lon}/dist/150`, 8000).then(r => r && r.json()).then(d => { if (d?.aircraft) { d.aircraft.forEach(a => { if (!a.lat || !a.lon) return; const cs = (a.flight || '').trim(); if (!milCallPat.test(cs) && !a._military) return; addMil({ ...a, zone: z.name }) }) } })))
      results.milaircraft = milAc
    })(),
    // Ships
    (async () => {
      const all = [], seen = new Set()
      const add = (v) => { const lat = +v.lat, lng = +v.lng; if (!lat || !lng || isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return; const k = v.mmsi ? String(v.mmsi) : `${lat.toFixed(3)},${lng.toFixed(3)}`; if (seen.has(k)) return; seen.add(k); all.push({ mmsi: String(v.mmsi || ''), name: (v.name || '').trim(), lat, lng, speed: +(v.speed || v.sog || 0), heading: +(v.heading || v.cog || 0), flag: v.flag || '', type: v.type || v.shipType || 'Cargo', dest: v.dest || v.destination || '', zone: v.zone || 'Global' }) }
      const kzones = [[-30, 55, 40, 72, 'North Sea/Norwegian'], [-10, 48, 5, 62, 'English Channel/Irish Sea'], [20, 30, 70, 50, 'Mediterranean/Black Sea'], [30, 0, 80, 30, 'Red Sea/Arabian Sea'], [95, -10, 145, 40, 'Indo-Pacific'], [-90, 20, -60, 50, 'North Atlantic'], [100, 0, 130, 25, 'South China Sea'], [50, 22, 62, 32, 'Persian Gulf/Hormuz'], [115, 1, 120, 5, 'Malacca Strait'], [32.2, 29.5, 33.0, 31.5, 'Suez/Red Sea Entrance'], [118.5, 23.5, 120.5, 25.5, 'Taiwan Strait'], [46.0, 11.5, 51.0, 14.0, 'Gulf of Aden']]
      await Promise.allSettled(kzones.map(([mnLon, mnLat, mxLon, mxLat, zone]) => get(`https://kystdatahuset.no/ws/api/ais/positions/latest/area/${mnLon}/${mnLat}/${mxLon}/${mxLat}`, 6000).then(r => r && r.json()).then(d => { if (d) { (d?.data || d || []).forEach(v => add({ mmsi: v.mmsi, name: v.name || v.shipName || '', lat: v.lat || v.latitude, lng: v.lon || v.longitude || v.lng, speed: v.sog || v.speed || 0, heading: v.cog || v.heading || 0, flag: v.flag || v.country || '', type: v.shipType || v.type || '', dest: v.destination || '', zone })) } }).catch(() => {})))
      try { const bwR = await fetch('https://www.barentswatch.no/bw/open/ais/v1/latest/posnormal', { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) }).catch(() => null); if (bwR?.ok) { const bwD = await bwR.json().catch(() => null); (bwD || []).forEach(v => add({ mmsi: v.mmsi, name: v.name || '', lat: +(v.lat || 0), lng: +(v.lon || 0), speed: +(v.speedOverGround || 0), heading: +(v.courseOverGround || 0), flag: '', type: v.shipType || 'Cargo', zone: 'BarentsWatch' })) } } catch {}
      try { const dtR = await fetch('https://meri.digitraffic.fi/api/ais/v1/locations', { headers: { 'Accept': 'application/json', 'Digitraffic-User': 'NEXUS/1.0' }, signal: AbortSignal.timeout(6000) }).catch(() => null); if (dtR?.ok) { const dtD = await dtR.json().catch(() => null); (dtD?.features || []).forEach(f => { const p = f.properties || {}, c = f.geometry?.coordinates; if (!c) return; add({ mmsi: p.mmsi, name: p.name || '', lat: c[1], lng: c[0], speed: +(p.sog || 0), heading: +(p.cog || 0), flag: '', type: p.vesselType || 'Cargo', zone: 'Digitraffic FI' }) }) } } catch {}
      const CHOKEPOINTS = [{ name: 'Strait of Hormuz', lat: 26.5, lng: 56.5, r: 150 }, { name: 'Strait of Malacca', lat: 1.2, lng: 103.8, r: 120 }, { name: 'Suez Canal', lat: 30.5, lng: 32.3, r: 80 }, { name: 'Bab-el-Mandeb', lat: 12.6, lng: 43.4, r: 100 }, { name: 'Strait of Gibraltar', lat: 35.9, lng: -5.7, r: 80 }, { name: 'Taiwan Strait', lat: 24.5, lng: 119.5, r: 150 }, { name: 'Danish Straits', lat: 57.4, lng: 10.5, r: 120 }, { name: 'English Channel', lat: 50.9, lng: 1.4, r: 120 }, { name: 'Gulf of Aden', lat: 12.0, lng: 47.0, r: 200 }]
      const distKm = (lat1, lng1, lat2, lng2) => { const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180; const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) }
      const shipSeen = new Set(); const ships = []
      CHOKEPOINTS.forEach(cp => { const inZone = all.filter(v => v.speed > 0 && distKm(cp.lat, cp.lng, v.lat, v.lng) <= cp.r); const count = inZone.length; const jitter = (Math.random() - 0.5) * 0.04; ships.push({ lat: cp.lat + jitter, lng: cp.lng + jitter, name: count === 0 ? `⚠ AIS BLACKOUT: ${cp.name}` : `${cp.name} · ${count} vessels`, type: 'ship', mmsi: 'density-' + cp.name.replace(/\t/g, '-'), speed: 0, _density: true, _count: count, zone: cp.name, severity: count === 0 ? 'high' : count < 5 ? 'medium' : 'low', desc: count === 0 ? `⚠ ZERO vessels detected at ${cp.name} — possible AIS jamming, closure, or restricted zone` : `${count} vessels in transit · ${cp.name} · Live AIS data` }); shipSeen.add('density-' + cp.name.replace(/\t/g, '-')); inZone.filter(v => v.name).slice(0, 8).forEach(v => { const k = v.mmsi || `${v.lat.toFixed(3)},${v.lng.toFixed(3)}`; if (shipSeen.has(k)) return; shipSeen.add(k); ships.push({ ...v, _density: false, _anomaly: false, severity: 'low' }) }) })
      const THREAT_ZONES = [{ name: 'Red Sea North', lat: 28, lng: 34, margin: 4 }, { name: 'Red Sea Central', lat: 20, lng: 38, margin: 4 }, { name: 'Gulf of Aden', lat: 12, lng: 47, margin: 3 }, { name: 'Persian Gulf', lat: 26, lng: 51, margin: 4 }]
      all.filter(v => THREAT_ZONES.some(z => Math.abs(v.lat - z.lat) <= z.margin && Math.abs(v.lng - z.lng) <= z.margin)).forEach(v => { const zone = THREAT_ZONES.find(z => Math.abs(v.lat - z.lat) <= z.margin && Math.abs(v.lng - z.lng) <= z.margin); const isEvasion = v.speed > 18; if (v.speed < 0.5) return; const k = v.mmsi || `${v.lat.toFixed(3)},${v.lng.toFixed(3)}`; if (shipSeen.has(k)) return; shipSeen.add(k); if (isEvasion) ships.push({ ...v, _anomaly: true, severity: 'high', desc: `⚡ High-speed evasion: ${v.speed.toFixed(1)}kn in ${zone.name} (Houthi attack zone)` }); else ships.push({ ...v, severity: 'medium', zone: zone.name }) })
      const HV_TYPES = /tanker|lng|crude|carrier|bulk|container|ro.ro|chemical/i
      all.filter(v => HV_TYPES.test(v.type || '') && v.speed > 0.5).slice(0, 80).forEach(v => { const k = v.mmsi || `${v.lat.toFixed(3)},${v.lng.toFixed(3)}`; if (shipSeen.has(k)) return; shipSeen.add(k); ships.push({ ...v, severity: 'low' }) })
      results.ships = ships
    })(),
    // NASA EONET
    (async () => { const r = await get('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=2500&days=180'); if (r) { const d = await r.json(); results.eonet = (d?.events || []).filter(e => e.geometry?.length > 0).map(e => { const geo = e.geometry[e.geometry.length - 1]; let coords = null; if (geo.type === 'Point') coords = geo.coordinates; else if (geo.type === 'Polygon') coords = geo.coordinates[0][0]; if (!coords) return null; const cat = e.categories?.[0]?.title || 'Unknown'; return { id: e.id, title: e.title, category: cat, date: geo.date?.slice(0, 10) || '', lng: coords[0], lat: coords[1], url: e.sources?.[0]?.url || '', severity: ['Wildfires', 'Volcanoes'].includes(cat) ? 'high' : cat.includes('Severe') ? 'medium' : 'low' } }).filter(Boolean) } })(),
    // SIGMETs
    (async () => { const r = await get('https://aviationweather.gov/api/data/isigmet?format=json', 6000); if (r) { const d = await r.json(); results.sigmets = (d || []).map(s => ({ id: s.isigmetId, hazard: s.hazard, qualifier: s.qualifier, lat: parseFloat(s.lat || 0), lng: parseFloat(s.lon || 0), altLow: s.altitudeLow, altHigh: s.altitudeHigh, validFrom: s.validTimeFrom, validTo: s.validTimeTo, rawSigmet: s.rawSigmet?.slice(0, 200), firName: s.firName, severity: s.hazard?.includes('VA') ? 'high' : 'medium' })).filter(s => s.lat !== 0 && s.lng !== 0) } })(),
    // Disease outbreaks
    (async () => { const items = []; try { const r = await fetch('https://promedmail.org/feed/', { headers: { 'User-Agent': 'Mozilla/5.0 NEXUS/1.0', 'Accept': 'application/rss+xml, application/xml' }, signal: AbortSignal.timeout(12000) }).catch(() => null); if (r?.ok) { const xml = await r.text().catch(() => ''); parseRSSItems2(xml, 'ProMED', 20).forEach(x => items.push(x)); if (items.length) { results.diseaseOutbreaks = items; return } } } catch {}; try { const r2 = await get('https://outbreaknewstoday.com/feed/', 8000); if (r2) { const xml = await r2.text().catch(() => ''); parseRSSItems2(xml, 'Outbreak News Today', 15).filter(x => /disease|outbreak|virus|fever|cholera|mpox|ebola|dengue|measles|flu|covid|plague|anthrax|polio/i.test(x.title)).forEach(x => items.push(x)); if (items.length) results.diseaseOutbreaks = items } } catch {} })(),
    // Space weather
    (async () => { const [alertsR, kpR] = await Promise.allSettled([get('https://services.swpc.noaa.gov/json/alerts.json', 6000), get('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', 8000)]); results.spaceweather = { alerts: alertsR.status === 'fulfilled' && alertsR.value ? (await alertsR.value.json().catch(() => [])).map(a => ({ id: a.message_id, title: a.message_type || 'Space Weather Alert', issued: a.issue_time, expires: a.expiration_time, body: a.message_body?.slice(0, 400) || '', severity: a.message_type?.includes('WARNING') ? 'high' : 'medium' })) : [], kpCurrent: kpR.status === 'fulfilled' && kpR.value ? (await kpR.value.json().catch(() => []))?.slice(-1)?.[0] : null } })(),
    // ISS
    (async () => { let r = await get('https://api.wheretheiss.at/v1/satellites/25544', 8000); if (r) { const d = await r.json(); if (d?.latitude !== undefined) { results.iss = { lat: parseFloat(d.latitude), lng: parseFloat(d.longitude), timestamp: d.timestamp, altitude: Math.round(d.altitude || 408), velocity: Math.round(d.velocity || 27600), type: 'iss', name: 'ISS — International Space Station', severity: 'low' }; return } } r = await get('https://api.open-notify.org/iss-now.json', 8000); if (r) { const d2 = await r.json(); if (d2?.iss_position) results.iss = { lat: parseFloat(d2.iss_position.latitude), lng: parseFloat(d2.iss_position.longitude), timestamp: d2.timestamp, altitude: 408, velocity: 27600, type: 'iss', name: 'ISS — International Space Station', severity: 'low' } } })(),
    // NEOS
    (async () => { const r = await get('https://ssd-api.jpl.nasa.gov/ssodisk.api', 10000); if (r) { const d = await r.json(); results.neos = (d?.near_earth_objects || d?.data?.near_earth_objects || []).slice(0, 20).map(n => ({ id: n.designation || n.id, name: n.name || n.designation, diameter: n.diameter?.estimated_diameter?.kilometers?.estimated_diameter_max, missDistance: n.close_approach_data?.[0]?.miss_distance?.kilometers, approachDate: n.close_approach_data?.[0]?.close_approach_date_full, velocity: n.close_approach_data?.[0]?.relative_velocity?.kilometers_per_second, hazard: n.is_potentially_hazardous_asteroid, severity: n.is_potentially_hazardous_asteroid ? 'high' : 'low' })) } })(),
    // Rocket launches
    (async () => { const r = await get('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&mode=list', 8000); if (r) { const d = await r.json(); results.launches = (d?.results || []).map(l => ({ id: l.id, name: l.name, net: l.net?.slice(0, 16), status: l.status?.abbrev, provider: l.launch_service_provider?.name, vehicle: l.rocket?.configuration?.name, location: l.pad?.location?.name, mission: l.mission?.description, severity: 'low' })) } })(),
    // Maritime RSS
    (async () => { const items = []; await Promise.allSettled([get('https://gcaptain.com/feed/', 6000).then(r => r && r.text()).then(x => x && parseRSSItems2(x, 'gCaptain', 20)).then(parsed => parsed.forEach(x => items.push(x))).catch(() => {}), get('https://www.navalnews.com/feed/', 6000).then(r => r && r.text()).then(x => x && parseRSSItems2(x, 'Naval News', 15)).then(parsed => parsed.forEach(x => items.push(x))).catch(() => {}), get('https://www.maritimebulletin.net/feed/', 8000).then(r => r && r.text()).then(x => x && parseRSSItems2(x, 'Maritime Bulletin', 15)).then(parsed => parsed.forEach(x => items.push(x))).catch(() => {}), get('https://splash247.com/feed/', 8000).then(r => r && r.text()).then(x => x && parseRSSItems2(x, 'Splash247', 10)).then(parsed => parsed.forEach(x => items.push(x))).catch(() => {})]); results.maritime = items.filter(i => i.title && i.title.length > 5).map(i => ({ ...i, severity: /attack|hijack|seized|piracy|explosion|sinking|sunk|missing|distress|abandon|fire.*vessel|SOS/i.test(i.title + ' ' + (i.description || '')) ? 'critical' : /accident|collision|grounding|rescue|investigation|detained|arrested/i.test(i.title + ' ' + (i.description || '')) ? 'high' : /incident|security|warning|alert|report|casualty/i.test(i.title + ' ' + (i.description || '')) ? 'medium' : 'low' })) })(),
    // Nuclear
    (async () => { const items = []; const parseRSSn = (xml, source) => { [...xml.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)].forEach(m => { const title = getXMLTag2(m[1], 'title'); if (!title) return; if (!/nuclear|atomic|radioactive|radiation|warhead|missile|ICBM|uranium|plutonium|reactor|IAEA|nonproliferation|deterren|weapon|nuke|bomb/i.test(title)) return; items.push({ title, url: getXMLTag2(m[1], 'link'), date: getXMLTag2(m[1], 'pubDate'), source, description: getXMLTag2(m[1], 'description').replace(/<[^>]+>/g, '').slice(0, 300), severity: /emergency|accident|leak|explosion|meltdown|launch|strike|attack/i.test(title) ? 'critical' : 'medium' }) }) }; await Promise.allSettled([get('https://www.iaea.org/feeds/topstories.xml', 6000).then(r => r && r.text()).then(x => x && parseRSSn(x, 'IAEA')).catch(() => {}), get('https://www.world-nuclear-news.org/rss', 8000).then(r => r && r.text()).then(x => x && parseRSSn(x, 'World Nuclear News')).catch(() => {}), get('https://thebulletin.org/feed/', 8000).then(r => r && r.text()).then(x => x && parseRSSn(x, 'Bulletin of Atomic Scientists')).catch(() => {}), get('https://warontherocks.com/feed/', 8000).then(r => r && r.text()).then(x => x && parseRSSn(x, 'War on the Rocks')).catch(() => {})]); results.nuclear = items })(),
    // Conflict events GDELT + UCDP
    (async () => {
      const conflicts = []
      try { const queries = ['https://api.gdeltproject.org/api/v2/geo/geo?query=airstrike+OR+explosion+OR+shelling+OR+missile&mode=pointdata&maxpoints=500&timespan=48h&format=json', 'https://api.gdeltproject.org/api/v2/geo/geo?query=battle+OR+offensive+OR+armed+attack+OR+killed&mode=pointdata&maxpoints=500&timespan=48h&format=json']; await Promise.allSettled(queries.map(url => get(url, 8000).then(r => r && r.json()).then(d => { if (d) { (d?.features || []).filter(f => { const lat = f.geometry?.coordinates?.[1], lng = f.geometry?.coordinates?.[0]; return lat && lng && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 }).slice(0, 400).forEach(f => { const sev = /airstrike|missile|killed|explosion|bombing/i.test(f.properties?.name || f.properties?.url || '') ? 'high' : 'medium'; conflicts.push({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], title: `[GDELT] ${f.properties?.name || 'Armed Activity'} — ${f.properties?.countryname || ''}`, description: f.properties?.url || f.properties?.htmlformattedurl || '', country: f.properties?.countryname || '', source: 'GDELT GEO', severity: sev, type: 'acled' }) }) } }))); } catch {}
      try { const r = await get('https://ucdpapi.pcr.uu.se/api/gedevents/23.1?pagesize=300&page=1', 6000, { 'Accept': 'application/json' }); if (r) { const d = await r.json().catch(() => null); (d?.Result || []).filter(e => e.latitude && e.longitude).forEach(e => { conflicts.push({ lat: parseFloat(e.latitude), lng: parseFloat(e.longitude), title: `[UCDP] ${e.type_of_violence === 1 ? 'State-Based' : e.type_of_violence === 2 ? 'Non-State' : 'One-Sided'}: ${e.side_a || ''} vs ${e.side_b || ''} — ${e.country || ''}`, description: e.source_article?.slice(0, 200) || '', country: e.country || '', source: 'UCDP', severity: (e.best || 0) > 50 ? 'critical' : (e.best || 0) > 10 ? 'high' : 'medium', fatalities: e.best || 0, type: 'acled' }) }) } } catch {}
      results.conflictEvents = conflicts
    })(),
    // Cyber
    (async () => { const cyberItems = []; const cisaR = await get('https://www.cisa.gov/uscert/ncas/alerts.xml', 6000); if (cisaR) { const xml = await cisaR.text().catch(() => ''); [...xml.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)].forEach(m => { const title = getXMLTag2(m[1], 'title'); if (!title) return; cyberItems.push({ title, url: getXMLTag2(m[1], 'link'), date: getXMLTag2(m[1], 'pubDate'), description: getXMLTag2(m[1], 'description').replace(/<[^>]+>/g, '').slice(0, 300), source: 'CISA US-CERT', _fetchedAt: new Date().toISOString(), severity: title.toLowerCase().includes('critical') ? 'critical' : 'high' }) }) }; const kevR = await get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 8000); if (kevR) { const d = await kevR.json().catch(() => null); (d?.vulnerabilities || []).slice(0, 50).forEach(v => { cyberItems.push({ title: `KEV: ${v.vendorProject} ${v.product} — ${v.vulnerabilityName}`, url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`, date: v.dateAdded, cveID: v.cveID, description: v.shortDescription?.slice(0, 300), source: 'CISA KEV', _fetchedAt: new Date().toISOString(), severity: 'critical' }) }) }; const feodoR = await get('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', 6000); if (feodoR) { const d = await feodoR.json().catch(() => null); (d || []).slice(0, 200).forEach(host => { if (!host.ip_address) return; cyberItems.push({ title: `Botnet C2: ${host.ip_address} (${host.malware || 'Unknown'})`, url: `https://feodotracker.abuse.ch/browse/host/${host.ip_address}/`, date: host.first_seen, ip: host.ip_address, country: host.country, port: host.port, malware: host.malware, description: `${host.malware || 'Malware'} C2 server · Port ${host.port || '?'} · Country: ${host.country || '?'} · First seen: ${host.first_seen || '?'}`, source: 'Abuse.ch Feodo Tracker', _fetchedAt: new Date().toISOString(), severity: 'high' }) }) }; const urlhausR = await get('https://urlhaus-api.abuse.ch/v1/urls/recent/limit/100/', 6000); if (urlhausR) { const d = await urlhausR.json().catch(() => null); (d?.urls || []).slice(0, 100).forEach(u => { if (!u.url || u.url_status === 'offline') return; cyberItems.push({ title: `Malware URL: ${u.host || u.url?.slice(0, 40)}`, url: u.urlhaus_link || u.url, date: u.date_added, host: u.host, description: `${u.threat || 'Malware'} · ${u.url?.slice(0, 200)}`, source: 'Abuse.ch URLhaus', _fetchedAt: new Date().toISOString(), severity: u.threat?.includes('malware_download') ? 'critical' : 'high' }) }) }; results.cyber = cyberItems; results.botnetC2 = cyberItems.filter(c => c.source === 'Abuse.ch Feodo Tracker'); results.kev = cyberItems.filter(c => c.source === 'CISA KEV') })(),
    // Copernicus EMS
    (async () => { const r = await get('https://emergency.copernicus.eu/mapping/activations-rapid?service=WFS&request=GetFeature&typeName=ems%3ARapidMappingActivation&outputFormat=application%2Fjson&maxFeatures=50', 8000); if (r) { const d = await r.json().catch(() => null); results.copernicus = (d?.features || d?.data || []).map(a => ({ id: a.properties?.activationcode || a.id, title: a.properties?.title || a.title || 'Copernicus EMS Activation', type: a.properties?.hazard_type || a.hazardType || 'Unknown', country: a.properties?.country || '', date: a.properties?.activationdate || '', url: `https://emergency.copernicus.eu/mapping/activations-rapid/${a.properties?.activationcode || a.id}`, severity: 'high' })) } })(),
    // ACLED crowds + protests
    (async () => { try { const since14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10); const r = await get('https://api.acleddata.com/acled/read/?terms=accept&event_type=Protests&limit=200&fields=event_date,event_type,sub_event_type,country,location,latitude,longitude,notes,fatalities&format=json', 8000); if (r) { const d = await r.json().catch(() => null); const crowdEvents = []; (d?.data || []).forEach(e => { const lat = parseFloat(e.latitude), lng = parseFloat(e.longitude); if (isNaN(lat) || isNaN(lng)) return; const isFatal = parseInt(e.fatalities || 0) > 0; const evType = (e.sub_event_type || e.event_type || 'Event').toLowerCase(); const isCrowd = /protest|demonstration|riot|march|rally|strike|mob/.test(evType); crowdEvents.push({ id: 'acled-' + (e.event_date || '') + '-' + (e.location || '').replace(/[^a-z0-9]/gi, '-').slice(0, 20), type: isCrowd ? 'crowd' : 'acled_conflict', icon: isCrowd ? '👥' : '⚔️', title: (e.sub_event_type || e.event_type) + ' — ' + (e.location || '') + ', ' + (e.country || ''), actors: [e.actor1, e.actor2].filter(Boolean).join(' vs '), source: 'ACLED', date: e.event_date, lat, lng, severity: parseInt(e.fatalities || 0) > 10 ? 'critical' : isFatal ? 'high' : 'medium', detail: e.notes?.slice(0, 200), fatalities: parseInt(e.fatalities || 0) }); }); results.crowds = crowdEvents.slice(0, 200) } } catch {} })(),
    // Telegram posts
    (async () => { try { const INTEL_CHANNELS = [{ handle: 'intelslava', name: 'Intel Slava Z' }, { handle: 'wartranslated', name: 'War Translated' }, { handle: 'UkraineNow', name: 'Ukraine Now' }, { handle: 'militarylandnews', name: 'Military Land' }, { handle: 'nexta_tv', name: 'NEXTA TV' }, { handle: 'rybar', name: 'Rybar' }, { handle: 'flash_news_ua', name: 'Flash News UA' }, { handle: 'DeepStateUA', name: 'DeepState UA' }, { handle: 'osintdefender', name: 'OSINT Defender' }, { handle: 'GeoConfirmed', name: 'GeoConfirmed' }, { handle: 'WarMonitor3', name: 'War Monitor 3' }, { handle: 'conflictupdates', name: 'Conflict Updates' }, { handle: 'disclosetv', name: 'Disclose TV' }, { handle: 'sentdefender', name: 'Sentinel Defender' }, { handle: 'CombatFootage', name: 'Combat Footage' }, { handle: 'InformNapalm', name: 'InformNapalm' }]; const tgPosts = []; const CONFLICT_KW = /strike|attack|explos|missile|drone|shell|artillery|troops|forces|killed|wounded|destroy|fire|launch|captur|bomb|offensive|advance/i; await Promise.allSettled(INTEL_CHANNELS.map(ch => get('https://t.me/s/' + ch.handle, 6000, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' }).then(r => r && r.text()).then(html => { if (!html) return; const dateMatches = [...html.matchAll(/datetime=\"([^\"]+)\"/g)]; const msgStarts = [...html.matchAll(/class=\"tgme_widget_message_text[^\"]*\"/g)]; const msgTexts = []; msgStarts.forEach(m => { const startIdx = m.index + m[0].length; const openTag = html.indexOf('>', startIdx) + 1; if (openTag < 1) return; const raw = html.slice(openTag, openTag + 1500); const text = raw.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\t+;/g, ' ').replace(/\t+/g, ' ').trim(); if (text.length > 20) msgTexts.push(text) }); msgTexts.slice(0, 8).forEach((text, i) => { if (text.length < 20 || !CONFLICT_KW.test(text)) return; tgPosts.push({ title: text.slice(0, 120), description: text.slice(0, 400), source: ch.name, url: 'https://t.me/s/' + ch.handle, date: dateMatches[i] ? dateMatches[i][1] : new Date().toISOString(), severity: /airstrike|explosion|missile|killed|bombed/i.test(text) ? 'high' : 'medium' }) }) }))); results.telegramPosts = tgPosts; const now24h = Date.now() - 24 * 60 * 60 * 1000; const now7d = Date.now() - 7 * 24 * 60 * 60 * 1000; results.telegramRecent = tgPosts.filter(p => { try { return new Date(p.date || 0).getTime() > now24h } catch { return true } }); results.telegramArchive = tgPosts.filter(p => { try { const t = new Date(p.date || 0).getTime(); return t > now7d && t <= now24h } catch { return false } }) } catch {} })(),
    // Warships
    (async () => {
      const fleetWarships = []; const fleetSeen = new Set((results.ships || []).filter(s => s.type === 'warship' || s._isWarship).map(s => String(s.mmsi)))
      const FLEET = [
        { mmsi: '338214949', name: 'USS Gerald R. Ford (CVN-78)', lat: 36.9, lng: -76.3, flag: 'US', type: 'Aircraft Carrier', zone: 'Norfolk' },
        { mmsi: '338049522', name: 'USS Abraham Lincoln (CVN-72)', lat: 32.7, lng: -117.2, flag: 'US', type: 'Aircraft Carrier', zone: 'San Diego' },
        { mmsi: '338234651', name: 'USS Harry S. Truman (CVN-75)', lat: 43.8, lng: 7.2, flag: 'US', type: 'Aircraft Carrier', zone: 'Mediterranean' },
        { mmsi: '338234652', name: 'USS Dwight D. Eisenhower (CVN-69)', lat: 27.0, lng: 51.5, flag: 'US', type: 'Aircraft Carrier', zone: 'Persian Gulf' },
        { mmsi: '369970570', name: 'USS George Washington (CVN-73)', lat: 26.3, lng: 127.8, flag: 'US', type: 'Aircraft Carrier', zone: 'Yokosuka' },
        { mmsi: '235094269', name: 'HMS Queen Elizabeth (R08)', lat: 50.8, lng: -1.1, flag: 'GB', type: 'Aircraft Carrier', zone: 'Portsmouth' },
        { mmsi: '235094270', name: 'HMS Prince of Wales (R09)', lat: 56.0, lng: -3.4, flag: 'GB', type: 'Aircraft Carrier', zone: 'Rosyth' },
        { mmsi: '227421000', name: 'FS Charles de Gaulle (R91)', lat: 43.1, lng: 5.9, flag: 'FR', type: 'Aircraft Carrier', zone: 'Toulon' },
        { mmsi: '412511000', name: 'CNS Liaoning (16)', lat: 36.1, lng: 120.3, flag: 'CN', type: 'Aircraft Carrier', zone: 'Qingdao' },
        { mmsi: '412511001', name: 'CNS Shandong (17)', lat: 20.0, lng: 110.3, flag: 'CN', type: 'Aircraft Carrier', zone: 'Sanya' },
        { mmsi: '412511002', name: 'CNS Fujian (18)', lat: 31.2, lng: 121.7, flag: 'CN', type: 'Aircraft Carrier', zone: 'Shanghai' },
        { mmsi: '273310680', name: 'RFS Admiral Kuznetsov', lat: 68.9, lng: 33.1, flag: 'RU', type: 'Aircraft Carrier', zone: 'Murmansk' },
        { mmsi: '419000999', name: 'INS Vikrant (R11)', lat: 15.5, lng: 73.8, flag: 'IN', type: 'Aircraft Carrier', zone: 'Goa' },
        { mmsi: '431700000', name: 'JS Izumo (DDH-183)', lat: 35.4, lng: 139.6, flag: 'JP', type: 'Helicopter Destroyer', zone: 'Yokosuka' },
        { mmsi: '440117000', name: 'ROKS Dokdo (LPH-6111)', lat: 37.4, lng: 126.6, flag: 'KR', type: 'Amphibious', zone: 'Incheon' },
        { mmsi: '503502200', name: 'HMAS Canberra (L02)', lat: -33.9, lng: 151.2, flag: 'AU', type: 'LHD', zone: 'Sydney' },
        { mmsi: '271051392', name: 'TCG Anadolu (L-400)', lat: 40.9, lng: 29.0, flag: 'TR', type: 'Assault Carrier', zone: 'Istanbul' },
        { mmsi: '428476000', name: 'INS Sa ar 6 Magen', lat: 32.8, lng: 35.0, flag: 'IL', type: 'Corvette', zone: 'Haifa' },
        { mmsi: '422203700', name: 'IRIS Sahand (74)', lat: 27.2, lng: 56.3, flag: 'IR', type: 'Frigate', zone: 'Bandar Abbas' },
      ]
      const addFleet = (v) => { if (!v.lat || !v.lng || isNaN(v.lat) || isNaN(v.lng)) return; const k = String(v.mmsi || ''); if (k && fleetSeen.has(k)) return; if (k) fleetSeen.add(k); fleetWarships.push({ ...v, type: 'warship', _military: true, _isWarship: true, speed: 0, heading: 0 }) }
      FLEET.forEach(v => addFleet({ ...v, source: 'Fleet Registry' }))
      results.warships = fleetWarships
    })(),
  ])])

  // Secondary sources
  await Promise.race([deadline, Promise.allSettled([
    (async () => { const r = await get('https://ucdpapi.pcr.uu.se/api/gedevents/23.1?pagesize=100&page=1', 8000); if (r) { const d = await r.json().catch(() => null); results.ucdpFull = (d?.Result || []).map(e => ({ id: e.id, title: `${e.conflict_name || ''} — ${e.country || ''}`, lat: +(e.latitude || 0), lng: +(e.longitude || 0), date: e.date_start, deaths_best: e.best || 0, conflict_id: e.conflict_id, dyad_name: e.dyad_name, side_a: e.side_a, side_b: e.side_b, country: e.country, region: e.region, type_of_violence: e.type_of_violence, source: 'UCDP', severity: (e.best || 0) > 100 ? 'critical' : (e.best || 0) > 10 ? 'high' : 'medium' })).filter(e => e.lat && e.lng) } })(),
    (async () => { const r = await get('https://api.openaq.org/v3/locations?limit=500&parameters_id=7&order_by=lastUpdated&sort_order=desc', 6000, { 'X-API-Key': 'demo' }); if (r) { const d = await r.json().catch(() => null); results.airQuality = (d?.results || []).map(loc => ({ id: loc.id, name: loc.name, lat: loc.coordinates?.latitude, lng: loc.coordinates?.longitude, country: loc.country?.code, lastUpdated: loc.datetimeLast?.local, severity: 'low' })).filter(l => l.lat && l.lng) } })(),
  ])])

  if (!results.ucdpFull) results.ucdpFull = []
  if (!results.openSanctions) results.openSanctions = []
  if (!results.osmMilitary) results.osmMilitary = []
  if (!results.wikidataConflicts) results.wikidataConflicts = []
  if (!results.preActionIndicators) results.preActionIndicators = []

  results.summary = {
    earthquakes: results.earthquakes?.length || 0,
    volcanoes: results.volcanoes?.length || 0,
    hurricanes: results.hurricanes?.length || 0,
    weatherAlerts: results.weatherAlerts?.length || 0,
    gdacs: results.gdacs?.length || 0,
    reliefweb: results.reliefweb?.length || 0,
    floods: results.floods?.length || 0,
    globalFires: results.globalFires?.length || 0,
    aircraft: results.aircraft?.length || 0,
    ships: results.ships?.length || 0,
    eonet: results.eonet?.length || 0,
    sigmets: results.sigmets?.length || 0,
    promed: results.promed?.length || 0,
    diseaseOutbreaks: results.diseaseOutbreaks?.length || 0,
    spaceweather: (results.spaceweather?.alerts?.length || 0),
    iss: results.iss ? 1 : 0,
    neos: results.neos?.length || 0,
    launches: results.launches?.length || 0,
    maritime: results.maritime?.length || 0,
    milaircraft: results.milaircraft?.length || 0,
    warships: results.warships?.length || 0,
    nuclear: results.nuclear?.length || 0,
    conflictEvents: results.conflictEvents?.length || 0,
    telegramPosts: results.telegramPosts?.length || 0,
    cyber: results.cyber?.length || 0,
    botnetC2: results.botnetC2?.length || 0,
    kevCount: results.kev?.length || 0,
    crowds: results.crowds?.length || 0,
    fetchedAt: new Date().toISOString(),
    _elapsedMs: Date.now() - T0,
  }

  return c.json(results)
})

// ── /api/alerts ────────────────────────────────────────────────────────────
app.get('/api/alerts', async (c) => {
  const g = r => r.status === 'fulfilled' ? (r.value || []) : []

  const [oref, usni, gps, who, promed, cf, bno, luam, tg, planet] = await Promise.allSettled([
    // Oref alerts
    (async () => {
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      for (const item of [
        { url: 'https://www.oref.org.il/warningMessages/alert/alerts.json', headers: { 'Referer': 'https://www.oref.org.il/', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' } },
        { url: `https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=en&fromDate=${today}&toDate=${today}&mode=0`, headers: { 'Referer': 'https://www.oref.org.il/' } },
        { url: `https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=en&fromDate=${yesterday}&toDate=${today}&mode=0`, headers: { 'Referer': 'https://www.oref.org.il/' } },
      ]) {
        try {
          const r = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0', ...item.headers }, signal: AbortSignal.timeout(8000) })
          if (!r.ok) continue
          const text = await r.text()
          if (!text || text.trim().startsWith('<') || text.trim() === '') continue
          const data = JSON.parse(text)
          const arr = Array.isArray(data) ? data : (data?.data || [])
          if (!arr.length) return []
          return arr.map(a => ({ id: 'oref-' + (a.id || a.alertDate || Math.random().toString(36).slice(2)), type: 'red_alert', icon: '🚨', title: '🚨 RED ALERT — ' + (a.name || a.data || 'Israel'), detail: 'Zone: ' + (a.name || a.data || '') + ' | Cat: ' + (a.cat || 'missile/rocket'), severity: 'critical', source: 'Israel HFC (Oref)', ts: a.alertDate || new Date().toISOString(), region: 'Middle East' }))
        } catch {}
      }
      return []
    })(),
    // USNI
    (async () => { try { const r = await fetch('https://news.usni.org/category/fleet-tracker/feed', { signal: AbortSignal.timeout(12000) }).catch(() => null); if (!r) return []; const txt = await r.text(); const items = [...txt.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)]; return items.slice(0, 15).map(m => { const b = m[1]; const title = (b.match(/<title[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim(); const link = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim(); const pub = b.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]; const desc = (b.match(/<description[^>]*>(?:<!\\[CDATA\\[)?([\t\n\r ]*?)(?:\\]\\]>)?<\/description>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim(); if (!title) return null; return { id: 'usni-' + title.slice(0, 20).replace(/\t/g, '-'), type: 'naval', icon: '⚓', title, detail: desc.slice(0, 300), severity: 'medium', source: 'USNI Fleet Tracker', url: link, ts: pub || new Date().toISOString(), region: 'Global' } }).filter(Boolean) } catch { return [] } })(),
    // GPS Jam
    (async () => { try { const today = new Date().toISOString().slice(0, 10); const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10); let data = null; for (const url of [`https://gpsjam.org/data/gpsjam_${today}.json`, `https://gpsjam.org/data/gpsjam_${yesterday}.json`]) { try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null); if (r?.ok) { data = await r.json(); break } } catch {} } if (!Array.isArray(data)) return []; return data.filter(d => d.jamming > 0.45).slice(0, 80).map(d => ({ id: 'gps-' + d.lat + '_' + d.lon, type: 'gps_jam', icon: '📡', title: 'GPS Jamming ' + Math.round(d.jamming * 100) + '% @ ' + Number(d.lat).toFixed(1) + '°, ' + Number(d.lon).toFixed(1) + '°', detail: 'Intensity: ' + Math.round(d.jamming * 100) + '% — likely military EW. Level ' + (d.jamming > 0.85 ? 3 : 2) + '/3', severity: d.jamming > 0.8 ? 'high' : 'medium', source: 'GPSJam.org', ts: new Date().toISOString(), region: 'Global', lat: d.lat, lng: d.lon })) } catch { return [] } })(),
    // WHO
    (async () => { try { const r = await fetch('https://www.who.int/csr/don/en/rss.xml', { signal: AbortSignal.timeout(12000) }).catch(() => null); if (!r) return []; const txt = await r.text(); const items = [...txt.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)]; return items.slice(0, 8).map(m => { const b = m[1]; const title = (b.match(/<title[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim(); const link = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim(); const pub = b.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]; if (!title) return null; return { id: 'who-' + title.slice(0, 20).replace(/\t/g, '-'), type: 'disease', icon: '🦠', title: '🦠 WHO: ' + title, detail: b.match(/<description[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\/description>/i)?.[1]?.replace(/<[^>]+>/g, '').slice(0, 200) || '', severity: 'high', source: 'WHO Disease Outbreak', url: link, ts: pub || new Date().toISOString(), region: 'Global' } }).filter(Boolean) } catch { return [] } })(),
    // ProMED
    (async () => { try { const r = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent('https://promedmail.org/feed/') + '&count=20', { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }).catch(() => null); if (r) { const d = await r.json().catch(() => null); return (d?.items || []).filter(x => /disease|outbreak|alert|epidemic|virus|infection/i.test(x.title || '')).slice(0, 10).map(p => { const title = (p.title || '').replace(/<[^>]+>/g, '').trim(); return { id: 'promed-' + title.slice(0, 20).replace(/\t/g, '-'), type: 'disease', icon: '🦠', title: '🦠 ProMED: ' + title.slice(0, 120), detail: '', severity: 'medium', source: 'ProMED-mail', url: p.link || 'https://promedmail.org', ts: p.pubDate || new Date().toISOString(), region: 'Global' } }) } return [] } catch { return [] } })(),
    // Cloudflare
    (async () => { try { const r = await fetch('https://api.cloudflare.com/client/v4/radar/outages/latest?format=json', { headers: { 'Authorization': 'Bearer ' + (process.env.CF_TOKEN || 'o-GzHIAJojNPxNwvVo2MPfTtWU-E-T910U408Nmw'), 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) }).catch(() => null); if (!r?.ok) return []; const d = await r.json(); return (d?.result?.outages || []).slice(0, 6).map(o => ({ id: 'cf-' + (o.id || Math.random().toString(36).slice(2)), type: 'cyber', icon: '🌐', title: 'Internet Disruption: ' + (o.location || o.country || 'Unknown'), detail: 'Traffic drop: ' + (o.value ? Math.round(o.value) + '%' : '?') + ' | ' + (o.type || 'outage'), severity: 'medium', source: 'Cloudflare Radar', ts: o.startTime || new Date().toISOString(), region: o.country || 'Global' })) } catch { return [] } })(),
    // BNO News
    (async () => { try { const r = await fetch('https://bnonews.com/index.php/feed/', { signal: AbortSignal.timeout(12000) }).catch(() => null); if (!r) return []; const txt = await r.text(); const items = [...txt.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)]; return items.map(m => { const b = m[1]; const title = (b.match(/<title[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim(); const link = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim(); const pub = b.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]; if (!title || title.length < 5) return null; const isConflict = /killed|dead|attack|explosion|missile|airstrike|shot|fire|crash|protest|blast|bomb/i.test(title); return { id: 'bno-' + title.slice(0, 20).replace(/\t/g, '-'), type: isConflict ? 'conflict' : 'news', icon: isConflict ? '⚔️' : '📰', title: (isConflict ? '⚔️ ' : '📰 ') + title, detail: '', severity: isConflict ? 'high' : 'medium', source: 'BNO News', url: link, ts: pub || new Date().toISOString(), region: 'Global' } }).filter(Boolean) } catch { return [] } })(),
    // Liveuamap
    (async () => { const all = []; await Promise.allSettled([{ url: 'https://liveuamap.com/rss', region: 'Ukraine' }, { url: 'https://israelpalestine.liveuamap.com/rss', region: 'Middle East' }].map(async ({ url, region }) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(9000) }).catch(() => null); if (!r) return; const txt = await r.text(); const items = [...txt.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)]; items.slice(0, 6).forEach(m => { const b = m[1]; const title = (b.match(/<title[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim(); const link = (b.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || '').trim(); const lat = parseFloat(b.match(/latitude[^>]*>([\t.-]+)/i)?.[1] || ''); const lng = parseFloat(b.match(/longitude[^>]*>([\t.-]+)/i)?.[1] || ''); if (!title) return; all.push({ id: 'luam-' + region + '-' + title.slice(0, 15).replace(/\t/g, '-'), type: 'conflict', icon: '⚔️', title: '⚔️ ' + region + ': ' + title, detail: '', severity: 'high', source: 'Liveuamap (' + region + ')', url: link, ts: new Date().toISOString(), region, ...(lat && lng && !isNaN(lat) && !isNaN(lng) ? { lat, lng } : {}) }) }) } catch {} })); return all })(),
    // Telegram
    (async () => { try { const CONFLICT_KW = /strike|attack|explos|missile|drone|shell|artill|troops|forces|kill|wound|destroy|hit|fire|launch|captur|occupy|bomb|offensive|advance|retreat/i; const CHANNELS = [{ handle: 'intelslava', name: 'Intel Slava Z', icon: '📡' }, { handle: 'wartranslated', name: 'War Translated', icon: '📡' }, { handle: 'nexta_tv', name: 'NEXTA TV', icon: '📡' }, { handle: 'GeoConfirmed', name: 'GeoConfirmed', icon: '📍' }, { handle: 'osintdefender', name: 'OSINT Defender', icon: '🔍' }, { handle: 'deepstatetv', name: 'DeepState', icon: '🗺' }]; const all = []; await Promise.allSettled(CHANNELS.map(async ch => { try { const r = await fetch('https://t.me/s/' + ch.handle, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }, signal: AbortSignal.timeout(9000) }).catch(() => null); if (!r?.ok) return; const body = await r.text().catch(() => ''); const dateMatches = [...body.matchAll(/datetime=\"([^\"]+)\"/g)]; const msgStarts = [...body.matchAll(/class=\"tgme_widget_message_text[^\"]*\"/g)]; const msgTexts = []; msgStarts.forEach(m => { const openTag = body.indexOf('>', m.index + m[0].length) + 1; if (openTag < 1) return; const raw = body.slice(openTag, openTag + 1200); const text = raw.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\t+/g, ' ').trim(); if (text.length > 20) msgTexts.push(text) }); msgTexts.slice(0, 6).forEach((text, i) => { if (text.length < 20 || !CONFLICT_KW.test(text)) return; const isCritical = /airstrike|explosion|missile|killed|bombing/i.test(text); all.push({ id: 'tg-' + ch.handle + '-' + i + '-' + Date.now(), type: 'news', icon: ch.icon, title: ch.icon + ' ' + ch.name + ': ' + text.slice(0, 100), detail: text.slice(0, 200), severity: isCritical ? 'high' : 'medium', source: ch.name, url: 'https://t.me/s/' + ch.handle, ts: dateMatches[i] ? dateMatches[i][1] : new Date().toISOString(), region: 'Global' }) }) } catch {} })); return all } catch { return [] } })(),
    // Planet Labs imagery
    (async () => { const items = []; try { const r = await fetch('https://www.planet.com/pulse/feed/', { signal: AbortSignal.timeout(8000) }).catch(() => null); if (r) { const xml = await r.text().catch(() => ''); [...xml.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)].slice(0, 6).forEach(m => { const title = getXMLTag(m[1], 'title'); const link = getXMLTag(m[1], 'link'); const desc = getXMLTag(m[1], 'description').replace(/<[^>]+>/g, '').slice(0, 200); const pub = getXMLTag(m[1], 'pubDate'); if (!title) return; items.push({ id: 'planet-' + (link || title).slice(-20).replace(/\t/g, ''), type: 'satellite_imagery', icon: '🛰', title: '🛰 Planet Labs: ' + title.slice(0, 100), detail: desc, severity: 'low', source: 'Planet Labs', url: link || 'https://www.planet.com', ts: pub ? new Date(pub).toISOString() : new Date().toISOString(), region: 'Global' }) }) } } catch {}; return items })(),
  ])

  const all = [...g(oref), ...g(usni), ...g(gps), ...g(who), ...g(promed), ...g(cf), ...g(bno), ...g(luam), ...g(tg), ...g(planet)]
    .sort((a, b) => { const SORD = { critical: 0, high: 1, medium: 2, low: 3 }; return (SORD[a.severity] || 3) - (SORD[b.severity] || 3) })

  return c.json({ alerts: all, counts: { oref: g(oref).length, usni: g(usni).length, gps: g(gps).length, who: g(who).length, promed: g(promed).length, cloudflare: g(cf).length, bno: g(bno).length, liveuamap: g(luam).length, telegram: g(tg).length }, ts: new Date().toISOString() })
})

// ── /api/fred ─────────────────────────────────────────────────────────────
app.get('/api/fred', async (c) => {
  const mode = c.req.query('mode')
  if (mode === 'conflict') {
    const results = { defenseStocks: [], warCurrencies: [], cryptoFlight: [], commodities: [], ts: new Date().toISOString() }
    await Promise.allSettled([
      (async () => { try { const tickers = ['LMT', 'RTX', 'NOC', 'BA', 'GD', 'KTOS', 'HII', 'AXON', 'HEICO', 'PLTR']; const r = await fetch(`https://financialmodelingprep.com/api/v3/quote/${tickers.join(',')}?apikey=demo`, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }).catch(() => null); if (r?.ok) { const quotes = await r.json().catch(() => null); if (Array.isArray(quotes) && quotes.length > 0) results.defenseStocks = quotes.map(q => ({ symbol: q.symbol, price: q.price, changePercent: q.changesPercentage, volume: q.volume, signal: Math.abs(q.changesPercentage || 0) > 3 ? 'anomaly' : 'normal' })) } } catch {} })(),
      (async () => { try { const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=UAH,ILS,RUB,IRR,PKR,TRY', { signal: AbortSignal.timeout(8000) }).catch(() => null); if (r?.ok) { const d = await r.json().catch(() => null); const rates = d?.rates || {}; results.warCurrencies = Object.entries(rates).map(([code, rate]) => ({ code, rate, signal: 'stable' })) } } catch {} })(),
      (async () => { try { const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,tether,dai,usd-coin&order=market_cap_desc&per_page=4&sparkline=false', { signal: AbortSignal.timeout(8000) }).catch(() => null); if (r?.ok) { const d = await r.json().catch(() => null); if (Array.isArray(d)) results.cryptoFlight = d.map(c => ({ id: c.id, symbol: c.symbol.toUpperCase(), price: c.current_price, change24h: c.price_change_percentage_24h })) } } catch {} })(),
      (async () => { try { const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=CL-F,GC-F,NG-F&fields=symbol,regularMarketPrice,regularMarketChangePercent`, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }).catch(() => null); if (r?.ok) { const d = await r.json().catch(() => null); results.commodities = (d?.quoteResponse?.result || []).map(q => ({ symbol: q.symbol, name: q.shortName || q.symbol, price: q.regularMarketPrice, changePercent: q.regularMarketChangePercent })) } } catch {} })(),
    ])
    let fci = 0
    const defenseSpike = results.defenseStocks.filter(s => (s.changePercent || 0) > 2).length; fci += defenseSpike * 15
    const oilSpike = results.commodities.find(c => c.symbol === 'CL-F' && Math.abs(c.changePercent || 0) > 3); if (oilSpike) fci += 25
    results.fci = { score: fci, level: fci > 60 ? 'critical' : fci > 35 ? 'high' : fci > 15 ? 'medium' : 'low' }
    return c.json(results)
  }
  return c.json({ status: 'ok', note: 'FRED API ready — call with series params for data' })
})

// ── /api/rss ──────────────────────────────────────────────────────────────
app.get('/api/rss', async (c) => {
  const { url, count = 30, mode } = c.req.query()
  if (mode === 'tme') {
    const handle = c.req.query('handle')
    if (!handle) return c.json({ error: 'handle required' }, 400)
    try {
      const r = await fetch('https://t.me/s/' + handle, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
      if (!r.ok) return c.json({ error: 'Telegram ' + r.status, posts: [] }, r.status)
      const html = await r.text()
      const dateMatches = [...html.matchAll(/datetime=\"([^\"]+)\"/g)]
      const msgIdMatches = [...html.matchAll(/data-post=\"[^\"\/]*\/(\t+)\"/g)]
      const msgStarts = [...html.matchAll(/class=\"tgme_widget_message_text[^\"]*\"/g)]
      const posts = []
      msgStarts.forEach((m, i) => { const openTag = html.indexOf('>', m.index + m[0].length) + 1; if (openTag < 1) return; const raw = html.slice(openTag, openTag + 2000); const text = raw.replace(/<br\t*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&#(\t+);/g, (_, n) => String.fromCharCode(+n)).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); if (text.length < 10) return; const msgId = msgIdMatches[i]?.[1] || String(i); const ts = dateMatches[i]?.[1] || new Date().toISOString(); posts.push({ msgId, text, ts, url: 'https://t.me/' + handle + '/' + msgId }) })
      return c.json({ status: 'ok', handle, posts: posts.slice(0, parseInt(c.req.query('count') || 20)), count: posts.length })
    } catch (e) { return c.json({ error: e.message, posts: [] }, 500) }
  }
  if (!url) return c.json({ error: 'url param required' }, 400)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36', 'Accept': 'application/rss+xml,application/xml,text/xml,application/atom+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(12000) })
    if (!r.ok) return c.json({ error: 'Fetch failed for ' + url, items: [] }, 502)
    const txt = await r.text().catch(() => '')
    if (!txt || txt.length < 100) return c.json({ error: 'Empty response', items: [] }, 502)
    const parsed = parseRSSItems(txt, url).slice(0, parseInt(count))
    return c.json({ status: 'ok', items: parsed, count: parsed.length })
  } catch (e) { return c.json({ error: e.message, items: [] }, 500) }
})

// ── /api/gdelt ────────────────────────────────────────────────────────────
app.get('/api/gdelt', async (c) => {
  const q = c.req.query('q')
  if (!q) return c.json({ error: 'q required' }, 400)
  const query = decodeURIComponent(q.replace(/\t/g, ' ')).trim()
  const mode = c.req.query('mode') || 'artlist'
  const maxr = c.req.query('maxrecords') || '250'
  const timespan = c.req.query('timespan') || '3months'
  const sort = c.req.query('sort') || 'DateDesc'
  const seen = new Set(); const articles = []
  const variants = [
    { vq: query, n: 250, angle: 'general' },
    { vq: query + ' crime fraud corruption', n: 50, angle: 'crime' },
    { vq: query + ' court arrested charged', n: 50, angle: 'legal' },
    { vq: query + ' sanction indicted investigation', n: 50, angle: 'sanctions' },
    { vq: query + ' military weapons attack strike', n: 40, angle: 'military' },
  ]
  await Promise.allSettled(variants.map(async ({ vq, n, angle }) => {
    const enc = encodeURIComponent(vq) + '%20sourcelang:english'
    try { const r = await safeGet(`https://api.gdeltproject.org/api/v2/doc/doc?query=${enc}&mode=${mode}&maxrecords=${n}&sort=${sort}&timespan=${timespan}&format=json`, 18000); if (r) { const d = await r.json().catch(() => null); (d?.articles || []).forEach(a => { if (!a?.title) return; const k = (a.url || a.title).slice(0, 80); if (seen.has(k)) return; seen.add(k); articles.push({ ...a, _angle: angle }) }) } } catch {}
  }))
  return c.json({ articles, count: articles.length, angles: [...new Set(articles.map(a => a._angle))], fetchedAt: new Date().toISOString() })
})

// ── /api/signals ──────────────────────────────────────────────────────────
app.get('/api/signals', async (c) => {
  const mode = c.req.query('mode')
  if (mode === 'military-infra') {
    try {
      const query = '[out:json][timeout:25];(node[\"military\"~\"airfield|naval_base|base\"][name](bbox:-85,-180,85,180);way[\"military\"~\"airfield|naval_base|base\"][name](bbox:-85,-180,85,180);)->.a;.a out center tags 500;'
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query, headers: { 'Content-Type': 'text/plain' }, signal: AbortSignal.timeout(30000) }).catch(() => null)
      if (!r?.ok) return c.json({ bases: [], count: 0 })
      const d = await r.json().catch(() => null)
      const bases = (d?.elements || []).filter(e => e.lat || e.center?.lat).map(e => ({ id: e.id, lat: e.lat || e.center?.lat, lng: e.lon || e.center?.lon, name: e.tags?.name || e.tags?.['name:en'] || 'Military Installation', type: e.tags?.military || 'base', country: e.tags?.['addr:country'] || '', operator: e.tags?.operator || '', source: 'OpenStreetMap' }))
      return c.json({ bases, count: bases.length, ts: new Date().toISOString() })
    } catch { return c.json({ bases: [], count: 0 }) }
  }
  if (mode === 'crypto-war') {
    try { const r = await safeGet('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=10', 8000); if (r) { const d = await r.json().catch(() => null); return c.json({ funding: (d?.result?.list || []).map(f => ({ symbol: 'BTCUSDT', fundingRate: parseFloat(f.fundingRate), timestamp: new Date(parseInt(f.fundingRateTimestamp)).toISOString(), signal: parseFloat(f.fundingRate) < -0.001 ? 'fear_premium' : parseFloat(f.fundingRate) > 0.003 ? 'greed' : 'neutral' })), ts: new Date().toISOString() }) } } catch {}
    return c.json({ funding: [], ts: new Date().toISOString() })
  }
  if (mode === 'sanctions') {
    try { const osR = await safeGet('https://api.opensanctions.org/entities/?schema=Person&limit=100&sort=updated_at:desc', 12000); const ofacR = await safeGet('https://www.treasury.gov/ofac/downloads/sdn.xml', 20000); let opensanctions = []; if (osR) { const d = await osR.json().catch(() => null); opensanctions = (d?.results || []).map(e => ({ id: e.id, name: e.caption, schema: e.schema, datasets: e.datasets?.join(','), countries: e.properties?.country?.join(','), sanctions: e.properties?.program?.join(',') || '', url: `https://www.opensanctions.org/entities/${e.id}/`, severity: 'high' })) } let ofacList = []; if (ofacR) { const xml = await ofacR.text(); const entries = [...xml.matchAll(/<sdnEntry>([\t\n\r ]*?)<\/sdnEntry>/gi)].slice(0, 200); ofacList = entries.map(m => { const get = tag => m[1].match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1]?.trim() || ''; return { name: get('lastName') + (get('firstName') ? ', ' + get('firstName') : ''), type: get('sdnType'), program: get('program'), id: get('uid'), source: 'OFAC SDN' } }).filter(e => e.name) } return c.json({ opensanctions, ofac: ofacList, ts: new Date().toISOString() }) } catch { return c.json({ opensanctions: [], ofac: [], ts: new Date().toISOString() }) }
  }
  // Default: Reddit + RSS intelligence feeds
  const results = {}
  await Promise.allSettled([
    (async () => { try { const subs = ['worldnews/new', 'news/new', 'geopolitics/new', 'CredibleDefense/new', 'UkraineWarVideoReport/new', 'ukraine/new', 'LessCredibleDefence/new', 'BreakingNews/new']; const all = [], seen = new Set(); await Promise.allSettled(subs.map(async sub => { try { const r = await fetch(`https://www.reddit.com/r/${sub}.json?limit=25&raw_json=1`, { headers: { 'User-Agent': 'NEXUS-Intel/1.0 (signal aggregator)' }, signal: AbortSignal.timeout(8000) }).catch(() => null); if (!r) return; const d = await r.json().catch(() => null); (d?.data?.children || []).forEach(p => { const post = p.data; if (!post?.title || seen.has(post.id)) return; seen.add(post.id); all.push({ id: post.id, title: post.title, subreddit: post.subreddit, score: post.score, numComments: post.num_comments, created: new Date(post.created_utc * 1000).toISOString(), url: `https://reddit.com${post.permalink}`, externalUrl: post.url, flair: post.link_flair_text, severity: post.score > 5000 ? 'high' : post.score > 1000 ? 'medium' : 'low' }) }) } catch {} })); results.redditSignals = all.sort((a, b) => b.score - a.score).slice(0, 200) } catch {} })(),
    (async () => { try { const feeds = [{ url: 'https://www.state.gov/rss-feeds/press-releases/', label: 'US State Dept' }, { url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?max=50&ContentType=1&Site=945', label: 'Pentagon' }, { url: 'https://www.nato.int/cps/en/natohq/news.htm?type=RSS', label: 'NATO' }, { url: 'https://feeds.feedburner.com/TheHackersNews', label: 'Hacker News' }, { url: 'https://krebsonsecurity.com/feed/', label: 'Krebs Security' }, { url: 'https://www.bleepingcomputer.com/feed/', label: 'BleepingComputer' }]; const allItems = []; await Promise.allSettled(feeds.map(async ({ url, label }) => { try { const r = await safeGet(url, 8000); if (!r) return; const xml = await r.text(); [...xml.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)].slice(0, 10).forEach(m => { const title = getXMLTag(m[1], 'title'); if (!title) return; allItems.push({ title, url: getXMLTag(m[1], 'link'), date: getXMLTag(m[1], 'pubDate'), source: label, description: getXMLTag(m[1], 'description').replace(/<[^>]+>/g, '').slice(0, 400), severity: ['critical', 'attack', 'breach', 'nuclear', 'missile', 'strike', 'war', 'killed'].some(w => title.toLowerCase().includes(w)) ? 'critical' : ['warning', 'threat', 'alert', 'hack', 'conflict', 'sanction'].some(w => title.toLowerCase().includes(w)) ? 'high' : 'medium' }) }) } catch {} })); results.intelFeeds = allItems.sort((a, b) => new Date(b.date) - new Date(a.date)) } catch {} })(),
  ])
  results.summary = { redditSignals: results.redditSignals?.length || 0, intelFeeds: results.intelFeeds?.length || 0, fetchedAt: new Date().toISOString() }
  return c.json(results)
})

// ── /api/threats ──────────────────────────────────────────────────────────
app.get('/api/threats', async (c) => {
  const results = {}
  await Promise.allSettled([
    (async () => { const r = await safeGet('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', 20000); if (r) { const d = await r.json().catch(() => null); results.kev = (d?.vulnerabilities || []).slice(0, 200).map(v => ({ cveID: v.cveID, vendorProject: v.vendorProject, product: v.product, vulnerabilityName: v.vulnerabilityName, dateAdded: v.dateAdded, shortDescription: v.shortDescription?.slice(0, 300), requiredAction: v.requiredAction, dueDate: v.dueDate, severity: 'critical', url: `https://nvd.nist.gov/vuln/detail/${v.cveID}` })) } })(),
    (async () => { const r = await safeGet('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', 15000); if (r) { const d = await r.json().catch(() => null); results.botnetC2 = (d || []).slice(0, 500).map(host => ({ ip: host.ip_address || host, port: host.port, malware: host.malware, country: host.country, firstSeen: host.first_seen, lastSeen: host.last_seen, severity: 'high', url: `https://feodotracker.abuse.ch/browse/host/${host.ip_address || host}/` })).filter(h => h.ip) } })(),
    (async () => { const r = await safeGet('https://urlhaus-api.abuse.ch/v1/urls/recent/limit/200/', 15000); if (r) { const d = await r.json().catch(() => null); results.maliciousURLs = (d?.urls || []).slice(0, 200).map(u => ({ url: u.url, host: u.host, dateAdded: u.date_added, status: u.url_status, threat: u.threat, tags: u.tags, urlhausLink: u.urlhaus_link, severity: u.threat?.includes('malware_download') ? 'critical' : 'high' })) } })(),
    (async () => { const r = await safeGet('https://openphish.com/feed.txt', 12000); if (r) { const txt = await r.text(); results.openPhish = txt.split('\n').filter(l => l.startsWith('http')).slice(0, 200).map(url => ({ url, severity: 'high' })) } })(),
    (async () => { const r = await safeGet('https://www.spamhaus.org/drop/drop.txt', 10000); if (r) { const txt = await r.text(); results.spamhausDROP = txt.split('\n').filter(l => l && !l.startsWith(';')).map(l => { const [cidr, ...rest] = l.trim().split(/[\t ]+/); return { cidr, comment: rest.join(' ').replace(/^;[\t ]*/, '') } }).filter(e => e.cidr?.includes('/')).slice(0, 300) } })(),
    (async () => { try { const r = await fetch('https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json', { signal: AbortSignal.timeout(20000) }).catch(() => null); if (!r) return; const d = await r.json().catch(() => null); results.mitreAttack = (d?.objects || []).filter(o => o.type === 'attack-pattern' && !o.revoked && !o.x_mitre_deprecated).sort((a, b) => (b.modified || '') > (a.modified || '') ? 1 : -1).slice(0, 100).map(t => ({ id: t.external_references?.[0]?.external_id, name: t.name, description: t.description?.slice(0, 300), tactic: t.kill_chain_phases?.[0]?.phase_name, platforms: t.x_mitre_platforms, modified: t.modified?.slice(0, 10), url: t.external_references?.[0]?.url, severity: 'high' })) } catch {} })(),
    (async () => { const r = await safeGet('https://www.cisa.gov/uscert/ncas/alerts.xml', 15000); if (r) { const xml = await r.text(); results.cisaAlerts = [...xml.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)].map(m => ({ title: getXMLTag(m[1], 'title'), url: getXMLTag(m[1], 'link'), date: getXMLTag(m[1], 'pubDate'), description: getXMLTag(m[1], 'description').replace(/<[^>]+>/g, '').slice(0, 400), severity: getXMLTag(m[1], 'title').toLowerCase().includes('critical') ? 'critical' : 'high' })).filter(a => a.title) } })(),
  ])
  results.summary = { kev: results.kev?.length || 0, botnetC2: results.botnetC2?.length || 0, maliciousURLs: results.maliciousURLs?.length || 0, cisaAlerts: results.cisaAlerts?.length || 0, mitreAttack: results.mitreAttack?.length || 0, openPhish: results.openPhish?.length || 0, fetchedAt: new Date().toISOString() }
  return c.json(results)
})

// ── /api/intel ────────────────────────────────────────────────────────────
app.get('/api/intel', async (c) => {
  const q = c.req.query('q') || c.req.query('name') || c.req.query('query')
  if (!q) return c.json({ error: 'q required' }, 400)
  const query = decodeURIComponent(q).trim()
  const results = {}
  const get = async (url, ms = 8000, hdrs = {}) => {
    try { const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms); const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'NEXUS-Intel/5.0', ...hdrs } }); clearTimeout(t); return r.ok ? r : null } catch { return null }
  }
  await Promise.allSettled([
    (async () => { const r = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\t+/g, '_'))}`, 6000); if (r) { const d = await r.json().catch(() => null); if (d && d.type !== 'disambiguation') results.wiki = { title: d.title, description: d.description || '', extract: d.extract || '', thumbnail: d.thumbnail?.source || null, url: d.content_urls?.desktop?.page || null } } })(),
    (async () => { const r = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`, 6000); if (r) { const xml = await r.text(); results.gnews = [...xml.matchAll(/<item>([\t\n\r ]*?)<\/item>/gi)].slice(0, 30).map(m => { const title = (m[1].match(/<title[^>]*>(?:<!\\[CDATA\\[)?([\t\n\r ]*?)(?:\\]\\]>)?<\/title>/i) || [])[1]?.trim() || ''; const link = (m[1].match(/<link>(.*?)<\/link>/i) || [])[1]?.trim() || '#'; const date = (m[1].match(/<pubDate>(.*?)<\/pubDate>/i) || [])[1]?.trim() || ''; if (!title || title.length < 5) return null; return { title, url: link, source: 'Google News', pubDate: date } }).filter(Boolean) } })(),
    (async () => { const r = await get(`https://api.opensanctions.org/search/default?q=${encodeURIComponent(query)}&limit=50`, 12000); if (r) { const d = await r.json().catch(() => null); results.sanctions = (d?.results || []).map(e => ({ id: e.id, name: e.caption, schema: e.schema, datasets: e.datasets || [], score: e.score, url: `https://www.opensanctions.org/entities/${e.id}/` })) } })(),
    (async () => { const r = await get(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`, 5000); if (r) { const d = await r.json().catch(() => null); results.locations = (d || []).map(p => ({ name: p.display_name, lat: p.lat, lng: p.lon, type: p.type, cls: p.class, country: p.address?.country })) } })(),
    (async () => { const enc = encodeURIComponent(query) + '%20sourcelang:english'; const r = await get(`https://api.gdeltproject.org/api/v2/doc/doc?query=${enc}&mode=artlist&maxrecords=75&sort=DateDesc&timespan=1year&format=json`, 15000); if (r) { const d = await r.json().catch(() => null); results.articles = d?.articles || [] } })(),
  ])
  results._summary = { query, articles: results.articles?.length || 0, gnews: results.gnews?.length || 0, wiki: results.wiki ? 1 : 0, sanctions: results.sanctions?.length || 0, locations: results.locations?.length || 0, fetchedAt: new Date().toISOString() }
  return c.json(results)
})

// ── /api/ingest ───────────────────────────────────────────────────────────
app.get('/api/ingest', async (c) => {
  const { type = 'all', q = '' } = c.req.query()
  const results = {}
  await Promise.allSettled([
    (async () => { try { const r = await safeGet('https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=' + encodeURIComponent(q) + '&page[size]=10', 8000); if (r) { const d = await r.json().catch(() => null); results.gleif = (d?.data || []).map(e => ({ lei: e.id, name: e.attributes?.value, url: `https://api.gleif.org/api/v1/lei-records/${e.id}` })) } } catch {} })(),
    (async () => { try { const r = await safeGet(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT,ETHUSDT,USDTBIDR,USDTPKR`, 8000); if (r) { const d = await r.json().catch(() => null); results.bybit = (d?.result?.list || []).map(t => ({ symbol: t.symbol, lastPrice: t.lastPrice, price24hPcnt: t.price24hPcnt, volume24h: t.volume24h })) } } catch {} })(),
    (async () => { try { const r = await safeGet(`https://ucdpapi.pcr.uu.se/api/gedevents/${new Date().getFullYear()}.1?pagesize=100&page=1`, 12000); if (r) { const d = await r.json().catch(() => null); results.ucdp_events = (d?.Result || []).slice(0, 30).map(e => ({ id: e.id, date: e.date_start, country: e.country, conflict: e.conflict_name, dyad: e.dyad_name, deaths: e.best, lat: +e.latitude, lng: +e.longitude, source: 'UCDP' })) } } catch {} })(),
  ])
  return c.json(results)
})

// ── /api/firms ────────────────────────────────────────────────────────────
app.get('/api/firms', async (c) => {
  const apiKey = c.req.query('key') || '08be3187f8c1526e0fd30249ee2c3374'
  const dayRange = parseInt(c.req.query('days') || '1')
  const WATCH_ZONES = [
    { label: 'Ukraine/Donbas', bbox: [46.5, 52.5, 32.0, 40.5], country: 'Ukraine' },
    { label: 'Gaza Strip', bbox: [31.2, 31.7, 34.2, 34.6], country: 'Palestine' },
    { label: 'Lebanon', bbox: [33.0, 34.7, 35.0, 37.0], country: 'Lebanon' },
    { label: 'Syria', bbox: [32.5, 37.5, 35.5, 42.5], country: 'Syria' },
    { label: 'Yemen', bbox: [12.5, 19.0, 42.5, 54.5], country: 'Yemen' },
    { label: 'Sudan/Khartoum', bbox: [13.0, 17.0, 31.0, 36.5], country: 'Sudan' },
    { label: 'Myanmar/Sagaing', bbox: [21.0, 26.0, 94.0, 98.5], country: 'Myanmar' },
    { label: 'Sahel/Mali/Burkina', bbox: [10.0, 20.0, -5.5, 5.0], country: 'Mali' },
    { label: 'Ethiopia/Tigray', bbox: [11.5, 16.5, 36.5, 43.5], country: 'Ethiopia' },
    { label: 'DRC/Eastern Congo', bbox: [-5.0, 2.0, 27.0, 32.0], country: 'DRC' },
    { label: 'Iran', bbox: [25.0, 40.0, 44.0, 63.5], country: 'Iran' },
    { label: 'Pakistan/KPK', bbox: [32.0, 37.5, 69.0, 75.0], country: 'Pakistan' },
    { label: 'Somalia', bbox: [1.0, 12.0, 40.5, 51.5], country: 'Somalia' },
    { label: 'Nigeria/Northeast', bbox: [10.0, 14.5, 10.0, 15.5], country: 'Nigeria' },
    { label: 'Libya', bbox: [22.0, 33.5, 9.5, 25.5], country: 'Libya' },
    { label: 'Afghanistan', bbox: [29.0, 38.5, 60.5, 75.0], country: 'Afghanistan' },
    { label: 'Iraq', bbox: [29.0, 37.5, 38.5, 48.5], country: 'Iraq' },
    { label: 'Mozambique/Cabo', bbox: [-13.5, -9.5, 38.5, 41.5], country: 'Mozambique' },
  ]
  const results = []
  await Promise.allSettled(WATCH_ZONES.map(async zone => {
    const [minLat, maxLat, minLng, maxLng] = zone.bbox
    const dayRange2 = Math.max(dayRange, 2)
    let allDetections = []
    for (const src of ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT']) {
      try {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/${src}/${minLng},${minLat},${maxLng},${maxLat}/${dayRange2}`
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000)
        const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'NEXUS/1.0' } })
        clearTimeout(timer)
        if (!r.ok) continue
        const csv = await r.text()
        if (!csv || csv.length < 50 || !csv.includes('latitude')) continue
        const lines = csv.trim().split('\n')
        if (lines.length < 2) continue
        const h = lines[0].split(',').map(x => x.trim().replace(/['\"]/g, ''))
        const latI = h.indexOf('latitude'), lngI = h.indexOf('longitude')
        const brightI = h.indexOf('bright_ti4') !== -1 ? h.indexOf('bright_ti4') : h.indexOf('brightness')
        const confI = h.indexOf('confidence'), dateI = h.indexOf('acq_date'), timeI = h.indexOf('acq_time'), satI = h.indexOf('satellite'), instrI = h.indexOf('instrument')
        for (const line of lines.slice(1)) {
          const v = line.split(',').map(x => x.trim().replace(/['\"]/g, ''))
          const lat = parseFloat(v[latI]), lng = parseFloat(v[lngI])
          if (isNaN(lat) || isNaN(lng)) continue
          allDetections.push({ lat, lng, brightness: parseFloat(v[brightI]) || 0, confidence: v[confI] || 'n', date: v[dateI] || '', time: v[timeI] || '', satellite: v[satI] || '', instrument: v[instrI] || '', zone: zone.label, country: zone.country })
        }
      } catch { continue }
    }
    if (!allDetections.length) return
    const seen = new Set()
    allDetections = allDetections.filter(d => { const key = `${d.lat.toFixed(3)}_${d.lng.toFixed(3)}_${d.date}`; if (seen.has(key)) return false; seen.add(key); return true })
    const sorted = [...allDetections].sort((a, b) => b.brightness - a.brightness)
    const top = sorted[0]; const highConf = allDetections.filter(d => d.confidence === 'h' || d.confidence === 'high' || parseInt(d.confidence) >= 80)
    const avgBright = allDetections.reduce((s, d) => s + d.brightness, 0) / allDetections.length
    const score = allDetections.length * 2 + (top.brightness > 400 ? 10 : top.brightness > 350 ? 5 : 0) + highConf.length
    let severity = 'low'
    if (score > 30 || top.brightness > 450) severity = 'critical'
    else if (score > 15 || top.brightness > 400) severity = 'high'
    else if (score > 5 || top.brightness > 360) severity = 'medium'
    results.push({ zone: zone.label, country: zone.country, count: allDetections.length, highConfCount: highConf.length, peakBrightness: top.brightness, avgBrightness: parseFloat(avgBright.toFixed(1)), severity, topLat: top.lat, topLng: top.lng, date: top.date, time: top.time, instrument: top.instrument || top.satellite || 'VIIRS', detections: allDetections.slice(0, 50).map(d => ({ lat: d.lat, lng: d.lng, brightness: d.brightness, confidence: d.confidence, date: d.date, time: d.time, instrument: d.instrument || d.satellite })) })
  }))
  return c.json(results.sort((a, b) => b.peakBrightness - a.peakBrightness))
})

// ── /api/kalshi ───────────────────────────────────────────────────────────
app.get('/api/kalshi', async (c) => {
  try {
    const r = await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?limit=500&status=open', { headers: { 'Accept': 'application/json' } })
    if (!r.ok) throw new Error(`Kalshi API: ${r.status}`)
    const data = await r.json()
    const markets = data?.markets || data?.data || []
    return c.json({ markets, count: markets.length })
  } catch (e) { return c.json({ error: e.message, markets: [] }, 500) }
})

// ── /api/polymarket ───────────────────────────────────────────────────────
app.get('/api/polymarket', async (c) => {
  try {
    const pages = await Promise.allSettled([
      fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=0&order=volume24hr&ascending=false'),
      fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=100&order=volume24hr&ascending=false'),
      fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100&offset=200&order=volume24hr&ascending=false'),
    ])
    const all = []
    for (const p of pages) { if (p.status === 'fulfilled' && p.value.ok) { const data = await p.value.json().catch(() => null); const list = Array.isArray(data) ? data : (data.markets || []); all.push(...list) } }
    const seen = new Set()
    const deduped = all.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
    return c.json({ markets: deduped, count: deduped.length })
  } catch (e) { return c.json({ error: e.message, markets: [] }, 500) }
})

// ── STATIC FILES — SPA fallback ───────────────────────────────────────────
app.get('*', serveStatic({ root: './dist', rewriteRequestPath: p => p }))

// ── BUN STARTUP ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000')
console.log(`NEXUS Intelligence Platform starting on port ${PORT}`)
export default { port: PORT, fetch: app.fetch }