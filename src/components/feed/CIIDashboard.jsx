/**
 * CIIDashboard — Composite Intelligence Index
 *
 * Shows which situations have multiple independent data sources converging.
 * This is the "situational awareness at a glance" panel that Monitor the Situation 
 * features prominently. When CII is high, something is ACTUALLY happening —
 * not just one outlet running a story.
 */

import React, { useState } from 'react'
import { useSignalConvergence } from '../../hooks/useSignalConvergence'
import { usePolymarket } from '../../hooks/usePolymarket'
import { useKalshi } from '../../hooks/useKalshi'
import { useLiveAlerts } from '../../hooks/useLiveAlerts'

const SEV = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'CRITICAL', glow: '0 0 12px rgba(239,68,68,0.4)' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)', label: 'HIGH', glow: 'none' },
  medium:   { color: '#eab308', bg: 'rgba(234,179,8,0.06)', label: 'MED', glow: 'none' },
  low:      { color: '#2dd4bf', bg: 'rgba(45,212,191,0.04)', label: 'LOW', glow: 'none' },
}

const LAYER_ICONS = {
  'News': '📰',
  'ACLED': '⚔️',
  'Polymarket': '🎯',
  'GPS Jamming': '📡',
  'ADS-B': '✈️',
  'Israel Home Front Command': '🚨',
  'USNI Fleet Tracker': '⚓',
  'NWS': '⛈️',
  'Cloudflare Radar': '🌐',
  'GPSJam.org': '📡',
  'default': '📌',
}

function CIIBar({ cii, level }) {
  const sev = SEV[level] || SEV.low
  const width = Math.min((cii / 20) * 100, 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${width}%`,
          background: `linear-gradient(90deg, ${sev.color}80, ${sev.color})`,
          borderRadius: '3px', transition: 'width 0.6s ease',
          boxShadow: sev.glow,
        }} />
      </div>
      <span style={{
        fontSize: '11px', fontWeight: 800, color: sev.color,
        minWidth: '32px', textAlign: 'right', letterSpacing: '0.02em',
      }}>
        {cii.toFixed(1)}
      </span>
    </div>
  )
}

function SituationCard({ sit, expanded, onToggle }) {
  const sev = SEV[sit.level] || SEV.low

  return (
    <div style={{
      marginBottom: '6px',
      background: sev.bg,
      border: `1px solid ${sev.color}25`,
      borderLeft: `3px solid ${sev.color}`,
      borderRadius: '4px',
      overflow: 'hidden',
      boxShadow: sit.level === 'critical' ? sev.glow : 'none',
      transition: 'box-shadow 0.3s',
    }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '5px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 800, color: sev.color,
            background: `${sev.color}18`, padding: '2px 6px', borderRadius: '3px',
            letterSpacing: '0.1em', flexShrink: 0,
          }}>
            {sev.label}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--t1)', flex: 1 }}>
            {sit.name}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--t4)', flexShrink: 0 }}>
            {sit.articleCount} art · {sit.signals.length} src
          </span>
          <span style={{ fontSize: '10px', color: 'var(--t4)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            ▼
          </span>
        </div>
        <CIIBar cii={sit.cii} level={sit.level} />
      </div>

      {/* Expanded signal breakdown */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${sev.color}20`, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '9px', color: 'var(--t4)', letterSpacing: '0.1em', marginBottom: '2px' }}>
            SIGNAL BREAKDOWN
          </div>
          {sit.signals.map((sig, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <span style={{ fontSize: '11px', flexShrink: 0 }}>
                {LAYER_ICONS[sig.layer] || LAYER_ICONS.default}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t2)' }}>
                    {sig.layer}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700 }}>
                    +{sig.score}
                  </span>
                  <span style={{ fontSize: '9px', color: 'var(--t4)' }}>
                    {sig.count > 1 ? `×${sig.count}` : ''}
                  </span>
                </div>
                {sig.topItem && (
                  <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '1px', lineHeight: '1.3' }}>
                    {sig.topItem}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div style={{ marginTop: '4px', padding: '4px 6px', background: 'var(--void)', borderRadius: '3px' }}>
            <span style={{ fontSize: '10px', color: 'var(--t4)' }}>
              CII = {sit.cii.toFixed(1)} &nbsp;|&nbsp; Formula: Σ(source_weight × recency × severity)
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CIIDashboard({ articles = [], acledEvents = [], satellite = null }) {
  const { markets: polyMarkets } = usePolymarket()
  const { markets: kalshiMarkets } = useKalshi()
  const { alerts: liveAlerts } = useLiveAlerts()
  const [expanded, setExpanded] = useState(null)

  const { situations, criticalCount, highCount } = useSignalConvergence({
    articles: articles || [],
    acledEvents: [],
    satellite: satellite || null,
    polyMarkets,
    kalshiMarkets,
    liveAlerts,
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--void)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t1)', letterSpacing: '0.05em' }}>
            ⚡ CII — SIGNAL CONVERGENCE
          </span>
          {criticalCount > 0 && (
            <span style={{
              fontSize: '11px', fontWeight: 700, color: '#ef4444',
              background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px',
            }}>
              {criticalCount} CRITICAL
            </span>
          )}
          {highCount > 0 && (
            <span style={{
              fontSize: '11px', color: '#f97316',
              background: 'rgba(249,115,22,0.12)', padding: '2px 8px', borderRadius: '4px',
            }}>
              {highCount} HIGH
            </span>
          )}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--t4)', lineHeight: '1.5' }}>
          Multi-source convergence score. High CII = confirmed activity across independent layers.
          Sources: News · ACLED · Polymarket · USNI · GPS Jamming · ADS-B · Oref Alerts
        </div>
      </div>

      {/* CII legend */}
      <div style={{
        padding: '6px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: '16px', flexShrink: 0,
      }}>
        {[
          { label: 'CRITICAL', range: '≥15', color: '#ef4444' },
          { label: 'HIGH', range: '8–15', color: '#f97316' },
          { label: 'MED', range: '3–8', color: '#eab308' },
          { label: 'LOW', range: '<3', color: '#2dd4bf' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: l.color, flexShrink: 0 }} />
            <span style={{ fontSize: '9px', color: 'var(--t4)', letterSpacing: '0.05em' }}>
              {l.label} {l.range}
            </span>
          </div>
        ))}
      </div>

      {/* Situation list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {situations.map(sit => (
          <SituationCard
            key={sit.name}
            sit={sit}
            expanded={expanded === sit.name}
            onToggle={() => setExpanded(expanded === sit.name ? null : sit.name)}
          />
        ))}

        <div style={{ padding: '12px', textAlign: 'center', fontSize: '10px', color: 'var(--t4)' }}>
          Scores recalculate every 90s as new data arrives
        </div>
      </div>
    </div>
  )
}
