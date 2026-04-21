// api_zo/firms.js — NASA FIRMS thermal anomaly detection (Hono/zo.space)
// Returns thermal anomaly detections for all conflict zone bounding boxes

import type { Context } from "hono";

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

function parseCSV(csv: string, zone: typeof WATCH_ZONES[0]): Record<string, unknown>[] {
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
    const lat  = parseFloat(vals[latIdx] as string)
    const lng  = parseFloat(vals[lngIdx] as string)
    if (isNaN(lat) || isNaN(lng)) return null
    return {
      lat, lng,
      brightness:  parseFloat(vals[brightIdx as number] as string) || 0,
      confidence:  vals[confIdx as number] || 'n',
      date:        vals[dateIdx as number] || '',
      time:        vals[timeIdx as number] || '',
      scan:        parseFloat(vals[scanIdx as number] as string)  || null,
      track:       parseFloat(vals[trackIdx as number] as string) || null,
      satellite:   vals[satIdx as number]  || '',
      instrument:  vals[instrIdx as number]|| '',
      zone:        zone.label,
      country:     zone.country,
    }
  }).filter(Boolean) as Record<string, unknown>[]
}

export default async (c: Context) => {
  const req = c.req

  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return c.text('', 200)

  const apiKey  = req.query('key') || process.env.FIRMS_KEY || '08be3187f8c1526e0fd30249ee2c3374'
  const dayRange = parseInt(req.query('days')) || 1
  if (!apiKey) return c.json({ error: 'key required' }, 400)

  const results = []

  await Promise.allSettled(WATCH_ZONES.map(async zone => {
    const [minLat, maxLat, minLng, maxLng] = zone.bbox
    const sources = [
      'VIIRS_SNPP_NRT',
      'VIIRS_NOAA20_NRT',
      'VIIRS_NOAA21_NRT',
      'MODIS_NRT',
    ]
    const dayRange2 = Math.max(dayRange, 2)

    let allDetections: Record<string, unknown>[] = []

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

    const seen = new Set()
    allDetections = allDetections.filter((d: Record<string, unknown>) => {
      const key = `${(d.lat as number).toFixed(3)}_${(d.lng as number).toFixed(3)}_${d.date}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })

    const sorted     = [...allDetections].sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b.brightness as number) - (a.brightness as number))
    const top        = sorted[0]
    const highConf   = allDetections.filter((d: Record<string, unknown>) => d.confidence === 'h' || d.confidence === 'high' || parseInt(d.confidence as string) >= 80)
    const avgBright  = allDetections.reduce((s: number, d: Record<string, unknown>) => s + (d.brightness as number), 0) / allDetections.length

    const score = allDetections.length * 2 + ((top.brightness as number) > 400 ? 10 : (top.brightness as number) > 350 ? 5 : 0) + highConf.length
    let severity = 'low'
    if (score > 30 || (top.brightness as number) > 450) severity = 'critical'
    else if (score > 15 || (top.brightness as number) > 400) severity = 'high'
    else if (score > 5 || (top.brightness as number) > 360) severity = 'medium'

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
      detections: allDetections.slice(0, 50).map((d: Record<string, unknown>) => ({
        lat: d.lat, lng: d.lng, brightness: d.brightness,
        confidence: d.confidence, date: d.date, time: d.time,
        instrument: d.instrument || d.satellite,
      })),
    })
  }))

  return c.json(results.sort((a, b) => (b as { peakBrightness: number }).peakBrightness - (a as { peakBrightness: number }).peakBrightness))
}