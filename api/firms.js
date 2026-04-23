// api/firms.js — NASA FIRMS via Vercel serverless (proxies blocked in browser)
// Returns thermal anomaly detections for all conflict zone bounding boxes

const WATCH_ZONES = [
  // Active conflict zones
  { label: 'Ukraine/Donbas',     bbox: [46.5,52.5,32.0,40.5], country: 'Ukraine'   },
  { label: 'Gaza Strip',         bbox: [31.2,31.7,34.2,34.6], country: 'Palestine' },
  { label: 'Lebanon',            bbox: [33.0,34.7,35.0,37.0], country: 'Lebanon'   },
  { label: 'Syria',              bbox: [32.5,37.5,35.5,42.5], country: 'Syria'     },
  { label: 'Yemen',              bbox: [12.5,19.0,42.5,54.5], country: 'Yemen'     },
  { label: 'Sudan/Khartoum',     bbox: [13.0,17.0,31.0,36.5], country: 'Sudan'     },
  { label: 'Myanmar/Sagaing',    bbox: [21.0,26.0,94.0,98.5], country: 'Myanmar'   },
  { label: 'Sahel/Mali/Burkina', bbox: [10.0,20.0,-5.5,5.0],  country: 'Mali'      },
  { label: 'Ethiopia/Tigray',    bbox: [11.5,16.5,36.5,43.5], country: 'Ethiopia'  },
  { label: 'DRC/Eastern Congo',  bbox: [-5.0,2.0, 27.0,32.0], country: 'DRC'       },
  { label: 'Iran',               bbox: [25.0,40.0,44.0,63.5], country: 'Iran'      },
  { label: 'Pakistan/KPK',       bbox: [32.0,37.5,69.0,75.0], country: 'Pakistan'  },
  { label: 'Somalia',            bbox: [1.0, 12.0,40.5,51.5], country: 'Somalia'   },
  { label: 'Nigeria/Northeast',  bbox: [10.0,14.5,10.0,15.5], country: 'Nigeria'   },
  { label: 'Libya',              bbox: [22.0,33.5,9.5, 25.5], country: 'Libya'     },
  // Expanded global coverage
  { label: 'Afghanistan',        bbox: [29.0,38.5,60.5,75.0], country: 'Afghanistan'},
  { label: 'Iraq',               bbox: [29.0,37.5,38.5,48.5], country: 'Iraq'      },
  { label: 'Mozambique/Cabo',    bbox: [-13.5,-9.5,38.5,41.5], country: 'Mozambique'},
  { label: 'CAR',                bbox: [2.5,11.0,14.0,27.5],  country: 'CAR'       },
  { label: 'Cameroon/NW',        bbox: [5.5,8.5,13.5,16.5],   country: 'Cameroon'  },
  { label: 'Burkina Faso',       bbox: [9.5,15.5,-5.5,2.5],   country: 'Burkina'   },
  { label: 'Niger',              bbox: [11.5,23.5,0.5,16.0],  country: 'Niger'     },
  { label: 'Haiti',              bbox: [17.5,20.5,-74.5,-71.5],country: 'Haiti'    },
  { label: 'Colombia',           bbox: [1.5,12.5,-78.0,-66.0], country: 'Colombia' },
  { label: 'Mexico/Sinaloa',     bbox: [22.0,27.0,-110.0,-104.0],country:'Mexico'  },
  { label: 'North Korea',        bbox: [37.5,43.0,124.0,130.5],country:'N.Korea'   },
  { label: 'Taiwan Strait',      bbox: [21.5,27.0,118.0,123.5],country:'Taiwan'    },
  { label: 'Israel/West Bank',   bbox: [29.5,33.5,34.2,36.0], country: 'Israel'    },
]

function parseCSV(csv, zone) {
  if (!csv || csv.length < 50) return []
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return []
  const header = lines[0].split(',').map(h => h.trim().replace(/"/g,''))
  const latIdx    = header.indexOf('latitude')
  const lngIdx    = header.indexOf('longitude')
  const brightIdx = header.indexOf('bright_ti4') !== -1 ? header.indexOf('bright_ti4') : header.indexOf('brightness')
  const confIdx   = header.indexOf('confidence')
  const dateIdx   = header.indexOf('acq_date')
  const timeIdx   = header.indexOf('acq_time')
  const scanIdx   = header.indexOf('scan')
  const trackIdx  = header.indexOf('track')
  const satIdx    = header.indexOf('satellite')
  const instrIdx  = header.indexOf('instrument')

  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/"/g,''))
    const lat  = parseFloat(vals[latIdx])
    const lng  = parseFloat(vals[lngIdx])
    if (isNaN(lat) || isNaN(lng)) return null
    return {
      lat, lng,
      brightness:  parseFloat(vals[brightIdx]) || 0,
      confidence:  vals[confIdx] || 'n',
      date:        vals[dateIdx] || '',
      time:        vals[timeIdx] || '',
      scan:        parseFloat(vals[scanIdx])  || null,
      track:       parseFloat(vals[trackIdx]) || null,
      satellite:   vals[satIdx]  || '',
      instrument:  vals[instrIdx]|| '',
      zone:        zone.label,
      country:     zone.country,
    }
  }).filter(Boolean)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const apiKey  = req.query.key || process.env.FIRMS_KEY || ''
  const dayRange = parseInt(req.query.days) || 1
  if (!apiKey || apiKey === '') {
    // Return empty but valid response — FIRMS data needs a key for all sources
    return res.status(200).json([])
  }

  const results = []

  await Promise.allSettled(WATCH_ZONES.map(async zone => {
    const [minLat, maxLat, minLng, maxLng] = zone.bbox
    const sources = [
      'VIIRS_SNPP_NRT',
      'VIIRS_NOAA20_NRT',
      'VIIRS_NOAA21_NRT',
      'MODIS_NRT',
    ]
    const dayRange2 = Math.max(dayRange, 2)  // always fetch at least 2 days

    let allDetections = []

    for (const src of sources) {
      try {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/${src}/${minLng},${minLat},${maxLng},${maxLat}/${dayRange2}`
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 15000)
        const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'NEXUS/1.0' } })
        clearTimeout(timer)
        if (!r.ok) continue
        const csv = await r.text()
        const dets = parseCSV(csv, zone)
        allDetections.push(...dets)
      } catch { continue }
    }

    if (!allDetections.length) return

    // Dedup by lat/lng/date
    const seen = new Set()
    allDetections = allDetections.filter(d => {
      const key = `${d.lat.toFixed(3)}_${d.lng.toFixed(3)}_${d.date}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })

    const sorted     = [...allDetections].sort((a, b) => b.brightness - a.brightness)
    const top        = sorted[0]
    const highConf   = allDetections.filter(d => d.confidence === 'h' || d.confidence === 'high' || parseInt(d.confidence) >= 80)
    const avgBright  = allDetections.reduce((s, d) => s + d.brightness, 0) / allDetections.length

    const score = allDetections.length * 2 + (top.brightness > 400 ? 10 : top.brightness > 350 ? 5 : 0) + highConf.length
    let severity = 'low'
    if (score > 30 || top.brightness > 450) severity = 'critical'
    else if (score > 15 || top.brightness > 400) severity = 'high'
    else if (score > 5 || top.brightness > 360) severity = 'medium'

    results.push({
      zone: zone.label,
      country: zone.country,
      count: allDetections.length,
      highConfCount: highConf.length,
      peakBrightness: top.brightness,
      avgBrightness: parseFloat(avgBright.toFixed(1)),
      severity,
      topLat: top.lat,
      topLng: top.lng,
      date: top.date,
      time: top.time,
      instrument: top.instrument || top.satellite || 'VIIRS',
      detections: allDetections.slice(0, 50).map(d => ({
        lat: d.lat, lng: d.lng, brightness: d.brightness,
        confidence: d.confidence, date: d.date, time: d.time,
        instrument: d.instrument || d.satellite,
      })),
    })
  }))

  res.status(200).json(results.sort((a, b) => b.peakBrightness - a.peakBrightness))
}
