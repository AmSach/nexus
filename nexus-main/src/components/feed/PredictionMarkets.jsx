/**
 * PredictionMarkets — Live Polymarket Geopolitical Intelligence Panel
 *
 * Displays prediction market probabilities as an intelligence signal layer.
 * A probability spike before news arrives is an early warning indicator.
 *
 * Features:
 *  - Grouped by category (conflict/election/economic/climate)
 *  - Probability trend visualization
 *  - Volume-weighted sorting
 *  - Click-through to Polymarket
 *  - Color coded: red >70%, orange 50-70%, green <30%
 */

import React, { useState, useMemo } from 'react'
import { usePolymarket } from '../../hooks/usePolymarket'

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#4ade80' }

function ProbBar({ value }) {
  if (value === null || value === undefined) return (
    <span style={{ color: 'var(--t4)', fontSize: '11px' }}>No data</span>
  )
  const pct = Math.round(value * 100)
  const color = pct >= 70 ? '#ef4444' : pct >= 50 ? '#f97316' : pct >= 30 ? '#eab308' : '#4ade80'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
      <div style={{
        flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`, background: color,
          borderRadius: '2px', transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '36px', textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

function formatVolume(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

const CATEGORY_LABELS = {
  ukraine: '🇺🇦 Ukraine', russia: '🇷🇺 Russia', china: '🇨🇳 China', taiwan: '🇹🇼 Taiwan',
  iran: '🇮🇷 Iran', israel: '🇮🇱 Israel', 'north-korea': '🇰🇵 DPRK', nato: '🛡️ NATO',
  nuclear: '☢️ Nuclear', war: '⚔️ War', conflict: '⚔️ Conflict', election: '🗳️ Election',
  military: '🪖 Military', sanctions: '🔒 Sanctions', 'middle-east': '🌍 Middle East',
  india: '🇮🇳 India', pakistan: '🇵🇰 Pakistan', recession: '📉 Recession', fed: '🏦 Fed',
  oil: '🛢️ Oil', general: '🌐 General',
}

export default function PredictionMarkets() {
  const { markets, loading, lastFetch, error, refresh } = usePolymarket()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('volume') // 'volume' | 'probability' | 'recent'
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    let list = [...markets]
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(m => m.question?.toLowerCase().includes(s) || m.category?.includes(s))
    }
    if (filter !== 'all') {
      list = list.filter(m => m.category === filter)
    }
    if (sortBy === 'volume') list.sort((a, b) => b.volume - a.volume)
    else if (sortBy === 'probability') list.sort((a, b) => (b.probability || 0) - (a.probability || 0))
    else if (sortBy === 'high-prob') list.sort((a, b) => Math.abs(0.5 - (b.probability || 0.5)) - Math.abs(0.5 - (a.probability || 0.5)))
    return list.slice(0, 50)
  }, [markets, search, sortBy, filter])

  const categories = useMemo(() => {
    const cats = [...new Set(markets.map(m => m.category).filter(Boolean))]
    return ['all', ...cats]
  }, [markets])

  // High-signal markets: very high OR very low probability (>75% or <25%)
  const highSignal = useMemo(() =>
    markets.filter(m => m.probability !== null && (m.probability > 0.75 || m.probability < 0.25))
      .sort((a, b) => b.volume - a.volume).slice(0, 5)
  , [markets])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--void)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t1)', letterSpacing: '0.05em' }}>
          🎯 PREDICTION MARKETS
        </span>
        <span style={{ fontSize: '11px', color: 'var(--t4)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '4px' }}>
          POLYMARKET · {markets.length} MARKETS
        </span>
        {lastFetch && (
          <span style={{ fontSize: '10px', color: 'var(--t4)', marginLeft: 'auto' }}>
            {lastFetch.toLocaleTimeString()}
          </span>
        )}
        <button onClick={refresh} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px',
          padding: '3px 10px', fontSize: '11px', color: 'var(--t2)', cursor: 'pointer',
        }}>↻</button>
      </div>

      {/* High Signal Alert Banner */}
      {highSignal.length > 0 && (
        <div style={{
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
          background: 'rgba(239,68,68,0.05)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, marginBottom: '4px', letterSpacing: '0.1em' }}>
            ⚡ HIGH-CONFIDENCE SIGNALS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {highSignal.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700,
                  color: (m.probability || 0) > 0.75 ? '#ef4444' : '#4ade80',
                  minWidth: '36px',
                }}>
                  {Math.round((m.probability || 0) * 100)}%
                </span>
                <a href={m.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '11px', color: 'var(--t2)', textDecoration: 'none', flex: 1 }}>
                  {m.question?.slice(0, 80)}
                </a>
                <span style={{ fontSize: '10px', color: 'var(--t4)' }}>{formatVolume(m.volume)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search markets..."
          style={{
            flex: '1 1 160px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--t1)',
            outline: 'none',
          }}
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px',
          padding: '4px 8px', fontSize: '12px', color: 'var(--t2)', cursor: 'pointer',
        }}>
          <option value="volume">By Volume</option>
          <option value="probability">By Probability</option>
          <option value="high-prob">Most Decisive</option>
        </select>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px',
          padding: '4px 8px', fontSize: '12px', color: 'var(--t2)', cursor: 'pointer',
        }}>
          {categories.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'All Categories' : (CATEGORY_LABELS[c] || c)}</option>
          ))}
        </select>
      </div>

      {/* Market List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {loading && markets.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t4)', fontSize: '13px' }}>
            Fetching prediction markets…
          </div>
        )}
        {error && markets.length === 0 && (
          <div style={{ padding: '20px 16px', color: '#f97316', fontSize: '12px' }}>
            ⚠️ Polymarket API unavailable — {error}
          </div>
        )}
        {filtered.map(m => (
          <div key={m.id} style={{
            padding: '8px 10px', marginBottom: '4px',
            background: 'var(--surface)', borderRadius: '4px',
            border: '1px solid var(--border)',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
              <span style={{
                fontSize: '9px', fontWeight: 700, color: 'var(--t4)',
                background: 'var(--void)', padding: '2px 5px', borderRadius: '3px',
                border: '1px solid var(--border)', flexShrink: 0, marginTop: '1px',
              }}>
                {CATEGORY_LABELS[m.category] || m.category?.toUpperCase() || 'MARKET'}
              </span>
              <a href={m.url} target="_blank" rel="noopener noreferrer" style={{
                fontSize: '12px', color: 'var(--t1)', textDecoration: 'none', lineHeight: '1.4', flex: 1,
              }}>
                {m.question}
              </a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ProbBar value={m.probability} />
              <span style={{ fontSize: '10px', color: 'var(--t4)', flexShrink: 0 }}>
                {formatVolume(m.volume)} vol
              </span>
              {m.endDate && (
                <span style={{ fontSize: '10px', color: 'var(--t4)', flexShrink: 0 }}>
                  exp {new Date(m.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
              )}
            </div>
          </div>
        ))}

        {!loading && filtered.length === 0 && markets.length > 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--t4)', fontSize: '12px' }}>
            No markets match your filters.
          </div>
        )}

        <div style={{ padding: '12px', textAlign: 'center' }}>
          <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '11px', color: 'var(--t4)', textDecoration: 'none' }}>
            View all on Polymarket →
          </a>
        </div>
      </div>
    </div>
  )
}
