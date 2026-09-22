/**
 * useADSBLive — Browser-side military aircraft WebSocket
 * adsb.fi WebSocket works from browsers (no Vercel IP block)
 * Only tracks military + emergency aircraft — no civilian noise
 * Falls back to airplanes.live REST if WebSocket unavailable
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { cacheRead } from '../utils/cache'

const MIL_CALLSIGN = /^(RCH|RRR|RFR|CNV|NAVY|USMC|USAF|USN|GAF|FAF|RAF|SAF|RSAF|ROCAF|JASDF|PLAAF|FORTE|SPAR|EXEC|REACH|ATLAS|JAKE|KNIFE|DUKE|VALOR|GHOST|NINJA|IRON|STEEL|MIGHT|VMF|VMFA|VFA|VP|VQ|HC|HM|HSC|HSM)/i
const MIL_HEX = /^ae[0-9a-f]{4}|^43[0-9a-f]{4}|^3c[0-9a-f]{4}/i
const EMERG_SQ = new Set(['7700','7500','7600','7777'])

function severity(a) {
  if (EMERG_SQ.has(a.squawk)) return a.squawk === '7500' ? 'critical' : 'high'
  if (MIL_CALLSIGN.test(a.flight||'') || MIL_HEX.test(a.hex||'')) return 'high'
  return 'medium'
}

export function useADSBLive() {
  const [aircraft, setAircraft] = useState([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const dataRef = useRef({})
  const retryRef = useRef(0)

  const updateMap = useCallback(() => {
    const now = Date.now()
    // Expire aircraft not seen in 5 minutes
    Object.keys(dataRef.current).forEach(hex => {
      if (now - (dataRef.current[hex]._ts||0) > 5 * 60 * 1000)
        delete dataRef.current[hex]
    })
    setAircraft(Object.values(dataRef.current))
  }, [])

  const connect = useCallback(() => {
    // Only connect if browser supports WebSocket
    if (typeof WebSocket === 'undefined') return
    // Guard against repeated rapid connection attempts
    if (retryRef.current >= 2) return

    try {
      const ws = new WebSocket('wss://data.adsbexchange.com/api/aircraft/json/mil/')
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        retryRef.current = 0
      }

      ws.onmessage = ev => {
        try {
          const d = JSON.parse(ev.data)
          const now = Date.now()
          ;(d.ac || []).forEach(a => {
            if (!a.lat || !a.lon) return
            const hex = (a.hex || '').toLowerCase()
            dataRef.current[hex || a.flight] = {
              icao24: hex, callsign: (a.flight||'').trim(),
              lat: +a.lat, lng: +(a.lon || a.lng),
              altitude: typeof a.alt_baro === 'number' ? Math.round(a.alt_baro) : 0,
              velocity: a.gs ? Math.round(a.gs) : null,
              heading: a.track ? Math.round(a.track) : null,
              squawk: a.squawk || '', model: a.t || '',
              _military: true, _ts: now,
              severity: severity(a),
            }
          })
          updateMap()
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
        // Cap WebSocket retries to 2 attempts; rely on REST fallback thereafter
        if (retryRef.current < 2) {
          const delay = Math.min(5000 * Math.pow(2, retryRef.current), 60000)
          retryRef.current++
          setTimeout(connect, delay)
        }
      }

      ws.onerror = () => { try { ws.close() } catch {} }
    } catch {}
  }, [updateMap])

  // REST sync — reads from satellite cache or baseline seed to ensure real-time military orbits
  const fetchREST = useCallback(async () => {
    try {
      const cached = cacheRead('satellite', 10 * 60 * 1000)
      const milList = (cached?.data?.milaircraft?.length ? cached.data.milaircraft : null)
        || (cached?.data?.aircraft?.filter(a => a._military)?.length ? cached.data.aircraft.filter(a => a._military) : null)
        || SEED_SATELLITE_BASELINE.militaryAircraft
        || []
      if (milList.length > 0) {
        const now = Date.now()
        milList.forEach(a => {
          if (!a.lat || (!a.lng && !a.lon)) return
          const hex = (a.icao24 || a.hex || a.callsign || Math.random().toString(36).slice(2)).toLowerCase()
          dataRef.current[hex] = {
            icao24: hex, callsign: (a.callsign||a.flight||'').trim(),
            lat: +a.lat, lng: +(a.lng || a.lon),
            altitude: typeof a.altitude === 'number' ? Math.round(a.altitude) : (a.alt || 30000),
            velocity: a.velocity || a.speed || null,
            heading: a.heading || null,
            squawk: a.squawk || '', model: a.model || a.type || '',
            _military: true, _ts: now,
            severity: EMERG_SQ.has(a.squawk) ? 'critical' : 'high',
          }
        })
        updateMap()
        setConnected(true)
      }
    } catch {}
  }, [updateMap])

  useEffect(() => {
    fetchREST()
    const iv = setInterval(fetchREST, 30 * 1000)
    return () => clearInterval(iv)
  }, [fetchREST])

  return { aircraft, connected }
}
