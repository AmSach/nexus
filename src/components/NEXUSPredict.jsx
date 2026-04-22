// NEXUSPredict — ACPL + VOX via zo.space API
import React, { useState, useCallback } from 'react'

const ACPL_BASE = 'https://man44.zo.space/api/acpl'
const VOX_BASE  = 'https://man44.zo.space/api/vox'

const PRESETS = [
  { label:'Ukraine ceasefire', q:'will ukraine ceasefire 2026' },
  { label:'Gaza war ends',    q:'gaza war ends 2026' },
  { label:'Taiwan conflict',   q:'taiwan strait conflict 2026' },
  { label:'Iran nuclear',     q:'iran nuclear deal 2026' },
  { label:'Russia NATO',      q:'russia nato war 2025' },
  { label:'Myanmar junta',   q:'myanmar junta resistance wins 2026' },
  { label:'India Pakistan',    q:'india pakistan war 2026' },
  { label:'China Taiwan',     q:'china invade taiwan 2026' },
]

function ProbBar({ value, color }) {
  const pct = Math.round(Math.max(0, Math.min(1, value || 0)) * 100)
  const c = color || '#4ade80'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ flex:1, height:6, background:'rgba(255,255,255,0.08)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:pct+'%', height:'100%', background:c, borderRadius:3, transition:'width 0.4s' }} />
      </div>
      <span style={{ fontSize:11, fontWeight:700, color:c, minWidth:36, textAlign:'right' }}>{pct}%</span>
    </div>
  )
}

function RegimeBadge({ regime }) {
  const c = { CALM:'#22c55e', TENSE:'#eab308', CRISIS:'#ef4444' }[regime] || '#94a3b8'
  return <span style={{ fontSize:11, fontFamily:'JetBrains Mono', color:c }}>[{regime||'N/A'}]</span>
}

export default function NEXUSPredict() {
  const [q, setQ]         = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const run = useCallback(async (query) => {
    if (!query?.trim()) return
    setLoading(true); setError(null)
    try {
      const [ar, vr] = await Promise.all([
        fetch(ACPL_BASE+'?q='+encodeURIComponent(query)).then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch(VOX_BASE +'?q='+encodeURIComponent(query)).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      ])
      setResults({ acpl: ar, vox: vr, question: query })
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const ac = results?.acpl
  const vx = results?.vox
  const acColor = !ac ? '#94a3b8' : ac.probability > 0.6 ? '#ef4444' : ac.probability > 0.3 ? '#eab308' : '#4ade80'

  return (
    <div style={{ padding:'12px 16px', height:'100%', overflow:'auto', background:'var(--void)', display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:11, fontFamily:'Orbitron', color:'var(--accent)', letterSpacing:'0.1em' }}>NEXUS PREDICTION ENGINE</div>

      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {PRESETS.map(p => (
          <button key={p.label} onClick={() => { setQ(p.q); run(p.q) }}
            style={{ background:'rgba(45,212,191,0.08)', border:'1px solid var(--border)', color:'var(--t2)', fontSize:10, padding:'3px 8px', borderRadius:3, cursor:'pointer' }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run(q)}
          placeholder="e.g. ceasefire gaza 2026"
          style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', color:'var(--t1)', padding:'6px 10px', borderRadius:4, fontSize:12, fontFamily:'JetBrains Mono', outline:'none' }}
        />
        <button onClick={() => run(q)} disabled={loading}
          style={{ background: loading ? 'var(--border)' : 'var(--accent)', color:'#000', border:'none', padding:'6px 16px', borderRadius:4, cursor: loading ? 'not-allowed' : 'pointer', fontWeight:700, fontSize:12 }}>
          {loading ? '…' : 'ANALYZE'}
        </button>
      </div>

      {error && <div style={{ color:'#ef4444', fontSize:11 }}>Error: {error}</div>}

      {ac ? (
        <div style={{ background:'rgba(45,212,191,0.05)', border:'1px solid var(--border)', borderRadius:6, padding:12, display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:10, fontFamily:'JetBrains Mono', color:'var(--t4)' }}>ACPL — Conflict Probability</div>
          <ProbBar value={ac.probability || 0} color={acColor} />
          <div style={{ fontSize:10, color:'var(--t2)', fontFamily:'JetBrains Mono' }}>
            {ac.source_count||0} sources · {ac.signal_count||0} signals · sev {ac.severity_avg?.toFixed(2)||'—'}
          </div>
          <div style={{ fontSize:10, color:'var(--t3)', fontFamily:'JetBrains Mono', lineHeight:1.5, whiteSpace:'pre-wrap' }}>
            {(ac.reasoning || ac.explanation || 'Analyzing…').slice(0, 400)}
          </div>
        </div>
      ) : null}

      {vx ? (
        <div style={{ background:'rgba(168,85,247,0.05)', border:'1px solid var(--border)', borderRadius:6, padding:12, display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:10, fontFamily:'JetBrains Mono', color:'var(--t4)' }}>VOX — Regime Forecast</div>
          {(vx.zones || []).map(z => (
            <div key={z.zone} style={{ display:'flex', flexDirection:'column', gap:3 }}>
              <div style={{ fontSize:10, color:'var(--t3)', fontFamily:'JetBrains Mono' }}>{z.zone || 'Zone'}</div>
              <ProbBar value={z.prob || 0}
                color={z.regime === 'CRISIS' ? '#ef4444' : z.regime === 'TENSE' ? '#eab308' : '#22c55e'} />
              <RegimeBadge regime={z.regime} />
            </div>
          ))}
          {vx.narrative ? (
            <div style={{ fontSize:10, color:'var(--t3)', fontFamily:'JetBrains Mono', lineHeight:1.5, whiteSpace:'pre-wrap' }}>
              {vx.narrative.slice(0, 300)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop:'auto', fontSize:9, color:'var(--t4)', fontFamily:'JetBrains Mono' }}>
        NEXUS v4 · {ac ? `${ac.source_count||0} sources` : 'ACPL+VOX engine'} · zo.space API
      </div>
    </div>
  )
}
