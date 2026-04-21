/**
 * MarketsTicker — scrolling prediction markets bar at top of page
 * Shows BOTH Kalshi + Polymarket geo markets, merged and deduped.
 * Uses seed data from Kalshi when live unavailable.
 */
import React, { useRef, useEffect, useMemo } from 'react'
import { useKalshi } from '../../hooks/useKalshi'
import { usePolymarket } from '../../hooks/usePolymarket'

function ProbBadge({ prob }) {
  if (prob === null || prob === undefined) return null
  const pct = Math.round(prob * 100)
  const color = pct >= 70 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 30 ? '#eab308' : '#4ade80'
  return (
    <span style={{ fontSize:'10px', fontWeight:800, color, background:`${color}18`, padding:'1px 5px', borderRadius:'3px', minWidth:'30px', display:'inline-block', textAlign:'center' }}>
      {pct}%
    </span>
  )
}

export function KalshiTicker() {
  const { markets: kal } = useKalshi()
  const { markets: poly } = usePolymarket()
  const ref = useRef(null)
  const pos = useRef(0)
  const raf = useRef(null)

  const items = useMemo(() => {
    const seen = new Set()
    const all = [
      ...kal.filter(m => m.isGeo && (m.title||'').length > 5).slice(0, 20).map(m => ({ ...m, label: m.title, src: 'K' })),
      ...poly.filter(m => m.isGeo && (m.question||'').length > 5).slice(0, 20).map(m => ({ ...m, label: m.question, src: 'P' })),
    ]
    return all.filter(m => {
      const k = (m.label||'').slice(0, 30).toLowerCase()
      if (seen.has(k)) return false
      seen.add(k); return true
    }).slice(0, 30)
  }, [kal, poly])

  useEffect(() => {
    if (!items.length) return
    const animate = () => {
      pos.current += 0.4
      if (ref.current) {
        const half = ref.current.scrollWidth / 2
        if (pos.current >= half) pos.current = 0
        ref.current.style.transform = `translateX(-${pos.current}px)`
      }
      raf.current = requestAnimationFrame(animate)
    }
    raf.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf.current)
  }, [items.length])

  if (!items.length) return null
  const doubled = [...items, ...items]

  return (
    <div style={{ height:'26px', borderBottom:'1px solid var(--border)', background:'var(--void)', overflow:'hidden', display:'flex', alignItems:'center', flexShrink:0 }}>
      <div style={{ flexShrink:0, padding:'0 8px', borderRight:'1px solid var(--border)', height:'100%', display:'flex', alignItems:'center', gap:'5px' }}>
        <span style={{ fontSize:'8px', fontWeight:800, color:'var(--accent)', letterSpacing:'0.1em' }}>🎯 MARKETS</span>
      </div>
      <div style={{ flex:1, overflow:'hidden', height:'100%', display:'flex', alignItems:'center' }}>
        <div ref={ref} style={{ display:'inline-flex', gap:'20px', whiteSpace:'nowrap', willChange:'transform' }}>
          {doubled.map((m, i) => (
            <a key={`${m.id || m.src}-${i}`} href={m.url || 'https://kalshi.com'} target="_blank" rel="noopener noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:'5px', textDecoration:'none' }}>
              <span style={{ fontSize:'8px', color: m.src==='K' ? '#a78bfa' : '#38bdf8', fontWeight:700, letterSpacing:'0.05em' }}>{m.src==='K'?'KAL':'PM'}</span>
              <ProbBadge prob={m.probability} />
              <span style={{ fontSize:'11px', color:'var(--t2)', maxWidth:'260px', overflow:'hidden', textOverflow:'ellipsis' }}>
                {(m.label||'').slice(0, 70)}
              </span>
              <span style={{ color:'var(--border2)', fontSize:'10px' }}>│</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export default KalshiTicker
