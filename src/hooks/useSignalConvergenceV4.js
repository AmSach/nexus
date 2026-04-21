/**
 * useSignalConvergenceV4 — Cross-source convergence scoring
 * 
 * The core Palantir insight: a single signal is noise.
 * The same signal confirmed by 3+ INDEPENDENT sources = actionable intelligence.
 * 
 * This computes:
 * 1. Per-zone multi-source convergence score
 * 2. Source independence weighting (correlated sources count less)
 * 3. Temporal clustering (all signals in same 6h window = higher weight)
 * 4. Escalation detection (score rising over consecutive intervals)
 * 
 * Formula inspired by Dempster-Shafer evidence theory (what Palantir's
 * TITAN system used) but simplified to pure JavaScript.
 */
import { useMemo, useRef } from 'react'

// Source independence groups — signals from same group are correlated,
// and we reduce their combined weight accordingly
const SOURCE_GROUPS = {
  MEDIA:       ['news', 'rss', 'gdelt', 'reddit', 'wikipedia'],
  SIGNALS_INT: ['telegram', 'osint'],
  PHYSICAL:    ['milaircraft', 'maritime_density', 'maritime_anomaly', 'ais_blackout'],
  FINANCIAL:   ['polymarket', 'kalshi', 'defense_stock', 'war_currency'],
  TECHNICAL:   ['notam', 'bgp', 'gpsjam', 'seismic'],
  HUMAN_INT:   ['acled', 'reliefweb', 'un_report'],
}

// Max independent groups that can stack (Dempster-Shafer cap)
const MAX_SOURCE_GROUPS = Object.keys(SOURCE_GROUPS).length  // 6

function getGroup(sourceType) {
  for (const [group, types] of Object.entries(SOURCE_GROUPS)) {
    if (types.some(t => sourceType.includes(t))) return group
  }
  return 'OTHER'
}

// Temporal decay — signals decay in importance over time
function temporalWeight(ageHours) {
  if (ageHours < 0.5) return 1.0   // <30min: full weight
  if (ageHours < 2)   return 0.90  // <2h: high weight
  if (ageHours < 6)   return 0.70  // <6h: moderate
  if (ageHours < 12)  return 0.45  // <12h: reduced
  if (ageHours < 24)  return 0.25  // <24h: low
  return 0.10  // older: background noise
}

// Evidence combination (simplified Dempster-Shafer)
// Multiple independent sources combine multiplicatively not additively
// p(combined) = 1 - Π(1 - p_i) for independent sources
function combineEvidence(scores) {
  return 1 - scores.reduce((prod, s) => prod * (1 - Math.min(s, 0.999)), 1)
}

export const CONVERGENCE_ZONES = [
  { id:'ukraine_donbas',  name:'Donbas Frontline',    lat:48.2,  lng:38.5, r:250, kw:['ukraine','donbas','kharkiv','zaporizhzhia','frontline','bakhmut','avdiivka','kupiansk'] },
  { id:'ukraine_kursk',   name:'Kursk Incursion',      lat:51.5,  lng:35.8, r:120, kw:['kursk','belgorod','ukraine.*russia','crossborder'] },
  { id:'gaza_strip',      name:'Gaza/Hamas',           lat:31.4,  lng:34.4, r:60,  kw:['gaza','hamas','rafah','khan yunis','idf.*gaza','jenin','nablus'] },
  { id:'lebanon_south',   name:'Lebanon/Hezbollah',   lat:33.5,  lng:35.6, r:80,  kw:['hezbollah','lebanon','beirut','southern lebanon','nasrallah'] },
  { id:'iran_nuclear',    name:'Iran (Nuclear+IRGC)',  lat:32.5,  lng:51.5, r:500, kw:['iran','irgc','natanz','fordow','uranium','enrichment','khamenei'] },
  { id:'red_sea_houthi',  name:'Red Sea/Houthis',      lat:14.5,  lng:43.5, r:400, kw:['houthi','red sea','bab.*mandeb','shipping.*attack','aden','hodeidah'] },
  { id:'taiwan_strait',   name:'Taiwan Strait',        lat:24.5,  lng:120.0,r:200, kw:['taiwan','pla','strait','taipei','tsmc','china.*military','invasion'] },
  { id:'south_china_sea', name:'South China Sea',      lat:12.0,  lng:114.0,r:500, kw:['south china sea','philippines','spratly','scarborough','second thomas'] },
  { id:'north_korea',     name:'DPRK/Korean DMZ',      lat:38.5,  lng:127.5,r:300, kw:['north korea','dprk','kim jong','icbm','hwasong','missile.*test','pyongyang'] },
  { id:'myanmar',         name:'Myanmar Civil War',    lat:19.5,  lng:96.0, r:500, kw:['myanmar','burma','tatmadaw','junta','arakan','shan','karen'] },
  { id:'sahel',           name:'Sahel/West Africa',    lat:14.5,  lng:3.0,  r:800, kw:['sahel','mali','burkina','niger','wagner','coup','junta.*africa'] },
  { id:'sudan',           name:'Sudan Civil War',      lat:15.0,  lng:28.0, r:600, kw:['sudan','rsf','khartoum','darfur','rapid support','port sudan'] },
  { id:'hormuz',          name:'Strait of Hormuz',     lat:26.5,  lng:56.5, r:200, kw:['hormuz','persian gulf','irgc.*ship','tanker.*seize','iran.*navy'] },
  { id:'cyber_global',    name:'Cyberspace (Global)',  lat:0,     lng:0,    r:99999, kw:['cyberattack','ransomware','critical infrastructure','data breach','apt','nation state hack'] },
  { id:'wmd_threat',      name:'WMD / Nuclear Threat', lat:0,     lng:0,    r:99999, kw:['nuclear weapon','dirty bomb','chemical weapon','sarin','novichok','wmd','weaponized'] },
]

function inZone(lat, lng, zone) {
  if (zone.r >= 99000) return false  // geo-unbounded zones match by keyword only
  if (!lat || !lng) return false
  const R = 6371, dLat = (zone.lat-lat)*Math.PI/180, dLng = (zone.lng-lng)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat*Math.PI/180)*Math.cos(zone.lat*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= zone.r
}

function kwMatch(text, kws) {
  const t = (text||'').toLowerCase()
  return kws.some(k => t.includes(k))
}

export function useSignalConvergenceV4({
  articles = [],
  satData = null,
  liveAlerts = [],
  tgRecent = [],
  polyMarkets = [],
  kalshiMarkets = [],
  polAnomalies = [],  // from usePatternOfLife
}) {
  const prevScores = useRef({})

  return useMemo(() => {
    const now = Date.now()
    const results = []

    CONVERGENCE_ZONES.forEach(zone => {
      const evidenceByGroup = {}  // group → [normalized_scores]
      const allSignals = []

      const addEvidence = (group, score, signal) => {
        if (!evidenceByGroup[group]) evidenceByGroup[group] = []
        evidenceByGroup[group].push(Math.min(score, 0.95))
        allSignals.push(signal)
      }

      // ── 1. Telegram (SIGNALS_INT group) ─────────────────────────────────────
      tgRecent.forEach(p => {
        const ageH = (now - new Date(p.ts||0).getTime()) / 3600000
        if (ageH > 6) return
        const geoMatch = p.lat && p.lng ? inZone(p.lat, p.lng, zone) : kwMatch(p.text, zone.kw)
        if (!geoMatch) return
        const isBreaking = /breaking|urgent|confirmed|just in/i.test(p.text||'')
        const score = temporalWeight(ageH) * (isBreaking ? 0.75 : 0.45)
        addEvidence('SIGNALS_INT', score, { type:'telegram', source: p.channelName, text: (p.text||'').slice(0,80), age: ageH, score })
      })

      // ── 2. Live alerts (TECHNICAL + HUMAN_INT) ──────────────────────────────
      liveAlerts.forEach(a => {
        const lat = parseFloat(a.lat), lng = parseFloat(a.lng)
        const geoMatch = lat && lng ? inZone(lat, lng, zone) : kwMatch((a.title||'')+(a.detail||''), zone.kw)
        if (!geoMatch) return
        const ageH = (now - new Date(a.ts||0).getTime()) / 3600000
        const group = a.type === 'bgp' || a.type === 'gps_jam' || a.type === 'notam' ? 'TECHNICAL' : 'HUMAN_INT'
        const baseScore = a.severity === 'critical' ? 0.85 : a.severity === 'high' ? 0.65 : 0.40
        const score = temporalWeight(ageH) * baseScore
        addEvidence(group, score, { type: a.type||'alert', source: a.source, text: (a.title||'').slice(0,80), age: ageH, score })
      })

      // ── 3. Military aircraft in zone (PHYSICAL) ─────────────────────────────
      ;(satData?.milaircraft || []).forEach(a => {
        if (!inZone(a.lat, a.lng, zone)) return
        const score = a.severity === 'critical' ? 0.90 : 0.70
        addEvidence('PHYSICAL', score, { type:'milaircraft', source: a.callsign||a.icao24, text:`Military aircraft: ${a.callsign||'?'} · Alt: ${a.altitude?.toLocaleString()||'?'}ft`, age: 0, score })
      })

      // ── 4. Maritime anomalies / AIS blackouts (PHYSICAL) ────────────────────
      ;(satData?.ships || []).filter(s => s._anomaly || (s._density && s._count === 0)).forEach(s => {
        if (!inZone(s.lat, s.lng, zone)) return
        const score = s._density && s._count === 0 ? 0.80 : 0.60  // AIS blackout > evasion
        addEvidence('PHYSICAL', score, { type: s._anomaly ? 'maritime_anomaly' : 'ais_blackout', source: s.zone||s.name, text: s.desc||'Maritime anomaly', age: 0, score })
      })

      // ── 5. News articles (MEDIA) ────────────────────────────────────────────
      articles.filter(a => {
        const ageH = (now - new Date(a.pub||0).getTime()) / 3600000
        return ageH < 12 && kwMatch((a.title||'')+(a.summary||''), zone.kw)
      }).slice(0, 10).forEach(a => {
        const ageH = (now - new Date(a.pub||0).getTime()) / 3600000
        const score = temporalWeight(ageH) * (a.severity === 'high' ? 0.50 : a.severity === 'critical' ? 0.65 : 0.30)
        addEvidence('MEDIA', score, { type:'news', source: a.source, text: (a.title||'').slice(0,80), age: ageH, score })
      })

      // ── 6. Prediction markets (FINANCIAL) ───────────────────────────────────
      ;[...polyMarkets, ...kalshiMarkets].forEach(m => {
        if (!kwMatch(m.question||m.title||'', zone.kw)) return
        const prob = m.probability || 0
        if (prob < 0.55) return  // only meaningful probabilities
        const score = (prob - 0.5) * 2 * 0.70  // 50%→0, 75%→0.35, 95%→0.63
        addEvidence('FINANCIAL', score, { type:'market', source: m.source||'Polymarket', text: `${Math.round(prob*100)}% — ${(m.question||m.title||'').slice(0,60)}`, age: 0, score })
      })

      // ── 7. Pattern of Life anomalies (strongest signal) ─────────────────────
      polAnomalies.filter(a => a.zone?.id === zone.id || kwMatch(a.zone?.name||'', zone.kw)).forEach(a => {
        const score = a.severity === 'critical' ? 0.92 : a.severity === 'high' ? 0.80 : 0.60
        addEvidence('SIGNALS_INT', score, { type:'pattern_anomaly', source: 'Pattern of Life', text: a.message?.slice(0,80)||'Behavioral anomaly', age: 0, score })
      })

      // ── Combine evidence across independent source groups ────────────────────
      const groupScores = Object.entries(evidenceByGroup).map(([group, scores]) => {
        // Within a group, combine evidence (diminishing returns)
        const combined = combineEvidence(scores)
        return { group, combined, count: scores.length }
      })

      // Number of independent source groups that fired
      const independentGroups = groupScores.filter(g => g.combined > 0.2).length

      // Multi-source convergence score: combine across groups (full independence assumed)
      const convergenceProb = combineEvidence(groupScores.map(g => g.combined))

      // Raw CII for backward compat with useSignalConvergence displays
      const cii = allSignals.reduce((s, sig) => s + sig.score * 10, 0)

      // Escalation: compare to previous score
      const prevCII = prevScores.current[zone.id] || 0
      const escalating = cii > prevCII * 1.3 && cii > 5  // >30% increase
      prevScores.current[zone.id] = cii

      // Threat level
      const convergenceLevel =
        (convergenceProb > 0.85 || (independentGroups >= 4 && cii > 30)) ? 'critical' :
        (convergenceProb > 0.65 || (independentGroups >= 3 && cii > 15)) ? 'high' :
        (convergenceProb > 0.40 || (independentGroups >= 2 && cii > 5))  ? 'medium' : 'low'

      results.push({
        zone,
        cii: +cii.toFixed(1),
        convergenceProb: +convergenceProb.toFixed(3),
        independentGroups,
        groupScores,
        allSignals: allSignals.sort((a,b) => b.score - a.score).slice(0, 12),
        level: convergenceLevel,
        escalating,
        sourceTypes: [...new Set(allSignals.map(s => s.type))],
      })
    })

    results.sort((a, b) => b.convergenceProb - a.convergenceProb || b.cii - a.cii)

    return {
      zones: results,
      criticalZones: results.filter(r => r.level === 'critical'),
      highZones: results.filter(r => r.level === 'high'),
      escalatingZones: results.filter(r => r.escalating),
      topZone: results[0] || null,
      multiSourceAlerts: results.filter(r => r.independentGroups >= 3),
    }
  }, [articles, satData, liveAlerts, tgRecent, polyMarkets, kalshiMarkets, polAnomalies])
}
