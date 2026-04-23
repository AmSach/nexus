/**
 * useFRED — Federal Reserve Economic Data
 * 
 * 22 key macro indicators tracked as live intelligence signals.
 * These aren't just numbers — they're geopolitical risk indicators.
 * 
 * Yield curve inversion → recession signal → political instability risk
 * VIX spike → market stress → flight to safety → geopolitical escalation
 * M2 collapse → monetary tightening → emerging market stress
 * 
 * Free key: fred.stlouisfed.org/docs/api/api_key.html
 */

import { useState, useEffect, useCallback, useRef } from 'react'

const BASE = 'https://api.stlouisfed.org/fred/series/observations'

// The indicators we track — chosen for geopolitical AND market relevance
export const FRED_SERIES = [
  // Market stress
  { id: 'VIXCLS',     label: 'VIX',               group: 'stress',   unit: '',    desc: 'CBOE Volatility Index — market fear gauge'           },
  { id: 'BAMLH0A0HYM2',label: 'HY Spread',        group: 'stress',   unit: 'bp',  desc: 'High-yield credit spread — default risk barometer'   },
  { id: 'DCOILWTICO', label: 'WTI Crude',          group: 'energy',   unit: '$',   desc: 'West Texas Intermediate crude oil price'             },
  { id: 'DCOILBRENTEU',label: 'Brent Crude',       group: 'energy',   unit: '$',   desc: 'Brent crude — global benchmark'                      },
  { id: 'DHHNGSP',    label: 'Natural Gas',        group: 'energy',   unit: '$',   desc: 'Henry Hub natural gas spot price'                    },
  // Monetary policy
  { id: 'FEDFUNDS',   label: 'Fed Funds',          group: 'rates',    unit: '%',   desc: 'Federal funds effective rate'                        },
  { id: 'DGS10',      label: '10Y Treasury',       group: 'rates',    unit: '%',   desc: '10-year US Treasury yield'                           },
  { id: 'DGS2',       label: '2Y Treasury',        group: 'rates',    unit: '%',   desc: '2-year US Treasury yield'                            },
  { id: 'T10Y2Y',     label: 'Yield Curve',        group: 'rates',    unit: '%',   desc: '10Y-2Y spread — recession indicator when negative'   },
  { id: 'DXY',        label: 'DXY',                group: 'rates',    unit: '',    desc: 'US Dollar Index'                                     },
  // Inflation
  { id: 'CPIAUCSL',   label: 'CPI',                group: 'inflation',unit: '',    desc: 'Consumer Price Index — all items'                    },
  { id: 'CPILFESL',   label: 'Core CPI',           group: 'inflation',unit: '',    desc: 'CPI excluding food and energy'                       },
  { id: 'PPIACO',     label: 'PPI',                group: 'inflation',unit: '',    desc: 'Producer Price Index — upstream inflation signal'    },
  // Money supply
  { id: 'M2SL',       label: 'M2',                 group: 'money',    unit: '$B',  desc: 'M2 money supply — broad liquidity measure'           },
  // Labor
  { id: 'UNRATE',     label: 'Unemployment',       group: 'labor',    unit: '%',   desc: 'US unemployment rate'                                },
  { id: 'PAYEMS',     label: 'Nonfarm Payrolls',   group: 'labor',    unit: 'K',   desc: 'Total nonfarm employees — monthly change'            },
  // Global
  { id: 'GVZCLS',     label: 'GVZ (Gold Vol)',     group: 'stress',   unit: '',    desc: 'Gold volatility — geopolitical risk proxy'           },
  { id: 'OVXCLS',     label: 'OVX (Oil Vol)',      group: 'energy',   unit: '',    desc: 'Oil volatility — supply chain risk proxy'            },
  { id: 'DTWEXBGS',   label: 'USD Broad',          group: 'rates',    unit: '',    desc: 'USD broad trade-weighted index'                      },
]

// FRED uses /api/fred serverless — direct FRED and proxies are both blocked in browser
async function fetchAllFREDViaServer(apiKey) {
  try {
    const r = await fetch(`/api/fred?key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(30000)
    })
    if (!r.ok) return null
    return await r.json()
  } catch (e) {
    console.warn('[FRED] serverless failed:', e.message)
    return null
  }
}

async function fetchSeries(seriesId, apiKey, numObs = 5) {
  try {
    const url = `${BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&limit=${numObs}&sort_order=desc`
    const d   = await fredFetch(url)
    if (!d) return null
    const obs = (d?.observations || []).filter(o => o.value !== '.')
    if (!obs.length) return null
    const latest = parseFloat(obs[0].value)
    const prev   = obs.length > 1 ? parseFloat(obs[1].value) : null
    return {
      value:    latest,
      prev,
      date:     obs[0].date,
      change:   prev != null ? latest - prev : null,
      changePct:prev != null && prev !== 0 ? ((latest - prev) / Math.abs(prev)) * 100 : null,
      history:  obs.slice(0, 10).map(o => ({ date: o.date, value: parseFloat(o.value) })).reverse(),
    }
  } catch { return null }
}

// Interpret a FRED reading as an intelligence signal with geopolitical context
function interpretSignal(series, data) {
  if (!data) return null
  const { id, label, desc } = series
  const { value, change, changePct } = data

  let alert = null
  let severity = 'low'

  if (id === 'VIXCLS') {
    if (value > 40)      { alert = `VIX at ${value.toFixed(1)} — EXTREME fear. Comparable to 2008/2020 crash levels.`; severity = 'critical' }
    else if (value > 30) { alert = `VIX at ${value.toFixed(1)} — HIGH stress. Market pricing significant tail risk.`; severity = 'high' }
    else if (value > 22) { alert = `VIX elevated at ${value.toFixed(1)} — above historical average of ~19.`; severity = 'medium' }
  } else if (id === 'T10Y2Y') {
    if (value < -0.5)   { alert = `Yield curve inverted ${value.toFixed(2)}% — strong recession signal. Every recession since 1955 was preceded by inversion.`; severity = 'high' }
    else if (value < 0) { alert = `Yield curve slightly inverted ${value.toFixed(2)}% — watch for deepening.`; severity = 'medium' }
    else if (value > 1) { alert = `Yield curve steepening to ${value.toFixed(2)}% — normalizing, reduced near-term recession risk.`; severity = 'low' }
  } else if (id === 'DCOILWTICO' || id === 'DCOILBRENTEU') {
    if (value > 100)     { alert = `Oil above $100 — historically associated with demand destruction and political instability.`; severity = 'high' }
    else if (change && Math.abs(changePct) > 5) {
      alert = `Oil moved ${changePct > 0 ? '+' : ''}${changePct?.toFixed(1)}% — sharp daily move signals supply/demand shock.`
      severity = 'medium'
    }
  } else if (id === 'BAMLH0A0HYM2') {
    if (value > 800)     { alert = `HY spread ${value.toFixed(0)}bps — approaching crisis territory (>1000bps in 2008/2020).`; severity = 'critical' }
    else if (value > 500){ alert = `HY spread ${value.toFixed(0)}bps — elevated default risk, credit stress building.`; severity = 'high' }
    else if (value > 350){ alert = `HY spread ${value.toFixed(0)}bps — above normal (historical avg ~350bps).`; severity = 'medium' }
  } else if (id === 'FEDFUNDS') {
    if (change && Math.abs(change) >= 0.25) {
      alert = `Fed funds rate ${change > 0 ? 'raised' : 'cut'} to ${value.toFixed(2)}% — policy shift has 6-18 month lag effect on economy.`
      severity = 'medium'
    }
  }

  return { seriesId: id, label, desc, value, change, changePct, date: data.date, history: data.history, alert, severity }
}

export function useFRED(apiKey) {
  const [data,    setData]    = useState({})
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const fetchAll = useCallback(async () => {
    const key = import.meta.env.VITE_FRED_KEY || apiKey
    if (!key) return
    setLoading(true)
    try {
      // Use serverless /api/fred — FRED blocks browser CORS and proxies
      const serverData = await fetchAllFREDViaServer(key)
      if (!mounted.current) return
      if (!serverData) { console.warn('[FRED] no data from serverless'); return }
      const out = {}
      FRED_SERIES.forEach(s => {
        const sd = serverData[s.id]
        if (!sd) return
        // Convert serverless format to interpretSignal format
        const data = {
          value: sd.value, date: sd.date, prev: sd.prev,
          change: sd.change, changePct: sd.changePct, history: sd.history || []
        }
        const interp = interpretSignal(s, data)
        if (interp) out[s.id] = interp
      })
      setData(out)
      setLastUpdate(new Date())
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [apiKey])

  // Refresh every 30 minutes — FRED updates daily/weekly so this is plenty
  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 30 * 60 * 1000)
    return () => clearInterval(iv)
  }, [fetchAll])

  // Returns signals that have active alerts — these merge into the main signal pool
  const alertSignals = Object.values(data)
    .filter(d => d.alert)
    .map(d => ({
      id:       `fred-${d.seriesId}-${d.date}`,
      title:    `[MACRO] ${d.label}: ${d.alert}`,
      summary:  `${d.desc} | Current: ${d.value?.toFixed?.(2) ?? d.value} | Date: ${d.date}`,
      source:   'FRED',
      url:      `https://fred.stlouisfed.org/series/${d.seriesId}`,
      category: 'finance',
      severity: d.severity,
      region:   'Global',
      tags:     ['FRED', 'macro', d.label],
      entities: [],
      pub:      new Date(),
      _fred:    true,
      _live:    true,
    }))

  return { data, loading, lastUpdate, alertSignals, refetch: fetchAll }
}
