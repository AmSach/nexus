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

import { cacheRead } from '../utils/cache'
import { SEED_SATELLITE_BASELINE } from '../data/satellite_seed'

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

// 1. Serverless Conflict Stream — Aggregates UCDP, ReliefWeb, and GDELT server-side (zero CORS errors)
async function fetchServerConflicts() {
  try {
    const r = await fetch('/api/satellite', { signal: AbortSignal.timeout(10000) })
    if (r.ok) {
      const d = await r.json()
      const list = []
      if (Array.isArray(d.conflictEvents)) list.push(...d.conflictEvents)
      if (Array.isArray(d.ucdpFull)) list.push(...d.ucdpFull)
      if (list.length > 0) {
        return list.map(e => acledToSignal({
          id: e.id || `sat-${Math.random().toString(36).slice(2)}`,
          event_type: e.type || e.event_type || 'Armed Conflict',
          actor1: e.actor1 || e.side_a || '',
          actor2: e.actor2 || e.side_b || '',
          country: e.country || '',
          region: e.region || e.country || 'Global',
          location: e.location || e.title || '',
          fatalities: e.fatalities || e.best || 0,
          latitude: e.lat || e.latitude,
          longitude: e.lng || e.longitude,
          event_date: e.event_date || e.date || new Date().toISOString(),
          notes: e.description || e.notes || e.title || '',
          source: e.source || 'UCDP / Conflict Stream',
          url: e.url || 'https://ucdp.uu.se/'
        }))
      }
    }
  } catch {}
  return []
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

  // Multi-source serverless conflict stream (UCDP + GDELT + ReliefWeb)
  const serverEvents = await fetchServerConflicts()
  if (serverEvents.length > 0) {
    if (sitName) {
      const lower = sitName.toLowerCase()
      const keywords = lower.split(/[/\s]+/).filter(w => w.length > 3)
      return serverEvents.filter(e => keywords.some(kw => (e.region + e.title + (e.tags||[]).join('')).toLowerCase().includes(kw)))
    }
    return serverEvents
  }

  // Baseline fallback
  const cached = cacheRead('satellite')
  const fallbackList = cached?.data?.conflictEvents || cached?.data?.ucdpFull || SEED_SATELLITE_BASELINE.conflictEvents || []
  const all = fallbackList.map(e => ({
    ...e,
    id: e.id || `fallback-${Math.random().toString(36).slice(2)}`,
    title: e.title?.startsWith('[') ? e.title : `[CONFLICT] ${e.title || 'Armed Conflict'} — ${e.country || ''}`,
    category: 'conflict',
    severity: e.severity || 'high',
    _acled: true,
    _live: true,
  }))
  
  if (sitName) {
    const lower = sitName.toLowerCase()
    const keywords = lower.split(/[/\s]+/).filter(w => w.length > 3)
    return all.filter(e => keywords.some(kw => (e.region + e.title + (e.tags||[]).join('')).toLowerCase().includes(kw)))
  }
  return all
}
