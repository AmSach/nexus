import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../store'
import { useFRED, FRED_SERIES } from '../hooks/useFRED'
import ArticleCard from './feed/ArticleCard'
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink,
  Bookmark, BookmarkCheck, Trash2, Eye, EyeOff, Save, DollarSign,
  Activity, Globe, BarChart2, Loader
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// FREE real-time market data sources (no API key needed)
// ─────────────────────────────────────────────────────────────────────────────

// Yahoo Finance via allorigins proxy — live quotes
async function fetchYahooQuote(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    const r = await fetch(proxy, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const j = await r.json()
    const raw = JSON.parse(j.contents || '{}')
    const meta = raw?.chart?.result?.[0]?.meta
    if (!meta) return null
    return {
      price:    meta.regularMarketPrice,
      prev:     meta.chartPreviousClose || meta.previousClose,
      currency: meta.currency,
      name:     meta.longName || meta.shortName || symbol,
    }
  } catch { return null }
}

// CoinGecko — crypto prices, completely free, no key
async function fetchCryptoPrice(coinId) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const d = await r.json()
    const coin = d[coinId]
    if (!coin) return null
    return { price: coin.usd, change24h: coin.usd_24h_change }
  } catch { return null }
}

// OilPrice.com RSS — free live commodity news
// ExchangeRate API (free tier) — live FX
async function fetchFX(key) {
  if (!key) return null
  try {
    const r = await fetch(`https://v6.exchangerate-api.com/v6/${key}/latest/USD`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const d = await r.json()
    return d?.conversion_rates || null
  } catch { return null }
}

// Financial RSS feeds — no key, completely free
const FINANCE_FEEDS = [
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',          src: 'MarketWatch'       },
  { url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',                         src: 'WSJ'               },
  { url: 'https://www.ft.com/rss/home/world',                                    src: 'FT'                },
  { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',                 src: 'CNBC Economy'      },
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',                src: 'CNBC World'        },
  { url: 'https://oilprice.com/rss/main',                                        src: 'OilPrice'          },
  { url: 'https://asia.nikkei.com/rss/feed/nar',                                 src: 'Nikkei Asia'       },
  { url: 'https://feeds.bloomberg.com/news/rss.xml',                             src: 'Bloomberg'         },
  { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', src: 'Economic Times'    },
  { url: 'https://rss.reuters.com/Reuters/businessNews',                         src: 'Reuters Business'  },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',                      src: 'CoinDesk'          },
  { url: 'https://cointelegraph.com/rss',                                        src: 'CoinTelegraph'     },
]

const PROXIES = [
  u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
]

async function fetchFinanceRSS(feed) {
  for (const proxy of PROXIES) {
    try {
      const r = await fetch(proxy(feed.url), { signal: AbortSignal.timeout(7000) })
      if (!r.ok) continue
      const j = await r.json()
      const raw = j.contents || j.body || j.data || ''
      if (!raw || raw.length < 100) continue
      const doc = new DOMParser().parseFromString(raw, 'text/xml')
      const items = doc.querySelectorAll('item, entry')
      return Array.from(items).slice(0, 8).map(el => {
        const g = (...sels) => { for (const s of sels) { const n = el.querySelector(s); if (n) return (n.textContent || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim() } return '' }
        const title   = g('title')
        const desc    = g('description', 'summary')
        const link    = g('link', 'guid')
        const pubDate = g('pubDate', 'published', 'updated')
        if (!title || title.length < 5) return null
        const clean = desc.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').slice(0, 300).trim()
        let pub; try { pub = pubDate ? new Date(pubDate) : new Date() } catch { pub = new Date() }
        return { id: title.slice(0,40), title, summary: clean, source: feed.src, url: link || '#', pub, _finance: true }
      }).filter(Boolean)
    } catch { continue }
  }
  return []
}

function pct(price, prev) {
  if (!prev || prev === 0) return 0
  return ((price - prev) / prev) * 100
}
function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
}
function ChangeTag({ value }) {
  if (value == null || isNaN(value)) return <span style={{ color: 'var(--t4)' }}>—</span>
  const pos = value > 0
  const zero = Math.abs(value) < 0.01
  const color = zero ? 'var(--t4)' : pos ? 'var(--green)' : 'var(--red)'
  const Icon  = zero ? Minus : pos ? TrendingUp : TrendingDown
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color, fontFamily: 'JetBrains Mono', fontSize: '10px' }}>
      <Icon size={9} />
      {pos && '+'}{fmt(value, 2)}%
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKETS PANEL
// ─────────────────────────────────────────────────────────────────────────────
export function MarketsPanel() {
  const { keys } = useStore()
  const [tab,        setTab]        = useState('overview')
  const [quotes,     setQuotes]     = useState({})
  const [crypto,     setCrypto]     = useState({})
  const [fx,         setFx]         = useState(null)
  const [news,       setNews]       = useState([])
  const [loading,    setLoading]    = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const fxKey  = import.meta.env.VITE_EXCHANGERATE_KEY || keys.exchangerate
  const fredKey = import.meta.env.VITE_FRED_KEY || keys.fred
  const { data: fredData, loading: fredLoading, alertSignals: fredAlerts } = useFRED(fredKey)

  // ── Equity / ETF quotes ───────────────────────────────────────────────────
  const TICKERS = [
    // Major indices via ETF proxies (Yahoo supports these without login)
    { sym: 'SPY',   label: 'S&P 500',    group: 'index'     },
    { sym: 'QQQ',   label: 'NASDAQ 100', group: 'index'     },
    { sym: 'DIA',   label: 'Dow Jones',  group: 'index'     },
    { sym: 'IWM',   label: 'Russell 2000',group: 'index'    },
    { sym: 'EEM',   label: 'Emerg Markets',group:'index'    },
    { sym: 'NIFTY50.NS', label: 'Nifty 50', group: 'index' },
    { sym: 'GC=F',  label: 'Gold',       group: 'commodity' },
    { sym: 'SI=F',  label: 'Silver',     group: 'commodity' },
    { sym: 'CL=F',  label: 'Crude WTI',  group: 'commodity' },
    { sym: 'BZ=F',  label: 'Brent',      group: 'commodity' },
    { sym: 'NG=F',  label: 'Nat Gas',    group: 'commodity' },
    { sym: 'HG=F',  label: 'Copper',     group: 'commodity' },
  ]

  const CRYPTOS = [
    { id: 'bitcoin',    sym: 'BTC' },
    { id: 'ethereum',   sym: 'ETH' },
    { id: 'tether',     sym: 'USDT' },
    { id: 'solana',     sym: 'SOL' },
    { id: 'ripple',     sym: 'XRP' },
    { id: 'cardano',    sym: 'ADA' },
  ]

  const FX_PAIRS = [
    { sym: 'EUR/USD', base: 'EUR', invert: true  },
    { sym: 'USD/JPY', base: 'JPY', invert: false },
    { sym: 'GBP/USD', base: 'GBP', invert: true  },
    { sym: 'USD/INR', base: 'INR', invert: false },
    { sym: 'USD/CNY', base: 'CNY', invert: false },
    { sym: 'USD/CHF', base: 'CHF', invert: false },
    { sym: 'AUD/USD', base: 'AUD', invert: true  },
    { sym: 'USD/BRL', base: 'BRL', invert: false },
    { sym: 'USD/TRY', base: 'TRY', invert: false },
    { sym: 'USD/RUB', base: 'RUB', invert: false },
    { sym: 'USD/SAR', base: 'SAR', invert: false },
    { sym: 'USD/KRW', base: 'KRW', invert: false },
  ]

  const fetchAll = useCallback(async () => {
    if (!mounted.current) return
    setLoading(true)
    try {
      // Fire all in parallel
      const [quotesResults, cryptoResults, fxResult, newsResults] = await Promise.allSettled([
        // Equity quotes
        Promise.allSettled(TICKERS.map(t => fetchYahooQuote(t.sym).then(d => ({ sym: t.sym, data: d })))),
        // Crypto
        fetchCryptoPrice(CRYPTOS.map(c => c.id).join(',')),
        // FX
        fetchFX(fxKey),
        // RSS news — all feeds in parallel
        Promise.allSettled(FINANCE_FEEDS.map(f => fetchFinanceRSS(f)))
          .then(rs => rs.flatMap(r => r.status === 'fulfilled' ? r.value : [])
            .sort((a, b) => b.pub - a.pub)
            .slice(0, 60)),
      ])

      if (!mounted.current) return

      if (quotesResults.status === 'fulfilled') {
        const q = {}
        quotesResults.value.forEach(r => {
          if (r.status === 'fulfilled' && r.value?.data) q[r.value.sym] = r.value.data
        })
        setQuotes(q)
      }

      if (cryptoResults.status === 'fulfilled' && cryptoResults.value) {
        setCrypto(cryptoResults.value)
      }

      if (fxResult.status === 'fulfilled' && fxResult.value) setFx(fxResult.value)

      if (newsResults.status === 'fulfilled') setNews(newsResults.value)

      setLastUpdate(new Date())
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [fxKey])

  // Fetch on mount, then every 60s
  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 60 * 1000)
    return () => clearInterval(iv)
  }, [fetchAll])

  const TABS = [
    { id: 'overview',   label: '⬡ Overview'   },
    { id: 'macro',      label: '◎ Macro'       },
    { id: 'fx',         label: '$ FX'          },
    { id: 'crypto',     label: '◈ Crypto'      },
    { id: 'news',       label: '◉ Market News' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--void)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--base)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Orbitron', fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.12em' }}>MARKETS</span>
        <div style={{ display: 'flex', gap: '3px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="mono"
              style={{ fontSize: '9px', padding: '3px 9px', borderRadius: '2px', cursor: 'pointer', border: 'none',
                background: tab === t.id ? 'rgba(45,212,191,0.1)' : 'transparent',
                color: tab === t.id ? 'var(--accent)' : 'var(--t4)',
                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {loading && <Loader size={10} className="spin" style={{ color: 'var(--accent)' }} />}
        {lastUpdate && !loading && (
          <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>
            updated {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
        <button className="btn" style={{ padding: '3px 7px', fontSize: '9px' }} onClick={fetchAll} disabled={loading}>
          <RefreshCw size={10} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── OVERVIEW: Indices + Commodities ── */}
        {tab === 'overview' && (
          <div style={{ padding: '12px 14px' }}>
            {['index', 'commodity'].map(group => (
              <div key={group} style={{ marginBottom: '16px' }}>
                <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.12em', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid var(--border)' }}>
                  {group === 'index' ? 'INDICES' : 'COMMODITIES'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px' }}>
                  {TICKERS.filter(t => t.group === group).map(t => {
                    const q = quotes[t.sym]
                    const change = q ? pct(q.price, q.prev) : null
                    return (
                      <div key={t.sym} style={{
                        padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px',
                        borderLeft: `3px solid ${change == null ? 'var(--border)' : change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : 'var(--t4)'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>{t.sym.replace('=F','').replace('.NS','')}</span>
                          {change != null && <ChangeTag value={change} />}
                        </div>
                        <div style={{ fontFamily: 'Orbitron', fontSize: '15px', fontWeight: 700, color: 'var(--t1)', marginBottom: '2px' }}>
                          {q ? fmt(q.price) : '…'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--t3)' }}>{t.label}</div>
                        {q?.currency && q.currency !== 'USD' && (
                          <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{q.currency}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Key crypto snapshot in overview */}
            <div style={{ marginBottom: '16px' }}>
              <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.12em', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid var(--border)' }}>
                CRYPTO (via CoinGecko)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '5px' }}>
                {CRYPTOS.slice(0, 4).map(c => {
                  const d = crypto[c.id]
                  return (
                    <div key={c.id} style={{ padding: '8px 10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span className="mono" style={{ fontSize: '9px', color: 'var(--accent)' }}>{c.sym}</span>
                        {d && <ChangeTag value={d.usd_24h_change} />}
                      </div>
                      <div style={{ fontFamily: 'Orbitron', fontSize: '13px', fontWeight: 700, color: 'var(--t1)' }}>
                        {d ? '$' + fmt(d.usd, d.usd > 1 ? 2 : 4) : '…'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ padding: '10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
              <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', lineHeight: 1.7 }}>
                Indices via Yahoo Finance (ETF proxies) · Crypto via CoinGecko · Updates every 60s<br/>
                {!fxKey && 'Add ExchangeRate API key in Settings for live FX rates'}
              </div>
            </div>
          </div>
        )}

        {/* ── MACRO: FRED Indicators ── */}
        {tab === 'macro' && (
          <div style={{ padding: '12px 14px' }}>
            {!fredKey ? (
              <div style={{ padding: '14px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--t2)', marginBottom: '6px', fontWeight: 600 }}>Add FRED API key for macro intelligence</div>
                <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)', lineHeight: 1.7 }}>
                  Free at fred.stlouisfed.org/docs/api/api_key.html · Instant · Add in Settings<br/>
                  Unlocks: VIX, yield curve, CPI, Fed funds, crude oil, HY spreads, M2, unemployment
                </div>
              </div>
            ) : fredLoading && Object.keys(fredData).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <Loader size={18} className="spin" style={{ color: 'var(--accent)', marginBottom: '8px' }} />
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t3)' }}>Loading FRED data…</div>
              </div>
            ) : (
              <>
                {/* Active alerts — indicators with notable readings */}
                {fredAlerts.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div className="mono" style={{ fontSize: '8px', color: 'var(--yellow)', letterSpacing: '0.12em', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(251,191,36,0.2)' }}>
                      ◈ ACTIVE MACRO SIGNALS
                    </div>
                    {fredAlerts.map(sig => (
                      <div key={sig.id} style={{ padding: '8px 10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', marginBottom: '5px',
                        borderLeft: `3px solid ${sig.severity === 'critical' ? 'var(--red)' : sig.severity === 'high' ? 'var(--orange)' : 'var(--yellow)'}` }}>
                        <div style={{ fontSize: '11px', color: 'var(--t1)', lineHeight: 1.5 }}>{sig.summary || sig.title}</div>
                        <a href={sig.url} target="_blank" rel="noopener noreferrer" className="mono"
                          style={{ fontSize: '8px', color: 'var(--accent)', textDecoration: 'underline', textDecorationColor: 'rgba(45,212,191,0.3)' }}>
                          ↗ FRED
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {/* Grouped indicators */}
                {['stress', 'energy', 'rates', 'inflation', 'money', 'labor'].map(group => {
                  const groupSeries = FRED_SERIES.filter(s => s.group === group)
                  const groupData   = groupSeries.map(s => fredData[s.id]).filter(Boolean)
                  if (!groupData.length) return null
                  const groupLabels = { stress: '◈ MARKET STRESS', energy: '⛽ ENERGY', rates: '$ RATES & YIELDS', inflation: '📈 INFLATION', money: '◎ MONEY SUPPLY', labor: '👤 LABOR' }
                  return (
                    <div key={group} style={{ marginBottom: '16px' }}>
                      <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.12em', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid var(--border)' }}>
                        {groupLabels[group] || group.toUpperCase()}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px' }}>
                        {groupSeries.map(s => {
                          const d = fredData[s.id]
                          if (!d) return null
                          const hasAlert = !!d.alert
                          const chgColor = d.changePct == null ? 'var(--t4)'
                            : d.changePct > 0 ? 'var(--green)' : d.changePct < 0 ? 'var(--red)' : 'var(--t4)'
                          const alertColor = { critical: 'var(--red)', high: 'var(--orange)', medium: 'var(--yellow)', low: 'var(--accent)' }[d.severity] || 'var(--border)'
                          return (
                            <a key={s.id} href={`https://fred.stlouisfed.org/series/${s.id}`} target="_blank" rel="noopener noreferrer"
                              style={{ padding: '10px', background: 'var(--panel)', border: `1px solid ${hasAlert ? alertColor + '60' : 'var(--border)'}`,
                                borderRadius: '3px', textDecoration: 'none', display: 'block',
                                borderLeft: hasAlert ? `3px solid ${alertColor}` : '3px solid var(--border)' }}>
                              <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '3px' }}>{s.label}</div>
                              <div style={{ fontFamily: 'Orbitron', fontSize: '14px', fontWeight: 700, color: hasAlert ? alertColor : 'var(--t1)', marginBottom: '3px' }}>
                                {s.unit === '$' ? '$' : ''}{typeof d.value === 'number' ? d.value.toFixed(d.value > 1000 ? 0 : 2) : '—'}{s.unit !== '$' && s.unit ? ' ' + s.unit : ''}
                              </div>
                              {d.changePct != null && (
                                <div className="mono" style={{ fontSize: '9px', color: chgColor }}>
                                  {d.changePct > 0 ? '+' : ''}{d.changePct.toFixed(2)}%
                                </div>
                              )}
                              <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)', marginTop: '2px' }}>{d.date}</div>
                              {hasAlert && d.alert && (
                                <div style={{ marginTop: '5px', fontSize: '9px', color: alertColor, lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: '4px' }}>
                                  {d.alert.slice(0, 80)}{d.alert.length > 80 ? '…' : ''}
                                </div>
                              )}
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* ── FX ── */}
        {tab === 'fx' && (
          <div style={{ padding: '12px 14px' }}>
            {!fxKey ? (
              <div style={{ padding: '14px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--t2)', marginBottom: '4px' }}>Add ExchangeRate API key for live FX</div>
                <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)', lineHeight: 1.6 }}>
                  Free at exchangerate-api.com · 1,500 req/month · add in Settings
                </div>
              </div>
            ) : !fx ? (
              <div style={{ padding: '14px', textAlign: 'center' }}>
                <Loader size={18} className="spin" style={{ color: 'var(--accent)', marginBottom: '8px' }} />
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t3)' }}>Loading FX rates…</div>
              </div>
            ) : (
              <>
                <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '10px', letterSpacing: '0.1em' }}>
                  LIVE FX · USD BASE · {lastUpdate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px', marginBottom: '16px' }}>
                  {FX_PAIRS.map(({ sym, base, invert }) => {
                    const rate = fx[base]
                    if (!rate) return null
                    const display = invert ? (1 / rate) : rate
                    return (
                      <div key={sym} style={{ padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                        <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)', marginBottom: '4px' }}>{sym}</div>
                        <div style={{ fontFamily: 'Orbitron', fontSize: '16px', fontWeight: 700, color: 'var(--accent)' }}>
                          {display.toFixed(base === 'JPY' || base === 'KRW' || base === 'INR' ? 2 : 4)}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Extended pairs */}
                <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '8px', letterSpacing: '0.1em' }}>EXTENDED PAIRS</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                  {['SGD','AED','NOK','SEK','DKK','PLN','HUF','CZK','ILS','THB','IDR','PHP','MYR','NGN','EGP'].map(cur => {
                    const r = fx[cur]
                    return r ? (
                      <div key={cur} style={{ padding: '5px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '2px', textAlign: 'center' }}>
                        <div className="mono" style={{ fontSize: '7px', color: 'var(--t4)' }}>USD/{cur}</div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)', fontWeight: 600 }}>
                          {r.toFixed(cur === 'IDR' || cur === 'NGN' ? 0 : 2)}
                        </div>
                      </div>
                    ) : null
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── CRYPTO ── */}
        {tab === 'crypto' && (
          <div style={{ padding: '12px 14px' }}>
            <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginBottom: '10px', letterSpacing: '0.1em' }}>
              CRYPTO · VIA COINGECKO · FREE · NO KEY REQUIRED
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px', marginBottom: '16px' }}>
              {CRYPTOS.map(c => {
                const d = crypto[c.id]
                return (
                  <div key={c.id} style={{ padding: '12px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px',
                    borderLeft: `3px solid ${!d ? 'var(--border)' : (d.usd_24h_change || 0) > 0 ? 'var(--green)' : 'var(--red)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span className="mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>{c.sym}</span>
                      {d && <ChangeTag value={d.usd_24h_change} />}
                    </div>
                    <div style={{ fontFamily: 'Orbitron', fontSize: '16px', fontWeight: 700, color: 'var(--t1)' }}>
                      {d ? '$' + fmt(d.usd, d.usd > 100 ? 2 : d.usd > 1 ? 3 : 5) : <Loader size={12} className="spin" style={{ color: 'var(--t4)' }} />}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '3px' }}>{c.id.charAt(0).toUpperCase() + c.id.slice(1)}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ textAlign: 'center', padding: '10px' }}>
              <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer" className="btn" style={{ fontSize: '10px' }}>
                <ExternalLink size={10} /> Full crypto data at CoinGecko
              </a>
            </div>
          </div>
        )}

        {/* ── MARKET NEWS ── */}
        {tab === 'news' && (
          <div>
            <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--border)', background: 'var(--base)' }}>
              <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.1em' }}>
                {news.length} ARTICLES · {FINANCE_FEEDS.length} SOURCES · LIVE RSS
              </span>
            </div>
            {news.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <Loader size={20} className="spin" style={{ color: 'var(--accent)', marginBottom: '10px' }} />
                <div className="mono" style={{ fontSize: '10px', color: 'var(--t3)' }}>Loading market news…</div>
              </div>
            ) : (
              news.map((a, i) => <FinanceNewsRow key={i} article={a} />)
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FinanceNewsRow({ article }) {
  const [open, setOpen] = useState(false)
  const { save, unsave, isSaved } = useStore()
  const saved = isSaved(article.id)

  return (
    <div onClick={() => setOpen(o => !o)}
      style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '3px' }}>
        <a href={article.url !== '#' ? article.url : undefined} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ fontFamily: 'JetBrains Mono', fontSize: '9px', fontWeight: 600, color: 'var(--accent)',
            textDecoration: 'underline', textDecorationColor: 'rgba(45,212,191,0.35)' }}>
          ↗ {article.source}
        </a>
        <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', marginLeft: 'auto' }}>
          {article.pub ? article.pub.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t1)', lineHeight: 1.4 }}>{article.title}</div>
      {open && (
        <div onClick={e => e.stopPropagation()} className="fade-in" style={{ marginTop: '7px' }}>
          {article.summary && <p style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.7, marginBottom: '7px' }}>{article.summary}</p>}
          <div style={{ display: 'flex', gap: '5px' }}>
            <button className={`btn ${saved ? 'btn-accent' : ''}`} style={{ fontSize: '9px', padding: '2px 7px' }}
              onClick={() => saved ? unsave(article.id) : save(article)}>
              {saved ? <><BookmarkCheck size={9}/> saved</> : <><Bookmark size={9}/> save</>}
            </button>
            {article.url !== '#' && (
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="btn"
                style={{ fontSize: '9px', padding: '2px 7px' }} onClick={e => e.stopPropagation()}>
                <ExternalLink size={9}/> read
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Saved Panel ───────────────────────────────────────────────────────────────
export function SavedPanel() {
  const { saved, unsave } = useStore()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
        <Bookmark size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ fontFamily: 'Orbitron', fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.1em' }}>SAVED</span>
        <span className="chip chip-accent">{saved.length}</span>
        {saved.length > 0 && (
          <button className="btn btn-danger" style={{ marginLeft: 'auto', fontSize: '9px', padding: '2px 8px' }}
            onClick={() => { if (window.confirm('Clear all saved?')) saved.forEach(a => unsave(a.id)) }}>
            <Trash2 size={10}/> clear all
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {saved.length === 0
          ? <div style={{ padding: '32px', textAlign: 'center' }}>
              <Bookmark size={24} style={{ color: 'var(--t4)', marginBottom: '8px' }} />
              <p style={{ color: 'var(--t3)', fontSize: '12px' }}>No saved articles yet</p>
            </div>
          : saved.map(a => <ArticleCard key={a.id} article={a} />)
        }
      </div>
    </div>
  )
}

// ── Settings Panel ────────────────────────────────────────────────────────────
export function SettingsPanel() {
  const { keys, setKey, watchlist, addWatch, removeWatch } = useStore()
  const [local, setLocal]    = useState({ ...keys })
  const [show,  setShow]     = useState({})
  const [savedMsg, setSavedMsg] = useState(false)
  const [wInput, setWInput]  = useState('')

  const saveAll = () => {
    Object.entries(local).forEach(([k, v]) => setKey(k, v))
    setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2000)
  }

  const FIELDS = [
    { k:'groq',          label:'Groq API Key',          hint:'console.groq.com · FREE · AI briefings + entity resolution', ph:'gsk_…', url:'https://console.groq.com', group:'AI' },
    { k:'newsapi',       label:'NewsAPI Key',            hint:'newsapi.org · FREE · news search',                          ph:'abc…',  url:'https://newsapi.org',       group:'NEWS' },
    { k:'gnews',         label:'GNews Key',              hint:'gnews.io · FREE · global breaking news',                    ph:'abc…',  url:'https://gnews.io',          group:'NEWS' },
    { k:'newsdata',      label:'NewsData.io Key',        hint:'newsdata.io · FREE 200/day · full article content',         ph:'pub_…', url:'https://newsdata.io',       group:'NEWS' },
    { k:'acled_key',     label:'ACLED Key',              hint:'acleddata.com · FREE · every conflict event on Earth, daily', ph:'abc…', url:'https://acleddata.com/register', group:'CONFLICT' },
    { k:'acled_email',   label:'ACLED Email',            hint:'acleddata.com · your registered email', ph:'you@university.edu', url:'https://acleddata.com/user/login', group:'CONFLICT' },
    { k:'acled_pass',    label:'ACLED Password',         hint:'OAuth auto-login — stored only in your browser (not in code)', ph:'Your acleddata.com password', group:'CONFLICT', type:'password' },
    { k:'firms',         label:'NASA FIRMS Key',         hint:'firms.modaps.eosdis.nasa.gov · FREE · satellite fire detection', ph:'abc…', url:'https://firms.modaps.eosdis.nasa.gov/api/area/', group:'SATELLITE' },
    { k:'aisstream',     label:'AISStream Key',          hint:'aisstream.io · FREE · real-time global AIS ship positions', ph:'abc…', url:'https://aisstream.io', group:'MARITIME' },
    { k:'shodan',        label:'Shodan API Key',         hint:'shodan.io · FREE 1k/mo · exposed devices, ship transponders, CVEs', ph:'abc…', url:'https://account.shodan.io', group:'CYBER' },
    { k:'censys_id',     label:'Censys API ID',          hint:'censys.io · FREE research · TLS certs, infrastructure scanning', ph:'abc…', url:'https://accounts.censys.io', group:'CYBER' },
    { k:'censys_secret', label:'Censys API Secret',      hint:'censys.io · paired with API ID above',                     ph:'abc…', url:'https://accounts.censys.io', group:'CYBER' },
    { k:'otx',           label:'AlienVault OTX Key · ✅ CONFIGURED', hint:'otx.alienvault.com · FREE · threat pulses, IOCs, malware', ph:'abc…', url:'https://otx.alienvault.com/settings', group:'CYBER' },
    { k:'spacetrack_user',label:'SpaceTrack Username',   hint:'space-track.org · FREE · US Space Force — all 27k+ orbital objects', ph:'email@…', url:'https://www.space-track.org/auth/createAccount', group:'SPACE' },
    { k:'spacetrack_pass',label:'SpaceTrack Password',   hint:'space-track.org · your account password',                  ph:'••••', url:'https://www.space-track.org/auth/createAccount', group:'SPACE' },
    { k:'fec',           label:'FEC API Key',            hint:'api.open.fec.gov · FREE instant · US campaign finance, donations', ph:'abc…', url:'https://api.open.fec.gov/developers/', group:'OSINT' },
    { k:'opencorp',      label:'OpenCorporates Token',   hint:'✅ Preconfigured — 50k/month · 200M company records worldwide · override here if needed', ph:'F6ypvqUI1qEk2OCJJQfC', url:'https://opencorporates.com/api_accounts/new', group:'OSINT' },
    { k:'ch_key',         label:'UK Companies House Key · ✅ CONFIGURED', hint:'developer.companieshouse.gov.uk · FREE · UK corporate registry + beneficial ownership', ph:'abc…', url:'https://developer.companieshouse.gov.uk', group:'OSINT' },
    { k:'cf_token',       label:'Cloudflare API Token · ✅ CONFIGURED', hint:'dash.cloudflare.com · Internet outage detection via Cloudflare Radar', ph:'abc…', url:'https://dash.cloudflare.com/profile/api-tokens', group:'OSINT' },
    { k:'intelx_key',     label:'IntelX API Key · ✅ CONFIGURED', hint:'free.intelx.io · FREE tier · breach data, paste search, dark web indexed, phonebook search', ph:'6a3d39ff-…', url:'https://intelx.io/account', group:'OSINT' },
    { k:'hibp_key',       label:'HaveIBeenPwned Key',       hint:'haveibeenpwned.com · $3.50/mo · check if email/domain appears in data breaches', ph:'…', url:'https://haveibeenpwned.com/API/Key', group:'OSINT' },
    { k:'hunter_key',     label:'Hunter.io API Key',        hint:'hunter.io · FREE 25/mo · find professional email addresses, verify emails', ph:'…', url:'https://hunter.io/api', group:'OSINT' },
    { k:'dehashed_key',   label:'DeHashed API Key',         hint:'dehashed.com · paid · credential leak search across 15B+ records', ph:'…', url:'https://www.dehashed.com/login', group:'OSINT' },
    { k:'wigle_key',      label:'WiGLE API Key',            hint:'wigle.net · FREE · WiFi network geolocation OSINT', ph:'…', url:'https://wigle.net/account', group:'OSINT' },
    { k:'urlscan_key',    label:'URLScan.io API Key',       hint:'urlscan.io · FREE 5000/day · website scan, screenshot, TLS, IP intel', ph:'…', url:'https://urlscan.io/user/apikey', group:'CYBER' },
    { k:'virustotal_key', label:'VirusTotal API Key · ✅ CONFIGURED', hint:'virustotal.com · FREE 500/day · file/URL/IP/domain threat intel', ph:'…', url:'https://www.virustotal.com/gui/my-apikey', group:'CYBER' },
    { k:'abuseipdb_key',  label:'AbuseIPDB API Key',        hint:'abuseipdb.com · FREE 1000/day · IP abuse/attack reporting database', ph:'…', url:'https://www.abuseipdb.com/account/api', group:'CYBER' },
    { k:'sectrails_key',  label:'SecurityTrails API Key',   hint:'securitytrails.com · FREE 50/mo · DNS history, subdomains, WHOIS history', ph:'…', url:'https://securitytrails.com/app/account/credentials', group:'CYBER' },
    { k:'urlscan_key',    label:'URLScan.io API Key',        hint:'urlscan.io · FREE 100/day · website analysis, screenshots, threat detection', ph:'…', url:'https://urlscan.io/user/signup', group:'CYBER' },
    { k:'virustotal_key', label:'VirusTotal API Key',        hint:'virustotal.com · FREE 500/day · file, URL, IP, domain threat intelligence', ph:'…', url:'https://www.virustotal.com/gui/join-us', group:'CYBER' },
    { k:'abuseipdb_key',  label:'AbuseIPDB API Key',         hint:'abuseipdb.com · FREE 1000/day · IP reputation and abuse reports', ph:'…', url:'https://www.abuseipdb.com/register', group:'CYBER' },
    { k:'sectrails_key',  label:'SecurityTrails API Key',    hint:'securitytrails.com · FREE 50/mo · DNS history, subdomains, IP history', ph:'…', url:'https://securitytrails.com/app/account', group:'OSINT' },
    { k:'leakix_key',     label:'LeakIX API Key',            hint:'leakix.net · FREE · exposed services, data leak detection', ph:'…', url:'https://leakix.net/register', group:'CYBER' },
    { k:'wigle',         label:'Wigle.net Token',        hint:'wigle.net · FREE · WiFi + cell tower mapping globally',    ph:'abc==…', url:'https://wigle.net/account', group:'OSINT' },
    { k:'ipinfo',        label:'IPinfo Token',           hint:'ipinfo.io · FREE 50k/mo · IP → location + org + ASN',     ph:'abc…', url:'https://ipinfo.io/signup', group:'OSINT' },
    { k:'reddit_id',     label:'Reddit Client ID',       hint:'reddit.com/prefs/apps · FREE · early-warning conflict signals', ph:'abc…', url:'https://www.reddit.com/prefs/apps', group:'SOCIAL' },
    { k:'reddit_secret', label:'Reddit Client Secret',   hint:'reddit.com/prefs/apps · paired with Client ID',           ph:'abc…', url:'https://www.reddit.com/prefs/apps', group:'SOCIAL' },
    { k:'fred',          label:'FRED API Key',           hint:'fred.stlouisfed.org · FREE · macro signals: VIX, oil, CPI', ph:'abc…', url:'https://fred.stlouisfed.org/docs/api/api_key.html', group:'MARKETS' },
    { k:'exchangerate',  label:'ExchangeRate Key',       hint:'exchangerate-api.com · FREE 1,500/mo · live FX rates',    ph:'abc…', url:'https://exchangerate-api.com', group:'MARKETS' },
    { k:'alphavantage',  label:'Alpha Vantage Key',      hint:'alphavantage.co · FREE · market news + sentiment',        ph:'abc…', url:'https://alphavantage.co', group:'MARKETS' },
  ]
  const groups = [...new Set(FIELDS.map(f => f.group))]

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--void)' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ marginBottom: '24px' }}>
          <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.12em', marginBottom: '3px' }}>CONFIGURATION</div>
          <div style={{ fontFamily: 'Orbitron', fontSize: '16px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em' }}>NEXUS SETTINGS</div>
        </div>

        <SSection title="API KEYS">
          <p style={{ fontSize: '11px', color: 'var(--t3)', lineHeight: 1.7, marginBottom: '14px', padding: '8px 10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '3px' }}>
            All keys stored in your browser only. Never sent anywhere except the respective API. All keys are optional — RSS + GDELT + CoinGecko work without any key.
          </p>
          {groups.map(group => (
            <div key={group} style={{ marginBottom:'20px' }}>
              <div className="mono" style={{ fontSize:'8px', color:'var(--accent)', letterSpacing:'0.15em', marginBottom:'10px', paddingBottom:'4px', borderBottom:'1px solid var(--border)' }}>── {group}</div>
              {FIELDS.filter(f => f.group === group).map(f => (
            <div key={f.k} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
                <span style={{ fontSize: '11px', color: 'var(--t2)' }}>{f.label}</span>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="mono"
                  style={{ fontSize: '8px', color: 'var(--accent)', textDecoration: 'none' }}>get key ↗</a>
              </div>
              <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)', marginBottom: '5px' }}>{f.hint}</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type={show[f.k] ? 'text' : 'password'}
                  value={local[f.k] || ''} onChange={e => setLocal(l => ({ ...l, [f.k]: e.target.value }))}
                  placeholder={keys[f.k] ? '••••••••••••••••' : f.ph} className="inp" />
                <button className="btn" style={{ padding: '4px 8px' }} onClick={() => setShow(s => ({ ...s, [f.k]: !s[f.k] }))}>
                  {show[f.k] ? <EyeOff size={11}/> : <Eye size={11}/>}
                </button>
              </div>
              {keys[f.k] && <div className="mono" style={{ fontSize: '9px', color: 'var(--green)', marginTop: '3px' }}>✓ configured</div>}
            </div>
          ))}
            </div>
          ))}
        </SSection>

        <SSection title="WATCHLIST">
          <p style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '10px' }}>Terms that trigger alerts when they appear in new articles.</p>
          <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
            <input value={wInput} onChange={e => setWInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && wInput.trim()) { addWatch(wInput.trim()); setWInput('') } }}
              placeholder="Add term…" className="inp" />
            <button className="btn btn-accent" onClick={() => { if (wInput.trim()) { addWatch(wInput.trim()); setWInput('') } }}>add</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {watchlist.map(t => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'JetBrains Mono', fontSize: '9px', padding: '2px 7px', background: 'rgba(45,212,191,0.07)', border: '1px solid rgba(45,212,191,0.2)', borderRadius: '3px', color: 'var(--accent)' }}>
                {t}
                <button onClick={() => removeWatch(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        </SSection>

        <button className="btn btn-accent" onClick={saveAll} style={{ justifyContent: 'center', fontSize: '11px', padding: '8px 20px' }}>
          <Save size={12}/> {savedMsg ? '✓ saved' : 'save settings'}
        </button>
      </div>
    </div>
  )
}

function SSection({ title, children }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.12em' }}>{title}</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
      </div>
      {children}
    </div>
  )
}
