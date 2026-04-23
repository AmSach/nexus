/**
 * FinanceNews v3 — Staggered multi-source financial intelligence feed
 * 40+ sources, requests staggered to avoid rss2json rate limiting
 * Uses rss2json for most, allorigins for others, direct fetch for CORS-native
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ExternalLink, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useFinanceIntel, WATCHLIST } from '../../hooks/useFinanceIntel'

// Multiple proxy options
const RSS2 = url => '/api/rss?count=15&url=' + encodeURIComponent(url)
const RSS2_FREE = url => '/api/rss?count=15&url=' + encodeURIComponent(url)
const AO = url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
const CORSPROXY = url => `https://corsproxy.io/?${encodeURIComponent(url)}`

const SOURCES = [
  // Tier 1 - Most reliable, native CORS or well-known feeds
  { id:'nws_econ',   label:'AP Economics',        cat:'macro',    url:'https://feeds.nbcnews.com/nbcnews/public/business',                          proxy:'rss2' },
  { id:'reliefweb',  label:'UN ReliefWeb',        cat:'macro',    url:'https://reliefweb.int/updates/rss.xml',                              proxy:'rss2' },
  { id:'usgs_eq',    label:'USGS Earthquakes',    cat:'disaster', url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.atom', proxy:'rss2' },
  { id:'nhc',        label:'NOAA Climate',        cat:'disaster', url:'https://www.climate.gov/news-features/feed',              proxy:'rss2' },
  // Macro / Global Finance
  { id:'reuters_biz',label:'Reuters Business',    cat:'macro',    url:'https://feeds.bbci.co.uk/news/business/rss.xml',                proxy:'rss2' },
  { id:'reuters_fin',label:'Reuters Finance',     cat:'macro',    url:'https://feeds.bbci.co.uk/news/world/rss.xml',               proxy:'rss2' },
  { id:'economist',  label:'The Economist',       cat:'macro',    url:'https://www.economist.com/finance-and-economics/rss.xml',      proxy:'rss2' },
  { id:'imf',        label:'IMF Blog',            cat:'macro',    url:'https://www.imf.org/en/News/rss?ids=4',                       proxy:'rss2' },
  { id:'worldbank',  label:'World Bank',          cat:'macro',    url:'https://blogs.worldbank.org/rss.xml',                   proxy:'rss2' },
  { id:'bis',        label:'BIS Research',        cat:'macro',    url:'https://www.bis.org/rss/speech.rss',                            proxy:'rss2' },
  { id:'cfr',        label:'CFR Economics',       cat:'macro',    url:'https://www.cfr.org/rss/economics-finance-and-trade.xml',      proxy:'rss2' },
  // Markets
  { id:'cnbc_mkt',   label:'CNBC Markets',        cat:'markets',  url:'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069', proxy:'rss2' },
  { id:'mktwatch',   label:'MarketWatch',         cat:'markets',  url:'https://feeds.marketwatch.com/marketwatch/topstories/',        proxy:'rss2' },
  { id:'yahoo_fin',  label:'Yahoo Finance',       cat:'markets',  url:'https://finance.yahoo.com/news/rssindex',                     proxy:'rss2' },
  { id:'zerohedge',  label:'Zero Hedge',          cat:'markets',  url:'https://feeds.feedburner.com/zerohedge/feed',                  proxy:'rss2' },
  { id:'dealbook',   label:'NYT DealBook',        cat:'markets',  url:'https://rss.nytimes.com/services/xml/rss/nyt/DealBook.xml',   proxy:'rss2' },
  { id:'seeking',    label:'Barron\'s Markets',  cat:'markets',  url:'https://www.barrons.com/feed/rss2_0.xml',               proxy:'rss2' },
  // Central Banks
  { id:'fed',        label:'Federal Reserve',     cat:'central',  url:'https://www.federalreserve.gov/feeds/press_all.xml',           proxy:'rss2' },
  { id:'ecb',        label:'ECB Newsroom',        cat:'central',  url:'https://www.ecb.europa.eu/press/pr/activities/mopo/html/index.en.rss',                     proxy:'rss2' },
  { id:'boe',        label:'Bank of England',     cat:'central',  url:'https://www.bankofengland.co.uk/rss/news',                 proxy:'rss2' },
  // Energy / Commodities
  { id:'oilprice',   label:'OilPrice.com',        cat:'commodities', url:'https://oilprice.com/rss/main',                            proxy:'rss2' },
  { id:'oilprice2',  label:'OilPrice Oil News',   cat:'commodities', url:'https://oilprice.com/rss/oil-news',                        proxy:'rss2' },
  { id:'kitco',      label:'Kitco Gold',          cat:'commodities', url:'https://www.kitco.com/rss/general.rss',                    proxy:'rss2' },
  { id:'mining',     label:'Mining.com',          cat:'commodities', url:'https://www.mining.com/feed/',                             proxy:'rss2' },
  // Crypto
  { id:'coindesk',   label:'CoinDesk',            cat:'crypto',   url:'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml',             proxy:'rss2' },
  { id:'cointele',   label:'CoinTelegraph',       cat:'crypto',   url:'https://cointelegraph.com/rss',                              proxy:'rss2' },
  { id:'decrypt',    label:'Decrypt',             cat:'crypto',   url:'https://decrypt.co/feed',                                    proxy:'rss2' },
  // Asia / EM
  { id:'nikkei',     label:'Nikkei Asia',         cat:'asia',     url:'https://japannews.yomiuri.co.jp/feed/',                       proxy:'rss2' },
  { id:'scmp',       label:'SCMP Business',       cat:'asia',     url:'https://www.scmp.com/rss/92/feed',                           proxy:'rss2' },
  { id:'livemint',   label:'LiveMint India',      cat:'asia',     url:'https://www.livemint.com/rss/markets',                       proxy:'rss2' },
  { id:'arabnews',   label:'Arab News Business',  cat:'mideast',  url:'https://www.arabnews.com/rss.xml?pid=23',                   proxy:'rss2' },
  // Sanctions / Trade / Policy
  { id:'ofac_news',  label:'US Treasury',         cat:'sanctions',url:'https://home.treasury.gov/system/files/press-releases.rss',  proxy:'rss2' },
  { id:'wto',        label:'WTO News',            cat:'sanctions',url:'https://www.wto.org/english/news_e/news_rss_e.xml',          proxy:'rss2' },
  { id:'tradefinance',label:'Trade Finance Global',cat:'sanctions',url:'https://www.tradefinanceglobal.com/feed/',                  proxy:'rss2' },
  // Tech / FinTech
  { id:'techcrunch', label:'TechCrunch Finance',  cat:'tech',     url:'https://techcrunch.com/category/fintech/feed/',              proxy:'rss2' },
  // Space weather (affects commodities/satellites)
  { id:'spacewx',    label:'Space Weather',       cat:'macro',    url:'https://www.swpc.noaa.gov/feeds/alerts.atom',                proxy:'rss2' },
  // More markets
  { id:'barrons',    label:"Barron's",            cat:'markets',  url:'https://www.barrons.com/feed/rss2_0.xml',                    proxy:'rss2' },
  { id:'ft_lex',     label:'FT Lex Column',       cat:'markets',  url:'https://www.ft.com/rss/home/uk',                             proxy:'rss2' },
  // Emerging markets
  { id:'bloomberg_em',label:'Bloomberg Markets',  cat:'markets',  url:'https://feeds.bloomberg.com/markets/news.rss',               proxy:'rss2' },
  { id:'wsj',        label:'WSJ Markets',         cat:'markets',  url:'https://feeds.content.dowjones.io/public/rss/mktw_realtimeheadlines', proxy:'rss2' },
]

const CATS = [
  { id:'all',         label:'All' },
  { id:'macro',       label:'🌍 Macro' },
  { id:'markets',     label:'📈 Markets' },
  { id:'central',     label:'🏦 Central Banks' },
  { id:'commodities', label:'🛢️ Commodities' },
  { id:'crypto',      label:'₿ Crypto' },
  { id:'asia',        label:'🌏 Asia/EM' },
  { id:'mideast',     label:'🌍 Mid East' },
  { id:'sanctions',   label:'⚠️ Trade/Sanctions' },
  { id:'tech',        label:'💻 FinTech' },
  { id:'disaster',    label:'🆘 Crisis/Disaster' },
]

async function fetchSource(src) {
  if (src.proxy === 'json') {
    try {
      const r = await fetch(src.url, { signal: AbortSignal.timeout(10000) })
      if (!r.ok) return []
      const d = await r.json()
      return (d?.data || []).map(item => ({
        id: item.fields?.url || item.href,
        title: item.fields?.title || '',
        link: item.fields?.url || '',
        pub: item.fields?.date?.created ? new Date(item.fields.date.created) : new Date(),
        source: src.label, cat: src.cat,
        desc: (item.fields?.body || '').replace(/<[^>]+>/g,'').slice(0,250),
      })).filter(a => a.title?.length > 5)
    } catch { return [] }
  }

  // rss2json - try paid key first, then free
  for (const proxyFn of [RSS2, RSS2_FREE]) {
    try {
      const r = await fetch(proxyFn(src.url), { signal: AbortSignal.timeout(12000) })
      if (!r.ok) continue
      const d = await r.json()
      if (d.status !== 'ok') continue
      return (d.items || []).map(item => ({
        id: item.link || item.guid || item.title,
        title: (item.title || '').replace(/<[^>]+>/g,'').trim(),
        link: item.link,
        pub: item.pubDate ? new Date(item.pubDate) : new Date(),
        source: src.label, cat: src.cat,
        desc: (item.description || item.content || '').replace(/<[^>]+>/g,'').trim().slice(0,300),
      })).filter(a => a.title.length > 5)
    } catch {}
  }

  // Last resort: allorigins + parse RSS manually
  try {
    const raw = await fetch(AO(src.url), { signal: AbortSignal.timeout(12000) })
    if (!raw.ok) return []
    const txt = await raw.text()
    const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    return items.slice(0,15).map(m => {
      const block = m[1]
      const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '').trim()
      const link = (block.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] || block.match(/<guid[^>]*>(.*?)<\/guid>/i)?.[1] || '').trim()
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]
      return { id:link||title, title, link, pub:pubDate?new Date(pubDate):new Date(), source:src.label, cat:src.cat, desc:'' }
    }).filter(a => a.title.length > 5)
  } catch { return [] }
}

function useArticles() {
  const [arts, setArts] = useState([])
  const [srcStatus, setSrcStatus] = useState({})
  const [loading, setLoading] = useState(false)
  const [ts, setTs] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const seen = new Set()
    const all = []
    const status = {}

    // Load from cache immediately
    try {
      const cached = JSON.parse(localStorage.getItem('nexus-finance-v3') || '{}')
      if (cached.arts?.length && Date.now() - cached.ts < 20*60*1000) {
        setArts(cached.arts.map(a => ({...a, pub: new Date(a.pub)})))
      }
    } catch {}

    // Fetch in batches of 6 to avoid rate limiting
    for (let i = 0; i < SOURCES.length; i += 6) {
      const batch = SOURCES.slice(i, i+6)
      const results = await Promise.allSettled(batch.map(src => fetchSource(src)))
      results.forEach((r, j) => {
        const src = batch[j]
        const items = r.status === 'fulfilled' ? r.value : []
        status[src.id] = items.length > 0
        items.forEach(a => {
          const k = (a.title||'').slice(0,40)
          if (!seen.has(k) && a.title) { seen.add(k); all.push(a) }
        })
      })
      // Update state after each batch so user sees progressive loading
      all.sort((a,b) => b.pub - a.pub)
      setArts([...all])
      setSrcStatus({...status})
      if (i + 6 < SOURCES.length) await new Promise(r => setTimeout(r, 300))
    }

    setTs(new Date())
    setLoading(false)

    // Cache result
    try {
      localStorage.setItem('nexus-finance-v3', JSON.stringify({ ts: Date.now(), arts: all.slice(0,600) }))
    } catch {}
  }, [])

  useEffect(() => { load(); const iv = setInterval(load, 12*60*1000); return ()=>clearInterval(iv) }, [load])
  return { arts, srcStatus, loading, ts, reload: load }
}

function ArticleRow({ a }) {
  const [open, setOpen] = useState(false)
  const ago = useMemo(() => {
    const m = Math.round((Date.now()-a.pub)/60000)
    return m<60 ? m+'m' : m<1440 ? Math.round(m/60)+'h' : Math.round(m/1440)+'d'
  }, [a.pub])
  return (
    <div onClick={() => setOpen(o=>!o)} style={{ padding:'7px 10px', borderBottom:'1px solid var(--border)', cursor:'pointer', background:open?'var(--surface)':'transparent' }}
      onMouseEnter={e=>!open&&(e.currentTarget.style.background='var(--hover)')}
      onMouseLeave={e=>!open&&(e.currentTarget.style.background='transparent')}>
      <div style={{ display:'flex', gap:'8px', alignItems:'flex-start' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'12px', color:'var(--t1)', lineHeight:1.4, marginBottom:'3px' }}>{a.title}</div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <span style={{ fontSize:'9px', color:'var(--accent)', background:'rgba(45,212,191,0.1)', padding:'1px 5px', borderRadius:'3px', fontWeight:700 }}>{a.source}</span>
            <span style={{ fontSize:'9px', color:'var(--t4)' }}>{ago} ago</span>
          </div>
        </div>
        <a href={a.link} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ color:'var(--t4)', flexShrink:0, marginTop:'2px' }}>
          <ExternalLink size={11}/>
        </a>
      </div>
      {open && a.desc && <div style={{ marginTop:'6px', fontSize:'11px', color:'var(--t3)', lineHeight:1.6 }}>{a.desc}</div>}
    </div>
  )
}


// ── Live price ticker for a single instrument ─────────────────────────────
function PriceTile({ label, data, color }) {
  if (!data) return (
    <div style={{ padding:'6px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px', minWidth:'90px', opacity:0.4 }}>
      <div style={{ fontSize:'8px', color:'var(--t4)', marginBottom:'2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</div>
      <div style={{ fontSize:'11px', color:'var(--t3)', fontFamily:'JetBrains Mono' }}>—</div>
    </div>
  )
  const price = data.price
  const prev  = data.prev
  const chg   = prev && price ? ((price - prev) / prev * 100) : null
  const up    = chg > 0, dn = chg < 0
  const clr   = up ? '#4ade80' : dn ? '#f87171' : 'var(--t3)'
  const fmt = (n) => {
    if (!n && n !== 0) return '—'
    if (n >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 2 })
    if (n >= 1)   return n.toFixed(2)
    return n.toFixed(4)
  }
  return (
    <div style={{ padding:'6px 10px', background:'var(--surface)', border:`1px solid ${color||'var(--border)'}22`, borderRadius:'4px', minWidth:'90px', flexShrink:0 }}>
      <div style={{ fontSize:'8px', color:'var(--t4)', marginBottom:'2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100px' }}>{label}</div>
      <div style={{ fontSize:'12px', color: color||'var(--t1)', fontFamily:'JetBrains Mono', fontWeight:700 }}>{fmt(price)}</div>
      {chg !== null && (
        <div style={{ fontSize:'9px', color:clr, display:'flex', alignItems:'center', gap:'2px', marginTop:'1px' }}>
          {up ? <TrendingUp size={8}/> : dn ? <TrendingDown size={8}/> : <Minus size={8}/>}
          {up?'+':''}{chg.toFixed(2)}%
        </div>
      )}
    </div>
  )
}

// ── Scrollable row of price tiles for a category ──────────────────────────
function PriceRow({ title, items, quotes, crypto, isCrypto }) {
  return (
    <div style={{ marginBottom:'8px' }}>
      <div className="mono" style={{ fontSize:'8px', color:'var(--t4)', letterSpacing:'0.1em', marginBottom:'4px', paddingLeft:'2px' }}>{title}</div>
      <div style={{ display:'flex', gap:'6px', overflowX:'auto', paddingBottom:'4px' }}>
        {items.map(item => {
          const data = isCrypto
            ? (crypto?.[item.id] ? { price: crypto[item.id].current_price, prev: crypto[item.id].current_price / (1 + (crypto[item.id].price_change_percentage_24h||0)/100) } : null)
            : (quotes?.[item.sym] || null)
          return <PriceTile key={item.sym||item.id} label={item.label} data={data} color={item.color} />
        })}
      </div>
    </div>
  )
}

// ── Full live prices panel ─────────────────────────────────────────────────
function LivePricesPanel({ collapsed, setCollapsed }) {
  const { quotes, crypto, loading: finLoading, lastUpdate, refresh: finRefresh } = useFinanceIntel()
  // crypto is an array from CoinGecko markets API — build a lookup map by id for PriceRow
  const cryptoMap = useMemo(() => {
    if (!Array.isArray(crypto)) return {}
    const m = {}
    crypto.forEach(c => { if (c?.id) m[c.id] = c })
    return m
  }, [crypto])
  const hasData = Object.keys(quotes).length > 0 || (Array.isArray(crypto) ? crypto.length > 0 : Object.keys(crypto||{}).length > 0)

  return (
    <div style={{ borderBottom:'1px solid var(--border)', background:'var(--base)', flexShrink:0 }}>
      {/* Toggle header */}
      <div onClick={()=>setCollapsed(c=>!c)} style={{ padding:'6px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', userSelect:'none' }}
        onMouseEnter={e=>e.currentTarget.style.background='var(--hover)'}
        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        <span style={{ fontSize:'10px', fontWeight:700, color:'var(--t1)' }}>📈 LIVE PRICES</span>
        <span style={{ fontSize:'9px', color: hasData ? '#4ade80' : '#f59e0b' }}>{hasData ? `${Object.keys(quotes).length + Object.keys(crypto).length} instruments live` : 'loading…'}</span>
        {finLoading && <RefreshCw size={9} style={{ animation:'spin 1s linear infinite', color:'var(--t4)' }}/>}
        {lastUpdate && !finLoading && <span style={{ fontSize:'8px', color:'var(--t4)', marginLeft:'auto' }}>↻{lastUpdate.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>}
        <button onClick={e=>{e.stopPropagation();finRefresh()}} style={{ fontSize:'8px', padding:'1px 6px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'3px', color:'var(--t3)', cursor:'pointer', marginLeft: lastUpdate ? '4px' : 'auto' }}>↺</button>
        <span style={{ fontSize:'9px', color:'var(--t4)', transform: collapsed?'rotate(0)':'rotate(180deg)', transition:'0.2s', display:'inline-block' }}>▼</span>
      </div>
      {!collapsed && (
        <div style={{ padding:'0 12px 10px', maxHeight:'340px', overflowY:'auto' }}>
          <PriceRow title="INDICES & DEFENSE" items={WATCHLIST.indices} quotes={quotes} />
          <PriceRow title="COMMODITIES — ENERGY" items={WATCHLIST.commodities.filter(x=>x.cat==='energy')} quotes={quotes} />
          <PriceRow title="COMMODITIES — METALS" items={WATCHLIST.commodities.filter(x=>x.cat==='metals')} quotes={quotes} />
          <PriceRow title="COMMODITIES — AGRICULTURE" items={WATCHLIST.commodities.filter(x=>x.cat==='agri')} quotes={quotes} />
          <PriceRow title="CRYPTO" items={WATCHLIST.crypto} quotes={quotes} crypto={cryptoMap} isCrypto />
          <PriceRow title="BONDS & RATES" items={WATCHLIST.bonds||[]} quotes={quotes} />
          <PriceRow title="FOREX" items={WATCHLIST.forex||[]} quotes={quotes} />
        </div>
      )}
    </div>
  )
}

export default function FinanceNews() {
  const [cat, setCat] = useState('all')
  const [search, setSearch] = useState('')
  const [pricesCollapsed, setPricesCollapsed] = useState(false)
  const { arts, srcStatus, loading, ts, reload } = useArticles()

  const shown = useMemo(() => {
    let a = cat==='all' ? arts : arts.filter(x=>x.cat===cat)
    if (search.trim()) { const q=search.toLowerCase(); a=a.filter(x=>x.title.toLowerCase().includes(q)||x.source.toLowerCase().includes(q)) }
    return a.slice(0,300)
  }, [arts, cat, search])

  const live = Object.values(srcStatus).filter(Boolean).length
  const total = SOURCES.length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--void)' }}>
      <LivePricesPanel collapsed={pricesCollapsed} setCollapsed={setPricesCollapsed} />
      {/* Header */}
      <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)', background:'var(--base)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
          <span style={{ fontSize:'13px', fontWeight:700, color:'var(--t1)' }}>📊 FINANCE INTELLIGENCE</span>
          <span style={{ fontSize:'9px', color: live>5?'#4ade80':'#f59e0b' }}>{arts.length} articles · {live}/{total} sources live</span>
          <div style={{ marginLeft:'auto', display:'flex', gap:'6px', alignItems:'center' }}>
            {ts && <span style={{ fontSize:'9px', color:'var(--t4)' }}>↻{ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>}
            <button onClick={reload} disabled={loading} style={{ padding:'3px 8px', fontSize:'10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'3px', color:'var(--t2)', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px' }}>
              <RefreshCw size={10} style={{ animation:loading?'spin 1s linear infinite':undefined }}/>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        <div style={{ display:'flex', gap:'3px', flexWrap:'wrap', marginBottom:'6px' }}>
          {CATS.map(c => (
            <button key={c.id} onClick={()=>setCat(c.id)} style={{ padding:'2px 7px', borderRadius:'3px', fontSize:'10px', cursor:'pointer', background:cat===c.id?'var(--accent)':'var(--surface)', border:`1px solid ${cat===c.id?'var(--accent)':'var(--border)'}`, color:cat===c.id?'#000':'var(--t3)', fontWeight:cat===c.id?700:400 }}>{c.label}</button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search finance news…"
          style={{ width:'100%', padding:'5px 8px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px', color:'var(--t1)', fontSize:'11px', outline:'none', boxSizing:'border-box' }}/>
      </div>
      {/* Articles */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading && !arts.length && (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--t4)' }}>
            <div style={{ fontSize:'24px', marginBottom:'8px' }}>📊</div>
            <div style={{ fontSize:'12px' }}>Loading {total} financial sources in batches…</div>
            <div style={{ fontSize:'10px', marginTop:'4px', color:'var(--t4)' }}>Staggered to avoid rate limits</div>
          </div>
        )}
        {shown.map(a => <ArticleRow key={a.id+a.source} a={a}/>)}
        {!loading && shown.length===0 && arts.length>0 && (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--t4)', fontSize:'12px' }}>No articles for this filter.</div>
        )}
      </div>
      {/* Source status */}
      <div style={{ padding:'4px 10px', borderTop:'1px solid var(--border)', background:'var(--base)', flexShrink:0, display:'flex', gap:'4px', flexWrap:'wrap' }}>
        {SOURCES.map(s => (
          <span key={s.id} title={`${s.label}: ${srcStatus[s.id]?'live':'unavailable'}`}
            style={{ fontSize:'8px', color:srcStatus[s.id]===undefined?'#6b7280':srcStatus[s.id]?'#4ade80':'#f87171' }}>
            {srcStatus[s.id]===undefined?'○':srcStatus[s.id]?'✓':'✗'} {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
