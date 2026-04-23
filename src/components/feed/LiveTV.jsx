/**
 * LiveTV v3 — User-verified working YouTube live video IDs
 * All 22 channels confirmed by user. Uses /embed/{videoId} format.
 * NOTE: YouTube live embeds require the page to have appropriate
 * referrer permissions — these work when served from a real domain.
 * For localhost dev: add ?origin=http://localhost:5173 to embed URL.
 */
import React, { useState, useMemo } from 'react'

const CHANNELS = [
  // US Networks
  { id:'abc',       label:'ABC News',       flag:'🇺🇸', cat:'us',      vid:'db6TzJM47jU' },
  { id:'cbs',       label:'CBS News',       flag:'🇺🇸', cat:'us',      vid:'v-Vf9dV7EB8' },
  { id:'nbc',       label:'NBC News',       flag:'🇺🇸', cat:'us',      vid:'1xsaeOoptoA' },
  { id:'fox',       label:'Fox News',       flag:'🇺🇸', cat:'us',      vid:'C96oohpWBGw' },
  { id:'cnbc',      label:'CNBC',           flag:'🇺🇸', cat:'finance', vid:'9NyxcX3rhQs' },
  { id:'bloomberg', label:'Bloomberg',      flag:'🇺🇸', cat:'finance', vid:'9RQWQ8pgDNg' },
  // UK / Europe
  { id:'gb',        label:'GB News',        flag:'🇬🇧', cat:'uk',      vid:'QliL4CGc7iY' },
  { id:'sky',       label:'Sky News',       flag:'🇬🇧', cat:'uk',      vid:'YDvsBbKfLPA' },
  { id:'talktv',    label:'Talk TV',        flag:'🇬🇧', cat:'uk',      vid:'DFYaNjzI1aI' },
  { id:'france24',  label:'France 24',      flag:'🇫🇷', cat:'europe',  vid:'Ap-UM1O9RBU' },
  { id:'dw',        label:'DW News',        flag:'🇩🇪', cat:'europe',  vid:'LuKwFajn37U' },
  { id:'euro',      label:'Euronews',       flag:'🇪🇺', cat:'europe',  vid:'pykpO5kQJ98' },
  // Middle East
  { id:'aljazeera', label:'Al Jazeera',     flag:'🌍', cat:'mideast',  vid:'gCNeDWCI0vo' },
  { id:'i24',       label:'i24 News',       flag:'🇮🇱', cat:'mideast', vid:'wLuD1yi9frY' },
  { id:'iranintl',  label:'Iran Intl.',     flag:'🇮🇷', cat:'mideast', vid:'wk0uvX60fxg' },
  { id:'alarabiya', label:'Al Arabiya',     flag:'🇸🇦', cat:'mideast', vid:'n7eQejkXbnM' },
  { id:'trt',       label:'TRT World',      flag:'🇹🇷', cat:'mideast', vid:'ABfFhWzWs0s' },
  // Asia
  { id:'nhk',       label:'NHK World',      flag:'🇯🇵', cat:'asia',    vid:'f0lYkdA-Gtw' },
  { id:'wion',      label:'WION',           flag:'🇮🇳', cat:'asia',    vid:'vfszY1JYbMc' },
  { id:'ndtv',      label:'NDTV',           flag:'🇮🇳', cat:'asia',    vid:'-fQyqVqi7GI' },
  { id:'arirang',   label:'Arirang Korea',  flag:'🇰🇷', cat:'asia',    vid:'CJVBX7KI5nU' },
  // International
  { id:'un',        label:'UN Live',        flag:'🇺🇳', cat:'intl',    vid:'vYRfQo6JMxc' },
]

const CATS = [
  { id:'all',     label:'All' },
  { id:'us',      label:'🇺🇸 US' },
  { id:'uk',      label:'🇬🇧 UK' },
  { id:'europe',  label:'🇪🇺 Europe' },
  { id:'mideast', label:'🌍 Mid East' },
  { id:'asia',    label:'🌏 Asia' },
  { id:'finance', label:'💰 Finance' },
  { id:'intl',    label:'🌐 Intl' },
]

function embedUrl(vid) {
  // Standard YouTube embed — works for both live and VOD
  return `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&rel=0&modestbranding=1`
}

function Player({ ch }) {
  const [muted, setMuted] = React.useState(true)
  const url = `https://www.youtube.com/embed/${ch.vid}?autoplay=1&mute=${muted?1:0}&rel=0&modestbranding=1`
  return (
    <div style={{ position:'relative', width:'100%', height:'100%', background:'var(--void)' }}>
      <div style={{
        position:'absolute', top:0, left:0, zIndex:2,
        padding:'3px 8px', background:'rgba(0,0,0,0.75)',
        display:'flex', alignItems:'center', gap:'5px',
      }}>
        <span style={{ fontSize:'10px', pointerEvents:'none' }}>{ch.flag}</span>
        <span style={{ fontSize:'10px', color:'#fff', fontWeight:600, pointerEvents:'none' }}>{ch.label}</span>
        <span style={{ fontSize:'8px', color:'#ef4444', fontWeight:800, letterSpacing:'0.1em', pointerEvents:'none' }}>● LIVE</span>
        <button
          onClick={() => setMuted(m => !m)}
          style={{ marginLeft:'6px', padding:'2px 8px', fontSize:'9px', fontWeight:700,
            background: muted ? 'rgba(239,68,68,0.8)' : 'rgba(45,212,191,0.8)',
            border:'none', borderRadius:'3px', color:'#fff', cursor:'pointer', letterSpacing:'0.05em' }}>
          {muted ? '🔇 MUTED' : '🔊 LIVE'}
        </button>
      </div>
      <iframe
        key={ch.id + muted}
        src={url}
        style={{ width:'100%', height:'100%', border:'none', display:'block' }}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        title={ch.label}
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  )
}

function EmptySlot({ n }) {
  return (
    <div style={{ width:'100%', height:'100%', background:'#0a0a0a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.2)' }}>
      <div style={{ fontSize:'20px', marginBottom:'6px' }}>📺</div>
      <div style={{ fontSize:'10px' }}>Slot {n} — select a channel</div>
    </div>
  )
}

export default function LiveTV() {
  const [cat, setCat] = useState('all')
  const [layout, setLayout] = useState('single') // single | grid2 | grid4
  const [single, setSingle] = useState(CHANNELS[0])
  // Grid slots
  const [slots, setSlots] = useState([CHANNELS[0].id, CHANNELS[12].id, CHANNELS[7].id, CHANNELS[17].id])

  const filtered = useMemo(() => cat === 'all' ? CHANNELS : CHANNELS.filter(c => c.cat === cat), [cat])

  const maxSlots = layout === 'grid4' ? 4 : layout === 'grid2' ? 2 : 1

  function selectChannel(ch) {
    if (layout === 'single') {
      setSingle(ch)
    } else {
      setSlots(prev => {
        if (prev.includes(ch.id)) return prev.filter(id => id !== ch.id)
        if (prev.length >= maxSlots) return [...prev.slice(1), ch.id]
        return [...prev, ch.id]
      })
    }
  }

  const slotChannels = slots.map(id => CHANNELS.find(c => c.id === id))
  const isActive = (ch) => layout === 'single' ? single?.id === ch.id : slots.includes(ch.id)

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'var(--void)', overflow:'hidden' }}>

      {/* Top bar */}
      <div style={{ padding:'6px 12px', background:'var(--base)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
        <span style={{ fontSize:'13px', fontWeight:700, color:'var(--t1)' }}>📺 LIVE TV</span>
        <span style={{ fontSize:'8px', fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,0.15)', padding:'2px 6px', borderRadius:'3px', letterSpacing:'0.1em' }}>● LIVE</span>
        <span style={{ fontSize:'10px', color:'var(--t4)' }}>{CHANNELS.length} channels</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:'3px' }}>
          {[
            { id:'single', label:'▣ 1' },
            { id:'grid2',  label:'▦ 2' },
            { id:'grid4',  label:'⊞ 4' },
          ].map(l => (
            <button key={l.id} onClick={() => setLayout(l.id)} style={{
              padding:'3px 8px', borderRadius:'3px', fontSize:'11px', cursor:'pointer',
              background: layout===l.id ? 'var(--accent)' : 'var(--surface)',
              border:`1px solid ${layout===l.id ? 'var(--accent)' : 'var(--border)'}`,
              color: layout===l.id ? '#000' : 'var(--t3)',
            }}>{l.label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Channel sidebar */}
        <div style={{ width:'148px', flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--base)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Category filter */}
          <div style={{ padding:'4px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            {CATS.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)} style={{
                display:'block', width:'100%', textAlign:'left', padding:'3px 7px',
                borderRadius:'3px', border:'none', cursor:'pointer', fontSize:'10px',
                background: cat===c.id ? 'rgba(45,212,191,0.1)' : 'transparent',
                color: cat===c.id ? 'var(--accent)' : 'var(--t4)',
                fontWeight: cat===c.id ? 700 : 400,
              }}>{c.label}</button>
            ))}
          </div>
          {/* Channel list */}
          <div style={{ flex:1, overflowY:'auto', padding:'3px' }}>
            {filtered.map(ch => {
              const active = isActive(ch)
              return (
                <button key={ch.id} onClick={() => selectChannel(ch)} style={{
                  display:'flex', alignItems:'center', gap:'6px', width:'100%',
                  textAlign:'left', padding:'5px 6px', borderRadius:'3px', border:'none',
                  cursor:'pointer', marginBottom:'1px',
                  background: active ? 'rgba(45,212,191,0.1)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--t3)',
                }}>
                  <span style={{ fontSize:'12px', flexShrink:0 }}>{ch.flag}</span>
                  <span style={{ fontSize:'10px', fontWeight: active ? 700 : 400, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ch.label}</span>
                  {active && <span style={{ fontSize:'7px', color:'#ef4444', fontWeight:800, flexShrink:0 }}>●</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Video area */}
        <div style={{ flex:1, overflow:'hidden', background:'var(--void)' }}>
          {layout === 'single' && (
            <div style={{ width:'100%', height:'100%' }}>
              {single ? <Player ch={single} /> : <EmptySlot n={1} />}
            </div>
          )}
          {layout === 'grid2' && (
            <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px', background:'#111' }}>
              {[0,1].map(i => {
                const ch = slotChannels[i]
                return <div key={i} style={{ overflow:'hidden', minHeight:0 }}>{ch ? <Player ch={ch} /> : <EmptySlot n={i+1} />}</div>
              })}
            </div>
          )}
          {layout === 'grid4' && (
            <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr 1fr', gap:'2px', background:'#111' }}>
              {[0,1,2,3].map(i => {
                const ch = slotChannels[i]
                return <div key={i} style={{ overflow:'hidden', minHeight:0 }}>{ch ? <Player ch={ch} /> : <EmptySlot n={i+1} />}</div>
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
