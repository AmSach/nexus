import React, { useState, useCallback } from 'react';

const API_BASE = 'https://man44.zo.space';

const PRESET_QUERIES = [
  { label: '🪖 Ukraine Ceasefire', q: 'Will Ukraine ceasefire happen 2026' },
  { label: '🇹🇼 Taiwan Strait', q: 'Taiwan Strait conflict 2026' },
  { label: '☢️ Iran Nuclear Deal', q: 'Iran nuclear deal JCPOA 2026' },
  { label: '🇮🇱 Israel Gaza', q: 'Israel Gaza ceasefire 2026' },
  { label: '🛢️ Oil Price Spike', q: 'Oil price crude spike 2026' },
  { label: '💻 Major Cyberattack', q: 'Major cyberattack breach 2026' },
];

const ZONE_COLOR = { ukraine:'#ef4444', taiwan:'#f97316', iran:'#eab308', israel_palestine:'#22c55e', nato:'#3b82f6', global:'#64748b' };

function ProbBar({ value, max=100, color='#2dd4bf' }) {
  const pct = Math.min(100, Math.max(0, value)) / max * 100;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'4px 0' }}>
      <div style={{ flex:1, height:8, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:4, transition:'width 0.6s' }} />
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, minWidth:42, textAlign:'right', fontFamily:'JetBrains Mono' }}>
        {Math.round(value)}%
      </span>
    </div>
  );
}

function EngineResult({ engine, result, loading }) {
  if (loading) return (
    <div style={{ padding:16, textAlign:'center', color:'var(--t4)' }}>
      <div style={{ fontSize:11, fontFamily:'JetBrains Mono', color:'var(--accent)', marginBottom:8 }}>{engine}</div>
      <div style={{ fontSize:20, fontFamily:'JetBrains Mono', color:'var(--t3)' }}>⟳ Calculating…</div>
    </div>
  );
  if (!result) return null;

  const acpl = engine === 'ACPL';
  const zone = result.zone || 'global';
  const zoneColor = ZONE_COLOR[zone] || ZONE_COLOR.global;

  return (
    <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:700, color:zoneColor, fontFamily:'JetBrains Mono', letterSpacing:'0.1em' }}>
          {zone.toUpperCase()} · {engine}
        </span>
        <span style={{ fontSize:9, color:'var(--t4)', fontFamily:'JetBrains Mono' }}>
          {result.ts ? new Date(result.ts).toLocaleTimeString() : ''}
        </span>
      </div>

      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:28, fontWeight:800, color:zoneColor, fontFamily:'Orbitron', lineHeight:1, marginBottom:2 }}>
          {acpl ? result.prob?.toFixed(1) : result.probability?.toFixed(1)}%
        </div>
        <div style={{ fontSize:10, color:'var(--t3)', fontFamily:'JetBrains Mono' }}>
          {result.regime || result.escalation}
          {(result.escalation === true || result.escalation === 'HIGH') && ' ⚠'}
        </div>
      </div>

      <ProbBar value={acpl ? result.prob : result.probability} color={zoneColor} />

      <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:9, fontFamily:'JetBrains Mono' }}>
        <div>
          <span style={{ color:'var(--t4)' }}>SIGNALS </span>
          <span style={{ color:'var(--t2)' }}>{result.signals || result.alerts_24h || 0}</span>
        </div>
        <div>
          <span style={{ color:'var(--t4)' }}>HIGH SEV </span>
          <span style={{ color:result.highSeverity > 5 || result.highSeverity_24h > 5 ? '#ef4444' : 'var(--t2)' }}>
            {result.highSeverity || result.highSeverity_24h || 0}
          </span>
        </div>
        <div>
          <span style={{ color:'var(--t4)' }}>CONFIDENCE </span>
          <span style={{ color:'var(--t2)' }}>{result.confidence || 0}%</span>
        </div>
        <div>
          <span style={{ color:'var(--t4)' }}>CONFLICT </span>
          <span style={{ color:'var(--t2)' }}>{result.conflictSignals || result.conflict_signals || 0}</span>
        </div>
      </div>

      {!acpl && result.evidence && (
        <div style={{ marginTop:8, padding:'6px 8px', background:'rgba(45,212,191,0.05)', borderRadius:4, fontSize:9, fontFamily:'JetBrains Mono' }}>
          <div style={{ color:'var(--t4)', marginBottom:4 }}>EVIDENCE VECTORS</div>
          {Object.entries(result.evidence).map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', color:'var(--t3)' }}>
              <span>{k.toUpperCase()}</span>
              <span style={{ color:zoneColor }}>{typeof v === 'number' ? v.toFixed(3) : v}</span>
            </div>
          ))}
        </div>
      )}

      {result.markets && (
        <div style={{ marginTop:8, fontSize:9, fontFamily:'JetBrains Mono', color:'var(--t3)' }}>
          <span style={{ color:'var(--t4)' }}>MARKETS </span>
          <span>{result.markets.count || 0} active · </span>
          {result.markets.avgProb != null && <span>avg {result.markets.avgProb.toFixed(2)} · </span>}
          <span style={{ color:result.markets.aligned === 'CONFIRMS' ? '#4ade80' : result.markets.aligned === 'CONTRADICTS' ? '#ef4444' : 'var(--t3)' }}>
            {result.markets.aligned || 'NEUTRAL'}
          </span>
        </div>
      )}

      {result.sources && result.sources.length > 0 && (
        <div style={{ marginTop:8, fontSize:9, fontFamily:'JetBrains Mono' }}>
          <span style={{ color:'var(--t4)' }}>TOP SOURCES </span>
          {result.sources.slice(0,4).map(s => (
            <span key={s.name} style={{ color:'var(--t3)', marginLeft:8 }}>
              {s.name}({s.count})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NEXUSPredict({ className }) {
  const [question, setQuestion] = useState('Will Russia Ukraine war end with ceasefire in 2026?');
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [acplResult, setAcplResult] = useState(null);
  const [voxResult, setVoxResult] = useState(null);
  const [error, setError] = useState(null);

  const runPrediction = useCallback(async (q) => {
    setLoading(true);
    setError(null);
    setAcplResult(null);
    setVoxResult(null);
    try {
      const [acplRes, voxRes] = await Promise.all([
        fetch(`${API_BASE}/api/acpl?question=${encodeURIComponent(q)}`).then(r => r.json()),
        fetch(`${API_BASE}/api/vox?question=${encodeURIComponent(q)}`).then(r => r.json()),
      ]);
      setAcplResult(acplRes);
      setVoxResult(voxRes);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputVal.trim()) runPrediction(inputVal.trim());
  };

  return (
    <div style={{
      background:'var(--panel)', border:'1px solid var(--border)', borderRadius:8,
      overflow:'hidden', fontFamily:'JetBrains Mono', minWidth:0
    }} className={className}>
      <div style={{
        padding:'10px 14px', borderBottom:'1px solid var(--border)',
        background:'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02)',
        display:'flex', justifyContent:'space-between', alignItems:'center'
      }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:'0.1em', fontFamily:'Orbitron' }}>
          🎯 NEXUS PREDICT
        </span>
        <div style={{ display:'flex', gap:8 }}>
          <span style={{ fontSize:9, color:'var(--t4)', background:'var(--raised)', padding:'2px 6px', borderRadius:3 }}>
            ACPL v2
          </span>
          <span style={{ fontSize:9, color:'var(--t4)', background:'var(--raised)', padding:'2px 6px', borderRadius:3 }}>
            VOX v2
          </span>
        </div>
      </div>

      {/* Presets */}
      <div style={{ padding:'8px 10px', display:'flex', gap:6, overflowX:'auto', borderBottom:'1px solid var(--border)' }}>
        {PRESET_QUERIES.map(p => (
          <button key={p.label} onClick={() => runPrediction(p.q)} style={{
            background:'rgba(45,212,191,0.06)', border:'1px solid var(--border)',
            borderRadius:4, padding:'3px 8px', fontSize:9, color:'var(--t3)',
            cursor:'pointer', whiteSpace:'nowrap', fontFamily:'JetBrains Mono',
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder="Ask a geopolitical question…"
          style={{
            flex:1, background:'var(--void)', border:'1px solid var(--border)',
            borderRadius:4, padding:'6px 10px', fontSize:10, color:'var(--t1)',
            fontFamily:'JetBrains Mono', outline:'none', minWidth:0
          }}
        />
        <button type="submit" disabled={loading} style={{
          background: loading ? 'var(--raised)' : 'var(--accent)',
          border:'none', borderRadius:4, padding:'6px 12px', fontSize:10,
          color: loading ? 'var(--t4)' : 'var(--void)', cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight:700, fontFamily:'JetBrains Mono', whiteSpace:'nowrap'
        }}>
          {loading ? '⟳' : 'PREDICT'}
        </button>
      </form>

      {/* Results */}
      {error && (
        <div style={{ padding:12, color:'#ef4444', fontSize:10, fontFamily:'JetBrains Mono' }}>
          Error: {error}
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
        <EngineResult engine="ACPL" result={acplResult} loading={loading} />
        <EngineResult engine="VOX" result={voxResult} loading={loading} />
      </div>
    </div>
  );
}
