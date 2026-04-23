/**
 * KalshiPanel — Full Kalshi Prediction Markets Panel
 * 
 * Monitor the Situation features Kalshi prominently — this is the full panel.
 * Shows all open markets with probability bars, volume, time to close.
 * Geo/political markets highlighted at top.
 */

import React, { useState, useMemo } from 'react'
import { useKalshi } from '../../hooks/useKalshi'

function ProbBar({ prob }) {
  if (prob === null || prob === undefined) return (
    <span style={{ color: 'var(--t4)', fontSize: '11px' }}>—</span>
  )
  const pct = Math.round(prob * 100)
  const color = pct >= 70 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 30 ? '#eab308' : '#4ade80'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
      <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: '2px', transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '36px', textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

function formatVol(v) {
  if (!v) return '$0'
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}

function timeLeft(closeTime) {
  if (!closeTime) return ''
  const diff = new Date(closeTime) - Date.now()
  if (diff < 0) return 'closed'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 30) return `${Math.floor(days / 30)}mo`
  if (days > 0) return `${days}d`
  return `${hours}h`
}

export default function KalshiPanel() {
  const { markets, geoMarkets, loading, lastFetch, error, refresh, usingSeeds } = useKalshi()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('geo') // 'geo' | 'all' | 'top'
  const [sortBy, setSortBy] = useState('volume')

  const displayList = useMemo(() => {
    let list = tab === 'geo' ? geoMarkets : tab === 'top' ? markets.slice(0, 50) : markets
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(m => (m.title || '').toLowerCase().includes(s))
    }
    if (sortBy === 'volume') list = [...list].sort((a, b) => b.volume - a.volume)
    else if (sortBy === 'prob') list = [...list].sort((a, b) => (b.probability || 0) - (a.probability || 0))
    else if (sortBy === 'close') list = [...list].sort((a, b) => new Date(a.close_time || 0) - new Date(b.close_time || 0))
    return list.slice(0, 80)
  }, [markets, geoMarkets, tab, search, sortBy])

  // High signal = far from 50%
  const highSignal = useMemo(() =>
    geoMarkets
      .filter(m => m.probability !== null && (m.probability > 0.72 || m.probability < 0.28))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 4)
  , [geoMarkets])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--void)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t1)', letterSpacing: '0.05em' }}>
            🎯 KALSHI MARKETS
          </span>
          <span style={{ fontSize: '11px', color: 'var(--t4)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '4px' }}>
            {markets.length} OPEN
          </span>
          {usingSeeds && (
          <span style={{ fontSize:'10px', color:'#f59e0b', background:'rgba(245,158,11,0.1)', padding:'2px 7px', borderRadius:'4px' }}>
            ⚠ API proxied — may show cached data
          </span>
        )}
        {lastFetch && <span style={{ fontSize: '10px', color: 'var(--t4)', marginLeft: 'auto' }}>{lastFetch.toLocaleTimeString()}</span>}
          <button onClick={refresh} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', color: 'var(--t2)', cursor: 'pointer' }}>↻</button>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--t4)' }}>
          US-regulated event contracts · <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>kalshi.com ↗</a>
        </div>
      </div>

      {/* High signal banner */}
      {highSignal.length > 0 && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(239,68,68,0.04)', flexShrink: 0 }}>
          <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: 800, letterSpacing: '0.1em', marginBottom: '5px' }}>⚡ HIGH-CONFIDENCE MARKETS</div>
          {highSignal.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: (m.probability || 0) > 0.5 ? '#ef4444' : '#4ade80', minWidth: '34px' }}>
                {Math.round((m.probability || 0) * 100)}%
              </span>
              <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--t2)', textDecoration: 'none', flex: 1 }}>
                {(m.title || '').slice(0, 80)}
              </a>
              <span style={{ fontSize: '9px', color: 'var(--t4)' }}>{formatVol(m.volume)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {[{ id: 'geo', label: `🌍 Geo (${geoMarkets.length})` }, { id: 'top', label: 'Top Vol' }, { id: 'all', label: `All (${markets.length})` }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '3px 9px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
              background: tab === t.id ? 'var(--accent)' : 'var(--surface)',
              border: `1px solid ${tab === t.id ? 'var(--accent)' : 'var(--border)'}`,
              color: tab === t.id ? 'var(--void)' : 'var(--t3)', fontWeight: tab === t.id ? 700 : 400,
            }}>{t.label}</button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{
          flex: 1, minWidth: '100px', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--t1)', outline: 'none',
        }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px',
          padding: '4px 8px', fontSize: '11px', color: 'var(--t2)', cursor: 'pointer',
        }}>
          <option value="volume">By Volume</option>
          <option value="prob">By Probability</option>
          <option value="close">Closing Soon</option>
        </select>
      </div>

      {/* Market list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {loading && !markets.length && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t4)', fontSize: '13px' }}>Fetching Kalshi markets…</div>
        )}
        {error && !markets.length && (
          <div style={{ padding: '20px', color: '#f97316', fontSize: '12px' }}>⚠️ Kalshi API unavailable — {error}</div>
        )}
        {displayList.map(m => (
          <div key={m.id} style={{
            padding: '8px 10px', marginBottom: '4px',
            background: 'var(--surface)', borderRadius: '4px', border: '1px solid var(--border)',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '6px' }}>
              {m.isGeo && <span style={{ fontSize: '9px', color: '#f97316', background: 'rgba(249,115,22,0.1)', padding: '1px 4px', borderRadius: '3px', flexShrink: 0, marginTop: '2px' }}>GEO</span>}
              <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--t1)', textDecoration: 'none', lineHeight: '1.4', flex: 1 }}>
                {m.title}
              </a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ProbBar prob={m.probability} />
              <span style={{ fontSize: '10px', color: 'var(--t4)', flexShrink: 0 }}>{formatVol(m.volume)}</span>
              {m.close_time && (
                <span style={{ fontSize: '10px', color: 'var(--t4)', flexShrink: 0 }}>⏱ {timeLeft(m.close_time)}</span>
              )}
            </div>
          </div>
        ))}
        {!loading && displayList.length === 0 && markets.length > 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--t4)', fontSize: '12px' }}>No markets match.</div>
        )}
        <div style={{ padding: '12px', textAlign: 'center' }}>
          <a href="https://kalshi.com/markets" target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--t4)', textDecoration: 'none' }}>Browse all on Kalshi →</a>
        </div>
      </div>
    </div>
  )
}
