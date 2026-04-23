/**
 * useFIRMS — NASA FIRMS Satellite Fire Detection
 * 
 * FIRMS detects thermal anomalies from NASA's MODIS and VIIRS satellites.
 * Updated every 3 hours. Resolution: 375m (VIIRS) to 1km (MODIS).
 * 
 * In OSINT context, thermal anomalies near conflict zones indicate:
 * - Artillery/missile strikes (brief intense hotspots)
 * - Infrastructure fires (sustained large hotspots)
 * - Crop/village destruction (line patterns)
 * - Industrial accidents vs intentional destruction
 * 
 * Free key: firms.modaps.eosdis.nasa.gov/api/area
 * 
 * API: returns CSV with lat/lon/brightness/confidence/date for each detection
 */

// Conflict zone bounding boxes — [minLat, maxLat, minLng, maxLng, label, country]
const WATCH_ZONES = [
  { label: 'Ukraine/Donbas',      bbox: [46.5, 52.5, 32.0, 40.5], country: 'Ukraine'    },
  { label: 'Gaza Strip',          bbox: [31.2, 31.7, 34.2, 34.6], country: 'Palestine'  },
  { label: 'Sudan/Khartoum',      bbox: [13.0, 17.0, 31.0, 36.5], country: 'Sudan'      },
  { label: 'Myanmar/Sagaing',     bbox: [21.0, 26.0, 94.0, 98.5], country: 'Myanmar'    },
  { label: 'Syria',               bbox: [32.5, 37.5, 35.5, 42.5], country: 'Syria'      },
  { label: 'Yemen',               bbox: [12.5, 19.0, 42.5, 54.5], country: 'Yemen'      },
  { label: 'Sahel/Mali/Burkina',  bbox: [10.0, 20.0, -5.5, 5.0],  country: 'Mali'       },
  { label: 'Ethiopia/Tigray',     bbox: [11.5, 16.5, 36.5, 43.5], country: 'Ethiopia'   },
  { label: 'DRC/Eastern Congo',   bbox: [-5.0, 2.0,  27.0, 32.0], country: 'DRC'        },
  { label: 'Iran',                bbox: [25.0, 40.0, 44.0, 63.5], country: 'Iran'       },
  { label: 'Pakistan/KPK',        bbox: [32.0, 37.5, 69.0, 75.0], country: 'Pakistan'   },
  { label: 'Somalia',             bbox: [1.0,  12.0, 40.5, 51.5], country: 'Somalia'    },
  { label: 'Nigeria/Northeast',   bbox: [10.0, 14.5, 10.0, 15.5], country: 'Nigeria'    },
  { label: 'Libya',               bbox: [22.0, 33.5, 9.5,  25.5], country: 'Libya'      },
  { label: 'Lebanon',             bbox: [33.0, 34.7, 35.0, 37.0], country: 'Lebanon'    },
]

function parseCSV(csv, zone) {
  if (!csv || csv.length < 50) return []
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return []
  const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const latIdx  = header.indexOf('latitude')
  const lngIdx  = header.indexOf('longitude')
  const brightIdx = header.indexOf('bright_ti4') !== -1 ? header.indexOf('bright_ti4') : header.indexOf('brightness')
  const confIdx = header.indexOf('confidence')
  const dateIdx = header.indexOf('acq_date')
  const timeIdx = header.indexOf('acq_time')

  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/"/g, ''))
    const lat  = parseFloat(vals[latIdx])
    const lng  = parseFloat(vals[lngIdx])
    const bright = parseFloat(vals[brightIdx]) || 0
    const conf = vals[confIdx] || 'n'
    const date = vals[dateIdx] || ''
    const time = vals[timeIdx] || ''
    if (isNaN(lat) || isNaN(lng)) return null
    return { lat, lng, brightness: bright, confidence: conf, date, time, zone: zone.label, country: zone.country }
  }).filter(Boolean)
}

function firmsToSignal(detections, zone) {
  if (!detections.length) return null
  
  // Sort by brightness — highest = most intense thermal event
  const sorted = [...detections].sort((a, b) => b.brightness - a.brightness)
  const top    = sorted[0]
  const highConf = detections.filter(d => d.confidence === 'h' || d.confidence === 'high' || parseInt(d.confidence) >= 80)
  
  // Assess significance: count + brightness + confidence
  const score = detections.length * 2 + (top.brightness > 400 ? 10 : top.brightness > 350 ? 5 : 0) + highConf.length
  
  let severity = 'low'
  if (score > 30 || top.brightness > 450) severity = 'critical'
  else if (score > 15 || top.brightness > 400) severity = 'high'
  else if (score > 5 || top.brightness > 360) severity = 'medium'

  const latest = top.date ? new Date(top.date) : new Date()
  const clusterStr = detections.length > 1
    ? `Cluster of ${detections.length} thermal detections`
    : 'Single thermal detection'
  const brightStr = top.brightness ? ` (peak ${top.brightness.toFixed(0)}K brightness)` : ''
  const confStr   = highConf.length > 0 ? `, ${highConf.length} high-confidence` : ''

  return {
    id:       `firms-${zone.label.replace(/\W/g,'-')}-${top.date}-${top.time}`,
    title:    `[FIRMS SATELLITE] ${clusterStr} in ${zone.label}${brightStr}`,
    summary:  `NASA VIIRS/MODIS thermal anomaly detection${confStr}. Peak brightness: ${top.brightness?.toFixed?.(0) ?? '?'}K. Location: ${top.lat.toFixed(3)}°, ${top.lng.toFixed(3)}°. Detected: ${top.date} ${top.time ? top.time.slice(0,2)+':'+top.time.slice(2) : ''}Z. In active conflict zone — may indicate strike activity, infrastructure damage, or vegetation fire.`,
    source:   'NASA FIRMS',
    url:      `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${top.lng},${top.lat},10z`,
    category: 'conflict',
    severity,
    region:   zone.country,
    tags:     ['FIRMS', 'satellite', zone.country, 'thermal'],
    entities: [{ name: zone.country, type: 'location' }, { name: zone.label, type: 'location' }],
    pub:      latest,
    lat:      top.lat,
    lng:      top.lng,
    _firms:   true,
    _live:    true,
    _count:   detections.length,
  }
}

export async function fetchFIRMS(sitName, apiKey) {
  if (!apiKey) return []
  const data = await fetchFIRMSGlobal(apiKey)
  // Filter to zones relevant to this situation
  const lower = sitName.toLowerCase()
  return data.filter(sig => {
    const zLower = (sig.zone + ' ' + sig.country).toLowerCase()
    const words = lower.split(/\s+/).filter(w => w.length > 3)
    return words.some(w => zLower.includes(w)) || lower.includes(sig.country.toLowerCase())
  })
}

// For the Finance/Global tab — fetch all zones via serverless (proxies blocked in browser)
export async function fetchFIRMSGlobal(apiKey) {
  // apiKey is optional — the server endpoint has the hardcoded key as fallback
  const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}&days=1` : '?days=1'
  try {
    const r = await fetch(`/api/firms${keyParam}`, {
      signal: AbortSignal.timeout(30000)
    })
    if (!r.ok) return []
    const zoneData = await r.json()
    // Convert serverless response to signal format
    return zoneData.map(z => {
      const zone = WATCH_ZONES.find(w => w.label === z.zone) || { label: z.zone, bbox: [0,0,0,0], country: z.country }
      const detections = (z.detections || []).map(d => ({
        lat: d.lat, lng: d.lng, brightness: d.brightness,
        confidence: d.confidence, date: d.date, time: d.time,
        zone: z.zone, country: z.country
      }))
      return firmsToSignal(detections, zone)
    }).filter(Boolean).sort((a, b) => (b._count || 0) - (a._count || 0))
  } catch (e) {
    console.warn('[FIRMS] serverless failed:', e.message)
    return []
  }
}
