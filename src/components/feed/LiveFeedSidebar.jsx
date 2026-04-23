/**
 * LiveFeedSidebar v5 - Signal / Alerts / Markets
 * Imports from dedicated hooks (not inline). Error-safe.
 */
import React, { useState, useMemo, useEffect } from 'react'
import { usePolymarket } from '../../hooks/usePolymarket'
import { useTelegram } from '../../hooks/useTelegram'
import { useSatellite } from '../../hooks/useSatellite'
import { useKalshi } from '../../hooks/useKalshi'
import { useLiveAlerts } from '../../hooks/useLiveAlerts'
import { useSignalConvergence } from '../../hooks/useSignalConvergence'

const C = { critical:'#ef4444', high:'#f97316', medium:'#eab308', low:'#4ade80' }
const B = { critical:'rgba(239,68,68,0.08)', high:'rgba(249,115,22,0.06)', medium:'rgba(234,179,8,0.05)', low:'rgba(74,222,128,0.03)' }

function ProbBar({ prob }) {
  if (prob == null) return <span style={{ color:'var(--t4)', fontSize:'10px' }}>—</span>
  const pct = Math.round(prob * 100)
  const clr = pct >= 70 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 30 ? '#eab308' : '#4ade80'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'5px', flex:1 }}>
      <div style={{ flex:1, height:'3px', background:'var(--border)', borderRadius:'2px', overflow:'hidden' }}>
        <div style={{ height:'100%', width:pct+'%', background:clr }} />
      </div>
      <span style={{ fontSize:'10px', fontWeight:700, color:clr, minWidth:'28px', textAlign:'right' }}>{pct}%</span>
    </div>
  )
}

function SignalPane({ situations, satData }) {
  const [open, setOpen] = useState(null)
  const ucdpCount = satData?.ucdpFull?.length || 0
  const sanctionCount = satData?.openSanctions?.length || 0
  const osmCount = satData?.osmMilitary?.length || 0
  const wikiCount = satData?.wikidataConflicts?.length || 0
  const armsCount = satData?.armsTransferSignals?.length || 0
  const cordisCount = satData?.euCordis?.length || 0
  const topUCDP = (satData?.ucdpFull||[]).filter(e=>e.deaths_best>5).sort((a,b)=>(b.deaths_best||0)-(a.deaths_best||0)).slice(0,3)
  return (
    <div style={{ overflowY:'auto', flex:1 }}>
      {/* Source inventory strip */}
      {(ucdpCount+sanctionCount+osmCount) > 0 && (
        <div style={{ padding:'4px 8px', background:'rgba(45,212,191,0.04)', borderBottom:'1px solid var(--border)', display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {ucdpCount>0 && <span className="mono" style={{fontSize:'7px',color:'#ef4444'}}>☠ UCDP {ucdpCount}</span>}
          {sanctionCount>0 && <span className="mono" style={{fontSize:'7px',color:'#a78bfa'}}>🚫 Sanctions {sanctionCount}</span>}
          {osmCount>0 && <span className="mono" style={{fontSize:'7px',color:'#6b7280'}}>🏛 Mil-Infra {osmCount}</span>}
          {wikiCount>0 && <span className="mono" style={{fontSize:'7px',color:'#f97316'}}>📖 Wiki {wikiCount}</span>}
          {armsCount>0 && <span className="mono" style={{fontSize:'7px',color:'#f59e0b'}}>⚔ Arms {armsCount}</span>}
          {cordisCount>0 && <span className="mono" style={{fontSize:'7px',color:'#6366f1'}}>🔬 CORDIS {cordisCount}</span>}
        </div>
      )}
      {/* UCDP top conflicts by fatalities */}
      {topUCDP.length > 0 && (
        <div style={{ borderBottom:'1px solid var(--border)' }}>
          <div className="mono" style={{padding:'3px 8px',fontSize:'7px',color:'#ef4444',letterSpacing:'0.1em'}}>☠ HIGHEST FATALITY EVENTS (UCDP)</div>
          {topUCDP.map((e,i) => (
            <a key={i} href={`https://ucdp.uu.se/event/${e.id}`} target="_blank" rel="noopener"
              style={{display:'flex',gap:'6px',padding:'3px 8px',borderBottom:'1px solid rgba(255,255,255,0.03)',textDecoration:'none',alignItems:'flex-start'}}>
              <span style={{fontSize:'9px',color:'#ef4444',fontWeight:700,flexShrink:0,minWidth:'30px'}}>{e.deaths_best}☠</span>
              <div>
                <div style={{fontSize:'9px',color:'var(--t1)',lineHeight:1.3}}>{(e.dyad_name||'').slice(0,55)}</div>
                <div className="mono" style={{fontSize:'7px',color:'var(--t4)'}}>{e.country} · {e.date?.slice(0,10)||''}</div>
              </div>
            </a>
          ))}
        </div>
      )}
      <div style={{ padding:'5px 8px 2px', fontSize:'8px', color:'var(--t4)', letterSpacing:'0.1em' }}>MULTI-SOURCE CONVERGENCE · 7 LAYERS</div>
      {situations.map(s => {
        const clr = C[s.level] || '#2dd4bf'
        const isOpen = open === s.name
        return (
          <div key={s.name} style={{ borderBottom:'1px solid var(--border)' }}>
            <div onClick={() => setOpen(isOpen ? null : s.name)} style={{ padding:'6px 8px', cursor:'pointer', borderLeft:`3px solid ${isOpen ? clr : 'transparent'}`, background: isOpen ? B[s.level] : 'transparent' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' }}>
                <span style={{ fontSize:'9px', fontWeight:800, color:clr, background:clr+'18', padding:'1px 5px', borderRadius:'3px' }}>
                  {s.level === 'critical' ? 'S5' : s.level === 'high' ? 'S4' : s.level === 'medium' ? 'S3' : 'S1'}
                </span>
                <span style={{ fontSize:'11px', color:'var(--t1)', flex:1 }}>{s.name}</span>
                <span style={{ fontSize:'10px', fontWeight:700, color:clr }}>{s.cii}</span>
              </div>
              <div style={{ height:'3px', background:'var(--border)', borderRadius:'2px', overflow:'hidden' }}>
                <div style={{ height:'100%', width:Math.min(s.cii / 15 * 100, 100)+'%', background:clr }} />
              </div>
            </div>
            {isOpen && (
              <div style={{ padding:'4px 10px 8px', background:B[s.level], fontSize:'10px', color:'var(--t3)' }}>
                {s.signals?.length ? s.signals.map((sig, i) => (
                  <div key={i} style={{ display:'flex', gap:'6px', padding:'1px 0' }}>
                    <span style={{ flexShrink:0 }}>{sig.layer}</span>
                    <span style={{ color:clr, fontWeight:700 }}>+{sig.score}</span>
                    {sig.topItem && <span style={{ color:'var(--t4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, fontSize:'9px' }}>{sig.topItem}</span>}
                  </div>
                )) : <div>{s.articleCount} matching articles</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Planet Labs image strip ──────────────────────────────────────────────────
function PlanetImageStrip({ alerts }) {
  const items = (alerts || []).filter(a =>
    a.type === 'satellite_imagery' || a.source === 'Planet Labs' || a.source === 'Planet/NICFI'
  )
  if (!items.length) return null
  return (
    <div style={{ padding:'4px 6px', borderBottom:'1px solid var(--border)', background:'rgba(167,139,250,0.04)', flexShrink:0 }}>
      <div className="mono" style={{ fontSize:'7px', color:'#a78bfa', letterSpacing:'0.1em', marginBottom:'4px' }}>🛰 PLANET LABS IMAGERY ({items.length})</div>
      <div style={{ display:'flex', gap:'4px', overflowX:'auto', paddingBottom:'2px' }}>
        {items.slice(0, 8).map((item, i) => (
          <a key={i} href={item.url || 'https://www.planet.com'} target="_blank" rel="noopener"
            style={{ flexShrink:0, width:'72px', textDecoration:'none' }}>
            <div style={{ width:'72px', height:'48px', background:'rgba(167,139,250,0.12)', border:'1px solid rgba(167,139,250,0.35)', borderRadius:'2px', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative' }}>
              {item.thumbnail
                ? <img src={item.thumbnail} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>{e.target.style.display='none'}} />
                : <span style={{ fontSize:'20px' }}>🛰</span>}
              <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.65)', padding:'1px 3px' }}>
                <span className="mono" style={{ fontSize:'6px', color:'#a78bfa' }}>{(item.region||'Earth').slice(0,12)}</span>
              </div>
            </div>
            <div className="mono" style={{ fontSize:'6px', color:'var(--t3)', lineHeight:1.2, marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {(item.title||'').replace(/🛰 Planet[^:]*: /,'').slice(0,22)}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

function AlertsPane({ alerts, loading }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('nexus-dismissed-alerts') || '[]')) }
    catch { return new Set() }
  })
  const dismiss = (id) => setDismissed(prev => {
    const next = new Set([...prev, id])
    try { localStorage.setItem('nexus-dismissed-alerts', JSON.stringify([...next].slice(-500))) } catch {}
    return next
  })
  const shown = alerts.filter(a => !dismissed.has(a.id))

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <PlanetImageStrip alerts={alerts} />
      {/* Clear all dismissed */}
      {dismissed.size > 0 && (
        <div style={{ padding:'2px 8px', background:'rgba(0,0,0,0.3)', textAlign:'right' }}>
          <button onClick={() => { setDismissed(new Set()); try{localStorage.removeItem('nexus-dismissed-alerts')}catch{} }} style={{ fontSize:'8px', color:'var(--t4)', background:'none', border:'none', cursor:'pointer' }}>
            restore {dismissed.size} dismissed
          </button>
        </div>
      )}
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading && !alerts.length && <div style={{ padding:'20px', textAlign:'center', color:'var(--t4)', fontSize:'11px' }}>Fetching alerts…</div>}
        {!loading && !shown.length && (
          <div style={{ padding:'20px', textAlign:'center' }}>
            <div style={{ fontSize:'20px', marginBottom:'6px' }}>✅</div>
            <div style={{ fontSize:'11px', color:'var(--t3)' }}>No {filter==='all'?'active':filter} alerts</div>
            <div style={{ fontSize:'9px', color:'var(--t4)', marginTop:'4px' }}>Oref · USNI · NWS · GDACS · GPSJam · BNO · Telegram · Wiki · NOTAM · BGP</div>
          </div>
        )}
        {shown.map(a => {
          const clr = C[a.severity] || '#4ade80'
          return (
            <div key={a.id} style={{ padding:'6px 8px', borderBottom:'1px solid var(--border)', borderLeft:`3px solid ${clr}`, background:B[a.severity], position:'relative' }}>
              <div style={{ display:'flex', gap:'5px', alignItems:'flex-start' }}>
                <span style={{ fontSize:'12px', flexShrink:0, lineHeight:1.2 }}>{a.icon || '⚠️'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', gap:'4px', marginBottom:'2px', alignItems:'center' }}>
                    <span style={{ fontSize:'8px', fontWeight:700, color:clr }}>{a.source}</span>

                    <span style={{ fontSize:'7px', color:'var(--t4)', marginLeft:'auto', marginRight:'18px' }}>{a.ts ? new Date(a.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}</span>
                  </div>
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:'10px', color:'var(--t1)', textDecoration:'none', lineHeight:1.4, display:'block' }}>{a.title}</a>
                  ) : (
                    <div style={{ fontSize:'10px', color:'var(--t1)', lineHeight:1.4 }}>{a.title}</div>
                  )}
                  {a.detail && <div style={{ fontSize:'9px', color:'var(--t3)', marginTop:'2px', lineHeight:1.4, wordBreak:'break-word' }}>{a.detail}</div>}
                </div>
                {/* Dismiss × button */}
                <button
                  onClick={() => dismiss(a.id)}
                  style={{ position:'absolute', top:'5px', right:'5px', background:'none', border:'none', cursor:'pointer', color:'var(--t4)', fontSize:'10px', lineHeight:1, padding:'2px 4px', borderRadius:'3px' }}
                  title="Dismiss"
                >×</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MarketsPane({ polyGeo, kalGeo, polyErr, kalLive, polyLoading, kalLoading }) {
  const [src, setSrc] = useState('all')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50
  const fmtVol = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : v ? '$' + v : '—'

  const combined = useMemo(() => {
    const seen = new Set()
    const all = [
      ...(src !== 'kalshi' ? polyGeo.map(m => ({ ...m, srcLabel: 'PM', srcClr: '#38bdf8' })) : []),
      ...(src !== 'poly' ? kalGeo.map(m => ({ ...m, srcLabel: 'KAL', srcClr: '#a78bfa', question: m.title })) : []),
    ]
    const full = all.filter(m => {
      const k = (m.question || '').slice(0, 35).toLowerCase()
      if (seen.has(k)) return false; seen.add(k); return true
    }).sort((a, b) => (b.volume || 0) - (a.volume || 0))
    return full.slice(0, 500)
  }, [polyGeo, kalGeo, src])

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <div style={{ padding:'4px 6px', borderBottom:'1px solid var(--border)', display:'flex', gap:'3px', alignItems:'center', flexShrink:0 }}>
        {[{id:'all',label:'All'},{id:'poly',label:'Polymarket'},{id:'kalshi',label:'Kalshi'}].map(s => (
          <button key={s.id} onClick={() => setSrc(s.id)} style={{ padding:'2px 6px', borderRadius:'3px', fontSize:'9px', cursor:'pointer', background:src===s.id?'var(--accent)':'var(--surface)', border:`1px solid ${src===s.id?'var(--accent)':'var(--border)'}`, color:src===s.id?'#000':'var(--t4)' }}>{s.label}</button>
        ))}
        <span style={{ fontSize:'8px', marginLeft:'auto', color: polyErr ? '#f87171' : '#4ade80' }}>
          ● PM {polyErr ? 'err' : polyGeo.length + ' geo'}
        </span>
        <span style={{ fontSize:'8px', color: kalLive ? '#4ade80' : '#f59e0b', marginLeft:'4px' }}>
          ● KAL {kalLive ? 'live' : 'seed'}
        </span>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {(polyLoading || kalLoading) && !combined.length && (
          <div style={{ padding:'20px', textAlign:'center', color:'var(--t4)', fontSize:'11px' }}>Loading markets…</div>
        )}
        {combined.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(m => {
          const pct = m.probability != null ? Math.round(m.probability * 100) : null
          const clr = pct == null ? '#888' : pct >= 70 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 30 ? '#eab308' : '#4ade80'
          return (
            <div key={m.srcLabel + m.id} style={{ padding:'7px 8px', borderBottom:'1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ display:'flex', gap:'4px', alignItems:'center', marginBottom:'4px' }}>
                <span style={{ fontSize:'8px', color:m.srcClr, background:m.srcClr+'18', padding:'1px 4px', borderRadius:'3px', flexShrink:0 }}>{m.srcLabel}</span>
                <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:'11px', color:'var(--t1)', textDecoration:'none', lineHeight:1.3, flex:1 }}>{(m.question || '').slice(0, 80)}</a>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <ProbBar prob={m.probability} />
                <span style={{ fontSize:'9px', color:'var(--t4)', flexShrink:0 }}>{fmtVol(m.volume)}</span>
              </div>
            </div>
          )
        })}
        {!polyLoading && !kalLoading && combined.length === 0 && (
          <div style={{ padding:'20px', textAlign:'center', color:'var(--t4)', fontSize:'11px' }}>No geo markets found.</div>
        )}
      </div>
      {combined.length > PAGE_SIZE && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 8px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}
            style={{ padding:'2px 8px', fontSize:'9px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'3px', cursor:'pointer', color:page===0?'var(--t4)':'var(--accent)' }}>← Prev</button>
          <span className="mono" style={{ fontSize:'8px', color:'var(--t4)' }}>
            {page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE, combined.length)} of {combined.length}
          </span>
          <button onClick={() => setPage(p => Math.min(Math.ceil(combined.length/PAGE_SIZE)-1, p+1))} disabled={(page+1)*PAGE_SIZE>=combined.length}
            style={{ padding:'2px 8px', fontSize:'9px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'3px', cursor:'pointer', color:(page+1)*PAGE_SIZE>=combined.length?'var(--t4)':'var(--accent)' }}>Next →</button>
        </div>
      )}
    </div>
  )
}

// Individual telegram post with expand/collapse for long content
function TelegramPost({ post: p, sev, ago }) {
  const [expanded, setExpanded] = React.useState(false)
  const text = p.text || ''
  const CLIP = 280  // chars before truncating
  const isLong = text.length > CLIP
  const displayText = (!isLong || expanded) ? text : text.slice(0, CLIP).trimEnd() + '…'

  return (
    <div
      style={{ padding:'7px 10px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Header row: severity dot + channel + time + geo */}
      <div style={{ display:'flex', alignItems:'center', gap:'5px', marginBottom:'5px' }}>
        <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:sev(p.severity), flexShrink:0, boxShadow:`0 0 5px ${sev(p.severity)}99` }} />
        <span style={{ fontSize:'9px', color:'var(--accent)', fontFamily:'JetBrains Mono,monospace', fontWeight:700, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {p.channelName}
        </span>
        {p.geoKnown && <span style={{ fontSize:'8px', color:'#a78bfa', flexShrink:0 }}>📍</span>}
        <span style={{ fontSize:'8px', color:'var(--t4)', flexShrink:0 }}>{ago(p.ts)}</span>
        {p.url && (
          <a href={p.url} target="_blank" rel="noreferrer"
            style={{ fontSize:'10px', color:'var(--accent)', textDecoration:'none', flexShrink:0, lineHeight:1 }}
            onClick={e => e.stopPropagation()}>↗</a>
        )}
      </div>

      {/* Message body — full text, no clipping by overflow hidden */}
      <div style={{ fontSize:'11px', color:'var(--t1)', lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere' }}>
        {displayText}
      </div>

      {/* Expand / collapse toggle for long posts */}
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginTop:'4px', background:'none', border:'none', color:'var(--accent)', fontSize:'9px', fontFamily:'JetBrains Mono,monospace', cursor:'pointer', padding:0, display:'block' }}
        >
          {expanded ? '▲ show less' : '▼ show more'}
        </button>
      )}

      {p.severity === 'critical' && (
        <div style={{ marginTop:'4px', fontSize:'8px', color:'#ef4444', fontFamily:'JetBrains Mono', fontWeight:700, letterSpacing:'0.06em' }}>⚠ CRITICAL EVENT</div>
      )}
    </div>
  )
}

function TelegramPane({ recent, archive, loading, lastFetch, channelStatus }) {
  const [view, setView] = React.useState('recent')  // 'recent' | 'archive'
  const posts = view === 'recent' ? recent : archive

  const sev = s => s === 'critical' ? '#ef4444' : s === 'high' ? '#f97316' : s === 'medium' ? '#eab308' : '#2dd4bf'
  const ago = ts => {
    if (!ts) return ''
    const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
    if (m < 1) return 'now'
    if (m < 60) return m + 'm ago'
    if (m < 1440) return Math.round(m / 60) + 'h ago'
    return Math.round(m / 1440) + 'd ago'
  }

  const liveCount = Object.values(channelStatus).filter(Boolean).length
  const totalChannels = Object.keys(channelStatus).length || 50

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Sub-tabs: Recent vs Archive */}
      <div style={{ padding:'4px 6px', borderBottom:'1px solid var(--border)', display:'flex', gap:'3px', alignItems:'center', flexShrink:0 }}>
        <button onClick={() => setView('recent')} style={{ padding:'2px 7px', borderRadius:'3px', fontSize:'9px', cursor:'pointer', fontFamily:'JetBrains Mono,monospace', fontWeight:700, border:`1px solid ${view==='recent'?'var(--accent)':'var(--border)'}`, background:view==='recent'?'rgba(45,212,191,0.1)':'var(--surface)', color:view==='recent'?'var(--accent)':'var(--t4)' }}>
          ⚡ RECENT 24h ({recent.length})
        </button>
        <button onClick={() => setView('archive')} style={{ padding:'2px 7px', borderRadius:'3px', fontSize:'9px', cursor:'pointer', fontFamily:'JetBrains Mono,monospace', fontWeight:700, border:`1px solid ${view==='archive'?'#a78bfa':'var(--border)'}`, background:view==='archive'?'rgba(167,139,250,0.1)':'var(--surface)', color:view==='archive'?'#a78bfa':'var(--t4)' }}>
          📁 ARCHIVE 7d ({archive.length})
        </button>
        <span style={{ fontSize:'7px', color: liveCount > 20 ? '#4ade80' : '#f59e0b', marginLeft:'auto' }}>
          {loading ? '⟳' : `${liveCount}/${totalChannels}`}
        </span>
      </div>

      {loading && !posts.length && (
        <div style={{ padding:'20px', textAlign:'center', color:'var(--t4)', fontSize:'10px' }}>
          <div style={{ fontSize:'16px', marginBottom:'6px' }}>📡</div>
          Scraping {totalChannels} Telegram channels…
        </div>
      )}

      {/* Post list — each post has expand/collapse for long content */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
        {posts.map((p, i) => (
          <TelegramPost key={p.id || i} post={p} sev={sev} ago={ago} />
        ))}
        {!loading && posts.length === 0 && (
          <div style={{ padding:'20px', textAlign:'center', color:'var(--t4)', fontSize:'11px' }}>
            {view === 'recent' ? 'No posts in last 24h — channels may be quiet' : 'No archived posts found'}
          </div>
        )}
      </div>

      {/* Footer: last update time */}
      {lastFetch && (
        <div style={{ padding:'3px 8px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <span style={{ fontSize:'7px', color:'var(--t4)', fontFamily:'JetBrains Mono' }}>
            Updated {lastFetch.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })} · auto-refresh 90s
          </span>
        </div>
      )}
    </div>
  )
}

const TABS = [{ id:'signal', label:'⚡ SIGNAL' }, { id:'alerts', label:'🚨 ALERTS' }, { id:'telegram', label:'📡 TELEGRAM' }, { id:'markets', label:'🎯 MARKETS' }]

export default function LiveFeedSidebar({ articles = [] }) {
  const [tab, setTab] = useState('signal')
  const { data: satData } = useSatellite()
  const { geoMarkets: polyGeo, loading: polyLoading, error: polyErr } = usePolymarket()
  const { geoMarkets: kalGeo, loading: kalLoading, live: kalLive } = useKalshi()
  const { alerts, loading: alertLoading, counts } = useLiveAlerts()
  const { recent: tgRecent, archive: tgArchive, loading: tgLoading, lastFetch: tgLastFetch, channelStatus } = useTelegram()
  const { situations } = useSignalConvergence({
    articles, polyMarkets: polyGeo, kalshiMarkets: kalGeo, liveAlerts: alerts
  })
  // Auto-switch to alerts tab if critical alerts arrive
  useEffect(() => {
    if (alerts.some(a => a.severity === 'critical') && tab === 'signal') setTab('alerts')
  }, [alerts])
  const critCount = alerts.filter(a => a.severity === 'critical').length

  return (
    <div style={{ width:'258px', flexShrink:0, borderLeft:'1px solid var(--border)', background:'var(--base)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--void)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:'6px 2px', border:'none', cursor:'pointer',
            background: tab === t.id ? 'var(--base)' : 'transparent',
            borderBottom:`2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
            color: tab === t.id ? 'var(--accent)' : 'var(--t4)',
            fontSize:'9px', fontWeight:700, letterSpacing:'0.05em',
            fontFamily:'JetBrains Mono,monospace', position:'relative',
          }}>
            {t.id === 'alerts' && alerts.length > 0 ? '🚨 ALERTS (' + alerts.length + ')' : t.id === 'telegram' && tgRecent.length > 0 ? '📡 TELEGRAM (' + tgRecent.length + ')' : t.label}
            {t.id === 'alerts' && critCount > 0 && (
              <span style={{ position:'absolute', top:'2px', right:'2px', minWidth:'12px', height:'12px', borderRadius:'6px', background:'#ef4444', fontSize:'7px', fontWeight:800, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px' }}>{Math.min(critCount, 9)}</span>
            )}
          </button>
        ))}
      </div>
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {tab === 'signal'  && <SignalPane situations={situations} satData={satData} />}
        {tab === 'alerts'  && <AlertsPane alerts={alerts} loading={alertLoading} counts={counts || {}} />}
        {tab === 'telegram' && <TelegramPane recent={tgRecent} archive={tgArchive} loading={tgLoading} lastFetch={tgLastFetch} channelStatus={channelStatus} />}
        {tab === 'markets' && <MarketsPane polyGeo={polyGeo} kalGeo={kalGeo} polyErr={polyErr} kalLive={kalLive} polyLoading={polyLoading} kalLoading={kalLoading} />}
      </div>
    </div>
  )
}
