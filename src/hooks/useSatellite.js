/**
 * useSatellite — God View data hook
 * Handles all satellite and geospatial data sources.
 * Refreshes every 2 minutes. Retries up to 3x with exponential backoff on failure.
 *
 * ARCHITECTURE UPGRADE: If VITE_SUPABASE_URL is set, data comes from Supabase DB
 * (pre-fetched server-side by the ingest Edge Function). Falls back to /api/satellite
 * if Supabase is not configured. Zero breaking changes to consumers.
 */

import { cacheWrite, cacheRead } from '../utils/cache'
import { useTelegram } from './useTelegram'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useADSBLive } from './useADSBLive'
import { useSupabaseSatellite } from './useSupabase'

// ── useSatellite: auto-selects Supabase or legacy at IMPORT time (not hook time)
// This avoids the React conditional hook rule violation.
// Components always call useSatellite() — routing is transparent.
const _USE_SUPABASE = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export function useSatellite() {
  // useSupabaseSatellite and useSatelliteLegacy are both called here to follow
  // React's rules of hooks (no conditional calls). Only one will do real work.
  const sbResult = useSupabaseSatellite()
  const lgResult = useSatelliteLegacy()
  return _USE_SUPABASE ? sbResult : lgResult
}

async function fetchWithRetry(url, maxRetries = 2) {
  let lastErr
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 60s first attempt (Vercel limit), 30s on retry
      const timeout = attempt === 0 ? 60000 : 30000
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r
    } catch (e) {
      lastErr = e
      if (attempt < maxRetries - 1) await new Promise(res => setTimeout(res, 2000))
    }
  }
  throw lastErr
}

function useSatelliteLegacy() {
  // No-op when Supabase is active — all data comes from DB instead
  const _isSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const [error,     setError]     = useState(null)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  // Bail immediately if Supabase is handling data
  useEffect(() => { if (_isSupabase) setLoading(false) }, [_isSupabase])

  const fetch_ = useCallback(async (forceRefresh = false) => {
    // No-op when Supabase provides data
    if (_isSupabase) return
    // ── Cache-first: serve stale data instantly, refresh in background ─────
    const CACHE_KEY = 'satellite'
    const CACHE_TTL = 5 * 60 * 1000  // 5 min — serve cached if fresher than this

    // On first load, immediately serve cached data so map renders instantly
    if (!forceRefresh) {
      const cached = cacheRead(CACHE_KEY, CACHE_TTL)
      if (cached?.data) {
        if (mounted.current) {
          setData(cached.data)
          setLastFetch(new Date(cached.ts))
        }
        // If cache is very fresh (< 2 min), skip network fetch entirely
        if (cached.age < 2 * 60 * 1000) {
          if (mounted.current) setLoading(false)
          return
        }
      }
    }

    setLoading(true); setError(null)
    try {
      const [satR, sigR, thrR] = await Promise.allSettled([
        fetchWithRetry('/api/satellite', 3),
        fetch('/api/signals',  { signal: AbortSignal.timeout(55000) }).catch(() => null),
        fetch('/api/threats',  { signal: AbortSignal.timeout(55000) }).catch(() => null),
      ])
      if (satR.status === 'rejected') throw new Error(satR.reason?.message || 'Satellite fetch failed')
      const sat = await satR.value.json()
      let merged = { ...sat }
      if (sigR.status === 'fulfilled' && sigR.value?.ok) {
        const sig = await sigR.value.json().catch(() => ({}))
        if (sig.aisStream?.length)        merged.aisStream        = sig.aisStream
        if (sig.aisCoastGuard?.length)    merged.aisCoastGuard    = sig.aisCoastGuard
        if (sig.acarsPositions?.length)   merged.acarsPositions   = sig.acarsPositions
        if (sig.redditSignals?.length)    merged.redditSignals    = sig.redditSignals
      }
      if (thrR.status === 'fulfilled' && thrR.value?.ok) {
        const thr = await thrR.value.json().catch(() => ({}))
        if (thr.botnetC2?.length)        merged.botnetC2        = thr.botnetC2
        if (thr.otxPulses?.length)       merged.otxPulses       = thr.otxPulses
        if (thr.kev?.length)             merged.kev             = thr.kev
        if (thr.shodanLatest?.length)    merged.shodanLatest    = thr.shodanLatest
        if (thr.recentCVEs?.length)      merged.recentCVEs      = thr.recentCVEs
        if (thr.censysAnomalous?.length) merged.censysAnomalous = thr.censysAnomalous
        if (thr.maliciousURLs?.length)   merged.maliciousURLs   = thr.maliciousURLs
      }
      if (!mounted.current) return
      merged.summary = { ...(merged.summary||{}), fetchedAt: new Date().toISOString() }

      // ── Merge with cached data so switching tabs never loses data ─────────
      const prev = cacheRead(CACHE_KEY)
      if (prev?.data) {
        // Keep ships/aircraft from cache if new fetch has fewer (API hiccup)
        if ((prev.data.ships?.length||0) > (merged.ships?.length||0))
          merged.ships = prev.data.ships
        if ((prev.data.aircraft?.length||0) > (merged.aircraft?.length||0))
          merged.aircraft = prev.data.aircraft
        // Preserve milaircraft — takes 2+ minutes to fill from ADSB, never wipe it
        if ((prev.data.milaircraft?.length||0) > (merged.milaircraft?.length||0))
          merged.milaircraft = prev.data.milaircraft
        // Preserve warships — static dataset, don't lose it
        if ((prev.data.warships?.length||0) > (merged.warships?.length||0))
          merged.warships = prev.data.warships
        // Merge conflict events — accumulate, deduplicate
        if (prev.data.conflictEvents?.length) {
          const seen = new Set((merged.conflictEvents||[]).map(e=>`${e.lat?.toFixed(2)},${e.lng?.toFixed(2)}`))
          const oldConflicts = prev.data.conflictEvents.filter(e => !seen.has(`${e.lat?.toFixed(2)},${e.lng?.toFixed(2)}`))
          merged.conflictEvents = [...(merged.conflictEvents||[]), ...oldConflicts].slice(0, 800)
        }
      }

      // ── Write to localStorage cache ────────────────────────────────────────
      // Trim before caching to prevent localStorage quota overflow (5MB limit)
      // 18k ships * 150 bytes = 2.7MB → only cache ships with speed > 0 (moving)
      const toCache = {
        ...merged,
        ships: (merged.ships||[]).filter(s => (s.speed||0) > 0.3).slice(0, 5000),  // ships pre-filtered at API (moving only)
        aircraft: (merged.aircraft||[]).slice(0, 2000),
        milaircraft: (merged.milaircraft||[]).slice(0, 500) || prev?.data?.milaircraft?.slice(0,500) || [],
        warships:    (merged.warships||[])   .slice(0, 200) || prev?.data?.warships?.slice(0,200) || [],
        ucdpFull:          merged.ucdpFull            || prev.data?.ucdpFull || [],
        openSanctions:     merged.openSanctions        || prev.data?.openSanctions || [],
        osmMilitary:       merged.osmMilitary          || prev.data?.osmMilitary || [],
        wikidataConflicts: merged.wikidataConflicts    || prev.data?.wikidataConflicts || [],
        armsTransferSignals: merged.armsTransferSignals|| prev.data?.armsTransferSignals || [],
        euCordis:          merged.euCordis             || prev.data?.euCordis || [],
        icaoNotams:        merged.icaoNotams           || prev.data?.icaoNotams || [],
      }
      cacheWrite(CACHE_KEY, toCache)

      // Only trigger re-render if data actually changed (avoid useless satelliteToPoints rebuilds)
      setData(prev => {
        // Quick size comparison — if nothing changed, reuse same reference (skips useMemo re-run)
        const prevTotal = (prev?.ships?.length||0) + (prev?.aircraft?.length||0) + (prev?.conflictEvents?.length||0)
        const newTotal  = (merged.ships?.length||0) + (merged.aircraft?.length||0) + (merged.conflictEvents?.length||0)
        if (prevTotal === newTotal && prevTotal > 0) return prev
        return merged
      })
      setLastFetch(new Date())
    } catch (e) {
      if (mounted.current) {
        setError(e.message)
        // On error, still use cached data if available
        const cached = cacheRead(CACHE_KEY)
        if (cached?.data && !data) {
          setData(cached.data)
          setLastFetch(new Date(cached.ts))
        }
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
    const iv = setInterval(fetch_, 3 * 60 * 1000)  // 3min — satellite cached 2min on edge
    return () => clearInterval(iv)
  }, [fetch_])

  // Merge useTelegram's fresh posts into satData so map gets realtime updates
  const { recent: tgRecent, archive: tgArchive } = useTelegram()
  React.useEffect(() => {
    if (!tgRecent?.length && !tgArchive?.length) return
    setData(prev => {
      if (!prev) return prev
      const allTg = [...(tgRecent||[]), ...(tgArchive||[])].map(p => ({
        title: p.text?.slice(0,120), description: p.text?.slice(0,400),
        source: p.channelName, url: p.url, date: p.ts, severity: p.severity,
        lat: p.lat, lng: p.lng, _fromUseTelegram: true,
      }))
      // Merge with existing (keep satellite-scraped posts, add hook posts)
      const existing = (prev.telegramPosts||[]).filter(p => !p._fromUseTelegram)
      return { ...prev, telegramPosts: [...allTg, ...existing].slice(0, 500),
        telegramRecent: tgRecent, telegramArchive: tgArchive }
    })
  }, [tgRecent, tgArchive])

  // Merge live WebSocket military aircraft — browser-side, bypasses Vercel IP blocks
  const { aircraft: wsAircraft, connected: wsConnected } = useADSBLive()
  React.useEffect(() => {
    if (!wsAircraft?.length) return
    setData(prev => {
      if (!prev) return prev
      return { ...prev, milaircraft: wsAircraft, _wsConnected: wsConnected }
    })
  }, [wsAircraft, wsConnected])

  return { data, loading, lastFetch, error, refresh: fetch_ }
}

// ── Convert satellite data to 3D globe map points ─────────────────────────
export function satelliteToPoints(satData, layers) {
  if (!satData) return []
  const pts = []

  if (layers.earthquakes && satData.earthquakes) {
    satData.earthquakes.forEach(eq => {
      if (!eq.lat || !eq.lng) return
      pts.push({
        lat:eq.lat, lng:eq.lng, type:'earthquake', severity:eq.severity,
        name:`M${eq.mag?.toFixed(1)} — ${eq.place}`,
        desc:`Magnitude ${eq.mag} · Depth ${eq.depth?.toFixed(0)}km · ${eq.time} UTC${eq.tsunami?' ⚠ TSUNAMI':''} · Felt by ${eq.felt||0} people`,
        url:eq.url, meta:{mag:eq.mag,depth:eq.depth,tsunami:eq.tsunami}, _glow:eq.tsunami,
      })
    })
  }

  if (layers.iris && satData.iris) {
    satData.iris.forEach(eq => {
      if (!eq.lat||!eq.lng) return
      pts.push({
        lat:eq.lat,lng:eq.lng,type:'earthquake',severity:eq.severity,
        name:`M${eq.mag?.toFixed(1)} — ${eq.place||'IRIS'}`,
        desc:`Magnitude ${eq.mag} · Depth ${eq.depth?.toFixed(0)}km · Network: ${eq.net||''}`,
        meta:{mag:eq.mag,depth:eq.depth},
      })
    })
  }

  if (layers.eonet && satData.eonet) {
    satData.eonet.forEach(e => {
      const t = (()=>{ const c=e.category?.toLowerCase()||''; if(c.includes('wildfire')||c.includes('fire'))return'eonet_wildfire'; if(c.includes('storm')||c.includes('cyclone'))return'eonet_severe_storms'; if(c.includes('volcano'))return'eonet_volcanoes'; if(c.includes('ice'))return'eonet_sea_and_lake_ice'; return'eonet_other' })()
      pts.push({lat:e.lat,lng:e.lng,type:t,severity:e.severity,name:e.title,
        desc:`${e.category} — detected ${e.date}. NASA EONET active event.`,url:e.url,meta:{category:e.category}})
    })
  }

  if (layers.gdacs && satData.gdacs) {
    satData.gdacs.forEach(g => {
      pts.push({lat:g.lat,lng:g.lng,type:'gdacs',severity:g.severity,name:g.title,
        desc:`${g.description?.slice(0,200)} Alert: ${g.alertlevel?.toUpperCase()}`,url:g.url,
        meta:{eventtype:g.eventtype,alertlevel:g.alertlevel},_glow:g.alertlevel==='red'})
    })
  }

  if (layers.hurricanes && satData.hurricanes) {
    satData.hurricanes.forEach(h => {
      pts.push({lat:h.lat,lng:h.lng,type:'hurricane',severity:h.severity,
        name:`🌀 ${h.classification} ${h.name}`,
        desc:`${h.headline} Wind: ${h.intensity}kt · Pressure: ${h.pressure}mb · Movement: ${h.movement}`,
        url:h.publicAdvisoryUrl,meta:{intensity:h.intensity,pressure:h.pressure,track:h.track},_glow:true})
    })
  }

  if (layers.volcanoes && satData.volcanoes) {
    satData.volcanoes.forEach(v => {
      if (!v.lat||!v.lng) return
      pts.push({lat:v.lat,lng:v.lng,type:'volcano',severity:v.severity,
        name:`🌋 ${v.name}`,
        desc:`Active eruption · ${v.country} · Type: ${v.type} · VEI: ${v.vei??'?'} · ${v.lastActivity}`,
        url:v.url,meta:{vei:v.vei,country:v.country,alert:v.alert},_glow:(v.vei||0)>=4})
    })
  }

  if (layers.floods && satData.floods) {
    satData.floods.forEach(f => {
      if (!f.lat||!f.lng) return
      pts.push({lat:f.lat,lng:f.lng,type:'flood',severity:f.severity,
        name:`🌊 Flood — ${f.country}`,
        desc:`Active flood · ${f.displaced?`${f.displaced?.toLocaleString()} displaced · `:''}${f.dead?`${f.dead} dead · `:''}Began: ${f.began}`,
        url:f.url,meta:{displaced:f.displaced,dead:f.dead,area:f.area}})
    })
  }

  if (layers.weatherAlerts && satData.weatherAlerts) {
    satData.weatherAlerts.forEach(w => {
      if (!w.lat&&!w.lng) return
      pts.push({lat:w.lat||38,lng:w.lng||-95,type:'weather',severity:w.mapSeverity,
        name:`⛈ ${w.event}`,desc:`${w.headline?.slice(0,200)} · Area: ${w.area}`,
        url:w.url,meta:{event:w.event,urgency:w.urgency,certainty:w.certainty}})
    })
  }

  if (layers.copernicus && satData.copernicus) {
    satData.copernicus.forEach(c => {
      pts.push({lat:c.lat,lng:c.lng,type:'copernicus',severity:'high',
        name:`🛰 ${c.title}`,
        desc:`Copernicus EU satellite emergency · ${c.type} in ${c.country} · Status: ${c.status} · Satellite imagery available.`,
        url:c.satelliteImgUrl,meta:{type:c.type,status:c.status}})
    })
  }

  if (layers.sigmets && satData.sigmets) {
    satData.sigmets.forEach(s => {
      pts.push({lat:s.lat,lng:s.lng,type:'sigmet',
        severity:s.hazard?.includes('VA')?'high':'medium',
        name:`✈ SIGMET: ${s.hazard}`,
        desc:`Aviation hazard · ${s.firName} · Alt: ${s.altLow}–${s.altHigh}ft · Valid: ${s.validFrom} to ${s.validTo} · ${s.rawSigmet||''}`,
        meta:{hazard:s.hazard},_glow:false})
    })
  }

  // ── AIR QUALITY — conflict zone pollution / smoke (disease layer) ─────────────
  if (layers.disease && satData.airQuality?.length) {
    satData.airQuality.slice(0, 100).forEach(a => {
      if (!a.lat || !a.lng) return
      pts.push({
        lat: a.lat, lng: a.lng, type: 'disease',
        severity: a.aqi > 200 ? 'high' : a.aqi > 100 ? 'medium' : 'low',
        name: `🌫 AQI ${a.aqi||'?'}: ${a.city || a.location || 'Monitoring Station'}`,
        desc: `Air Quality Index: ${a.aqi||'?'} · ${a.category||''} · ${a.dominant||''} · Near conflict zone`,
        url: `https://aqicn.org/city/${encodeURIComponent(a.city||a.location||'')}`,
        meta: { aqi: a.aqi, category: a.category },
        source: 'OpenAQ',
      })
    })
  }

  // ── ICAO NOTAMs — international airspace (supplements FAA notams) ─────────────
  if (layers.notams && satData.icaoNotams?.length) {
    satData.icaoNotams.slice(0, 100).forEach(n => {
      const lat = n.lat || n.latitude, lng = n.lng || n.longitude || n.lon
      if (!lat || !lng) return
      const isMil = /exercise|military|restricted|danger|warning|prohibited/i.test(n.text||n.notamText||n.title||'')
      pts.push({
        lat: +lat, lng: +lng, type: 'notam',
        severity: isMil ? 'high' : 'medium',
        name: `✈ ICAO NOTAM: ${(n.id||n.notamId||'').slice(0,20)} ${isMil?'[MIL]':''}`,
        desc: (n.text||n.notamText||n.title||'').slice(0, 200),
        url: n.url || 'https://www.notams.faa.gov',
        _glow: isMil,
        source: 'ICAO',
      })
    })
  }

  // ── EU CORDIS — defence/security research grants (cyber layer) ───────────────
  if (layers.cyber && satData.euCordis?.length) {
    // CORDIS projects don't have lat/lng — surface as a summary intel point in Brussels
    const topProject = satData.euCordis[0]
    if (topProject) {
      pts.push({
        lat: 50.85, lng: 4.35, // Brussels (EU headquarters)
        type: 'cyber',
        severity: 'low',
        name: `🔬 EU Defence R&D: ${satData.euCordis.length} funded projects`,
        desc: `Latest: "${(topProject.title||'').slice(0,80)}" · Budget: €${((topProject.budget||0)/1e6).toFixed(1)}M`,
        url: 'https://cordis.europa.eu',
        meta: { count: satData.euCordis.length, topProject },
        source: 'EU CORDIS',
      })
    }
  }

  // ── UCDP FULL — UN-verified conflict events with fatality data ──────────────
  if (layers.acled && satData.ucdpFull?.length) {
    satData.ucdpFull.slice(0, 500).forEach(e => {
      if (!e.lat || !e.lng) return
      pts.push({
        lat: e.lat, lng: e.lng, type: 'conflict',
        severity: e.severity || 'medium',
        name: `⚔ ${e.dyad_name || e.title || 'UCDP Event'} — ${e.country || ''}`,
        desc: `Deaths: ${e.deaths_best || 0} (est) · ${e.side_a} vs ${e.side_b} · ${e.date?.slice(0,10) || ''}`,
        url: `https://ucdp.uu.se/event/${e.id}`,
        meta: { fatalities: e.deaths_best, conflict_id: e.conflict_id, type: e.type_of_violence },
        _glow: (e.deaths_best || 0) > 50,
        source: 'UCDP',
      })
    })
  }

  // ── OSM MILITARY INFRASTRUCTURE — bases, airfields, naval stations ─────────
  if (layers.milaircraft && satData.osmMilitary?.length) {
    satData.osmMilitary.slice(0, 400).forEach(b => {
      if (!b.lat || !b.lng) return
      const icrType = b.type === 'airfield' ? 'milaircraft' : b.type === 'naval_base' ? 'warship' : 'milaircraft'
      pts.push({
        lat: b.lat, lng: b.lng, type: icrType,
        severity: 'medium',
        name: `🏛 ${b.name} [${b.type?.toUpperCase() || 'BASE'}]${b.country ? ' · ' + b.country : ''}`,
        desc: `Military installation · ${b.type || 'base'}${b.operator ? ' · ' + b.operator : ''} · OpenStreetMap verified`,
        meta: { osm_id: b.id, type: b.type, country: b.country, operator: b.operator, _isBase: true },
        _glow: false,
        source: 'OSM',
      })
    })
  }

  // ── WIKIDATA ACTIVE CONFLICTS — knowledge graph verified ──────────────────
  if (layers.acled && satData.wikidataConflicts?.length) {
    satData.wikidataConflicts.forEach(c => {
      if (!c.lat || !c.lng) return
      pts.push({
        lat: c.lat, lng: c.lng, type: 'wikidata',
        severity: 'medium',
        name: `📖 ${c.name}${c.country ? ' · ' + c.country : ''}`,
        desc: `Active conflict since ${c.start ? c.start.slice(0,10) : '?'} · Wikidata verified`,
        url: `https://www.wikidata.org/wiki/${c.id}`,
        meta: { wikidata_id: c.id, country: c.country },
        _glow: false,
        source: 'Wikidata',
      })
    })
  }

  // ── OPENSANCTIONS — sanctioned vessels + aircraft on map ─────────────────
  if (layers.maritime && satData.openSanctions?.length) {
    satData.openSanctions
      .filter(e => e.schema === 'Vessel' || e.schema === 'Aircraft')
      .forEach(e => {
        // Vessels/aircraft don't have fixed lat/lng — show in intel overlay with low opacity
        // We geo-approximate by country for map placement using country centroid seed
        // Main surfacing is via IntelBoard entity search
      })
    // Surface count in signals panel
    const count = satData.openSanctions.length
    if (count > 0 && layers.nuclear) {
      // Add a summary signal in the cyber/intel layer
      pts.push({
        lat: 38.9, lng: -77.0,  // Washington DC (OFAC HQ)
        type: 'cyber',
        severity: 'medium',
        name: `🚫 OpenSanctions: ${count} sanctioned entities tracked`,
        desc: `${satData.openSanctions.filter(e=>e.schema==='Vessel').length} vessels · ${satData.openSanctions.filter(e=>e.schema==='Aircraft').length} aircraft · ${satData.openSanctions.filter(e=>e.schema==='Person').length} persons · ${satData.openSanctions.filter(e=>e.schema==='Organization').length} orgs`,
        url: 'https://www.opensanctions.org',
        _glow: false,
        source: 'OpenSanctions',
      })
    }
  }

  // ── ARMS TRANSFER SIGNALS — geo-approximate to source country ─────────────
  if (layers.maritime && satData.armsTransferSignals?.length) {
    satData.armsTransferSignals.slice(0, 30).forEach(a => {
      // Arms transfer articles have sourcecountry from GDELT - use it for rough placement
      // If no country, use title to detect country keywords
      const countryCoords = {
        'US':[-95,37],'GB':[-3,54],'FR':[2,46],'DE':[10,51],'RU':[37,55],
        'CN':[105,35],'IL':[34,31],'UA':[32,49],'IR':[53,32],'SA':[45,24],
        'TR':[35,39],'IN':[78,22],'PK':[70,30],'KR':[128,36],'JP':[138,36],
        'AU':[134,-26],'KW':[47,29],'AE':[54,24],'QA':[51,25],'EG':[30,26],
        'NG':[8,10],'ZA':[25,-30],'BR':[-53,-15],'MX':[-99,23],'CA':[-95,56],
      }
      const cc = (a.country||'').toUpperCase().slice(0,2)
      const coords = countryCoords[cc] || [
        (parseFloat(a.lng)||0) || ((Math.random()-0.5)*320),
        (parseFloat(a.lat)||0) || ((Math.random()-0.5)*120),
      ]
      pts.push({
        lat: coords[1], lng: coords[0],
        type: 'maritime',
        severity: 'medium',
        name: `⚔ Arms Transfer: ${a.title?.slice(0,60)||''}`,
        desc: `${a.title || ''} · Source: ${a.country || 'Unknown'}`,
        url: a.url || '',
        source: 'SIPRI/GDELT',
        _glow: false,
      })
    })
  }

  // ── AVIATION PATTERN INTELLIGENCE — not raw dots, but actionable signals ──
  if (layers.aircraft && satData.aircraft) {
    // Emergency squawks — always show, highest priority
    satData.aircraft.filter(a => a.squawk==='7700'||a.squawk==='7500'||a.squawk==='7600').forEach(a => {
      if (!a.lat||!a.lng) return
      const type = a.squawk==='7700'?'General Emergency':a.squawk==='7500'?'Hijack':a.squawk==='7600'?'Radio Failure':'Emergency'
      pts.push({
        lat:a.lat,lng:a.lng,type:'aircraft',severity:a.squawk==='7700'||a.squawk==='7500'?'critical':'high',
        name:`🚨 ${type}: ${a.callsign||a.icao24} (${a.country||'?'})`,
        desc:`EMERGENCY SQUAWK ${a.squawk} · ${a.callsign||a.icao24} · ${a.zone||'?'} · Alt: ${a.altitude?.toLocaleString()||'?'}ft · ${a.velocity||'?'}kt`,
        url:`https://adsb.fi/#icao=${a.icao24}`,
        meta:{callsign:a.callsign,icao24:a.icao24,squawk:a.squawk,heading:a.heading},
        _glow:true,
      })
    })

    // Unusual altitude/speed patterns — potential surveillance, interceptions, evasion
    satData.aircraft.forEach(a => {
      if (!a.lat||!a.lng||a.squawk==='7700'||a.squawk==='7500'||a.squawk==='7600') return
      const veryHigh = a.altitude > 55000  // SR-71/U-2 territory
      const veryLow  = a.altitude > 0 && a.altitude < 1000 && (a.velocity||0) > 150  // low fast = surveillance/attack
      const loiter   = (a.velocity||0) < 120 && a.altitude > 5000 && a.altitude < 25000  // ISR loiter pattern
      if (!veryHigh && !veryLow && !loiter) return
      const pattern = veryHigh ? 'High-altitude ('+a.altitude.toLocaleString()+'ft)' : veryLow ? 'Low & Fast (possible strike/recon)' : 'Loiter/Orbit pattern'
      // Loiter/Orbit: aircraft flying repetitive circles or figure-8s over an area
      // Indicates ISR (surveillance), close air support standby, or AWACS orbit
      // Low & Fast: below 1000ft at >150kt - strike run, border patrol, or special ops
      // High-altitude: above 55,000ft - U-2/RQ-4 reconnaissance or test flight
      const patternDesc = veryHigh
        ? `High-altitude surveillance/recon at ${a.altitude.toLocaleString()}ft — likely ISR (U-2, RQ-4, ER-2) or test flight`
        : veryLow
        ? `Low-altitude fast flight at ${a.altitude?.toLocaleString()||'?'}ft/${a.velocity||'?'}kt — possible strike run, border patrol, or special ops`
        : `Loiter/orbit pattern — aircraft circling area, indicates ISR surveillance, close air support standby, or AWACS orbit`
      pts.push({
        lat:a.lat,lng:a.lng,type:'aircraft',severity:veryLow?'high':'medium',
        name:`✈ ${pattern}: ${a.callsign||a.icao24||'Unknown'} (${a.country||'?'}) · ${a.zone||'?'}`,
        desc:patternDesc + ` · Callsign: ${a.callsign||a.icao24} · Alt: ${a.altitude?.toLocaleString()||'?'}ft · ${a.velocity||'?'}kt · Hdg: ${a.heading!=null?a.heading+'°':'?'}`,
        url:`https://adsb.fi/#icao=${a.icao24}`,
        meta:{callsign:a.callsign,icao24:a.icao24,alt:a.altitude,heading:a.heading,pattern},
        _glow:veryLow,
      })
    })
  }

  if (layers.milaircraft) {
    // Primary: dedicated milaircraft array from satellite.js
    const milSrc = satData.milaircraft?.length ? satData.milaircraft
      : (satData.aircraft||[]).filter(a => a._military)  // fallback
    milSrc.forEach(a => {
      if (!a.lat||!a.lng) return
      pts.push({
        lat:a.lat,lng:a.lng,type:'milaircraft',severity:'high',
        name:`✈ ${a.callsign||a.icao24||'Military'} [MIL]`,
        desc:`Military · ${a.callsign||a.icao24||a.icao24} · ${a.zone||'Global'} · Alt: ${a.altitude?a.altitude.toLocaleString()+'ft':'?'} · ${a.velocity?a.velocity+'kt':'?'} · Hdg: ${a.heading!=null?a.heading+'°':'?'}`,
        url:`https://adsb.fi/#icao=${a.icao24||''}`,
        meta:{callsign:a.callsign,icao24:a.icao24,alt:a.altitude,heading:a.heading,country:a.country,model:a.model,_military:true},
        _military:true,_glow:true,
      })
    })
  }

  // ── MARITIME PATTERN INTELLIGENCE — chokepoint density + anomalies ──────────
  if (layers.ships && satData.ships) {
    satData.ships.forEach(s => {
      if (!s.lat||!s.lng) return
      if (s.type==='warship'||s._isWarship||s._military) return

      if (s._density) {
        // Chokepoint density marker — shows vessel count + AIS blackout alerts
        const isBlackout = s._count === 0
        pts.push({
          lat:s.lat,lng:s.lng,type:'ship',
          severity:isBlackout?'high':s._count < 3?'medium':'low',
          name:`${isBlackout?'⚠ AIS BLACKOUT':'🚢 '} ${s.zone||s.name}: ${s._count||0} vessels`,
          desc: isBlackout
            ? `⚠ ZERO vessels detected at ${s.zone} — possible AIS jamming, closure, or data gap. Normal traffic should be visible here.`
            : `${s._count} vessels in transit through ${s.zone}. ${s._count < 3 ? 'Below normal — reduced traffic or data gap.' : 'Normal traffic density.'}`,
          url:`https://www.marinetraffic.com/en/ais/home/centerx:${s.lng}/centery:${s.lat}/zoom:8`,
          meta:{zone:s.zone,count:s._count,_density:true},
          _glow:isBlackout,
        })
      } else if (s._anomaly) {
        // Anomaly: vessel behaving unusually (high-speed evasion, sudden stop, etc.)
        pts.push({
          lat:s.lat,lng:s.lng,type:'ship',severity:s.severity||'high',
          name:`⚡ Anomaly: ${s.name||s.mmsi||'Unknown'} (${s.flag||'?'})`,
          desc: s.desc || `Anomalous vessel behavior · ${s.zone||'?'} · ${s.speed}kn`,
          url:`https://www.marinetraffic.com/en/ais/home/centerx:${s.lng}/centery:${s.lat}/zoom:10`,
          meta:{mmsi:s.mmsi,name:s.name,speed:s.speed,zone:s.zone,_anomaly:true},
          _glow:true,
        })
      } else if (s.name && s.speed > 0) {
        // Named vessel in notable zone — show only if contextually interesting
        const isHighValue = /tanker|LNG|crude|carrier|bulk|container/i.test(s.type||'')
        if (!isHighValue) return  // skip generic small vessels
        pts.push({
          lat:s.lat,lng:s.lng,type:'ship',severity:'low',
          name:`🚢 ${s.name} (${s.flag||'?'}) — ${s.type||'Vessel'}`,
          desc:`${s.type||'Vessel'} · ${s.zone||'?'} · ${s.speed}kn${s.dest?' → '+s.dest:''}`,
          url:`https://www.marinetraffic.com/en/ais/home/centerx:${s.lng}/centery:${s.lat}/zoom:12`,
          meta:{mmsi:s.mmsi,name:s.name,speed:s.speed,shipType:s.type},
          _glow:false,
        })
      }
    })
  }

  if (layers.warships) {
    // Use dedicated warships array (from /api/warships) if available, fallback to ships filter
    const warshipSrc = satData.warships?.length
      ? satData.warships
      : (satData.ships||[]).filter(s => s.type==='warship'||s._isWarship||s._military)
    warshipSrc.forEach(s => {
      if (!s.lat||!s.lng) return
      pts.push({
        lat:s.lat,lng:s.lng,type:'warship',severity:'high',
        name:`⚔ ${s.name||s.mmsi||'Warship'} (${s.flag||'?'}) [${s.shipType||'Military'}]`,
        desc:`${s.name||'Vessel '+s.mmsi} · Flag: ${s.flag||'?'} · ${s.zone||'Global'} · ${s.speed!=null?s.speed+'kn ':''} · Type: ${s.shipType||'Warship'}${s.source?' · src:'+s.source:''}`,
        url:`https://www.marinetraffic.com/en/ais/home/centerx:${s.lng}/centery:${s.lat}/zoom:12`,
        meta:{mmsi:s.mmsi,name:s.name,speed:s.speed,heading:s.heading||s.cog,shipType:s.shipType,flag:s.flag,zone:s.zone,_military:true,_livePos:s._livePos||false},
        _military:true,_glow:true,
      })
    })
  }

  if (layers.globalFires && satData.globalFires) {
    satData.globalFires.forEach(f => {
      pts.push({
        lat:f.lat,lng:f.lng,type:'firms',severity:f.severity,
        name:`🔥 Fire (${f.brightness?.toFixed(0)}K · ${f.confidence} conf)`,
        desc:`NASA ${f.product||'VIIRS'} thermal anomaly · Brightness: ${f.brightness?.toFixed(0)}K · Confidence: ${f.confidence} · ${f.zone} · ${f.date}`,
        url:`https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${f.lng},${f.lat},10z`,
        meta:{brightness:f.brightness,product:f.product},_glow:false,
      })
    })
  }

  if (layers.iss && satData.iss) {
    const i = satData.iss
    pts.push({
      lat:i.lat,lng:i.lng,type:'iss',severity:'low',
      name:'🛸 ISS — International Space Station',
      desc:`Live ISS position · Altitude: ~${i.altitude}km · Velocity: ~${i.velocity?.toLocaleString()}km/h · Orbiting every 92 minutes`,
      meta:{altitude:i.altitude,velocity:i.velocity},_glow:true,
    })
  }

  if (layers.launches && satData.launches) {
    satData.launches.forEach(l => {
      if (!l.lat&&!l.lng) return
      pts.push({
        lat:l.lat,lng:l.lng,type:'launch',severity:'low',
        name:`🚀 ${l.name}`,
        desc:`Launch: ${l.net?.slice(0,16)} UTC · Vehicle: ${l.vehicle||'?'} · Provider: ${l.provider||'?'} · Site: ${l.site||'?'} · Status: ${l.status||'?'}${l.probability?` · ${l.probability}% probability`:''}`,
        url:l.url,meta:{vehicle:l.vehicle,provider:l.provider,probability:l.probability},
      })
    })
  }

  // ── Server-side conflict events (GDELT + UCDP, no CORS) ─────────────────
  if (layers.acled && satData.conflictEvents?.length) {
    satData.conflictEvents.forEach(e => {
      if (!e.lat||!e.lng||isNaN(e.lat)||isNaN(e.lng)) return
      const j = () => (Math.random()-0.5)*0.5
      pts.push({
        lat:e.lat+j(), lng:e.lng+j(), type:'conflict',
        severity:e.severity||'medium',
        name:`⚔️ ${e.title?.slice(0,70)||'Conflict Event'}`,
        desc:`${e.title} · Source: ${e.source||'GDELT'}${e.fatalities?' · '+e.fatalities+' fatalities':''}`,
        url:e.url||'https://gdeltproject.org',
        pub: e.event_date||e.date||e.dateAdded||null,
        meta:{source:e.source,country:e.country,fatalities:e.fatalities},
      })
    })
  }

  // ── Telegram OSINT channel posts — geo-inferred from content ──────────
  if ((layers.telegram || layers.news) && satData.telegramPosts?.length) {
    const TG_LOCS = {
      'ukraine':[49,31],'kyiv':[50.4,30.5],'kharkiv':[50,36.3],'kherson':[46.6,32.6],
      'zaporizhzhia':[47.8,35.1],'odesa':[46.5,30.7],'mariupol':[47.1,37.5],
      'donbas':[48.2,38.2],'donetsk':[48,37.8],'bakhmut':[48.6,38],'avdiivka':[48.1,37.7],
      'belgorod':[50.6,36.6],'kursk':[51.7,36.2],'russia':[55.7,37.6],'moscow':[55.7,37.6],
      'crimea':[45,34],'sevastopol':[44.6,33.5],
      'gaza':[31.4,34.4],'israel':[31.8,35.2],'tel aviv':[32.1,34.8],'rafah':[31.3,34.2],
      'west bank':[31.9,35.2],'ramallah':[31.9,35.2],'jenin':[32.5,35.3],
      'lebanon':[33.9,35.5],'beirut':[33.9,35.5],'hezbollah':[33.5,35.6],
      'syria':[34.8,38.9],'damascus':[33.5,36.3],'aleppo':[36.2,37.2],
      'iran':[32.4,53.7],'tehran':[35.7,51.4],'iraq':[33.2,43.7],'baghdad':[33.3,44.4],
      'yemen':[15.5,48.5],'houthi':[15,43.5],'sudan':[15,30.2],'khartoum':[15.6,32.5],
      'taiwan':[23.7,121],'strait':[24,122],'china':[35.8,104.2],'beijing':[39.9,116.4],
      'north korea':[40,127],'pyongyang':[39,125.8],'korea':[36,128],
      'myanmar':[19,96.9],'pakistan':[30,69],'afghanistan':[33.9,67.7],
    }
    satData.telegramPosts.forEach((p, i) => {
      const text = ((p.title||'')+(p.description||'')).toLowerCase()
      let lat=0,lng=0
      for (const [k,co] of Object.entries(TG_LOCS)) { if(text.includes(k)){[lat,lng]=co;break} }
      if (!lat) { lat=48+(i%5)*2; lng=32+(i%7)*3 }  // Ukraine region fallback for unmatched
      const j = () => (Math.random()-0.5)*1.5
      pts.push({ lat:lat+j(), lng:lng+j(), type:'telegram', severity:p.severity||'medium',
        name:`📡 ${p.source||'Telegram'}: ${(p.title||'').slice(0,80)}`,
        desc:(p.description||'').slice(0,400), url:p.url||'',
        pub:p.date||null, meta:{source:p.source||'Telegram'}, _telegram:true,
      })
    })
  }

  // ── NOTAMs — military airspace closures (pre-strike signal) ─────────────
  if (layers.notams && satData.notams?.length) {
    satData.notams.forEach(n => {
      if (!n.lat||!n.lng||isNaN(n.lat)||isNaN(n.lng)) return
      pts.push({ lat:n.lat, lng:n.lng, type:'notam', severity:n.isMilitary?'high':'low',
        name:`✈ NOTAM: ${n.title?.slice(0,60)}`,
        desc:n.description?.slice(0,300), url:n.url||'https://notams.faa.gov',
        meta:{source:n.source, isMilitary:n.isMilitary}, })
    })
  }

  // ── Wikipedia edits — conflict article changes (real-time event signal) ──
  if (layers.wikiEdits && satData.wikiEdits?.length) {
    // Wiki edits are not geolocated — cluster near topic region via title inference
    const WIKI_LOCS = {
      'ukraine':[48.4,31.2],'russia':[55.7,37.6],'gaza':[31.4,34.4],'israel':[31.0,34.9],
      'sudan':[15.5,32.5],'myanmar':[16.9,96.2],'yemeni':[15.5,44.2],'nato':[50.0,14.0],
      'hezbollah':[33.9,35.5],'hamas':[31.4,34.4],'islamic state':[33.5,43.7],
    }
    satData.wikiEdits.forEach(w => {
      const t = (w.page||w.title||'').toLowerCase()
      let lat=0, lng=0
      for (const [k,co] of Object.entries(WIKI_LOCS)) { if (t.includes(k)) { [lat,lng]=co; break } }
      if (!lat) return
      const j = () => (Math.random()-0.5)*3
      pts.push({ lat:lat+j(), lng:lng+j(), type:'wikiEdit', severity:'low',
        name:`📝 Wiki: ${w.page||'Unknown'}`,
        desc:`Edited by ${w.user}: ${w.comment?.slice(0,200)||'no comment'}`,
        url:w.url, meta:{source:'Wikipedia Edits', user:w.user} })
    })
  }

  // ── BGP anomalies — routing hijacks (cyber/infrastructure) ─────────────
  if (layers.bgp && satData.bgpAnomalies?.length) {
    satData.bgpAnomalies.forEach((b, i) => {
      // No lat/lng on BGP events — distribute across known cyber hotspots
      const CYBER_LOCS = [[55.7,37.6],[39.9,116.4],[37.5,127.0],[38.9,-77.0],[51.5,-0.1],[48.9,2.3]]
      const [lat,lng] = CYBER_LOCS[i % CYBER_LOCS.length]
      const j = () => (Math.random()-0.5)*5
      pts.push({ lat:lat+j(), lng:lng+j(), type:'bgp', severity:b.severity||'medium',
        name:`🌐 BGP: ${b.title?.slice(0,60)}`,
        desc:b.description?.slice(0,300), url:b.url,
        meta:{source:'BGP Stream'} })
    })
  }

  // ── VIIRS Nightlights — infrastructure damage signal ─────────────────────
  if (layers.viirs && satData.viirsNightlights?.length) {
    satData.viirsNightlights.forEach(v => {
      if (!v.lat||!v.lng) return
      pts.push({ lat:v.lat, lng:v.lng, type:'viirs', severity:v.severity||'high',
        name:`🛰 VIIRS Anomaly (${v.brightness?.toFixed(0)}K) — ${v.zone}`,
        desc:`NASA VIIRS nightlight anomaly. Brightness: ${v.brightness?.toFixed(0)}K. Zone: ${v.zone}. Confidence: ${v.confidence}`,
        url:'https://firms.modaps.eosdis.nasa.gov',
        meta:{source:'NASA VIIRS', brightness:v.brightness, zone:v.zone} })
    })
  }

  // ── Pre-Action Indicators (ISR loitering, chokepoint activity, seismic/NUDET) ─
  if ((layers.preaction || true) && satData.preActionIndicators?.length) {
    satData.preActionIndicators.forEach(p => {
      if (!p.lat||!p.lng) return
      const typeMap = {
        loitering_aircraft:  'milaircraft',
        chokepoint_activity: 'warship',
        seismic_anomaly:     'nuclear',
        satellite_pass:      'viirs',
      }
      pts.push({
        lat:p.lat, lng:p.lng,
        type: typeMap[p.type] || 'hotspot',
        severity: p.severity || 'medium',
        name: `⚡ ${p.name}`,
        desc: `${p.significance||''} · category: ${p.category||''}`,
        url: p.url||'',
        pub: p.ts,
        meta: { category:p.category, significance:p.significance },
        _glow: true, _preAction: true,
      })
    })
  }

  // ── NEW TYPES — appended below v58 core (never modifies above) ──────────

  // AISStream ships — dedup against base ships
  if (layers.ships && satData.aisStream) {
    const seen = new Set((satData.ships||[]).map(s => String(s.mmsi)))
    ;(satData.aisStream||[]).forEach(s => {
      if (!s.lat||!s.lng||seen.has(String(s.mmsi))) return
      seen.add(String(s.mmsi))
      pts.push({ lat:s.lat, lng:s.lng, type:'ship', severity:'low',
        name:`🚢 ${s.name||s.mmsi||'Vessel'} (${s.flag||'?'})`,
        desc:`AISStream real-time · ${s.speed!=null?s.speed+'kn ':''} · ${s.zone||'Global'}`,
        url:`https://www.marinetraffic.com/en/ais/home/centerx:${s.lng}/centery:${s.lat}/zoom:12`,
        meta:{mmsi:s.mmsi,name:s.name,speed:s.speed,heading:s.heading} })
    })
  }

  // ACARS oceanic aircraft — no radar coverage
  if (layers.aircraft && satData.acarsPositions) {
    ;(satData.acarsPositions||[]).forEach(a => {
      if (!a.lat||!a.lng) return
      pts.push({ lat:a.lat, lng:a.lng, type:'aircraft', severity:'low',
        name:`✈ ACARS: ${a.callsign}`,
        desc:`Oceanic position report via ACARS datalink — beyond radar coverage`,
        meta:{callsign:a.callsign,source:'ACARS'} })
    })
  }

  // Disease outbreaks (WHO + ProMED) — geo-inferred with wide keyword matching
  if (layers.disease) {
    const DLOCS = {
      // Africa
      'congo':[-4,21.8],'drc':[-4,21.8],'kinshasa':[-4.3,15.3],'nigeria':[9.1,8.7],
      'ghana':[7.9,-1],'cameroon':[3.9,11.5],'kenya':[-0.0,37.9],'tanzania':[-6.4,34.9],
      'angola':[-11.2,17.9],'zambia':[-15.4,28.5],'malawi':[-13.3,34.3],'mozambique':[-18.7,35.5],
      'zimbabwe':[-20.0,30.0],'south africa':[-29.0,25.0],'senegal':[14.5,-14.5],
      'mali':[17.6,-2.0],'niger':[17.6,8.1],'chad':[15.5,18.7],'ethiopia':[9.1,40.5],
      'somalia':[5.2,46.2],'sudan':[15,30],'south sudan':[7.0,30.0],'uganda':[1.4,32.3],
      'rwanda':[-1.9,29.9],'burundi':[-3.4,29.9],'liberia':[6.4,-9.4],'guinea':[11.0,-10.9],
      'sierra leone':[8.5,-11.8],'ivory coast':[7.5,-5.6],
      // Middle East / Asia
      'yemen':[15.5,48.5],'iraq':[33.2,43.7],'syria':[34.8,38.9],'jordan':[30.6,36.5],
      'lebanon':[33.9,35.5],'iran':[32.4,53.7],'afghanistan':[33.9,67.7],'pakistan':[30.4,69.3],
      'india':[20.6,78.9],'bangladesh':[23.7,90.4],'myanmar':[16.9,96.2],'indonesia':[-0.8,113.9],
      'philippines':[12.9,121.8],'vietnam':[14.1,108.3],'cambodia':[11.6,104.9],'thailand':[13.8,100.5],
      'china':[35.8,104.2],'wuhan':[30.6,114.3],'hong kong':[22.3,114.2],
      // Americas
      'brazil':[-14.2,-51.9],'colombia':[4.7,-74.1],'venezuela':[6.4,-66.6],'peru':[-9.2,-75.0],
      'ecuador':[-1.8,-78.2],'bolivia':[-16.3,-63.6],'paraguay':[-23.4,-58.4],'haiti':[18.9,-72.3],
      'mexico':[23.6,-102.6],'guatemala':[15.8,-90.2],'honduras':[15.2,-86.2],
      // Disease names (map to outbreak regions)
      'mpox':[-4,21.8],'monkeypox':[-4,21.8],'ebola':[-4,21.8],'marburg':[-4,21.8],
      'cholera':[15,30],'dengue':[14,101],'zika':[0,-60],'yellow fever':[5,-5],
      'lassa':[7.5,-5.6],'rift valley':[1.4,32.3],'plague':[47.9,106.9],
      'meningitis':[13.0,0.0],'measles':[14.5,-14.5],'polio':[33.9,67.7],
    }
    const items = (satData.diseaseOutbreaks||[]).concat(satData.promed||[])
    items.forEach(d => {
      const t = ((d.title||'')+(d.description||'')).toLowerCase()
      let lat=0,lng=0
      for(const [k,co] of Object.entries(DLOCS)){if(t.includes(k)){[lat,lng]=co;break}}
      // If no country match, place near a known outbreak hotspot region
      if (!lat) {
        const FALLBACK = [[1,-25],[5,20],[15,30],[0,30],[-5,20],[10,40],[20,45]]
        const fb = FALLBACK[Math.floor(Math.random()*FALLBACK.length)]
        lat = fb[0]; lng = fb[1]
      }
      const j=()=>(Math.random()-0.5)*3
      pts.push({ lat:lat+j(), lng:lng+j(), type:'disease', severity:'high',
        name:`🦠 ${d.title?.slice(0,70)}`, desc:d.description?.slice(0,300), url:d.url,
        meta:{source:d.source||'WHO/ProMED'}, _fetchedAt:d._fetchedAt })
    })
  }

  // Nuclear (IAEA) — geo-inferred, wide keyword matching, fallback to IAEA HQ
  if (layers.nuclear) {
    const NLOCS = {
      'ukraine':[48.5,37],'zaporizhzhia':[47.5,34.6],'chernobyl':[51.4,30.1],
      'iran':[34.9,50.5],'natanz':[33.7,51.9],'fordow':[34.9,50.5],'tehran':[35.7,51.4],
      'bushehr':[28.9,50.9],'north korea':[40.7,129.1],'dprk':[40.7,129.1],'pyongyang':[39.0,125.8],
      'russia':[55.7,37.6],'moscow':[55.7,37.6],'china':[35.8,104.2],'beijing':[39.9,116.4],
      'pakistan':[33.7,73.1],'india':[20.6,78.9],'japan':[36.2,138.3],'fukushima':[37.4,141.0],
      'usa':[37.1,-95.7],'united states':[37.1,-95.7],'france':[46.2,2.2],'uk':[51.5,-0.1],
      'britain':[51.5,-0.1],'taiwan':[23.7,121.0],'south korea':[35.9,127.8],'israel':[31.0,34.9],
      'brazil':[-14.2,-51.9],'argentina':[-38.4,-63.6],'germany':[51.2,10.4],'sweden':[59.3,18.1],
      'facility':[48.2,16.4],'plant':[48.2,16.4],'reactor':[48.2,16.4],
    }
    ;(satData.nuclear||[]).forEach(n => {
      const t=((n.title||'')+(n.description||'')).toLowerCase(); let lat=0,lng=0
      for(const [k,co] of Object.entries(NLOCS)){if(t.includes(k)){[lat,lng]=co;break}}
      if(!lat){lat=48.2;lng=16.4} // IAEA Vienna HQ as fallback
      const j=()=>(Math.random()-0.5)*2
      pts.push({ lat:lat+j(), lng:lng+j(), type:'nuclear', severity:n.severity||'medium',
        name:`☢️ IAEA: ${n.title?.slice(0,70)}`, desc:n.description?.slice(0,300), url:n.url,
        meta:{source:'IAEA'}, _fetchedAt:n._fetchedAt })
    })
  }

  // Humanitarian crises (ReliefWeb) — geo-inferred, wide matching, fallback
  if (layers.humanitarian) {
    const HLOCS = {
      'ukraine':[48.4,31.2],'russia':[55.7,37.6],'sudan':[15,30],'gaza':[31.4,34.4],
      'west bank':[31.9,35.2],'palestine':[31.9,35.2],'israel':[31.0,34.9],
      'afghanistan':[33.9,67.7],'syria':[34.8,38.9],'iraq':[33.2,43.7],'turkey':[38.9,35.2],
      'yemen':[15.5,48.5],'somalia':[5.2,46.2],'ethiopia':[9.1,40.5],'kenya':[-0.0,37.9],
      'drc':[-4,21.8],'congo':[-4,21.8],'haiti':[18.9,-72.3],'venezuela':[6.4,-66.6],
      'myanmar':[21.9,95.9],'bangladesh':[23.7,90.4],'pakistan':[30.4,69.3],
      'mali':[17.6,-2.0],'niger':[17.6,8.1],'chad':[15.5,18.7],'sahel':[15.0,0.0],
      'burkina faso':[12.4,-1.6],'central african':[6.6,20.9],'south sudan':[7.0,30.0],
      'mozambique':[-18.7,35.5],'malawi':[-13.3,34.3],'zimbabwe':[-20.0,30.0],
      'libya':[26.3,17.2],'lebanon':[33.9,35.5],'jordan':[30.6,36.5],
      'colombia':[4.7,-74.1],'honduras':[15.2,-86.2],'guatemala':[15.8,-90.2],
      'rohingya':[21.2,92.0],'indonesia':[-0.8,113.9],'philippines':[12.9,121.8],
    }
    ;(satData.reliefweb||[]).forEach(rw => {
      const t=((rw.name||'')+(rw.country||'')).toLowerCase(); let lat=0,lng=0
      for(const [k,co] of Object.entries(HLOCS)){if(t.includes(k)){[lat,lng]=co;break}}
      if(!lat){lat=0;lng=20} // Africa center as fallback for unmatched
      const j=()=>(Math.random()-0.5)*5
      pts.push({ lat:lat+j(), lng:lng+j(), type:'humanitarian', severity:'high',
        name:`🆘 ${rw.name?.slice(0,70)}`,
        desc:`UN ReliefWeb · ${rw.country||''} · ${rw.type||''} · ${rw.date||''}`, url:rw.url,
        meta:{source:'ReliefWeb',country:rw.country} })
    })
  }

  // Cyber threats — CISA alerts (US-based scatter) + botnet C2 (country geo)
  if (layers.cyber) {
    ;(satData.cyber||[]).forEach((c,i) => {
      pts.push({ lat:36+(i%7)*0.8, lng:-100+(i%11)*1.2, type:'cyber', severity:c.severity||'high',
        name:`💻 CISA: ${c.title?.slice(0,60)}`, desc:c.description?.slice(0,300), url:c.url,
        meta:{source:'CISA'} })
    })
    const CLOCS = {
      'RU':[55.7,37.6],'CN':[35.8,104.2],'US':[37.1,-95.7],'DE':[51.2,10.4],
      'NL':[52.1,5.3],'GB':[51.5,-0.1],'UA':[48.4,31.2],'BR':[-14.2,-51.9],
    }
    ;(satData.botnetC2||[]).forEach(b => {
      const co=CLOCS[b.country]; if(!co) return
      const j=()=>(Math.random()-0.5)*4
      pts.push({ lat:co[0]+j(), lng:co[1]+j(), type:'cyber', severity:'high',
        name:`💻 Botnet C2: ${b.ip}`,
        desc:`${b.malware||'Malware'} C2 · Port ${b.port||'?'} · ${b.country}`,
        url:b.url, meta:{source:'Feodo Tracker',ip:b.ip} })
    })
  }

  // ── Worldwide cyber threats + vulnerable infrastructure ─────────────────
  if (layers.cyber) {
    // Full 60-country geo-lookup
    const CLOCS = {
      'US':[37.1,-95.7],'CN':[35.8,104.2],'RU':[55.7,37.6],'DE':[51.2,10.4],
      'NL':[52.1,5.3],'GB':[51.5,-0.1],'FR':[46.2,2.2],'UA':[48.4,31.2],
      'BR':[-14.2,-51.9],'KR':[35.9,127.8],'JP':[36.2,138.3],'IN':[20.6,78.9],
      'SG':[1.35,103.8],'AU':[-25.3,133.8],'CA':[56.1,-106.3],'IT':[41.9,12.5],
      'ES':[40.4,-3.7],'PL':[51.9,19.1],'TR':[38.9,35.2],'IR':[32.4,53.7],
      'SE':[59.3,18.1],'NO':[59.9,10.7],'FI':[60.2,24.9],'DK':[55.7,12.6],
      'BE':[50.8,4.4],'CH':[46.9,7.4],'AT':[48.2,16.4],'CZ':[50.1,14.4],
      'RO':[44.4,26.1],'HU':[47.5,19.1],'SK':[48.1,17.1],'BG':[42.7,23.3],
      'MX':[23.6,-102.6],'AR':[-34.6,-58.4],'CO':[4.7,-74.1],'CL':[-33.5,-70.7],
      'ZA':[-25.7,28.2],'NG':[9.1,8.7],'EG':[30.0,31.2],'KE':[-1.3,36.8],
      'SA':[24.7,46.7],'AE':[24.5,54.4],'IL':[31.8,35.2],'PK':[30.4,69.3],
      'BD':[23.7,90.4],'TH':[13.8,100.5],'VN':[14.1,108.3],'ID':[-0.8,113.9],
      'PH':[12.9,121.8],'MY':[3.1,101.7],'TW':[23.7,120.9],'HK':[22.3,114.2],
      'NZ':[-40.9,174.9],'AR_2':[-38.4,-63.6],'PT':[38.7,-9.1],'GR':[37.98,23.7],
      'CS':[44.0,21.0],'LV':[56.9,24.1],'LT':[55.2,23.9],'EE':[58.6,25.0],
      'KZ':[48.0,66.9],'UZ':[41.3,64.6],'AZ':[40.4,49.9],'GE':[42.3,43.4],
    }
    const j = () => (Math.random()-0.5)*5

    const getCo = (countryCode) => {
      if (!countryCode) return null
      const code = countryCode.toString().toUpperCase().slice(0,2)
      return CLOCS[code] || null
    }

    const getCoByName = (countryName) => {
      if (!countryName) return null
      const name = countryName.toLowerCase()
      const MAP = {
        'united states':CLOCS['US'],'russia':CLOCS['RU'],'china':CLOCS['CN'],
        'germany':CLOCS['DE'],'netherlands':CLOCS['NL'],'united kingdom':CLOCS['GB'],
        'france':CLOCS['FR'],'ukraine':CLOCS['UA'],'brazil':CLOCS['BR'],
        'south korea':CLOCS['KR'],'japan':CLOCS['JP'],'india':CLOCS['IN'],
        'singapore':CLOCS['SG'],'australia':CLOCS['AU'],'canada':CLOCS['CA'],
        'iran':CLOCS['IR'],'turkey':CLOCS['TR'],'north korea':CLOCS['KR'],
        'israel':CLOCS['IL'],'taiwan':CLOCS['TW'],'indonesia':CLOCS['ID'],
        'hong kong':CLOCS['HK'],'poland':CLOCS['PL'],'romania':CLOCS['RO'],
      }
      for (const [k,v] of Object.entries(MAP)) { if (name.includes(k)) return v }
      return null
    }

    // 1. Feodo botnet C2 — active C2 servers by country (Abuse.ch feed)
    ;(satData.botnetC2||[]).forEach(b => {
      const co = getCo(b.country) || getCoByName(b.country)
      if (!co) return
      pts.push({
        lat:co[0]+j(), lng:co[1]+j(), type:'cyber', severity:'high',
        name:`💻 Botnet C2: ${b.ip||b.title?.split(':')[1]?.trim()||'Server'}`,
        desc:`${b.malware||'Malware'} C2 · Port ${b.port||'?'} · First: ${b.date||b.firstSeen||'?'}`,
        url:b.url, meta:{ source:'Feodo Tracker', ip:b.ip, country:b.country },
        _fetchedAt:b._fetchedAt,
      })
    })

    // 2. CISA KEV — critically exploited vulnerabilities (scatter across major tech nations)
    const KEV_LOCS = [
      CLOCS['US'],CLOCS['GB'],CLOCS['DE'],CLOCS['JP'],CLOCS['CN'],
      CLOCS['FR'],CLOCS['AU'],CLOCS['CA'],CLOCS['NL'],CLOCS['IN'],
      CLOCS['KR'],CLOCS['SE'],CLOCS['CH'],CLOCS['SG'],CLOCS['BR'],
    ]
    ;(satData.kev||[]).forEach((v, i) => {
      const co = KEV_LOCS[i % KEV_LOCS.length]
      pts.push({
        lat:co[0]+j(), lng:co[1]+j(), type:'cve', severity:'critical',
        name:`⚠️ KEV: ${v.vulnerabilityName||v.title||v.cveID}`,
        desc:`${v.vendorProject||''} ${v.product||''} · ${v.shortDescription||v.description||''}`.slice(0,300),
        url:v.url, meta:{ source:'CISA KEV', cveID:v.cveID||v.id },
        _fetchedAt:v._fetchedAt,
      })
    })

    // 3. NVD Recent CVEs — plotted realistically across affected regions
    // High CVSS = scatter more widely (network-level vulns affect global infra)
    ;(satData.recentCVEs||[]).slice(0,60).forEach((cve, i) => {
      const cvss = parseFloat(cve.cvss||0)
      const allLocs = Object.values(CLOCS)
      const co = cvss >= 9
        ? allLocs[i % allLocs.length]
        : cvss >= 7
          ? KEV_LOCS[i % KEV_LOCS.length]
          : CLOCS['US']
      pts.push({
        lat:co[0]+j(), lng:co[1]+j(), type:'cve',
        severity: cvss >= 9 ? 'critical' : 'high',
        name:`⚠️ CVE-${cve.id?.replace('CVE-','')||i} (CVSS ${cve.cvss||'?'})`,
        desc:(cve.description||'').slice(0,280),
        url:cve.url, meta:{ source:'NVD CVE', cveID:cve.id, cvss:cve.cvss },
      })
    })

    // 4. OTX AlienVault pulses — targeted countries (most precise geo)
    ;(satData.otxPulses||[]).forEach(p => {
      ;(p.targetedCountries||[]).forEach(country => {
        const co = getCoByName(country) || getCo(country)
        if (!co) return
        pts.push({
          lat:co[0]+j(), lng:co[1]+j(), type:'cyber', severity:p.severity||'high',
          name:`🎯 OTX: ${p.name?.slice(0,60)}`,
          desc:`${(p.description||'').slice(0,200)} · ${p.indicatorCount||0} indicators · ${(p.malwareFamilies||[]).join(', ')}`,
          url:p.url, meta:{ source:'AlienVault OTX' },
        })
      })
    })

    // 5. CISA alerts — US-based (scatter across US regions)
    const US_CITIES = [
      [37.4,-122.1],[47.6,-122.3],[40.7,-74.0],[33.7,-84.4],
      [41.9,-87.6],[29.7,-95.4],[32.7,-97.3],[39.1,-94.6],
    ]
    ;(satData.cyber||[]).filter(c=>c.source==='CISA US-CERT').forEach((c, i) => {
      const co = US_CITIES[i % US_CITIES.length]
      pts.push({
        lat:co[0]+j(), lng:co[1]+j(), type:'cyber', severity:c.severity||'high',
        name:`💻 CISA: ${c.title?.slice(0,60)}`,
        desc:(c.description||'').slice(0,280),
        url:c.url, meta:{ source:'CISA US-CERT' },
        _fetchedAt:c._fetchedAt,
      })
    })

    // 6. URLhaus — malicious URLs by known malware hosting regions
    const MALWARE_HOSTING = [
      CLOCS['RU'],CLOCS['CN'],CLOCS['UA'],CLOCS['NL'],CLOCS['US'],
      CLOCS['DE'],CLOCS['FR'],CLOCS['HK'],CLOCS['SG'],CLOCS['BR'],
    ]
    ;(satData.maliciousURLs||[]).filter(u=>u.url).slice(0,80).forEach((u, i) => {
      const co = MALWARE_HOSTING[i % MALWARE_HOSTING.length]
      pts.push({
        lat:co[0]+j(), lng:co[1]+j(), type:'cyber', severity:'high',
        name:`🦠 Malware: ${u.host||u.url?.slice(8,45)||'server'}`,
        desc:`${u.threat||'Malware'} distribution · ${u.url?.slice(0,180)}`,
        url:u.urlhausLink||u.url,
        meta:{ source:'URLhaus', host:u.host },
      })
    })
  }

  // Exposed infrastructure (Shodan/GreyNoise/Censys) — separate 'vuln' layer
  if (layers.vuln) {
    const CLOCS_V = {
      'US':[37.1,-95.7],'CN':[35.8,104.2],'RU':[55.7,37.6],'DE':[51.2,10.4],
      'NL':[52.1,5.3],'GB':[51.5,-0.1],'FR':[46.2,2.2],'UA':[48.4,31.2],
      'BR':[-14.2,-51.9],'KR':[35.9,127.8],'JP':[36.2,138.3],'IN':[20.6,78.9],
      'SG':[1.35,103.8],'AU':[-25.3,133.8],'CA':[56.1,-106.3],'TR':[38.9,35.2],
      'IR':[32.4,53.7],'IL':[31.8,35.2],'PL':[51.9,19.1],'RO':[44.4,26.1],
    }
    const jv = () => (Math.random()-0.5)*5
    const getCoV = (code) => {
      if (!code) return null
      const k = code.toString().toUpperCase().slice(0,2)
      return CLOCS_V[k] || null
    }
    const getCoNameV = (name) => {
      if (!name) return null
      const n = name.toLowerCase()
      const M = {'united states':CLOCS_V['US'],'russia':CLOCS_V['RU'],'china':CLOCS_V['CN'],
        'germany':CLOCS_V['DE'],'netherlands':CLOCS_V['NL'],'united kingdom':CLOCS_V['GB'],
        'france':CLOCS_V['FR'],'ukraine':CLOCS_V['UA'],'iran':CLOCS_V['IR'],
        'israel':CLOCS_V['IL'],'turkey':CLOCS_V['TR'],'india':CLOCS_V['IN'],
        'south korea':CLOCS_V['KR'],'brazil':CLOCS_V['BR'],'canada':CLOCS_V['CA'],
      }
      for(const [k,v] of Object.entries(M)) if(n.includes(k)) return v
      return null
    }
    ;(satData.shodanLatest||[]).forEach(host => {
      const co = getCoV(host.country) || getCoNameV(host.country) || CLOCS_V['US']
      const hasVulns = host.vulns?.length > 0
      const label = host._count ? `${host.country}: ${host._count} exposed` : (host.ip||'Host')
      pts.push({
        lat:co[0]+jv(), lng:co[1]+jv(), type:'vuln',
        severity: hasVulns ? 'critical' : 'high',
        name:`🔓 ${host._source||'Shodan'}: ${label}`,
        desc:`${hasVulns?'CVEs: '+host.vulns.slice(0,5).join(', ')+' · ':''}${host.product||host.org||''} · ${host.country||''}`,
        url: host.ip ? `https://www.shodan.io/host/${host.ip}` : 'https://www.shodan.io',
        meta:{ source:host._source||'Shodan', ip:host.ip, country:host.country, vulns:host.vulns },
      })
    })
    ;(satData.censysAnomalous||[]).forEach(host => {
      if (!host.ip) return
      const co = getCoV(host.country?.slice(0,2)) || CLOCS_V['US']
      pts.push({
        lat:co[0]+jv(), lng:co[1]+jv(), type:'vuln', severity:'high',
        name:`🔍 Censys: ${host.ip}`,
        desc:`Services: ${(host.services||[]).join(', ')} · ${host.org||''} · Labels: ${(host.labels||[]).join(', ')}`,
        url:host.url||`https://search.censys.io/hosts/${host.ip}`,
        meta:{ source:'Censys', ip:host.ip },
      })
    })
  }

  // Maritime incidents (EMSA) — geo-inferred from title/description
  if (layers.maritime) {
    const MLOCS = {
      'mediterranean':[37.0,18.0],'aegean':[38.5,25.5],'adriatic':[43.0,16.5],
      'black sea':[43.0,34.0],'red sea':[20.0,38.0],'arabian sea':[20.0,62.0],
      'persian gulf':[26.5,53.0],'gulf of aden':[12.0,46.0],'hormuz':[26.6,56.3],
      'strait of malacca':[3.0,102.0],'south china sea':[15.0,114.0],'yellow sea':[35.0,123.0],
      'east china sea':[28.0,124.0],'bay of bengal':[15.0,87.0],'indian ocean':[-15.0,70.0],
      'atlantic':[40.0,-30.0],'north sea':[55.0,3.0],'baltic':[58.0,20.0],
      'english channel':[50.5,-1.5],'bosphorus':[41.1,29.0],'suez':[30.5,32.3],
      'cape horn':[-56.0,-67.0],'cape of good hope':[-34.4,18.5],'gulf of mexico':[24.0,-90.0],
      'bering sea':[58.0,-170.0],'norwegian sea':[68.0,5.0],'barents sea':[73.0,36.0],
      'ukraine':[46.5,30.5],'crimea':[45.0,34.0],'nato':[51.5,-0.1],'russia':[55.7,37.6],
      'iran':[26.5,53.0],'houthi':[14.0,44.5],'somali':[7.0,48.0],'piracy':[7.0,48.0],
    }
    ;(satData.maritime||[]).forEach(m => {
      // Use existing coords if available, otherwise geo-infer
      let lat = m.lat, lng = m.lng
      if (!lat||!lng) {
        const t = ((m.title||'')+(m.description||'')).toLowerCase()
        for(const [k,co] of Object.entries(MLOCS)){if(t.includes(k)){[lat,lng]=co;break}}
      }
      if (!lat||!lng){lat=0;lng=0} // equator/prime meridian as fallback
      const j=()=>(Math.random()-0.5)*4
      pts.push({ lat:lat+j(), lng:lng+j(), type:'maritime', severity:m.severity||'medium',
        name:`⚓ ${m.title?.slice(0,60)}`, desc:m.description?.slice(0,300), url:m.url,
        meta:{source:'EMSA'}, _fetchedAt:m._fetchedAt })
    })
  }

  // Reddit breaking signals — keyword geo-infer
  if (layers.redditSignals) {
    const RLOCS = {
      ukraine:[48.4,31.2],russia:[55.7,37.6],gaza:[31.4,34.4],israel:[31,34.9],
      iran:[32.4,53.7],china:[35.8,104.2],taiwan:[23.7,121],'north korea':[40.3,127.5],
      syria:[34.8,38.9],yemen:[15.5,48.5],sudan:[15,30],myanmar:[21.9,95.9],
    }
    ;(satData.redditSignals||[]).filter(r=>r.score>500).forEach(r => {
      const t=(r.title||'').toLowerCase()
      for(const [kw,co] of Object.entries(RLOCS)) {
        if(t.includes(kw)) {
          const j=()=>(Math.random()-0.5)*3
          pts.push({ lat:co[0]+j(), lng:co[1]+j(), type:'social',
            severity:r.score>5000?'high':'medium',
            name:`📡 Reddit: ${r.title?.slice(0,70)}`,
            desc:`r/${r.subreddit} · ${r.score.toLocaleString()} upvotes`,
            url:r.url, meta:{source:'Reddit',subreddit:r.subreddit,score:r.score} })
          break
        }
      }
    })
  }

  // Crowd / Protest + ACLED conflict events
  if (layers.crowds && satData.crowds) {
    satData.crowds.forEach(c => {
      if (!c.lat || !c.lng) return
      pts.push({
        lat: c.lat, lng: c.lng,
        type: c.type || 'crowd',
        severity: c.severity || 'medium',
        name: (c.title || 'Event').slice(0, 80),
        desc: [c.actors, c.detail, c.fatalities > 0 ? c.fatalities + ' fatalities' : ''].filter(Boolean).join(' · ').slice(0, 250),
        source: c.source || 'ACLED',
        url: c.url || 'https://acleddata.com',
        icon: c.icon || (c.type === 'crowd' ? '👥' : '⚔️'),
        fatalities: c.fatalities || 0,
        date: c.date,
      })
    })
  }


  return pts
}

export const SAT_COLORS = {
  earthquake:          0xff6600,
  eonet_wildfire:      0xff3300,
  eonet_severe_storms: 0x8888ff,
  eonet_volcanoes:     0xff2200,
  eonet_sea_and_lake_ice: 0x88ccff,
  eonet_other:         0xaaaaff,
  gdacs:               0xffaa00,
  hurricane:           0xcc44ff,
  volcano:             0xff2200,
  flood:               0x0044ff,
  weather:             0x4488ff,
  copernicus:          0x00ccff,
  sigmet:              0xffff00,
  aircraft:            0x00ffcc,
  ship:                0x0088ff,
  firms:               0xff4400,
  iss:                 0xffffff,
  launch:              0xff8800,
  disease:             0x22cc88,
  cyber:               0xff00ff,
  nuclear:             0xffff00,
  maritime:            0x0055cc,
  humanitarian:        0xff8800,
  social:              0xff6600,
  vuln:                0xff6600,   // orange — exposed infrastructure
  cve:                 0xffaa00,
  milaircraft:         0xff4444,   // red — military aircraft
  warship:             0x8888ff,   // blue-purple — warships
  acled:               0xff1111,   // bright red — conflict events
  hotspot:             0xff3333,
  gpsjam:              0xf59e0b,
  notam:               0xff8844,
  news:                0x2dd4bf,
  telegram:            0x2dd4bf,
  wikiEdit:            0xaaaaff,
  bgp:                 0xff6600,
  viirs:               0xffffff,
  preaction:           0xf59e0b,
}

export const SAT_ICONS = {
  earthquake:'⚡', eonet_wildfire:'🔥', eonet_severe_storms:'⛈',
  eonet_volcanoes:'🌋', hurricane:'🌀', flood:'🌊', volcano:'🌋',
  weather:'⛈', copernicus:'🛰', sigmet:'✈', aircraft:'✈', ship:'🚢',
  firms:'🔥', iss:'🛸', launch:'🚀', gdacs:'⚠',
  disease:'🦠', cyber:'💻', nuclear:'☢️', maritime:'⚓', humanitarian:'🆘', social:'📡',
  vuln:'🔓', cve:'⚠️',
  milaircraft:'✈', warship:'⚔', acled:'⚔️', hotspot:'🎯',
  gpsjam:'📡', news:'📰', notam:'✈', telegram:'📡', wikiEdit:'📝', bgp:'🌐', viirs:'🛰',
  preaction:'⚡',
}

// ── Default export — auto-selects Supabase or legacy based on env ────────────
// useSatellite exported above
export { useSatelliteLegacy }
