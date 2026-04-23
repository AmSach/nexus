/**
 * ViewMode — "Watch the World" Theater Display
 * Compact, dense, no wasted space. Autoscrolling live feed + signals.
 * Designed to run 24/7 on a big screen or TV.
 * v75: Live TV panel added (toggle), CII strip, Kalshi ticker
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useStore } from '../store'
import { useUserLocation, filterLocalNews } from '../hooks/useLocation'
import { useSatellite, satelliteToPoints } from '../hooks/useSatellite'
import { useKalshi } from '../hooks/useKalshi'
import { useLiveAlerts } from '../hooks/useLiveAlerts'
import { useTelegram } from '../hooks/useTelegram'
import { usePatternOfLife, POL_ZONES } from '../hooks/usePatternOfLife'
import { useSignalConvergenceV4, CONVERGENCE_ZONES } from '../hooks/useSignalConvergenceV4'
import { useSignalConvergence } from '../hooks/useSignalConvergence'
import { usePolymarket } from '../hooks/usePolymarket'
import { useConflictMarkets } from '../hooks/useConflictMarkets'
import { useIntelAlgorithms } from '../hooks/useIntelAlgorithms'
import { useGeoRiskAlgorithms } from '../hooks/useGeoRiskAlgorithms'
import { useFinanceIntel } from '../hooks/useFinanceIntel'
import { useACPL } from '../hooks/useACPL'

const S = { critical:'#ef4444', high:'#f97316', medium:'#eab308', low:'#2dd4bf' }
const ICONS = {
  aircraft:'✈', ship:'🚢', earthquake:'⚡', gdacs:'⚠️', hurricane:'🌀',
  volcano:'🌋', firms:'🔥', eonet_wildfire:'🔥', iss:'🛸', launch:'🚀',
  news:'📰', acled:'⚔️', hotspot:'🎯', cyber:'💻', vuln:'🔓', cve:'⚠️',
  disease:'🦠', nuclear:'☢️', humanitarian:'🆘', maritime:'⚓', social:'📡',
  flood:'🌊', weather:'⛈', copernicus:'🛰',
  milaircraft:'✈', warship:'⚔', gpsjam:'📡', notam:'🚫',
  wikiEdit:'📝', bgp:'🌐', viirs:'🛰️', telegram:'📡',
}
const TYPE_LABEL = {
  acled:'CONFLICT', hotspot:'HOTSPOT', aircraft:'AIRCRAFT', ship:'VESSEL',
  earthquake:'SEISMIC', gdacs:'DISASTER', hurricane:'STORM', volcano:'VOLCANO',
  firms:'FIRE', eonet_wildfire:'WILDFIRE', iss:'ISS', launch:'LAUNCH',
  news:'NEWS', cyber:'CYBER', vuln:'EXPOSED', cve:'CVE', disease:'DISEASE',
  nuclear:'NUCLEAR', humanitarian:'CRISIS', maritime:'MARITIME', social:'SIGNAL',
  flood:'FLOOD', weather:'WEATHER', copernicus:'SATELLITE',
  milaircraft:'MIL AIRCRAFT', warship:'WARSHIP', gpsjam:'GPS JAM',
  notam:'NOTAM', wikiEdit:'WIKI EDIT', bgp:'BGP', viirs:'VIIRS', telegram:'TELEGRAM',
}

function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const iv = setInterval(() => setT(new Date()), 1000); return () => clearInterval(iv) }, [])
  return (
    <span className="mono" style={{ fontSize:'13px', color:'var(--t1)', letterSpacing:'0.05em' }}>
      {t.toUTCString().slice(17,25)} UTC &nbsp;
      <span style={{ color:'var(--t4)', fontSize:'11px' }}>
        {t.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
      </span>
    </span>
  )
}

// Horizontal scrolling ticker
function Ticker({ items }) {
  const wrap = useRef(null)
  const pos  = useRef(0)
  useEffect(() => {
    if (!items.length) return
    const iv = setInterval(() => {
      pos.current += 0.6
      if (wrap.current) {
        if (pos.current > wrap.current.scrollWidth / 2) pos.current = 0
        wrap.current.style.transform = `translateX(-${pos.current}px)`
      }
    }, 20) // ~50fps equivalent, TV-safe
    return () => clearInterval(iv)
  }, [items.length])

  const doubled = [...items, ...items]
  return (
    <div style={{ overflow:'hidden', flex:1 }}>
      <div ref={wrap} style={{ display:'inline-flex', gap:'48px', whiteSpace:'nowrap', willChange:'transform' }}>
        {doubled.map((it, i) => (
          <span key={i} style={{ fontSize:'11px', color:'var(--t2)', display:'inline-flex', alignItems:'center', gap:'6px' }}>
            <span style={{ color:S[it.severity]||'var(--t3)', fontSize:'9px', fontWeight:700,
              padding:'1px 4px', background:`${S[it.severity]||'var(--t4)'}18`, borderRadius:'2px' }}>
              {it.type?.toUpperCase()||'NEWS'}
            </span>
            <span style={{ color:'var(--t1)' }}>{it.name||it.title||'Event'}</span>
            {it.zone && <span style={{ color:'var(--t4)', fontSize:'10px' }}>{it.zone}</span>}
            <span style={{ color:'var(--border2)' }}>│</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// Single compact event row
function Row({ pt, onClick, active }) {
  const clr = S[pt.severity] || '#2dd4bf'
  const ic  = ICONS[pt.type] || '●'
  const lbl = TYPE_LABEL[pt.type] || pt.type?.toUpperCase() || 'EVENT'
  return (
    <div onClick={onClick} style={{
      display:'flex', alignItems:'flex-start', gap:'8px',
      padding:'5px 10px', cursor:'pointer', borderLeft:`2px solid ${active?clr:'transparent'}`,
      background: active ? `${clr}10` : 'transparent',
      borderBottom:'1px solid rgba(255,255,255,0.03)', transition:'background 0.15s',
    }}
    onMouseEnter={e=>{ e.currentTarget.style.background=`${clr}0a` }}
    onMouseLeave={e=>{ e.currentTarget.style.background=active?`${clr}10`:'transparent' }}>
      <span style={{ fontSize:'13px', flexShrink:0, marginTop:'1px' }}>{ic}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', gap:'6px', alignItems:'center', marginBottom:'2px', flexWrap:'wrap' }}>
          <span className="mono" style={{ fontSize:'8px', padding:'1px 4px', borderRadius:'2px',
            background:`${clr}20`, color:clr, fontWeight:700 }}>{pt.severity?.toUpperCase()}</span>
          <span className="mono" style={{ fontSize:'8px', color:'var(--t4)' }}>{lbl}</span>
          {(pt.date||pt._fetchedAt) && (
            <span className="mono" style={{ fontSize:'8px', color:'var(--t4)', marginLeft:'auto' }}>
              {new Date(pt.date||pt._fetchedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
            </span>
          )}
        </div>
        <div style={{ fontSize:'11px', color:'var(--t1)', lineHeight:1.4,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {pt.name||pt.title}
        </div>
        {pt.desc && (
          <div style={{ fontSize:'10px', color:'var(--t3)', lineHeight:1.4, marginTop:'2px',
            overflow:'hidden', display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical' }}>
            {pt.desc}
          </div>
        )}
      </div>
    </div>
  )
}

// News article row
function NewsRow({ a, onClick }) {
  const clr = S[a.severity] || '#2dd4bf'
  return (
    <div onClick={onClick} style={{
      padding:'5px 10px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.03)',
      borderLeft:`2px solid ${clr}60`,
    }}
    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <div style={{ fontSize:'11px', color:'var(--t1)', lineHeight:1.5,
        overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
        {a.title}
      </div>
      <div style={{ display:'flex', gap:'8px', marginTop:'2px' }}>
        <span className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>{a.source}</span>
        {a.region && <span className="mono" style={{ fontSize:'9px', color:'var(--t3)' }}>{a.region}</span>}
        <span className="mono" style={{ fontSize:'9px', color:clr }}>{a.severity}</span>
        {a.pub && <span className="mono" style={{ fontSize:'9px', color:'var(--t4)', marginLeft:'auto' }}>
          {new Date(a.pub).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
        </span>}
      </div>
    </div>
  )
}

// Detail panel
function Detail({ pt, onClose }) {
  if (!pt) return null
  const clr = S[pt.severity] || '#2dd4bf'
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'6px 10px', borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span className="mono" style={{ fontSize:'8px', color:'var(--t4)', letterSpacing:'0.12em' }}>EVENT DETAIL</span>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--t4)', cursor:'pointer', fontSize:'14px', lineHeight:1 }}>×</button>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'10px' }}>
        <div style={{ fontSize:'13px', fontWeight:600, color:'var(--t1)', lineHeight:1.5, marginBottom:'8px' }}>
          {ICONS[pt.type]||'●'} {pt.name||pt.title}
        </div>
        <div style={{ display:'flex', gap:'5px', marginBottom:'10px', flexWrap:'wrap' }}>
          <span style={{ padding:'2px 7px', borderRadius:'2px', fontSize:'9px', fontWeight:700,
            background:`${clr}20`, color:clr }}>{pt.severity?.toUpperCase()}</span>
          <span className="mono" style={{ padding:'2px 7px', borderRadius:'2px', fontSize:'9px',
            background:'var(--panel)', color:'var(--t3)' }}>{TYPE_LABEL[pt.type]||pt.type}</span>
        </div>
        {pt.desc && <p style={{ fontSize:'11px', color:'var(--t2)', lineHeight:1.7, margin:'0 0 10px' }}>{pt.desc}</p>}
        {pt.lat && <div className="mono" style={{ fontSize:'10px', color:'var(--accent)', marginBottom:'8px' }}>
          📍 {Number(pt.lat).toFixed(4)}° {Number(pt.lng).toFixed(4)}°
        </div>}
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {pt.url && pt.url !== '#' && (
            <a href={pt.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:'10px', color:'var(--accent)', textDecoration:'none' }}>↗ Source</a>
          )}
          {pt.lat && <>
            <a href={`https://www.google.com/maps?q=${pt.lat},${pt.lng}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:'10px', color:'var(--t3)', textDecoration:'none' }}>↗ Maps</a>
            <a href={`https://zoom.earth/#view=${pt.lat},${pt.lng},8z`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:'10px', color:'var(--t3)', textDecoration:'none' }}>↗ Satellite</a>
          </>}
        </div>
      </div>
    </div>
  )
}

// Right panel: live intel summary when no event is selected
function IntelSidebar({ sorted, articles, satData, convergence, intel, conflictMarkets, geoRisk = null, adultEcon = null, crypto = [] }) {
  const critical = sorted.filter(p=>p.severity==='critical').slice(0,8)
  const conflicts = sorted.filter(p=>['acled','hotspot'].includes(p.type)||p.source==='UCDP'||p.source==='Wikidata').sort((a,b)=>(b.meta?.fatalities||0)-(a.meta?.fatalities||0)).slice(0,5)
  const cyber = sorted.filter(p=>['cyber','vuln','cve'].includes(p.type)).slice(0,5)
  const aircraft = sorted.filter(p=>p.type==='aircraft' && p.severity!=='low').slice(0,5)
  const latestNews = articles.slice(0,8)
  // NEW: surface high-value data that wasn't visible anywhere
  const ucdpTop = (satData?.ucdpFull||[]).filter(e=>e.deaths_best>10).sort((a,b)=>(b.deaths_best||0)-(a.deaths_best||0)).slice(0,5)
  const osmBases = (satData?.osmMilitary||[]).slice(0,5)
  const sanctioned = (satData?.openSanctions||[]).filter(e=>e.schema==='Vessel'||e.schema==='Aircraft').slice(0,5)
  const wikiConflicts = (satData?.wikidataConflicts||[]).slice(0,4)
  const armsSignals = (satData?.armsTransferSignals||[]).slice(0,4)

  const Section = ({ title, color, children }) => (
    <div style={{ marginBottom:'6px' }}>
      <div style={{ padding:'4px 10px', borderBottom:`1px solid ${color}30`,
        display:'flex', alignItems:'center', gap:'5px' }}>
        <div style={{ width:'4px', height:'4px', borderRadius:'50%', background:color, flexShrink:0 }}/>
        <span className="mono" style={{ fontSize:'8px', color, letterSpacing:'0.12em' }}>{title}</span>
      </div>
      <div style={{ padding:'4px 0' }}>{children}</div>
    </div>
  )

  const Item = ({ icon, text, sub, color, url }) => (
    <div onClick={()=>url&&window.open(url,'_blank')}
      style={{ padding:'3px 10px', cursor:url?'pointer':'default',
        borderBottom:'1px solid rgba(255,255,255,0.025)' }}
      onMouseEnter={e=>{ if(url) e.currentTarget.style.background='rgba(255,255,255,0.03)' }}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <div style={{ display:'flex', gap:'5px', alignItems:'flex-start' }}>
        <span style={{ fontSize:'11px', flexShrink:0 }}>{icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'10px', color:'var(--t1)', lineHeight:1.4,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{text}</div>
          {sub && <div style={{ fontSize:'9px', color, lineHeight:1.3 }}>{sub}</div>}
        </div>
      </div>
    </div>
  )

  const hasNewData = (satData?.ucdpFull?.length||0) + (satData?.openSanctions?.length||0) + (satData?.osmMilitary?.length||0) > 0
  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      {!hasNewData && (
        <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)', background:'rgba(45,212,191,0.03)' }}>
          <div className="mono" style={{ fontSize:'7px', color:'var(--t4)', lineHeight:1.8 }}>
            ⟳ Loading intelligence feeds…<br/>
            UCDP events · OpenSanctions · OSM bases<br/>
            WikiData conflicts · Arms signals
          </div>
        </div>
      )}
      {critical.length > 0 && (
        <Section title={`🔴 CRITICAL (${critical.length})`} color="#ef4444">
          {critical.map((p,i) => (
            <Item key={i} icon={ICONS[p.type]||'●'} text={p.name} sub={p.severity} color="#ef4444" url={p.url} />
          ))}
        </Section>
      )}

      {conflicts.length > 0 && (
        <Section title={`⚔️ CONFLICT (${sorted.filter(p=>['acled','hotspot'].includes(p.type)).length})`} color="#f97316">
          {conflicts.map((p,i) => (
            <Item key={i} icon="⚔️" text={p.name} sub={p.desc?.slice(0,60)} color="#f97316" url={p.url} />
          ))}
        </Section>
      )}

      {cyber.length > 0 && (
        <Section title={`💻 CYBER THREATS (${sorted.filter(p=>['cyber','vuln','cve'].includes(p.type)).length})`} color="#ff00ff">
          {cyber.map((p,i) => (
            <Item key={i} icon={ICONS[p.type]||'💻'} text={p.name} sub={p.meta?.source||p.meta?.country} color="#ff00ff" url={p.url} />
          ))}
        </Section>
      )}

      {aircraft.length > 0 && (
        <Section title="✈ NOTABLE AIRCRAFT" color="#00ffcc">
          {aircraft.map((p,i) => (
            <Item key={i} icon="✈" text={p.name} sub={p.desc?.slice(0,50)} color="#00ffcc" url={p.url} />
          ))}
        </Section>
      )}

      {satData?.iss && (
        <Section title="🛸 ISS POSITION" color="#aaddff">
          <div style={{ padding:'6px 10px' }}>
            <div className="mono" style={{ fontSize:'10px', color:'#aaddff' }}>
              {Number(satData.iss.lat).toFixed(2)}° {Number(satData.iss.lng).toFixed(2)}°
            </div>
            <div className="mono" style={{ fontSize:'9px', color:'var(--t4)' }}>
              Alt: {satData.iss.altitude}km · {satData.iss.velocity?.toLocaleString()} km/h
            </div>
          </div>
        </Section>
      )}

      {latestNews.length > 0 && (
        <Section title={`📰 LATEST NEWS (${articles.length})`} color="#2dd4bf">
          {latestNews.map((a,i) => (
            <Item key={i} icon="📰" text={a.title} sub={a.source} color="#2dd4bf" url={a.url} />
          ))}
        </Section>
      )}

      {ucdpTop.length > 0 && (
        <Section title={`☠ UCDP CONFLICTS BY FATALITIES (${(satData?.ucdpFull||[]).length} total)`} color="#ef4444">
          {ucdpTop.map((e,i) => (
            <Item key={i} icon="⚔" text={e.dyad_name||e.title||'Conflict'}
              sub={`${e.deaths_best} dead · ${e.country} · ${e.date?.slice(0,10)||''}`}
              color="#ef4444" url={`https://ucdp.uu.se/event/${e.id}`} />
          ))}
        </Section>
      )}

      {wikiConflicts.length > 0 && (
        <Section title={`📖 WIKIDATA ACTIVE CONFLICTS (${(satData?.wikidataConflicts||[]).length})`} color="#f97316">
          {wikiConflicts.map((c,i) => (
            <Item key={i} icon="🌍" text={c.name} sub={`${c.country}${c.start?' · since '+c.start.slice(0,10):''}`}
              color="#f97316" url={`https://www.wikidata.org/wiki/${c.id}`} />
          ))}
        </Section>
      )}

      {sanctioned.length > 0 && (
        <Section title={`🚫 SANCTIONED VESSELS/AIRCRAFT (${(satData?.openSanctions||[]).length} total entities)`} color="#a78bfa">
          {sanctioned.map((e,i) => (
            <Item key={i} icon={e.schema==='Vessel'?'🚢':'✈'} text={e.name}
              sub={`${e.schema} · ${e.program||''} · ${e.countries||''}`}
              color="#a78bfa" url={e.url} />
          ))}
        </Section>
      )}

      {armsSignals.length > 0 && (
        <Section title={`⚔ ARMS TRANSFERS (${(satData?.armsTransferSignals||[]).length})`} color="#f59e0b">
          {armsSignals.map((a,i) => (
            <Item key={i} icon="🔫" text={(a.title||'').slice(0,70)}
              sub={a.country||'Global'} color="#f59e0b" url={a.url} />
          ))}
        </Section>
      )}

      {osmBases.length > 0 && (
        <Section title={`🏛 MILITARY INFRASTRUCTURE (${(satData?.osmMilitary||[]).length} installations)`} color="#6b7280">
          {osmBases.map((b,i) => (
            <Item key={i} icon="🏛" text={b.name}
              sub={`${b.type||'base'} · ${b.country||'?'}${b.operator?' · '+b.operator:''}`}
              color="#6b7280" />
          ))}
        </Section>
      )}

      {geoRisk && (
        <Section title={`🌐 GEO RISK — ${geoRisk.compositeLabel||'...'}`} color={geoRisk.compositeRisk>0.65?'#ef4444':geoRisk.compositeRisk>0.45?'#f97316':'#2dd4bf'}>
          <div style={{ padding:'4px 10px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'9px', fontFamily:'monospace', marginBottom:'3px' }}>
              <span style={{ color:'var(--t3)' }}>COMPOSITE</span>
              <span style={{ color:geoRisk.compositeRisk>0.65?'#ef4444':geoRisk.compositeRisk>0.45?'#f97316':'#2dd4bf', fontWeight:700 }}>{Math.round((geoRisk.compositeRisk||0)*100)}%</span>
            </div>
            <div style={{ width:'100%', height:'3px', background:'rgba(255,255,255,0.06)', borderRadius:2, marginBottom:'5px' }}>
              <div style={{ width:`${(geoRisk.compositeRisk||0)*100}%`, height:'100%', background:geoRisk.compositeRisk>0.65?'#ef4444':geoRisk.compositeRisk>0.45?'#f97316':'#2dd4bf', borderRadius:2 }}/>
            </div>
            {geoRisk.taiwan && <Item icon="🇹🇼" text={`Taiwan V4: ${Math.round(geoRisk.taiwan.index*100)}% ${geoRisk.taiwan.regime}`} sub={`trend ${geoRisk.taiwan.trend>0?'+':''}${geoRisk.taiwan.trend?.toFixed(2)} · ${geoRisk.taiwan.eventCount} events`} color="#f97316" />}
            {geoRisk.particleFilter && <Item icon="⚛️" text={`Particle Filter: ${(geoRisk.particleFilter.meanState*100).toFixed(1)}% hidden risk`} sub={`σ ${(geoRisk.particleFilter.stdState*100).toFixed(1)}%`} color="#a78bfa" />}
            {geoRisk.supplyChain && <Item icon="🚢" text={`Supply Chain: ${Math.round(geoRisk.supplyChain.risk*100)}%`} sub={geoRisk.supplyChain.label} color={geoRisk.supplyChain.risk>0.5?'#ef4444':'#fbbf24'} />}
            {geoRisk.markovRegime && <Item icon="📊" text={`Portfolio Regime: ${geoRisk.markovRegime.regime?.replace('_',' ')}`} sub={Object.entries(geoRisk.markovRegime.probabilities||{}).map(([k,v])=>`${k.slice(0,4)}:${Math.round(v*100)}%`).join(' ')} color={geoRisk.markovRegime.regime==='RISK_OFF'?'#ef4444':'#22c55e'} />}
            {geoRisk.garch?.energy && <Item icon="⚡" text={`Energy VaR95: ${(geoRisk.garch.energy.var95*100).toFixed(1)}%${geoRisk.garch.energy.stressed?' ⚠️':''}`} sub={`CVaR99: ${(geoRisk.garch.energy.cvar99*100).toFixed(1)}% · σ: ${(geoRisk.garch.energy.annualVol*100).toFixed(0)}%/yr`} color="#fbbf24" />}
          </div>
        </Section>
      )}

      {adultEcon?.signal != null && (
        <Section title={`📊 ECON STRESS — ${adultEcon.label}`} color={adultEcon.label==='RECESSION'?'#ef4444':adultEcon.label==='STRESS'?'#f97316':'#22c55e'}>
          <div style={{ padding:'4px 10px' }}>
            <div style={{ width:'100%', height:'3px', background:'rgba(255,255,255,0.06)', borderRadius:2, marginBottom:'4px' }}>
              <div style={{ width:`${(adultEcon.signal||0)*100}%`, height:'100%', background:adultEcon.label==='RECESSION'?'#ef4444':'#f97316', borderRadius:2 }}/>
            </div>
            {adultEcon.consumerStress!=null && <Item icon="😰" text={`Consumer Stress: ${(adultEcon.consumerStress*100).toFixed(0)}%`} sub="UMCSENT inverted" color={adultEcon.consumerStress>0.5?'#ef4444':'#22c55e'} />}
            {adultEcon.unemploymentRate!=null && <Item icon="📉" text={`Unemployment: ${adultEcon.unemploymentRate?.toFixed(1)}%`} sub="FRED UNRATE" color={adultEcon.unemploymentRate>5?'#ef4444':'#22c55e'} />}
          </div>
        </Section>
      )}

      {crypto?.length > 0 && (
        <Section title="₿ CRYPTO SIGNALS" color="#f59e0b">
          {crypto.slice(0,5).map((c,i) => (
            <Item key={i} icon={c.symbol==='BTC'?'₿':c.symbol==='ETH'?'Ξ':'🪙'} text={`${c.symbol}: $${c.price?.toLocaleString(undefined,{maximumFractionDigits:0})}`} sub={`${c.changePercent>0?'+':''}${c.changePercent?.toFixed(2)}% · Vol $${((c.volume24h||0)/1e9).toFixed(1)}B`} color={c.changePercent>0?'#22c55e':'#ef4444'} />
          ))}
        </Section>
      )}
    </div>
  )
}


// ── TelegramFeed — full-height Telegram intel stream for ViewMode ────────────
function TelegramFeed({ recent, archive, loading, lastFetch, compact }) {
  const [view, setView] = React.useState('recent')
  const posts = view === 'recent' ? recent : archive
  const sev = s => s === 'critical' ? '#ef4444' : s === 'high' ? '#f97316' : s === 'medium' ? '#eab308' : '#2dd4bf'
  const ago = ts => {
    if (!ts) return ''
    const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return m + 'm ago'
    if (m < 1440) return Math.round(m / 60) + 'h ago'
    return Math.round(m / 1440) + 'd ago'
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'4px 8px', borderBottom:'1px solid var(--border)', display: compact ? 'none' : 'flex', gap:'4px', alignItems:'center', flexShrink:0, background:'rgba(167,139,250,0.06)' }}>
        <span className="mono" style={{ fontSize:'9px', color:'#a78bfa', letterSpacing:'0.12em', marginRight:'2px' }}>📡 TELEGRAM</span>
        <button onClick={() => setView('recent')} className="mono" style={{ padding:'2px 8px', borderRadius:'2px', fontSize:'8px', cursor:'pointer', border:`1px solid ${view==='recent'?'#a78bfa':'var(--border)'}`, background:view==='recent'?'rgba(167,139,250,0.2)':'transparent', color:view==='recent'?'#a78bfa':'var(--t4)', fontWeight:view==='recent'?700:400 }}>
          ⚡ 24h {recent.length > 0 && <span style={{ background:'#a78bfa22', padding:'0 4px', borderRadius:'2px' }}>{recent.length}</span>}
        </button>
        <button onClick={() => setView('archive')} className="mono" style={{ padding:'2px 8px', borderRadius:'2px', fontSize:'8px', cursor:'pointer', border:`1px solid ${view==='archive'?'#a78bfa':'var(--border)'}`, background:view==='archive'?'rgba(167,139,250,0.2)':'transparent', color:view==='archive'?'#a78bfa':'var(--t4)', fontWeight:view==='archive'?700:400 }}>
          7d {archive.length > 0 && <span style={{ background:'#a78bfa22', padding:'0 4px', borderRadius:'2px' }}>{archive.length}</span>}
        </button>
        <span style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'4px' }}>
          {loading && <span className="mono" style={{ fontSize:'7px', color:'#a78bfa', animation:'pulse 1s infinite' }}>FETCHING…</span>}
          {lastFetch && !loading && <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>↻{lastFetch.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>}
        </span>
      </div>

      {/* Posts */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading && posts.length === 0 && (
          <div style={{ padding:'24px', textAlign:'center', color:'var(--t4)' }}>
            <div style={{ fontSize:'20px', marginBottom:'8px' }}>📡</div>
            <div className="mono" style={{ fontSize:'10px' }}>Fetching {view === 'recent' ? '24h' : '7-day'} Telegram intel…</div>
            <div className="mono" style={{ fontSize:'9px', color:'var(--t4)', marginTop:'4px' }}>Scraping 50 channels via server proxy</div>
          </div>
        )}
        {posts.map((p, i) => (
          <div key={p.id || i}
            onClick={() => p.url && window.open(p.url, '_blank', 'noopener')}
            style={{ padding:'6px 10px', borderBottom:'1px solid rgba(167,139,250,0.08)', cursor:'pointer', borderLeft:`2px solid ${sev(p.severity)}` }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ display:'flex', alignItems:'center', gap:'5px', marginBottom:'3px' }}>
              <span style={{ width:'4px', height:'4px', borderRadius:'50%', background:sev(p.severity), flexShrink:0, boxShadow:`0 0 4px ${sev(p.severity)}` }} />
              <span className="mono" style={{ fontSize:'9px', color:'#a78bfa', fontWeight:700, flex:1 }}>{p.channelName || p.source}</span>
              <span className="mono" style={{ fontSize:'8px', color:'var(--t4)', flexShrink:0 }}>{ago(p.ts)}</span>
              {p.geoKnown && <span style={{ fontSize:'8px', color:'#4ade80' }}>📍</span>}
              {p.severity === 'critical' && <span className="mono" style={{ fontSize:'7px', color:'#ef4444', fontWeight:800 }}>CRITICAL</span>}
            </div>
            <div style={{ fontSize:'11px', color:'var(--t2)', lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:4, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {p.text}
            </div>
          </div>
        ))}
        {!loading && posts.length === 0 && (
          <div style={{ padding:'24px', textAlign:'center', color:'var(--t4)', fontSize:'10px' }}>
            <div className="mono">{view === 'recent' ? 'No posts in last 24h' : 'No archived posts'}</div>
            <div className="mono" style={{ fontSize:'9px', marginTop:'4px' }}>Auto-refreshes every 90s</div>
          </div>
        )}
      </div>

    </div>
  )
}

export default function ViewMode({ articles = [] }) {
  const { data: satData, lastFetch, refresh } = useSatellite()
  const { loc } = useUserLocation()
  const { markets: kalshiMarkets } = useKalshi()
  const { alerts: liveAlerts } = useLiveAlerts()
  const { recent: tgRecent, archive: tgArchive, loading: tgLoading, lastFetch: tgLastFetch, channelStatus: tgStatus } = useTelegram()
  const { data: conflictMarkets } = useConflictMarkets()
  const { anomalies: polAnomalies, summary: polSummary } = usePatternOfLife({ satData, liveAlerts, tgRecent, articles, polyMarkets: kalshiMarkets })
  const convergence = useSignalConvergenceV4({ articles, satData, liveAlerts, tgRecent, polyMarkets: [], kalshiMarkets, polAnomalies })
  const { geoMarkets: polyMarkets } = usePolymarket()
  const { situations: ciiSituations, criticalCount: ciiCritical, highCount: ciiHigh } = useSignalConvergence({
    articles, acledEvents: satData?.conflictEvents || [], satellite: satData,
    polyMarkets: polyMarkets || [], kalshiMarkets, liveAlerts,
  })
  const intel = useIntelAlgorithms({ satData, liveAlerts, tgRecent, articles, polAnomalies, convergenceZones: convergence })
  // ── New intelligence layers ────────────────────────────────────────────
  const geoRisk = useGeoRiskAlgorithms()
  const { adultEcon, crypto, fx } = useFinanceIntel()
  // Compute geo risk from live data
  React.useEffect(() => {
    if (articles?.length > 3) geoRisk.compute({
      articles, convergenceZones: convergence?.zones || [], quotes: {}, vix: null,
    })
  }, [(articles||[]).length]) // eslint-disable-line

  const [localOnly, setLocalOnly] = useState(false)
  const [showTV, setShowTV] = useState(false)
  const [tvChannel, setTvChannel] = useState(0) // index into TV_CHANNELS

  // TV channels with verified live stream IDs (from user)
  const TV_CHANNELS = [
    // Satellite / Earth feeds — 24/7 real streams
    { label:'ISS Live',    vid:'zPH5KtjJFaQ', flag:'🛸', type:'space' },
    { label:'NASA TV',     vid:'21X5lGlDOfg', flag:'🚀', type:'space' },
    // Verified 24/7 news streams
    { label:'Al Jazeera',  vid:'gCNeDWCI0vo', flag:'🌍' },
    { label:'France 24',   vid:'Ap-UM1O9RBU', flag:'🇫🇷' },
    { label:'DW News',     vid:'LuKwFajn37U', flag:'🇩🇪' },
    { label:'i24 News',    vid:'wLuD1yi9frY', flag:'🇮🇱' },
    { label:'Iran Intl.',  vid:'wk0uvX60fxg', flag:'🇮🇷' },
    { label:'NHK World',   vid:'f0lYkdA-Gtw', flag:'🇯🇵' },
    { label:'UN Live',     vid:'vYRfQo6JMxc', flag:'🇺🇳' },
    { label:'Bloomberg',   vid:'9RQWQ8pgDNg', flag:'💰' },
    { label:'WION',        vid:'vfszY1JYbMc', flag:'🇮🇳' },
  ]

  const criticalAlerts = liveAlerts.filter(a => a.severity === 'critical')
  const kalshiTop = kalshiMarkets.filter(m => m.isGeo && m.probability != null).slice(0, 6)
  const layers = useMemo(() => ({
    hotspots:true, acled:true, firms:true, globalFires:false,
    earthquakes:false, iris:false, volcanoes:true, hurricanes:false, gdacs:true,
    floods:false, weatherAlerts:false, eonet:true, aircraft:true, ships:true,
    iss:true, launches:true, copernicus:true, sigmets:false, news:true,
    disease:true, nuclear:true, humanitarian:true, maritime:true,
    cyber:true, redditSignals:true, vuln:true, cve:true,
    milaircraft:true, warships:true, gpsjam:true,
    notams:true, wikiEdits:true, bgp:true, viirs:true,
    telegram:true, preaction:true,
  }), [])

  const allPts = useMemo(() => {
    if (!satData) return []
    return satelliteToPoints(satData, layers)
  }, [satData, layers])

  // ── ACPL: Adaptive Consequence-aware Policy Learning ──────────────────────
  // Augments each signal with consequence-weighted action recommendation.
  // Non-critical suppressed signals are filtered out; all critical always shown.
  const acpl = useACPL({ signals: allPts, enabled: true })
  const acplSignals = useMemo(() => acpl.processedSignals(), [allPts, acpl.processedSignals])

  const sevOrder = { critical:4, high:3, medium:2, low:1 }
  const sorted = useMemo(() =>
    [...acplSignals].sort((a,b) => (sevOrder[b.severity]||0) - (sevOrder[a.severity]||0))
  , [acplSignals])

  // Separate streams
  const conflicts  = sorted.filter(p => ['acled','hotspot','notam','wikiEdit'].includes(p.type) || p.source==='UCDP' || p.source==='Wikidata')
  const disasters  = sorted.filter(p => ['gdacs','hurricane','volcano','flood','earthquake','viirs'].includes(p.type))
  const signals    = sorted.filter(p => ['cyber','vuln','cve','disease','nuclear','humanitarian','maritime','social','bgp','gpsjam','telegram'].includes(p.type) || p.source==='OpenSanctions')
  const movement   = sorted.filter(p => ['aircraft','ship','iss','launch','milaircraft','warship'].includes(p.type))

  // Counts
  const counts = useMemo(() => ({
    total: allPts.length,
    critical: sorted.filter(p=>p.severity==='critical').length,
    conflict: conflicts.length,
    disaster: disasters.length,
    signal: signals.length,
    aircraft: movement.filter(p=>p.type==='aircraft').length,
    ships: movement.filter(p=>p.type==='ship').length,
    news: articles.length,
  }), [allPts, articles])

  // Ticker items: critical + high conflict/disaster
  const tickerItems = useMemo(() => [
    ...sorted.filter(p=>p.severity==='critical').slice(0,15),
    ...articles.slice(0,20).map(a=>({ name:a.title, severity:a.severity||'low', type:'news', zone:a.region||'' })),
  ], [sorted, articles])

  // Selected event
  const [selected, setSelected] = useState(null)

  // Active column tab
  const [colTab, setColTab] = useState('all') // 'all'|'conflict'|'disaster'|'signal'|'movement'|'news'
  const financeArts = useMemo(() =>
    articles.filter(a => a.category==='finance' || /stock|bitcoin|crypto|inflation|fed rate|gdp|oil price|nasdaq|s&p|recession|treasury|tariff|sanction.*economy/i.test(a.title))
  , [articles])

  const localArts = useMemo(() =>
    loc ? filterLocalNews(articles, loc) : []
  , [articles, loc])

  const colItems = useMemo(() => {
    if (colTab==='conflict')  return conflicts
    if (colTab==='disaster')  return disasters
    if (colTab==='signal')    return signals
    if (colTab==='movement')  return movement
    if (colTab==='finance')   return financeArts.map(a=>({ ...a, _isNews:true, name:a.title, severity:a.severity||'low', type:'news' }))
    if (colTab==='local')     return localArts.map(a=>({ ...a, _isNews:true, name:a.title, severity:a.severity||'low', type:'news' }))
    if (colTab==='news')      return (localOnly && loc ? localArts : articles).slice(0,200).map(a=>({ ...a, _isNews:true, name:a.title, severity:a.severity||'low', type:'news' }))
    if (colTab==='telegram')  return []
    return sorted
  }, [colTab, sorted, conflicts, disasters, signals, movement, articles, financeArts, localArts, localOnly, loc, tgRecent])

  // Autoscroll — setInterval works on TV browsers where rAF is throttled
  const scrollRef  = useRef(null)
  const pauseRef   = useRef(false)
  const [scrolling, setScrolling] = useState(true)
  useEffect(() => {
    const iv = setInterval(() => {
      if (pauseRef.current || !scrollRef.current) return
      scrollRef.current.scrollTop += 1
      if (scrollRef.current.scrollTop >= scrollRef.current.scrollHeight - scrollRef.current.clientHeight - 4) {
        scrollRef.current.scrollTop = 0
      }
    }, 30) // ~33fps, reliable on TV browsers
    return () => clearInterval(iv)
  }, [])

  // Refresh every 90s
  useEffect(() => {
    const iv = setInterval(refresh, 90000)
    return () => clearInterval(iv)
  }, [refresh])

  const colTabs = [
    { id:'all',      label:`ALL (${counts.total})` },
    { id:'conflict', label:`⚔️ CONFLICT (${counts.conflict})` },
    { id:'disaster', label:`⚠️ DISASTER (${counts.disaster})` },
    { id:'signal',   label:`💻 INTEL (${counts.signal})` },
    { id:'movement', label:`✈ MOVEMENT` },
    { id:'finance',  label:`💰 FINANCE (${financeArts.length})` },
    { id:'news',     label:`📰 NEWS (${counts.news})` },
    { id:'telegram',  label:`📡 TELEGRAM${tgRecent.length > 0 ? ' (' + tgRecent.length + ')' : ''}` },
    ...(loc ? [{ id:'local', label:`📍 LOCAL (${localArts.length})` }] : []),
  ]

  const statItems = [
    { icon:'⚡', label:'TOTAL',    val:counts.total,    clr:'#2dd4bf' },
    { icon:'🔴', label:'CRITICAL', val:counts.critical, clr:'#ef4444' },
    { icon:'⚔️', label:'CONFLICT', val:counts.conflict, clr:'#f97316' },
    { icon:'⚠️', label:'DISASTER', val:counts.disaster, clr:'#f59e0b' },
    { icon:'💻', label:'INTEL',    val:counts.signal,   clr:'#a78bfa' },
    { icon:'✈',  label:'AIRCRAFT', val:counts.aircraft, clr:'#00ffcc' },
    { icon:'🚢', label:'VESSELS',  val:counts.ships,    clr:'#0088ff' },
    { icon:'📰', label:'NEWS',     val:counts.news,     clr:'#2dd4bf' },
    { icon:'📡', label:'TELEGRAM',  val:tgRecent.length, clr:'#a78bfa' },
    { icon:'📐', label:'CUSUM',     val:intel?.summary?.cusumAlarmCount||0, clr:'#f97316' },
    { icon:'🎲', label:'BAYESIAN',  val:intel?.summary?.highBayesianZones||0, clr:'#a78bfa' },
    { icon:'🧠', label:'ACPL',      val:acpl.qTableSize, clr:'#22c55e' },
    { icon:'⚡', label:'DCC',       val:(acpl.delayedConsequenceCost()*100).toFixed(0)+'%', clr:'#f59e0b' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--void)', overflow:'hidden', fontSize:'12px' }}>

      {/* ── Compact header ── */}
      <div style={{ flexShrink:0, height:'36px', padding:'0 12px', borderBottom:'1px solid var(--border)',
        background:'var(--void)', display:'flex', alignItems:'center', gap:'12px' }}>

        <span className="mono" style={{ fontSize:'11px', fontWeight:700, color:'var(--accent)', letterSpacing:'0.25em', flexShrink:0 }}>
          NEXUS
        </span>

        {/* Live dot */}
        <div style={{ display:'flex', alignItems:'center', gap:'4px', flexShrink:0 }}>
          <div style={{ width:'5px', height:'5px', borderRadius:'50%', background:'#22cc88',
            boxShadow:'0 0 6px #22cc88', animation:'vmpulse 2s infinite' }}/>
          <span className="mono" style={{ fontSize:'9px', color:'#22cc88' }}>LIVE</span>
        </div>

        {/* Stat pills */}
        <div style={{ display:'flex', gap:'6px', flex:1, overflow:'hidden' }}>
          {statItems.map(s => (
            <div key={s.label} style={{ display:'flex', alignItems:'center', gap:'3px',
              padding:'1px 6px', borderRadius:'2px', background:`${s.clr}12`,
              border:`1px solid ${s.clr}30`, flexShrink:0 }}>
              <span style={{ fontSize:'9px' }}>{s.icon}</span>
              <span className="mono" style={{ fontSize:'10px', color:s.clr, fontWeight:700 }}>{s.val}</span>
            </div>
          ))}
        </div>

        {lastFetch && <span className="mono" style={{ fontSize:'9px', color:'var(--t4)', flexShrink:0 }}>
          last sync {lastFetch.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
        </span>}
        {/* TV toggle */}
        <button onClick={() => setShowTV(v => !v)} style={{
          padding: '2px 8px', borderRadius: '3px', flexShrink: 0,
          border: `1px solid ${showTV ? '#ef4444' : 'var(--border)'}`,
          background: showTV ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
          color: showTV ? '#ef4444' : 'var(--t4)',
          cursor: 'pointer', fontSize: '9px', fontFamily: 'JetBrains Mono, monospace',
        }}>
          {showTV ? '📺 ● LIVE' : '📺 TV'}
        </button>
        <Clock />
      </div>

      {/* ── Ticker ── */}
      {tickerItems.length > 0 && (
        <div style={{ flexShrink:0, height:'22px', padding:'0 8px', background:'rgba(45,212,180,0.04)',
          borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'8px' }}>
          <span className="mono" style={{ fontSize:'8px', color:'var(--accent)', flexShrink:0, letterSpacing:'0.1em' }}>BREAKING</span>
          <Ticker items={tickerItems} />
        </div>
      )}

      {/* ── Kalshi markets strip ── */}
      {kalshiTop.length > 0 && (
        <div style={{ flexShrink:0, height:'22px', padding:'0 8px', background:'rgba(167,139,250,0.04)',
          borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'8px', overflow:'hidden' }}>
          <span className="mono" style={{ fontSize:'8px', color:'#a78bfa', flexShrink:0, letterSpacing:'0.1em' }}>🎯 KALSHI</span>
          <div style={{ flex:1, overflow:'hidden', display:'flex', gap:'12px', alignItems:'center' }}>
            {kalshiTop.map(m => {
              const pct = Math.round((m.probability||0)*100)
              const clr = pct>=70?'#ef4444':pct>=50?'#f97316':pct>=30?'#eab308':'#4ade80'
              return (
                <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:'5px', textDecoration:'none', flexShrink:0 }}>
                  <span style={{ fontSize:'10px', fontWeight:800, color:clr }}>{pct}%</span>
                  <span style={{ fontSize:'10px', color:'var(--t3)' }}>{(m.title||'').slice(0,45)}</span>
                  <span style={{ color:'var(--border2)', fontSize:'9px' }}>│</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Critical alerts strip ── */}
      {criticalAlerts.length > 0 && (
        <div style={{ flexShrink:0, height:'22px', padding:'0 8px', background:'rgba(239,68,68,0.08)',
          borderBottom:'1px solid rgba(239,68,68,0.3)', display:'flex', alignItems:'center', gap:'8px', overflow:'hidden' }}>
          <span className="mono" style={{ fontSize:'8px', color:'#ef4444', flexShrink:0, letterSpacing:'0.1em', animation:'vmpulse 1s infinite' }}>🚨 ALERT</span>
          <div style={{ flex:1, overflow:'hidden', display:'flex', gap:'12px' }}>
            {criticalAlerts.slice(0,3).map(a => (
              <span key={a.id} style={{ fontSize:'10px', color:'#ef4444', flexShrink:0 }}>{a.title?.slice(0,60)}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Column tabs ── */}
      <div style={{ flexShrink:0, display:'flex', borderBottom:'1px solid var(--border)',
        background:'var(--void)', padding:'0 4px' }}>
        {colTabs.map(t => (
          <button key={t.id} onClick={()=>setColTab(t.id)} className="mono"
            style={{ padding:'4px 10px', background:'none', border:'none', cursor:'pointer',
              fontSize:'8px', letterSpacing:'0.08em', whiteSpace:'nowrap',
              color: colTab===t.id ? 'var(--accent)' : 'var(--t4)',
              borderBottom: `2px solid ${colTab===t.id ? 'var(--accent)' : 'transparent'}`,
            }}>{t.label}</button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:'2px', padding:'0 4px', alignItems:'center' }}>
          {loc && (
            <button onClick={()=>setLocalOnly(l=>!l)}
              style={{ padding:'2px 7px', background:localOnly?'rgba(45,212,180,0.12)':'rgba(255,255,255,0.04)',
                border:`1px solid ${localOnly?'var(--accent)':'var(--border)'}`,
                borderRadius:'2px', color:localOnly?'var(--accent)':'var(--t4)',
                cursor:'pointer', fontSize:'9px', fontFamily:'JetBrains Mono,monospace', whiteSpace:'nowrap' }}>
              📍 {loc.city||loc.country}
            </button>
          )}
          <button onClick={()=>{ if(scrollRef.current) scrollRef.current.scrollTop-=200; pauseRef.current=true; setTimeout(()=>{pauseRef.current=false},2000) }}
            style={{ padding:'2px 8px', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:'2px', color:'var(--t3)', cursor:'pointer', fontSize:'11px' }}>▲</button>
          <button onClick={()=>{ pauseRef.current=!pauseRef.current; setScrolling(s=>!s) }}
            style={{ padding:'2px 8px', background:scrolling?'rgba(45,212,180,0.1)':'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:'2px', color:scrolling?'var(--accent)':'var(--t3)', cursor:'pointer', fontSize:'11px' }}>{scrolling?'⏸':'▶'}</button>
          <button onClick={()=>{ if(scrollRef.current) scrollRef.current.scrollTop+=200; pauseRef.current=true; setTimeout(()=>{pauseRef.current=false},2000) }}
            style={{ padding:'2px 8px', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:'2px', color:'var(--t3)', cursor:'pointer', fontSize:'11px' }}>▼</button>
        </div>
      </div>

      {/* ── NEXUS Convergence — 4-panel Palantir-style unified view ── */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', gap:0 }}>

        {/* PANEL LEFT (33%) — Event stream: conflict + intel + news auto-scroll */}
        <div style={{ flex:'0 0 25%', overflow:'hidden', display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)' }}>
          <div className="mono" style={{ padding:'4px 10px', borderBottom:'1px solid var(--border)', fontSize:'7px', color:'var(--accent)', letterSpacing:'0.12em', background:'rgba(45,212,191,0.04)', flexShrink:0 }}>
            ◈ INTEL STREAM · {colItems.length} · {signals.length} cyber · {movement.filter(p=>p.type==='milaircraft').length} mil air
          </div>
          {/* Tab strip */}
          <div style={{ display:'flex', flexShrink:0, borderBottom:'1px solid var(--border)', overflowX:'auto', background:'var(--void)' }}>
            {colTabs.map(t => (
              <button key={t.id} onClick={()=>setColTab(t.id)} className="mono"
                style={{ padding:'3px 8px', background:'none', border:'none', cursor:'pointer',
                  fontSize:'7px', letterSpacing:'0.07em', whiteSpace:'nowrap', flexShrink:0,
                  color: colTab===t.id ? 'var(--accent)' : 'var(--t4)',
                  borderBottom: `2px solid ${colTab===t.id ? 'var(--accent)' : 'transparent'}`,
                }}>{t.label}</button>
            ))}
          </div>
          <div ref={scrollRef} style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}
            onMouseEnter={()=>{pauseRef.current=true}} onMouseLeave={()=>{pauseRef.current=false}}>
            {colItems.length === 0
              ? <div style={{ padding:'24px', textAlign:'center', color:'var(--t4)', fontSize:'10px' }}>Loading signals…</div>
              : colItems.map((pt,i) => pt._isNews
                  ? <NewsRow key={i} a={pt} onClick={()=>pt.url&&window.open(pt.url,'_blank')} />
                  : <Row key={i} pt={pt} active={selected?.name===pt.name}
                      onClick={()=>setSelected(p=>p?.name===pt.name?null:pt)} />
              )
            }
          </div>
        </div>

        {/* PANEL CENTER (34%) — Telegram live + TV */}
        <div style={{ flex:'0 0 25%', overflow:'hidden', display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)' }}>
          {showTV ? (
            <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
              <div style={{ padding:'3px 8px', borderBottom:'1px solid var(--border)', display:'flex', gap:'3px', flexWrap:'wrap', flexShrink:0, background:'var(--void)', alignItems:'center' }}>
                <span style={{ fontSize:'8px', color:'#ef4444', fontWeight:800, letterSpacing:'0.1em', marginRight:'4px' }}>● LIVE</span>
                {TV_CHANNELS.map((ch, idx) => (
                  <button key={idx} onClick={() => setTvChannel(idx)} style={{
                    padding:'2px 6px', borderRadius:'2px', fontSize:'9px', cursor:'pointer',
                    background: tvChannel===idx ? 'rgba(239,68,68,0.2)' : 'transparent',
                    border: `1px solid ${tvChannel===idx ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                    color: tvChannel===idx ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}>{ch.flag} {ch.label}</button>
                ))}
              </div>
              <div style={{ position:'relative', width:'100%', paddingBottom:'56.25%', background:'#000', flexShrink:0 }}>
                <iframe key={tvChannel}
                  src={`https://www.youtube.com/embed/${TV_CHANNELS[tvChannel].vid}?autoplay=1&mute=1&rel=0&modestbranding=1`}
                  style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'none' }}
                  allow="autoplay; encrypted-media; fullscreen" allowFullScreen
                  title={TV_CHANNELS[tvChannel].label} referrerPolicy="no-referrer-when-downgrade" />
              </div>
              <div style={{ flex:1, overflowY:'auto' }}>
                <TelegramFeed recent={tgRecent} archive={tgArchive} loading={tgLoading} lastFetch={tgLastFetch} compact />
              </div>
            </div>
          ) : (
            <>
              <div className="mono" style={{ padding:'4px 10px', borderBottom:'1px solid var(--border)', fontSize:'7px', color:'#a78bfa', letterSpacing:'0.12em', background:'rgba(167,139,250,0.04)', flexShrink:0, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>📡 TELEGRAM LIVE · {tgRecent.length} posts (24h)</span>
                {tgLoading && <span style={{ fontSize:'7px', animation:'vmpulse 1s infinite' }}>FETCHING…</span>}
                {tgLastFetch && !tgLoading && <span style={{ color:'var(--t4)' }}>↻ {tgLastFetch.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>}
              </div>
              <div style={{ flex:1, overflowY:'auto' }}>
                <TelegramFeed recent={tgRecent} archive={tgArchive} loading={tgLoading} lastFetch={tgLastFetch} compact />
              </div>
            </>
          )}
        </div>

        {/* PANEL RIGHT (33%) — Imagery + Markets + Critical alerts + detail */}
        <div style={{ flex:'0 0 25%', overflow:'hidden', display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)' }}>
          {selected ? (
            <Detail pt={selected} onClose={()=>setSelected(null)} />
          ) : (
            <>
              {/* ── Pattern of Life + Convergence Alerts — always visible ── */}
              <div style={{ flexShrink:0, borderBottom:'1px solid var(--border)', padding:'5px 8px', background:'rgba(239,68,68,0.04)' }}>
                <div className="mono" style={{ fontSize:'7px', color:'#ef4444', letterSpacing:'0.1em', marginBottom:'4px', display:'flex', justifyContent:'space-between' }}>
                  <span>⚡ CONVERGENCE {convergence?.criticalZones ? `(${(convergence.criticalZones.length||0) + (convergence.multiSourceAlerts?.length||0)} zones)` : '(loading…)'}</span>
                  {polSummary?.anomalyCount > 0 && <span style={{ color:'#f97316' }}>📊 {polSummary.anomalyCount} PoL</span>}
                </div>
                {convergence?.criticalZones && [...(convergence.criticalZones||[]), ...(convergence.multiSourceAlerts||[])].slice(0,5).map((z,i) => (
                  <div key={i} style={{ padding:'3px 0', borderBottom:'1px solid rgba(239,68,68,0.1)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:'9px', color: z.level==='critical'?'#ef4444':'#f97316', fontWeight:700 }}>
                        {z.level==='critical'?'🔴':'🟠'} {z.zone?.name}
                      </span>
                      <span className="mono" style={{ fontSize:'7px', color:'var(--t4)' }}>
                        {z.independentGroups} src · {((z.convergenceProb||0)*100).toFixed(0)}%
                        {z.escalating && <span style={{ color:'#ef4444', marginLeft:'3px' }}>↑ESC</span>}
                      </span>
                    </div>
                  </div>
                ))}
                {convergence?.criticalZones && (convergence.criticalZones.length + (convergence.multiSourceAlerts?.length||0)) === 0 && (
                  <div style={{ fontSize:'8px', color:'var(--t4)' }}>All zones nominal</div>
                )}
              </div>

              {/* ── CUSUM Alarms + Bayesian Scores ──────────────────────────── */}
              {intel && (
                <div style={{ flexShrink:0, borderBottom:'1px solid var(--border)', padding:'5px 8px', background:'rgba(167,139,250,0.04)' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#a78bfa', letterSpacing:'0.1em', marginBottom:'4px', display:'flex', gap:'8px' }}>
                    <span>📐 CUSUM ({intel.cusumAlerts?.length||0})</span>
                    <span>🎲 BAYES ({intel.bayesianScores?.length||0})</span>
                    {intel.telegramClustering?.clustered && <span style={{color:'#ef4444'}}>📡 TG CLUSTER {intel.telegramClustering.ratio}×</span>}
                  </div>
                  {intel.cusumAlerts?.slice(0,3).map((a,i) => (
                    <div key={i} style={{ fontSize:'8px', color: a.severity==='critical'?'#ef4444':'#f97316', marginBottom:'2px' }}>
                      ↑ {a.zone?.name} C+={a.Cplus} (base {a.baselineCII})
                    </div>
                  ))}
                  {intel.bayesianScores?.slice(0,3).map((s,i) => (
                    <div key={i} style={{ fontSize:'8px', color: s.level==='critical'?'#ef4444':s.level==='high'?'#f97316':'#fbbf24', marginBottom:'2px' }}>
                      🎲 {s.zone?.name}: {(s.probability*100).toFixed(0)}% escalation
                    </div>
                  ))}
                  {intel?.narrativeAcceleration?.length > 0 && (
                    <div style={{ fontSize:'7px', color:'var(--t4)', marginTop:'3px' }}>
                      ↑ Accelerating: {intel.narrativeAcceleration.map(v=>v.topic).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* ── Financial Conflict Index ─────────────────────────────────── */}
              <div style={{ flexShrink:0, borderBottom:'1px solid var(--border)', padding:'4px 8px', background:'rgba(251,191,36,0.04)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span className="mono" style={{ fontSize:'7px', color:'#fbbf24', letterSpacing:'0.1em' }}>💰 FCI {conflictMarkets?.fci ? `— ${conflictMarkets.fci.level?.toUpperCase()}` : '(loading…)'}</span>
                  {conflictMarkets?.fci && (
                    <span className="mono" style={{ fontSize:'9px', fontWeight:700, color: conflictMarkets.fci.level==='critical'?'#ef4444':conflictMarkets.fci.level==='high'?'#f97316':'#fbbf24' }}>
                      {conflictMarkets.fci.score}
                    </span>
                  )}
                </div>
                {conflictMarkets && (
                  <div style={{ display:'flex', gap:'8px', marginTop:'3px', flexWrap:'wrap' }}>
                    {(conflictMarkets.defenseStocks||[]).filter(s=>Math.abs(s.changePercent||0)>2).slice(0,3).map((s,i)=>(
                      <span key={i} className="mono" style={{ fontSize:'7px', color:(s.changePercent||0)>0?'#4ade80':'#ef4444' }}>
                        {s.symbol} {(s.changePercent||0)>0?'↑':'↓'}{Math.abs(s.changePercent||0).toFixed(1)}%
                      </span>
                    ))}
                    {(conflictMarkets.warCurrencies||[]).filter(c=>c.signal==='devaluation_alert').slice(0,3).map((c,i)=>(
                      <span key={i} className="mono" style={{ fontSize:'7px', color:'#f97316' }}>
                        {c.code} {c.monthChange?.toFixed(1)}% (30d)
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Satellite imagery strip */}
              {liveAlerts.filter(a=>a.type==='satellite_imagery').length > 0 && (
                <div style={{ flexShrink:0, borderBottom:'1px solid var(--border)', padding:'6px 8px', background:'rgba(167,139,250,0.04)' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#a78bfa', letterSpacing:'0.1em', marginBottom:'4px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>🛰 SATELLITE IMAGERY ({liveAlerts.filter(a=>a.type==='satellite_imagery').length})</span>
                    <span style={{ display:'flex', gap:'4px' }}>
                      <a href="https://zoom.earth" target="_blank" rel="noopener" className="mono" style={{ fontSize:'6px', color:'#60a5fa', textDecoration:'none', padding:'1px 4px', border:'1px solid rgba(96,165,250,0.3)', borderRadius:'2px' }}>Zoom Earth ↗</a>
                      <a href="https://worldview.earthdata.nasa.gov" target="_blank" rel="noopener" className="mono" style={{ fontSize:'6px', color:'#4ade80', textDecoration:'none', padding:'1px 4px', border:'1px solid rgba(74,222,128,0.3)', borderRadius:'2px' }}>NASA Worldview ↗</a>
                      <a href="https://eos.com/landviewer/" target="_blank" rel="noopener" className="mono" style={{ fontSize:'6px', color:'#fbbf24', textDecoration:'none', padding:'1px 4px', border:'1px solid rgba(251,191,36,0.3)', borderRadius:'2px' }}>EOSDA ↗</a>
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:'5px', overflowX:'auto', paddingBottom:'3px' }}>
                    {liveAlerts.filter(a=>a.type==='satellite_imagery').slice(0,8).map((item,i) => (
                      <a key={i} href={item.url||'#'} target="_blank" rel="noopener"
                        style={{ flexShrink:0, width:'80px', textDecoration:'none' }}>
                        <div style={{ width:'80px', height:'54px', background:'rgba(167,139,250,0.1)', border:'1px solid rgba(167,139,250,0.3)', borderRadius:'3px', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                          {item.thumbnail
                            ? <img src={item.thumbnail} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex'}} />
                            : null}
                          <span style={{ fontSize:'18px', display: item.thumbnail ? 'none' : 'flex' }}>{item.icon||'🛰'}</span>
                          <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.7)', padding:'1px 3px' }}>
                            <span className="mono" style={{ fontSize:'6px', color:'#a78bfa' }}>{(item.region||item.source||'Earth').slice(0,12)}</span>
                          </div>
                        </div>
                        <div className="mono" style={{ fontSize:'6px', color:'var(--t3)', lineHeight:1.2, marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {(item.title||'').replace(/🛰[^:]*:\s*/,'').slice(0,22)}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Markets probability strip */}
              {kalshiTop.length > 0 && (
                <div style={{ flexShrink:0, borderBottom:'1px solid var(--border)', padding:'5px 8px', background:'rgba(167,139,250,0.03)' }}>
                  <div className="mono" style={{ fontSize:'7px', color:'#a78bfa', letterSpacing:'0.1em', marginBottom:'4px' }}>🎯 PREDICTION MARKETS</div>
                  {kalshiTop.slice(0,4).map(m => {
                    const pct = Math.round((m.probability||0)*100)
                    const clr = pct>=70?'#ef4444':pct>=50?'#f97316':pct>=30?'#eab308':'#4ade80'
                    return (
                      <a key={m.id} href={m.url} target="_blank" rel="noopener"
                        style={{ display:'flex', alignItems:'center', gap:'6px', padding:'2px 0', textDecoration:'none' }}>
                        <span style={{ fontSize:'12px', fontWeight:800, color:clr, width:'30px', flexShrink:0 }}>{pct}%</span>
                        <span style={{ fontSize:'9px', color:'var(--t2)', lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(m.title||'').slice(0,50)}</span>
                      </a>
                    )
                  })}
                </div>
              )}

              {/* Intel summary */}
              <div style={{ flex:1, overflowY:'auto' }}>
                <IntelSidebar sorted={sorted} articles={articles} satData={satData} convergence={convergence} intel={intel} conflictMarkets={conflictMarkets} geoRisk={geoRisk.results} adultEcon={adultEcon} crypto={crypto} />
              </div>
            </>
          )}
        </div>

        {/* PANEL 4 (25%) — Conflict + Disaster live feed */}
        <div style={{ flex:'0 0 25%', overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div className="mono" style={{ padding:'4px 10px', borderBottom:'1px solid var(--border)', fontSize:'7px', color:'#f97316', letterSpacing:'0.12em', background:'rgba(249,115,22,0.04)', flexShrink:0 }}>
            ⚔ CONFLICT & DISASTER · {conflicts.length + disasters.length} active
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {[...conflicts.slice(0,30), ...disasters.slice(0,20)].map((pt,i) => (
              <Row key={i} pt={pt} active={selected?.name===pt.name} onClick={()=>setSelected(p=>p?.name===pt.name?null:pt)} />
            ))}
            {conflicts.length===0 && disasters.length===0 && (
              <div style={{ padding:'20px', textAlign:'center', color:'var(--t4)', fontSize:'10px' }}>Loading…</div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes vmpulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar { width:3px }
        ::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px }
      `}</style>
    </div>
  )
}
