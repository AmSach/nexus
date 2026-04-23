// api/fred.js — FRED (Federal Reserve Economic Data) via Vercel serverless
// FRED blocks browser CORS, so we proxy it here

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

const SERIES = [
  { id: 'VIXCLS',      label: 'VIX',            group: 'stress',    unit: '' },
  { id: 'BAMLH0A0HYM2',label: 'HY Spread',      group: 'stress',    unit: 'bp' },
  { id: 'DCOILWTICO',  label: 'WTI Crude',       group: 'energy',    unit: '$' },
  { id: 'DCOILBRENTEU',label: 'Brent Crude',     group: 'energy',    unit: '$' },
  { id: 'DHHNGSP',     label: 'Natural Gas',     group: 'energy',    unit: '$' },
  { id: 'FEDFUNDS',    label: 'Fed Funds',       group: 'rates',     unit: '%' },
  { id: 'DGS10',       label: '10Y Treasury',    group: 'rates',     unit: '%' },
  { id: 'DGS2',        label: '2Y Treasury',     group: 'rates',     unit: '%' },
  { id: 'T10Y2Y',      label: 'Yield Curve',     group: 'rates',     unit: '%' },
  { id: 'CPIAUCSL',    label: 'CPI',             group: 'inflation', unit: '' },
  { id: 'CPILFESL',    label: 'Core CPI',        group: 'inflation', unit: '' },
  { id: 'UNRATE',      label: 'Unemployment',    group: 'labor',     unit: '%' },
  { id: 'PAYEMS',      label: 'Nonfarm Payrolls',group: 'labor',     unit: 'K' },
  { id: 'M2SL',        label: 'M2',              group: 'money',     unit: '$B' },
  { id: 'GVZCLS',      label: 'GVZ (Gold Vol)',  group: 'stress',    unit: '' },
  { id: 'OVXCLS',      label: 'OVX (Oil Vol)',   group: 'energy',    unit: '' },
  { id: 'DTWEXBGS',    label: 'USD Broad',       group: 'rates',     unit: '' },
]

// ── Conflict Financial Intelligence (merged from intel-markets) ──────────────
async function conflictMarkets(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200')

  // Quote proxy mode — fetch individual stock/ETF quotes server-side (no CORS)
  if (req.query.mode === 'quote') {
    const symbols = (req.query.symbols || '').split(',').filter(Boolean).slice(0, 30)
    if (!symbols.length) return res.status(400).json({ error: 'No symbols' })
    try {
      const r = await fetch(`https://financialmodelingprep.com/api/v3/quote/${symbols.join(',')}?apikey=demo`, {
        headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000)
      })
      if (r.ok) {
        const d = await r.json()
        return res.status(200).json({ quotes: Array.isArray(d) ? d : [], ts: new Date().toISOString() })
      }
      // Stooq fallback
      const stooq = []
      await Promise.allSettled(symbols.slice(0,10).map(async s => {
        const sr = await fetch(`https://stooq.com/q/l/?s=${s.toLowerCase()}.us&f=sd2t2ohlcv&h&e=json`, { signal: AbortSignal.timeout(5000) }).catch(()=>null)
        if (sr?.ok) {
          const sd = await sr.json().catch(()=>null)
          const q = sd?.symbols?.[0]
          if (q?.Close) stooq.push({ symbol: s, price: +q.Close, changesPercentage: 0, volume: 0 })
        }
      }))
      return res.status(200).json({ quotes: stooq, ts: new Date().toISOString() })
    } catch(e) {
      return res.status(200).json({ quotes: [], error: e.message })
    }
  }

  const results = { defenseStocks: [], warCurrencies: [], cryptoFlight: [], commodities: [], ts: new Date().toISOString() }

  await Promise.allSettled([

    // ── Defense stocks via FinancialModelingPrep (free, no Vercel block) ─────
    // Spike in defense stocks = smart money pricing in conflict escalation
    // Yahoo Finance blocks Vercel IPs (CORS) — FMP works from serverless
    (async () => {
      const tickers = ['LMT','RTX','NOC','BA','GD','KTOS','HII','AXON','HEICO','PLTR']
      try {
        // FinancialModelingPrep free tier — 250 req/day, no key needed for basic
        const r = await fetch(`https://financialmodelingprep.com/api/v3/quote/${tickers.join(',')}?apikey=demo`, {
          headers:{'Accept':'application/json'}, signal: AbortSignal.timeout(10000)
        }).catch(()=>null)
        if (r?.ok) {
          const quotes = await r.json().catch(()=>null)
          if (Array.isArray(quotes) && quotes.length > 0) {
            results.defenseStocks = quotes.map(q => ({
              symbol: q.symbol,
              price: q.price,
              changePercent: q.changesPercentage,
              volume: q.volume,
              signal: Math.abs(q.changesPercentage||0) > 3 ? 'anomaly' : 'normal',
              rangePosition: q.yearHigh && q.yearLow
                ? ((q.price - q.yearLow) / (q.yearHigh - q.yearLow) * 100).toFixed(0) : null,
            }))
            console.log('[Stocks] FMP:', results.defenseStocks.length, 'tickers')
            return
          }
        }
        // Fallback: Stooq API (European financial data, no key, no CORS block)
        const stooqResults = []
        await Promise.allSettled(tickers.slice(0,5).map(async ticker => {
          const sr = await fetch(`https://stooq.com/q/l/?s=${ticker.toLowerCase()}.us&f=sd2t2ohlcv&h&e=json`, {
            signal: AbortSignal.timeout(6000)
          }).catch(()=>null)
          if (sr?.ok) {
            const sd = await sr.json().catch(()=>null)
            const q = sd?.symbols?.[0]
            if (q?.Close) stooqResults.push({ symbol: ticker, price: +q.Close, changePercent: 0, volume: 0, signal: 'normal' })
          }
        }))
        if (stooqResults.length > 0) results.defenseStocks = stooqResults
      } catch {}
    })(),

    // ── War currencies via ExchangeRate.host (FREE no key) ───────────────────
    // UAH devaluation = Ukraine under pressure
    // ILS devaluation = Middle East escalation
    // RUB collapse = Russia sanctions/military spending
    // IRR = Iran sanctions/conflict premium
    (async () => {
      try {
        const currencies = 'UAH,ILS,RUB,IRR,PKR,MMK,SDG,TRY,ETB'
        const r = await fetch(`https://api.exchangerate.host/latest?base=USD&symbols=${currencies}`, {
          signal: AbortSignal.timeout(8000)
        }).catch(()=>null)
        if (r?.ok) {
          const d = await r.json().catch(()=>null)
          const rates = d?.rates || {}
          // Also get 30-day history for trend
          const histR = await fetch(`https://api.exchangerate.host/timeseries?start_date=${new Date(Date.now()-30*86400000).toISOString().slice(0,10)}&end_date=${new Date().toISOString().slice(0,10)}&base=USD&symbols=${currencies}`, {
            signal: AbortSignal.timeout(8000)
          }).catch(()=>null)
          const hist = histR?.ok ? await histR.json().catch(()=>null) : null
          const timeseries = hist?.rates || {}
          const dates = Object.keys(timeseries).sort()

          results.warCurrencies = Object.entries(rates).map(([code, rate]) => {
            // 30-day trend
            const monthAgoRate = dates.length > 0 ? timeseries[dates[0]]?.[code] : null
            const monthChange = monthAgoRate ? ((rate - monthAgoRate) / monthAgoRate * 100) : null
            const labels = {
              UAH: 'Ukraine Hryvnia', ILS: 'Israeli Shekel', RUB: 'Russian Ruble',
              IRR: 'Iranian Rial', PKR: 'Pakistan Rupee', MMK: 'Myanmar Kyat',
              SDG: 'Sudan Pound', TRY: 'Turkish Lira', ETB: 'Ethiopian Birr',
            }
            return {
              code, name: labels[code] || code,
              rate, // USD per unit
              monthChange: monthChange ? +monthChange.toFixed(2) : null,
              signal: monthChange && Math.abs(monthChange) > 10 ? 'devaluation_alert' : 'stable',
            }
          })
        }
      } catch {}
    })(),

    // ── Crypto capital flight via CoinGecko (FREE no key) ───────────────────
    // BTC/USDT volume spike + price premium in conflict regions = capital flight
    (async () => {
      try {
        const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,tether,dai,usd-coin&order=market_cap_desc&per_page=4&sparkline=false&price_change_percentage=1h,24h,7d', {
          signal: AbortSignal.timeout(8000)
        }).catch(()=>null)
        if (r?.ok) {
          const d = await r.json().catch(()=>null)
          if (Array.isArray(d)) {
            results.cryptoFlight = d.map(c => ({
              id: c.id, symbol: c.symbol.toUpperCase(),
              price: c.current_price,
              change1h: c.price_change_percentage_1h_in_currency,
              change24h: c.price_change_percentage_24h,
              volume24h: c.total_volume,
              // Stablecoin premium signal: if USDT/DAI/USDC trade >$1.02 = demand pressure
              stablecoinPremium: (c.id === 'tether' || c.id === 'dai' || c.id === 'usd-coin')
                ? (c.current_price - 1.0) * 100 : null,
            }))
          }
        }
      } catch {}
    })(),

    // ── Conflict commodities via Yahoo Finance ───────────────────────────────
    // Oil spike = Middle East / supply disruption
    // Gold spike = risk-off / uncertainty
    // Wheat spike = food security / conflict disruption
    (async () => {
      const comms = ['CL=F','GC=F','NG=F','ZW=F','HG=F']  // WTI, Gold, NatGas, Wheat, Copper
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${comms.join(',')}&fields=symbol,regularMarketPrice,regularMarketChangePercent,shortName`, {
          headers: {'Accept':'application/json','User-Agent':'Mozilla/5.0'},
          signal: AbortSignal.timeout(8000)
        }).catch(()=>null)
        if (r?.ok) {
          const d = await r.json().catch(()=>null)
          results.commodities = (d?.quoteResponse?.result||[]).map(q => ({
            symbol: q.symbol,
            name: q.shortName || q.symbol,
            price: q.regularMarketPrice,
            changePercent: q.regularMarketChangePercent,
            signal: Math.abs(q.regularMarketChangePercent||0) > 2 ? 'spike' : 'normal',
          }))
        }
      } catch {}
    })(),
  ])

  // Compute aggregate financial conflict index (FCI)
  // High FCI = financial markets pricing in elevated conflict risk
  let fci = 0
  const defenseSpike = results.defenseStocks.filter(s => (s.changePercent||0) > 2).length
  fci += defenseSpike * 15
  const currencyStress = results.warCurrencies.filter(c => c.signal === 'devaluation_alert').length
  fci += currencyStress * 20
  const oilSpike = results.commodities.find(c => c.symbol === 'CL=F' && Math.abs(c.changePercent||0) > 3)
  if (oilSpike) fci += 25
  const goldSpike = results.commodities.find(c => c.symbol === 'GC=F' && (c.changePercent||0) > 1)
  if (goldSpike) fci += 15

  results.fci = { score: fci, level: fci > 60 ? 'critical' : fci > 35 ? 'high' : fci > 15 ? 'medium' : 'low' }

  res.status(200).json(results)
}


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  if (req.query.mode === 'conflict' || !req.query.mode) return conflictMarkets(req, res)

  // ── OHLCV history mode: returns daily OHLCV for charting + backtesting ─────
  // ?mode=history&symbol=SPY&range=1y   (range: 5d|1mo|3mo|6mo|1y|2y|5y)
  if (req.query.mode === 'history') {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    const symbol = (req.query.symbol || 'SPY').toUpperCase()
    const range  = req.query.range || '1y'
    const interval = range === '5d' ? '1h' : range === '1mo' ? '1d' : '1d'
    try {
      // Primary: Yahoo Finance chart API (v8)
      const yurl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
      const yr = await fetch(yurl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(12000)
      }).catch(() => null)
      if (yr?.ok) {
        const yd = await yr.json().catch(() => null)
        const result = yd?.chart?.result?.[0]
        if (result) {
          const meta = result.meta || {}
          const ts   = result.timestamp || []
          const q    = result.indicators?.quote?.[0] || {}
          const adj  = result.indicators?.adjclose?.[0]?.adjclose || []
          const bars = ts.map((t, i) => ({
            t: t * 1000, date: new Date(t * 1000).toISOString().slice(0,10),
            o: q.open?.[i] != null ? +q.open[i].toFixed(4) : null,
            h: q.high?.[i] != null ? +q.high[i].toFixed(4) : null,
            l: q.low?.[i]  != null ? +q.low[i].toFixed(4)  : null,
            c: q.close?.[i] != null ? +q.close[i].toFixed(4) : null,
            v: q.volume?.[i] || 0,
            ac: adj[i] != null ? +adj[i].toFixed(4) : null,
          })).filter(b => b.c != null)
          return res.status(200).json({
            symbol, range, interval,
            currency: meta.currency || 'USD',
            name: meta.longName || meta.shortName || symbol,
            bars,
            latestPrice: meta.regularMarketPrice,
            ts: new Date().toISOString()
          })
        }
      }
      // Fallback: Stooq
      const stooqSym = symbol.replace('^','').replace('=F','.f').toLowerCase()
      const sr = await fetch(`https://stooq.com/q/d/l/?s=${stooqSym}&i=d`, { signal: AbortSignal.timeout(8000) }).catch(() => null)
      if (sr?.ok) {
        const csv = await sr.text().catch(() => '')
        const rows = csv.trim().split('\n').slice(1)
        const bars = rows.map(r => {
          const [date, o, h, l, c, v] = r.split(',')
          return { t: new Date(date).getTime(), date, o: +o, h: +h, l: +l, c: +c, v: v ? +v : 0, ac: +c }
        }).filter(b => !isNaN(b.c)).slice(-365)
        return res.status(200).json({ symbol, range, bars, ts: new Date().toISOString() })
      }
      return res.status(200).json({ symbol, bars: [], error: 'No data', ts: new Date().toISOString() })
    } catch(e) {
      return res.status(200).json({ symbol, bars: [], error: e.message })
    }
  }

  // ── Multi-quote batch mode: up to 50 symbols in one call ─────────────────
  // ?mode=multi&symbols=SPY,QQQ,GLD,BTC-USD
  // Strategy order: Alpha Vantage (batched) → Twelve Data (batched) → Stooq → Yahoo → FMP
  if (req.query.mode === 'multi') {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
    const symbols = (req.query.symbols || '').split(',').filter(Boolean).slice(0, 50)
    const avKey  = req.query.avkey  || process.env.VITE_ALPHAVANTAGE_KEY  || 'GX7D3YNMNJND5ZF3'
    const tdKey  = req.query.tdkey  || process.env.VITE_TWELVEDATA_KEY   || ''
    if (!symbols.length) return res.status(400).json({ error: 'No symbols' })

    const quotes = {}

    // ── Strategy 1: Twelve Data batch (50 symbols/call, free tier 800 req/day) ──
    // Best all-round source: equities, ETFs, forex, crypto, indices, futures
    if (tdKey) {
      try {
        const tdSyms = symbols.slice(0, 50).join(',')
        const r = await fetch(
          `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(tdSyms)}&apikey=${tdKey}`,
          { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(12000) }
        ).catch(() => null)
        if (r?.ok) {
          const d = await r.json().catch(() => null)
          if (d && typeof d === 'object') {
            // Response is either { symbol: data } map or single symbol object
            const entries = d.symbol ? { [d.symbol]: d } : d
            Object.entries(entries).forEach(([sym, q]) => {
              if (!q?.close || q.status === 'error') return
              const price = parseFloat(q.close), prev = parseFloat(q.previous_close || q.open || q.close)
              quotes[sym] = {
                price, prev, open: parseFloat(q.open || price),
                high: parseFloat(q.high || price), low: parseFloat(q.low || price),
                volume: parseInt(q.volume || 0),
                changePercent: prev ? ((price - prev) / prev * 100) : parseFloat(q.percent_change || 0),
                name: q.name || sym,
              }
            })
            console.log('[TwelveData] got:', Object.keys(quotes).length, 'quotes')
          }
        }
      } catch(e) { console.warn('[TwelveData] error:', e.message) }
    }

    // ── Strategy 2: Alpha Vantage GLOBAL_QUOTE (individual, but free & reliable) ──
    // Best for: US equities, ETFs. 500 req/day free tier. Fetch only still-missing.
    const missingForAV = symbols.filter(s =>
      !quotes[s] &&
      !s.includes('=F') && !s.includes('=X') &&  // skip futures and forex
      !s.startsWith('^')                           // skip indices (AV uses different endpoint)
    ).slice(0, 15)  // cap at 15 to preserve rate limit

    if (avKey && missingForAV.length > 0) {
      await Promise.allSettled(missingForAV.map(async sym => {
        try {
          // Add 200ms spacing between AV calls — free tier is rate limited
          await new Promise(r => setTimeout(r, missingForAV.indexOf(sym) * 200))
          const r = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${avKey}`,
            { signal: AbortSignal.timeout(8000) }
          ).catch(() => null)
          if (!r?.ok) return
          const d = await r.json().catch(() => null)
          const q = d?.['Global Quote']
          if (!q?.['05. price']) return
          const price = parseFloat(q['05. price'])
          const prev  = parseFloat(q['08. previous close'] || price)
          quotes[sym] = {
            price, prev,
            open:  parseFloat(q['02. open'] || price),
            high:  parseFloat(q['03. high'] || price),
            low:   parseFloat(q['04. low']  || price),
            volume: parseInt(q['06. volume'] || 0),
            changePercent: parseFloat(q['10. change percent']?.replace('%','') || 0),
            name: sym,
          }
        } catch {}
      }))
      console.log('[AlphaVantage] total quotes now:', Object.keys(quotes).length)
    }

    // ── Strategy 3: Stooq batch (EU service, no key, CORS-free from Vercel) ──
    // Good for: US equities, ETFs, some futures. Fills remaining gaps.
    const STOOQ_INDEX_MAP = {
      '^VIX': '^vix', '^TNX': '^tnx', '^IRX': '^irx', '^TYX': '^tyx',
      '^GSPC': '^spx', '^DJI': '^dji', '^IXIC': '^ndx', '^RUT': '^rut',
      '^FTSE': '^ftx', '^GDAXI': '^dax', '^FCHI': '^cac', '^N225': '^nkx',
      '^HSI': '^hsi', '^KS11': '^ks11', '^TWII': '^twii',
    }
    const stooqMap = sym => {
      if (STOOQ_INDEX_MAP[sym]) return STOOQ_INDEX_MAP[sym]
      if (sym.startsWith('^')) return sym.toLowerCase()
      if (sym.endsWith('=F')) return sym.replace('=F', '').toLowerCase() + '.f'
      if (sym.endsWith('=X')) return sym.replace('=X', '').toLowerCase() + '.x'
      return sym.toLowerCase() + '.us'
    }
    const missingForStooq = symbols.filter(s => !quotes[s])
    if (missingForStooq.length > 0) {
      const chunks = []
      for (let i = 0; i < missingForStooq.length; i += 20) chunks.push(missingForStooq.slice(i, i + 20))
      await Promise.allSettled(chunks.map(async chunk => {
        try {
          const batch = chunk.map(stooqMap).join(',')
          const r = await fetch(
            `https://stooq.com/q/l/?s=${batch}&f=sd2t2ohlcv&h&e=json`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }
          ).catch(() => null)
          if (!r?.ok) return
          const d = await r.json().catch(() => null)
          ;(d?.symbols || []).forEach((q, i) => {
            if (!q?.Close || q.Close === 'N/D') return
            const origSym = chunk[i] || chunk.find(s => stooqMap(s).split('.')[0].toLowerCase() === q.Symbol?.toLowerCase())
            if (!origSym || quotes[origSym]) return  // don't overwrite
            const close = +q.Close, open = +q.Open || close
            quotes[origSym] = {
              price: close, prev: open, open, high: +q.High || close, low: +q.Low || close,
              volume: +q.Volume || 0, changePercent: open ? +((close-open)/open*100).toFixed(3) : 0, name: origSym,
            }
          })
        } catch {}
      }))
      console.log('[Stooq] total quotes now:', Object.keys(quotes).length)
    }

    // ── Strategy 4: Yahoo Finance (sometimes works, sometimes blocks Vercel) ──
    const missingForYahoo = symbols.filter(s => !quotes[s])
    if (missingForYahoo.length > 0) {
      try {
        const yUrl = `https://query2.finance.yahoo.com/v8/finance/spark?symbols=${missingForYahoo.slice(0,30).join(',')}&range=1d&interval=1d`
        const yr = await fetch(yUrl, {
          headers: { 'User-Agent': 'python-requests/2.31.0', 'Accept': '*/*' },
          signal: AbortSignal.timeout(8000)
        }).catch(() => null)
        if (yr?.ok) {
          const yd = await yr.json().catch(() => null)
          ;(yd?.spark?.result || []).forEach(item => {
            if (quotes[item.symbol]) return
            const meta = item.response?.[0]?.meta
            if (meta?.regularMarketPrice) {
              quotes[item.symbol] = {
                price: meta.regularMarketPrice,
                prev: meta.previousClose || meta.regularMarketPrice,
                open: meta.regularMarketPrice, high: meta.regularMarketPrice, low: meta.regularMarketPrice,
                volume: 0,
                changePercent: meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) : 0,
                name: item.symbol,
              }
            }
          })
        }
      } catch {}
    }

    // ── Strategy 5: FMP demo (250 req/day) — equity symbols only ──
    const stillMissing = symbols.filter(s => !quotes[s] && !s.includes('=') && !s.startsWith('^'))
    if (stillMissing.length > 0) {
      try {
        const fmpR = await fetch(
          `https://financialmodelingprep.com/api/v3/quote/${stillMissing.slice(0,20).join(',')}?apikey=demo`,
          { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) }
        ).catch(() => null)
        if (fmpR?.ok) {
          const fmpD = await fmpR.json().catch(() => null)
          if (Array.isArray(fmpD)) {
            fmpD.forEach(q => {
              if (quotes[q.symbol] || !q.price) return
              quotes[q.symbol] = {
                price: q.price, prev: q.previousClose || q.price,
                open: q.open, high: q.dayHigh, low: q.dayLow,
                volume: q.volume, mktCap: q.marketCap,
                changePercent: q.changesPercentage, pe: q.pe, beta: q.beta,
                yearHigh: q.yearHigh, yearLow: q.yearLow, name: q.name || q.symbol,
              }
            })
          }
        }
      } catch {}
    }

    return res.status(200).json({
      quotes,
      source: Object.keys(quotes).length > 0 ? 'twelvedata+alphavantage+stooq+yahoo+fmp' : 'empty',
      count: Object.keys(quotes).length,
      ts: new Date().toISOString()
    })
  }

  // Health check ping - return summary of configured series
  if (!req.query || Object.keys(req.query).length === 0) {
    return res.status(200).json({ status: 'ok', configured: true, note: 'FRED API ready — call with series params for data' })
  }

  const apiKey = req.query.key
  if (!apiKey) { res.status(400).json({ error: 'key required' }); return }

  const results = {}

  await Promise.allSettled(SERIES.map(async s => {
    try {
      const url = `${FRED_BASE}?series_id=${s.id}&api_key=${apiKey}&file_type=json&limit=5&sort_order=desc`
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 10000)
      const r = await fetch(url, { signal: ctrl.signal })
      clearTimeout(t)
      if (!r.ok) return
      const d = await r.json()
      const obs = (d?.observations || []).filter(o => o.value !== '.' && o.value !== '')
      if (!obs.length) return
      const latest = obs[0]
      const prev   = obs[1]
      const val    = parseFloat(latest.value)
      const prevVal = prev ? parseFloat(prev.value) : null
      results[s.id] = {
        id: s.id, label: s.label, group: s.group, unit: s.unit,
        value: val, date: latest.date,
        prev: prevVal,
        change: prevVal != null ? parseFloat((val - prevVal).toFixed(4)) : null,
        changePct: prevVal != null && prevVal !== 0 ? parseFloat(((val - prevVal) / Math.abs(prevVal) * 100).toFixed(2)) : null,
        history: obs.slice(0, 5).map(o => ({ date: o.date, value: parseFloat(o.value) })),
      }
    } catch {}
  }))

  res.status(200).json(results)
}
