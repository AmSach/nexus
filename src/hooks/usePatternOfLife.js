/**
 * usePatternOfLife — Gotham-style behavioral baseline + deviation detection
 * 
 * For each situation zone, maintains a rolling 7-day signal frequency baseline.
 * Alerts when current signal rate deviates >2σ from baseline.
 * This is pure statistics — no AI, no LLM, deterministic.
 * 
 * Palantir Gotham's core: "Pattern of Life" analysis was fundamentally
 * this math applied to human movement + communication metadata.
 * We apply it to open-source signal streams.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { cacheRead, cacheWrite } from '../utils/cache'

const CACHE_KEY = 'pol-baseline-v2'
const HISTORY_DAYS = 7
const BUCKET_HOURS = 1   // 1-hour buckets
const BUCKETS_TOTAL = HISTORY_DAYS * 24

// Zones with geo bounds for signal attribution
export const POL_ZONES = [
  { id:'ukraine_east',  name:'E. Ukraine Frontline',  lat:48.2,  lng:38.5,  r:300 },
  { id:'ukraine_kursk', name:'Kursk Incursion',        lat:51.7,  lng:35.9,  r:150 },
  { id:'gaza',          name:'Gaza Strip',             lat:31.4,  lng:34.4,  r:50  },
  { id:'west_bank',     name:'West Bank',              lat:32.0,  lng:35.2,  r:80  },
  { id:'lebanon',       name:'Lebanon/Hezbollah',      lat:33.5,  lng:35.6,  r:100 },
  { id:'iran',          name:'Iran Nuclear Sites',     lat:32.5,  lng:51.5,  r:400 },
  { id:'red_sea',       name:'Red Sea/Bab-el-Mandeb',  lat:14.0,  lng:43.0,  r:400 },
  { id:'hormuz',        name:'Strait of Hormuz',       lat:26.5,  lng:56.5,  r:150 },
  { id:'taiwan_strait', name:'Taiwan Strait',          lat:24.5,  lng:120.0, r:200 },
  { id:'south_china_sea',name:'South China Sea',       lat:12.0,  lng:114.0, r:500 },
  { id:'north_korea',   name:'Korean Peninsula',       lat:38.5,  lng:127.5, r:300 },
  { id:'sahel',         name:'Sahel Belt',             lat:14.5,  lng:3.0,   r:800 },
  { id:'myanmar',       name:'Myanmar',                lat:19.5,  lng:96.0,  r:500 },
  { id:'sudan',         name:'Sudan/Darfur',           lat:15.0,  lng:28.0,  r:600 },
  { id:'hormuz_irgc',   name:'Persian Gulf IRGC',      lat:26.0,  lng:54.0,  r:200 },
]

// Signal types and their baseline weights
const SIGNAL_WEIGHTS = {
  telegram_conflict: 1.0,    // Telegram conflict keyword post
  telegram_breaking: 2.0,    // Telegram "breaking" / urgent
  military_aircraft: 4.0,    // Military aircraft in zone
  maritime_anomaly:  3.5,    // AIS blackout or evasion
  news_conflict:     0.8,    // RSS/GDELT article with conflict keywords
  alert_critical:    5.0,    // Critical live alert in zone
  alert_high:        3.0,    // High live alert in zone
  prediction_spike:  2.5,    // Prediction market >70% probability
  notam_military:    2.0,    // Military NOTAM in area
  seismic_near_base: 6.0,    // Seismic near known military/nuclear site
}

// Distance between two lat/lng points in km (haversine)
function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function inZone(lat, lng, zone) {
  if (!lat || !lng) return false
  return distKm(lat, lng, zone.lat, zone.lng) <= zone.r
}

// Statistical helpers
function mean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0 }
function stddev(arr) {
  const m = mean(arr)
  return arr.length < 2 ? 0 : Math.sqrt(arr.reduce((s,x)=>s+(x-m)**2,0)/(arr.length-1))
}
function zScore(value, arr) {
  const sd = stddev(arr)
  return sd < 0.01 ? 0 : (value - mean(arr)) / sd
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function usePatternOfLife({ satData, liveAlerts = [], tgRecent = [], articles = [], polyMarkets = [] }) {
  const [anomalies, setAnomalies] = useState([])
  const [baseline, setBaseline] = useState(() => {
    const cached = cacheRead(CACHE_KEY, 8 * 24 * 60 * 60 * 1000)
    return cached?.data || {}
  })
  const tick = useRef(0)

  const computeSignals = useCallback(() => {
    const now = Date.now()
    const currentHour = Math.floor(now / 3600000)

    // Build current-hour signal intensity per zone
    const currentSignals = {}
    POL_ZONES.forEach(z => { currentSignals[z.id] = 0 })

    // 1. Telegram posts — geo-attributed conflict signals
    tgRecent.forEach(p => {
      const age = (now - new Date(p.ts||0).getTime()) / 3600000
      if (age > 2) return  // only last 2 hours
      const isBreaking = /breaking|urgent|just in|developing|confirmed/i.test(p.text)
      const isConflict = /attack|strike|missile|killed|explosion|shelling|airstrike|drone/i.test(p.text)
      if (!isConflict) return
      POL_ZONES.forEach(z => {
        if (!p.lat || !p.lng) {
          // Keyword match fallback
          const text = (p.text||'').toLowerCase()
          const zMatch = z.name.toLowerCase().split('/').some(n => text.includes(n.trim().split(' ')[0]))
          if (zMatch) currentSignals[z.id] += isBreaking ? SIGNAL_WEIGHTS.telegram_breaking : SIGNAL_WEIGHTS.telegram_conflict
        } else if (inZone(p.lat, p.lng, z)) {
          currentSignals[z.id] += isBreaking ? SIGNAL_WEIGHTS.telegram_breaking : SIGNAL_WEIGHTS.telegram_conflict
        }
      })
    })

    // 2. Military aircraft in zone
    ;(satData?.milaircraft || []).forEach(a => {
      POL_ZONES.forEach(z => {
        if (inZone(a.lat, a.lng, z)) currentSignals[z.id] += SIGNAL_WEIGHTS.military_aircraft
      })
    })

    // 3. Maritime anomalies
    ;(satData?.ships || []).filter(s => s._anomaly || (s._density && s._count === 0)).forEach(s => {
      POL_ZONES.forEach(z => {
        if (inZone(s.lat, s.lng, z)) currentSignals[z.id] += s._density ? SIGNAL_WEIGHTS.maritime_anomaly : SIGNAL_WEIGHTS.maritime_anomaly * 0.5
      })
    })

    // 4. Live alerts
    liveAlerts.forEach(a => {
      const lat = parseFloat(a.lat), lng = parseFloat(a.lng)
      if (!lat || !lng) return
      const w = a.severity === 'critical' ? SIGNAL_WEIGHTS.alert_critical : SIGNAL_WEIGHTS.alert_high
      POL_ZONES.forEach(z => {
        if (inZone(lat, lng, z)) currentSignals[z.id] += w
      })
    })

    // 5. News articles
    articles.filter(a => {
      const h = (now - new Date(a.pub||0).getTime()) / 3600000
      return h < 3
    }).forEach(a => {
      POL_ZONES.forEach(z => {
        const zKeywords = z.name.toLowerCase().split(/[\s\/]+/)
        const inText = zKeywords.some(k => k.length > 3 && (a.title||'').toLowerCase().includes(k))
        if (inText) currentSignals[z.id] += SIGNAL_WEIGHTS.news_conflict * (a.severity === 'high' ? 1.5 : 1.0)
      })
    })

    // 6. NOTAMs
    ;(satData?.notams || []).filter(n => n.isMilitary).forEach(n => {
      POL_ZONES.forEach(z => {
        if (inZone(n.lat, n.lng, z)) currentSignals[z.id] += SIGNAL_WEIGHTS.notam_military
      })
    })

    // 7. Prediction market spikes
    polyMarkets.filter(m => (m.probability||0) > 0.70).forEach(m => {
      const text = (m.question||m.title||'').toLowerCase()
      POL_ZONES.forEach(z => {
        const zMatch = z.name.toLowerCase().split(/[\s\/]+/).some(k => k.length > 3 && text.includes(k))
        if (zMatch) currentSignals[z.id] += SIGNAL_WEIGHTS.prediction_spike * Math.min((m.probability - 0.5) * 4, 2)
      })
    })

    // ── Update baseline + detect anomalies ────────────────────────────────────
    const newBaseline = { ...baseline }
    const newAnomalies = []

    POL_ZONES.forEach(z => {
      const key = z.id
      if (!newBaseline[key]) {
        newBaseline[key] = { buckets: new Array(BUCKETS_TOTAL).fill(0), lastHour: currentHour, zone: z }
      }
      const b = newBaseline[key]

      // Advance buckets if time has passed
      const hoursDiff = currentHour - (b.lastHour || currentHour)
      if (hoursDiff > 0 && hoursDiff < BUCKETS_TOTAL) {
        for (let i = 0; i < Math.min(hoursDiff, BUCKETS_TOTAL); i++) {
          b.buckets.push(0)
          b.buckets.shift()
        }
        b.lastHour = currentHour
      }

      // Record current signal
      const current = currentSignals[key]
      b.buckets[b.buckets.length - 1] = current

      // Compute z-score vs last 7 days (excluding last 3 hours — current event window)
      const historicalBuckets = b.buckets.slice(0, -3).filter(v => v >= 0)
      const z_score = zScore(current, historicalBuckets)
      const baseline_mean = mean(historicalBuckets)
      const baseline_sd = stddev(historicalBuckets)

      // Anomaly if z>2σ AND current > meaningful threshold
      if (z_score > 2.0 && current > 1.0) {
        newAnomalies.push({
          zone: z,
          current,
          baseline_mean: +baseline_mean.toFixed(2),
          baseline_sd: +baseline_sd.toFixed(2),
          z_score: +z_score.toFixed(2),
          severity: z_score > 4 ? 'critical' : z_score > 3 ? 'high' : 'medium',
          signals: currentSignals,
          timestamp: new Date().toISOString(),
          message: `${z.name}: ${z_score.toFixed(1)}σ above baseline (current: ${current.toFixed(1)}, normal: ${baseline_mean.toFixed(1)}±${baseline_sd.toFixed(1)})`,
        })
      }
      newBaseline[key] = b
    })

    // Sort by z-score descending
    newAnomalies.sort((a, b) => b.z_score - a.z_score)
    setAnomalies(newAnomalies)
    setBaseline(newBaseline)

    // Persist baseline every 10 ticks
    if (tick.current++ % 10 === 0) {
      cacheWrite(CACHE_KEY, newBaseline)
    }

    return newAnomalies
  }, [satData, liveAlerts, tgRecent, articles, polyMarkets, baseline])

  useEffect(() => {
    const iv = setInterval(computeSignals, 5 * 60 * 1000)  // recompute every minute
    computeSignals()
    return () => clearInterval(iv)
  }, [computeSignals])

  // Summary stats
  const summary = {
    anomalyCount: anomalies.length,
    criticalZones: anomalies.filter(a => a.severity === 'critical').map(a => a.zone.name),
    highZones: anomalies.filter(a => a.severity === 'high').map(a => a.zone.name),
    topAnomaly: anomalies[0] || null,
  }

  return { anomalies, baseline, summary, recompute: computeSignals }
}
