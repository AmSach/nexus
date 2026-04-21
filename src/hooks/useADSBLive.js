/**
 * useADSBLive — Browser-side military aircraft WebSocket
 * adsb.fi WebSocket works from browsers (no Vercel IP block)
 * Only tracks military + emergency aircraft — no civilian noise
 * Falls back to airplanes.live REST if WebSocket unavailable
 */
import { useState, useEffect, useRef, useCallback } from 'react'

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
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    // adsb.fi public WebSocket — no key needed, works from browser
    const ws = new WebSocket('wss://data.adsbexchange.com/api/aircraft/json/mil/')
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retryRef.current = 0
      console.log('[ADSB-WS] Connected to adsbexchange military feed')
    }

    ws.onmessage = (evt) => {
      try {
        const d = JSON.parse(evt.data)
        ;(d.ac || d.aircraft || []).forEach(a => {
          if (!a.lat || !a.lon) return
          const cs = (a.flight || '').trim()
          const hex = (a.hex || '').toLowerCase()
          const isMil = MIL_CALLSIGN.test(cs) || MIL_HEX.test(hex) || a.military
          const isEmerg = EMERG_SQ.has(a.squawk)
          if (!isMil && !isEmerg) return
          dataRef.current[hex || cs] = {
            icao24: hex, callsign: cs,
            lat: +a.lat, lng: +(a.lon || a.lng),
            altitude: typeof a.alt_baro === 'number' ? Math.round(a.alt_baro) : (a.alt_geom || 0),
            velocity: a.gs ? Math.round(a.gs) : null,
            heading: a.track ? Math.round(a.track) : null,
            squawk: a.squawk || '', model: a.t || '',
            country: a.r?.slice(0,2) || '',
            _military: isMil, _emergency: isEmerg,
            _ts: Date.now(),
            severity: severity(a),
          }
        })
        updateMap()
      } catch {}
    }

    ws.onclose = () => {
      setConnected(false)
      // Exponential backoff: 5s, 10s, 20s, 40s, max 60s
      const delay = Math.min(5000 * Math.pow(2, retryRef.current), 60000)
      retryRef.current++
      console.log(`[ADSB-WS] Disconnected. Reconnecting in ${delay/1000}s (attempt ${retryRef.current})`)
      setTimeout(connect, delay)
    }

    ws.onerror = () => { ws.close() }
  }, [updateMap])

  // REST fallback — polls airplanes.live /v2/mil every 30s when WS unavailable
  const fetchREST = useCallback(async () => {
    try {
      const r = await fetch('https://api.airplanes.live/v2/mil', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      })
      if (!r.ok) return
      const d = await r.json()
      const now = Date.now()
      ;(d?.ac || []).forEach(a => {
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
          severity: EMERG_SQ.has(a.squawk) ? 'critical' : 'high',
        }
      })
      updateMap()
    } catch {}
  }, [updateMap])

  useEffect(() => {
    connect()
    // Also poll REST as backup
    fetchREST()
    const iv = setInterval(fetchREST, 3 * 60 * 1000)
    return () => {
      clearInterval(iv)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect, fetchREST])

  return { aircraft, connected }
}
