/**
 * useSignalConvergence v3 — Expanded CII
 * Now covers 20 active situations per the guide + current conflicts.
 * Formula: news(1.0×recency×severity) + ACLED(3.0×) + markets(2.0×deviation×volume)
 *          + alerts(4.0×) + GPS jam(2.2 flat) + ADS-B military(2.5×)
 * Thresholds: S5/Critical≥15, S4/High 8-14, S3/Medium 3-7, S1/Low <3
 */
import { useMemo } from 'react'

// ALL 20 active situations - matches the guide + current events
const SITUATIONS = {
  'Ukraine/Russia':       ['ukraine','russia','zelenskyy','putin','kyiv','donbas','kharkiv','frontline','offensive','ceasefire','crimea','kherson','zaporizhzhia'],
  'Middle East/Gaza':     ['israel','gaza','hamas','hezbollah','idf','beirut','houthi','red sea','west bank','netanyahu','rafah','ceasefire','hostage','jenin'],
  'Iran':                 ['iran','iaea','enrichment','uranium','fordow','natanz','tehran','khamenei','revolutionary guard','irgc','persian gulf'],
  'Taiwan Strait':        ['taiwan','pla','prc','strait','taipei','china military','tsmc','xi jinping','deterrence'],
  'North Korea':          ['north korea','dprk','kim jong','pyongyang','missile test','icbm','hwasong','nuclear weapon','seoul'],
  'South China Sea':      ['south china sea','philippines','spratly','paracel','second thomas','scarborough','manila','beijing sea'],
  'Kashmir/India-Pak':    ['kashmir','india-pakistan','line of control','jammu','modi','islamabad','india pakistan border','pahalgam','pulwama'],
  'Sahel/West Africa':    ['mali','niger','burkina','sahel','wagner','boko haram','al-shabaab','junta','coup','africa military'],
  'Sudan Civil War':      ['sudan','khartoum','rsf','darfur','rapid support','sudanese army','port sudan','famine'],
  'Myanmar':              ['myanmar','burma','junta','shan','karen','arakan army','tatmadaw','mandalay','coup'],
  'Ethiopia/Horn':        ['ethiopia','tigray','amhara','oromia','fano','somalia','al-shabaab','eritrea','addis ababa'],
  'DRC/Congo':            ['drc','congo','m23','kinshasa','goma','eastern congo','rwanda','un peacekeeping','kivu'],
  'Yemen':                ['yemen','houthi','aden','sanaa','red sea attack','shipping attack','missile','drone attack'],
  'Haiti':                ['haiti','gang','port-au-prince','mss','armed group','peacekeeping','kenya police'],
  'Venezuela/Latin Am':   ['venezuela','maduro','guyana','essequibo','colombia','mexico cartel','el salvador'],
  'Cyber/Infrastructure': ['cyberattack','ransomware','critical infrastructure','data breach','hack','espionage','zero-day','apt','nation-state cyber'],
  'Global Economy':       ['recession','fed rate','inflation','crash','bank fail','oil price','tariff','trade war','debt ceiling','default','gdp'],
  'US Political/MAGA':    ['trump','congress','impeach','supreme court','nato funding','ukraine aid','election','tariff'],
  'Space/Orbital':        ['satellite','asat','starlink','orbit','iss','china space','nasa','debris','kessler'],
  'WMD/Nuclear Threat':   ['nuclear weapon','dirty bomb','radiological','biological weapon','chemical weapon','wmd','sarin','novichok','enrichment'],
}

function matches(text, kws) {
  const t = (text || '').toLowerCase()
  return kws.filter(k => {
    if (k.length <= 3) {
      // Short keywords: require word boundary (space, start, end, punctuation)
      return new RegExp('(^|[\\s,./\\-])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\s,./\\-]|$)').test(t)
    }
    return t.includes(k)
  }).length
}

function recency(pub) {
  const h = (Date.now() - new Date(pub || 0).getTime()) / 3600000
  return h < 1 ? 1.0 : h < 3 ? 0.85 : h < 6 ? 0.65 : h < 12 ? 0.45 : h < 24 ? 0.3 : 0.1
}

function sevW(s) {
  return { critical: 3, high: 2, medium: 1.2, low: 0.5 }[s] || 1
}

export function useSignalConvergence({ articles = [], acledEvents = [], satellite = null, polyMarkets = [], kalshiMarkets = [], liveAlerts = [] }) {
  return useMemo(() => {
    const rows = Object.entries(SITUATIONS).map(([name, kws]) => {
      let cii = 0
      const signals = []

      // 1. News articles (last 12h) — 1.0 base weight
      const arts = articles.filter(a => {
        try {
          const h = (Date.now() - new Date(a.pub || 0).getTime()) / 3600000
          return h < 12 && matches((a.title || '') + ' ' + (a.summary || ''), kws) >= 1
        } catch { return false }
      })
      if (arts.length) {
        const s = arts.reduce((sum, a) => sum + 1.0 * recency(a.pub) * sevW(a.severity), 0)
        cii += s
        signals.push({ layer: '📰 News', count: arts.length, score: +s.toFixed(1), topItem: arts[0]?.title?.slice(0, 70) })
      }

      // 2. ACLED conflict events — 3.0 base weight (verified events)
      const acled = acledEvents.filter(e => matches((e.title || '') + (e.summary || ''), kws) >= 1)
      if (acled.length) {
        const s = acled.reduce((sum, e) => sum + 3.0 * recency(e.pub) * sevW(e.severity), 0)
        cii += s
        signals.push({ layer: '⚔️ ACLED', count: acled.length, score: +s.toFixed(1), topItem: acled[0]?.title?.slice(0, 70) })
      }

      // 3. Polymarket — 2.0× deviation from 50%, scaled by volume
      const polyHits = polyMarkets.filter(m => matches(m.question || '', kws) >= 1 && m.probability != null)
      polyHits.forEach(m => {
        const dev = Math.abs((m.probability || 0.5) - 0.5)
        if (dev > 0.05) {
          const s = 2.0 * dev * Math.min((m.volume || 0) / 10000, 3)
          cii += s
          signals.push({ layer: '🎯 Polymarket', count: 1, score: +s.toFixed(1), topItem: `${(m.question || '').slice(0, 55)} (${Math.round((m.probability || 0) * 100)}%)` })
        }
      })

      // 4. Kalshi — same formula
      const kalHits = kalshiMarkets.filter(m => matches(m.title || '', kws) >= 1 && m.probability != null)
      kalHits.forEach(m => {
        const dev = Math.abs((m.probability || 0.5) - 0.5)
        if (dev > 0.05) {
          const s = 2.0 * dev * Math.min((m.volume || 0) / 10000, 3)
          cii += s
          signals.push({ layer: '🏦 Kalshi', count: 1, score: +s.toFixed(1), topItem: `${(m.title || '').slice(0, 55)} (${Math.round((m.probability || 0) * 100)}%)` })
        }
      })

      // 5. Live alerts — 4.0 base weight (strongest signal)
      const alertHits = liveAlerts.filter(a =>
        matches((a.title || '') + (a.detail || ''), kws) >= 1 ||
        (name === 'Middle East/Gaza' && a.type === 'red_alert') ||
        (name === 'Yemen' && a.type === 'naval')
      )
      alertHits.forEach(a => {
        const s = 4.0 * sevW(a.severity) * recency(a.ts || a.timestamp)
        cii += s
        signals.push({ layer: `🚨 ${a.source || 'Alert'}`, count: 1, score: +s.toFixed(1), topItem: (a.title || '').slice(0, 70) })
      })

      // 6. GPS jamming — 2.2 flat per detection
      const gpsHits = liveAlerts.filter(a => a.type === 'gps_jam' && matches(a.title || '', kws) >= 1)
      gpsHits.forEach(() => {
        cii += 2.2
        signals.push({ layer: '📡 GPS Jam', count: 1, score: 2.2, topItem: 'Active GPS interference detected' })
      })

      // 7. ADS-B military aircraft in zone — 2.5 per aircraft, cap 5
      if (satellite) {
        const mil = (satellite.militaryAircraft || satellite.aircraft || []).filter(a =>
          matches((a.zone || '') + (a.callsign || ''), kws) >= 1
        )
        if (mil.length) {
          const s = 2.5 * Math.min(mil.length, 5)
          cii += s
          signals.push({ layer: '✈️ ADS-B', count: mil.length, score: +s.toFixed(1), topItem: mil[0]?.callsign || null })
        }
      }

      const level = cii >= 15 ? 'critical' : cii >= 8 ? 'high' : cii >= 3 ? 'medium' : 'low'
      return { name, cii: +cii.toFixed(1), level, signals, articleCount: arts.length }
    })

    rows.sort((a, b) => b.cii - a.cii)
    return {
      situations: rows,
      topSituation: rows[0] || null,
      criticalCount: rows.filter(s => s.level === 'critical').length,
      highCount: rows.filter(s => s.level === 'high').length,
    }
  }, [articles, acledEvents, satellite, polyMarkets, kalshiMarkets, liveAlerts])
}
