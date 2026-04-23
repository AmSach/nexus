import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MAP_ZONES, SEV_COLOR } from '../../data/constants'
import { useStore } from '../../store'
import { ZoomIn, ZoomOut, Maximize2, X, Plus } from 'lucide-react'

const W = 960, H = 500
const proj = (lat, lng) => ({ x: ((lng + 180) / 360) * W, y: ((90 - lat) / 180) * H })

// Simplified Natural Earth land paths — equirectangular 960×500
const LAND = [
  // North America
  "M62 44 L82 38 L110 36 L135 38 L158 40 L175 44 L185 50 L185 56 L178 62 L168 60 L155 62 L148 70 L138 74 L122 72 L108 68 L92 64 L76 60 L64 54Z",
  "M80 62 L95 58 L120 56 L150 54 L178 54 L200 56 L220 58 L235 62 L240 70 L235 80 L225 88 L210 95 L195 100 L178 104 L160 104 L140 100 L120 96 L105 92 L92 86 L80 78Z",
  // Mexico + Central Am
  "M110 104 L130 100 L148 100 L160 108 L165 118 L160 128 L148 134 L135 132 L122 125 L112 116Z M148 134 L158 138 L162 148 L157 155 L150 154 L144 146 L146 138Z",
  // Greenland
  "M232 18 L265 12 L295 14 L318 20 L325 32 L318 46 L298 56 L270 58 L248 52 L230 40Z",
  // Cuba
  "M188 135 L202 132 L210 136 L206 142 L196 143Z",
  // Colombia + Venezuela
  "M160 178 L178 172 L195 174 L205 180 L200 192 L188 196 L172 193 L162 186Z M202 175 L220 170 L235 173 L240 182 L232 190 L215 190 L204 183Z",
  // Brazil
  "M162 193 L185 190 L210 194 L235 200 L252 212 L258 230 L252 252 L238 268 L220 275 L200 272 L180 260 L165 244 L158 225 L160 208Z",
  // Argentina + Chile
  "M178 262 L198 270 L205 288 L200 312 L190 335 L178 350 L168 346 L162 328 L165 305 L170 280Z M165 262 L175 260 L172 278 L165 295 L155 288 L158 272Z",
  // Peru + Bolivia
  "M157 220 L168 214 L180 216 L188 226 L182 238 L168 244 L158 238Z",
  // Iceland
  "M358 42 L368 38 L378 40 L380 48 L372 54 L362 54 L356 48Z",
  // UK + Ireland
  "M408 72 L416 68 L424 70 L426 78 L420 84 L412 82Z M402 76 L408 72 L410 80 L404 82 L400 78Z",
  // Iberia
  "M402 90 L416 86 L428 86 L436 94 L432 104 L420 108 L408 106 L400 98Z",
  // France + Benelux
  "M418 82 L436 80 L448 82 L452 92 L444 100 L432 102 L420 96Z",
  // Norway + Sweden
  "M448 32 L466 26 L480 30 L485 40 L478 52 L468 58 L454 55 L446 44Z M466 28 L482 26 L492 30 L494 42 L486 52 L472 54 L466 44Z",
  // Finland + Baltics
  "M490 34 L504 30 L514 34 L516 46 L508 55 L496 54 L488 44Z",
  // Germany + Austria + Czech
  "M448 80 L468 77 L480 80 L482 90 L472 96 L454 96 L446 88Z",
  // Poland
  "M470 72 L490 70 L500 74 L500 84 L490 88 L472 86 L468 78Z",
  // Italy
  "M448 96 L460 92 L466 98 L462 112 L456 124 L448 122 L442 108Z",
  // Greece
  "M464 108 L478 104 L484 110 L480 120 L468 122 L460 116Z",
  // Romania + Hungary
  "M476 84 L494 80 L506 84 L508 94 L496 100 L478 98Z",
  // Ukraine + Belarus
  "M490 70 L514 64 L534 66 L538 76 L526 84 L504 86 L488 80Z",
  // Russia (west + east)
  "M486 28 L540 18 L600 14 L660 12 L720 14 L760 20 L780 28 L775 42 L750 50 L720 52 L690 50 L660 48 L630 50 L600 52 L570 55 L540 54 L510 52 L490 46Z M720 14 L780 10 L840 14 L870 22 L875 34 L850 44 L820 48 L784 46 L755 42 L730 32Z M840 14 L895 12 L930 16 L940 26 L928 38 L905 44 L875 42 L846 30Z",
  // Turkey
  "M480 102 L508 96 L532 98 L540 106 L534 116 L512 120 L490 116Z",
  // Syria + Iraq
  "M510 116 L534 112 L550 112 L558 120 L550 130 L528 134 L510 128Z",
  // Iran
  "M540 100 L578 94 L610 96 L620 108 L614 124 L592 130 L562 128 L544 118Z",
  // Arabian Peninsula
  "M510 130 L550 126 L570 130 L572 148 L560 164 L540 170 L518 165 L506 148Z",
  // Kazakhstan
  "M546 64 L590 56 L630 56 L650 64 L648 76 L624 82 L594 82 L560 78Z",
  // Pakistan + Afghanistan
  "M578 94 L616 86 L648 88 L656 100 L646 114 L618 120 L588 118Z",
  // India
  "M620 102 L648 96 L664 100 L668 116 L658 136 L644 152 L626 158 L610 150 L606 132 L610 114Z",
  // China
  "M648 60 L700 52 L748 54 L770 62 L775 78 L760 96 L732 108 L702 112 L672 108 L650 96 L644 78Z",
  // Mongolia
  "M648 52 L695 44 L735 46 L752 56 L746 66 L714 70 L678 68 L652 60Z",
  // SE Asia
  "M690 112 L714 106 L724 112 L720 128 L706 136 L692 130Z M716 108 L732 104 L738 112 L730 124 L718 120Z",
  // Korea
  "M736 72 L748 68 L752 74 L750 84 L742 88 L734 82Z",
  // Japan
  "M756 64 L770 60 L778 66 L776 76 L766 82 L756 76Z M750 82 L758 78 L762 84 L758 92 L750 90Z",
  // Indonesia (simplified)
  "M680 148 L710 142 L726 146 L724 156 L706 160 L682 156Z M720 146 L745 140 L760 146 L756 156 L736 158 L718 152Z M760 152 L778 148 L788 154 L784 164 L764 165Z",
  // Philippines
  "M740 114 L752 110 L758 116 L754 128 L744 132 L738 124Z",
  // Taiwan
  "M734 96 L740 92 L744 96 L740 104 L734 102Z",
  // Egypt
  "M465 120 L492 118 L506 124 L500 136 L478 138 L462 132Z",
  // Libya + Algeria
  "M436 118 L465 118 L465 140 L448 142 L428 138 L420 128Z M390 110 L436 108 L438 130 L416 135 L394 132 L384 120Z",
  // West Africa
  "M378 138 L415 130 L450 130 L466 140 L460 158 L440 168 L415 168 L390 160 L372 150Z",
  // Congo + Central Africa
  "M450 158 L484 152 L508 155 L510 172 L492 182 L462 182 L446 170Z",
  // Ethiopia + Horn
  "M500 150 L528 144 L542 148 L545 162 L530 172 L508 170 L498 162Z",
  // East Africa
  "M505 168 L530 164 L540 174 L534 196 L518 206 L502 200 L496 186 L498 172Z",
  // South Africa + Zimbabwe
  "M452 192 L482 188 L505 192 L510 210 L496 228 L474 232 L450 224 L440 208Z",
  // Madagascar
  "M508 184 L516 178 L524 182 L522 200 L514 208 L505 200Z",
  // Australia
  "M696 192 L738 182 L775 184 L800 196 L808 216 L798 240 L775 254 L744 258 L714 250 L692 230 L686 208Z",
  // New Zealand
  "M808 240 L820 234 L826 242 L820 255 L810 256Z M818 258 L828 250 L836 256 L833 270 L822 274 L814 266Z",
]

export default function ThreatMap() {
  const { addNode, setTab } = useStore()
  const [zoom,     setZoom]     = useState(1)
  const [pan,      setPan]      = useState({ x: 0, y: 0 })
  const [panning,  setPanning]  = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter,   setFilter]   = useState('all')
  const svgRef = useRef(null)

  const filtered = filter === 'all' ? MAP_ZONES : MAP_ZONES.filter(z => z.sev === filter || z.cat === filter)
  const sel = MAP_ZONES.find(z => z.id === selected)

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const h = e => { e.preventDefault(); setZoom(z => Math.max(0.5, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 0.87)))) }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])

  const onDown = e => {
    if (e.target === svgRef.current || e.target.tagName === 'rect') {
      setPanning({ sx: e.clientX - pan.x, sy: e.clientY - pan.y })
    }
  }
  const onMove = useCallback(e => { if (panning) setPan({ x: e.clientX - panning.sx, y: e.clientY - panning.sy }) }, [panning])
  const onUp   = useCallback(() => setPanning(null), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--base)', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Orbitron', fontSize: '11px', color: 'var(--accent)', letterSpacing: '0.12em' }}>THREAT MAP</span>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {['all', 'critical', 'high', 'medium', 'conflict', 'crime', 'politics'].map(f => (
            <button key={f} className="btn" style={{ fontSize: '9px', padding: '2px 8px', background: filter === f ? 'rgba(45,212,191,0.1)' : 'transparent', borderColor: filter === f ? 'rgba(45,212,191,0.35)' : 'var(--border)', color: filter === f ? 'var(--accent)' : 'var(--t3)' }}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>{filtered.length} zones</span>
        <button className="btn" style={{ padding: '3px 6px' }} onClick={() => setZoom(z => Math.min(8, z * 1.2))}><ZoomIn size={11}/></button>
        <button className="btn" style={{ padding: '3px 6px' }} onClick={() => setZoom(z => Math.max(0.5, z * 0.8))}><ZoomOut size={11}/></button>
        <button className="btn" style={{ padding: '3px 6px' }} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}><Maximize2 size={11}/></button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Map */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <svg ref={svgRef} viewBox="0 0 960 500" preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '100%', background: '#020810', cursor: panning ? 'grabbing' : 'grab' }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
            <defs>
              {Object.entries(SEV_COLOR).map(([sev, color]) => (
                <radialGradient key={sev} id={`glow-${sev}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={color} stopOpacity="0.45"/>
                  <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </radialGradient>
              ))}
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`} style={{ transformOrigin: '480px 250px' }}>
              {/* Ocean */}
              <rect x={0} y={0} width={W} height={H} fill="#020810"/>
              {/* Grid */}
              {[-60,-30,0,30,60].map(lat => { const y=(90-lat)/180*H; return <line key={lat} x1={0} y1={y} x2={W} y2={y} stroke={lat===0?"#0d3060":"#061828"} strokeWidth={lat===0?0.8:0.4}/> })}
              {[-120,-60,0,60,120].map(lng => { const x=(lng+180)/360*W; return <line key={lng} x1={x} y1={0} x2={x} y2={H} stroke="#061828" strokeWidth={0.4}/> })}
              {/* Arctic circle */}
              <line x1={0} y1={(90-66.5)/180*H} x2={W} y2={(90-66.5)/180*H} stroke="#0d3060" strokeWidth={0.5} strokeDasharray="4 4"/>
              {/* Land */}
              {LAND.map((d, i) => <path key={i} d={d} fill="#0d1f35" stroke="#1a3050" strokeWidth="0.5"/>)}
              {/* Zones */}
              {filtered.map(z => {
                const { x, y } = proj(z.lat, z.lng)
                const c = SEV_COLOR[z.sev] || 'var(--accent)'
                const r = z.sev === 'critical' ? 5 : z.sev === 'high' ? 4 : 3
                const isSel = selected === z.id
                return (
                  <g key={z.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(isSel ? null : z.id)}>
                    <circle cx={x} cy={y} r={isSel ? 24 : 18} fill={`url(#glow-${z.sev})`} opacity={0.7}/>
                    <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={1} opacity={0.5}>
                      <animate attributeName="r" values={`${r};${r+10};${r}`} dur="2.5s" repeatCount="indefinite"/>
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="2.5s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx={x} cy={y} r={isSel?r+2:r} fill={c} stroke={isSel?"#fff":c} strokeWidth={isSel?1.5:0.5} style={{ filter:`drop-shadow(0 0 ${isSel?6:3}px ${c})` }}/>
                    {isSel && <text x={x+10} y={y-8} style={{ fontFamily:'JetBrains Mono', fontSize:'8px' }} fill="#e2e8f0" stroke="#020810" strokeWidth={1.5} paintOrder="stroke">{z.name}</text>}
                  </g>
                )
              })}
            </g>
          </svg>

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(6,12,20,0.9)', border: '1px solid var(--border)', borderRadius: '3px', padding: '8px 10px' }}>
            {Object.entries(SEV_COLOR).map(([sev, c]) => (
              <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c, display: 'inline-block' }}/>
                <span className="mono" style={{ fontSize: '9px', color: 'var(--t3)' }}>{sev}</span>
                <span className="mono" style={{ fontSize: '9px', color: c }}>{MAP_ZONES.filter(z=>z.sev===sev).length}</span>
              </div>
            ))}
          </div>
          <div className="mono" style={{ position:'absolute', bottom:'10px', right: sel?'270px':'10px', fontSize:'9px', color:'var(--t4)', background:'rgba(6,12,20,0.8)', border:'1px solid var(--border)', padding:'2px 7px', borderRadius:'2px' }}>
            {Math.round(zoom*100)}%
          </div>
        </div>

        {/* Zone list */}
        <div style={{ width: '200px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--base)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <span className="mono" style={{ fontSize: '8px', color: 'var(--t4)', letterSpacing: '0.1em' }}>MONITORING ZONES</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map(z => (
              <button key={z.id} onClick={() => setSelected(z.id === selected ? null : z.id)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', width: '100%', padding: '8px 10px', borderBottom: '1px solid var(--border)', background: selected===z.id?'rgba(45,212,191,0.06)':'transparent', cursor: 'pointer', border: 'none', borderLeft: selected===z.id?'2px solid var(--accent)':'2px solid transparent', textAlign: 'left', transition: 'background 0.1s' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: SEV_COLOR[z.sev], flexShrink: 0, marginTop: '3px', boxShadow: `0 0 4px ${SEV_COLOR[z.sev]}` }}/>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.3 }}>{z.name}</div>
                  <div className="mono" style={{ fontSize: '8px', color: 'var(--t4)' }}>{z.cat}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected zone detail */}
        {sel && (
          <div style={{ width: '240px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--base)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="fade-in">
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${SEV_COLOR[sel.sev]}44`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: SEV_COLOR[sel.sev] }}/>
                <span className="mono" style={{ fontSize: '9px', color: SEV_COLOR[sel.sev] }}>{sel.sev.toUpperCase()}</span>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}><X size={11}/></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', marginBottom: '8px', lineHeight: 1.3 }}>{sel.name}</div>
              <p style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.7, marginBottom: '10px' }}>{sel.desc}</p>
              <div className="mono" style={{ fontSize: '9px', color: 'var(--t4)', marginBottom: '12px' }}>
                {Math.abs(sel.lat).toFixed(1)}°{sel.lat>=0?'N':'S'} {Math.abs(sel.lng).toFixed(1)}°{sel.lng>=0?'E':'W'}
              </div>
              <button className="btn btn-accent" style={{ width: '100%', justifyContent: 'center', fontSize: '10px' }}
                onClick={() => { addNode({ type: 'location', label: sel.name, detail: sel.desc, color: SEV_COLOR[sel.sev], x: 200+Math.random()*400, y: 150+Math.random()*300 }); setTab('board') }}>
                <Plus size={10}/> add to board
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
