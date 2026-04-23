/**
 * LiveAlertsFeed — Real-time global alert layer
 *
 * Shows: Red Alerts (Israel), Naval movements (USNI), Severe Weather (NWS/Meteoalarm),
 * GPS Jamming (GPSJam.org), Internet Outages (Cloudflare Radar)
 *
 * This is the layer Monitor the Situation uses that NEXUS was missing.
 * Refresh: 30 seconds (Oref can change fast)
 */

import React, { useState, useMemo } from 'react'
import { useLiveAlerts } from '../../hooks/useLiveAlerts'

const SEV = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'CRITICAL' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.1)', label: 'HIGH' },
  medium:   { color: '#eab308', bg: 'rgba(234,179,8,0.07)', label: 'MEDIUM' },
  low:      { color: '#2dd4bf', bg: 'rgba(45,212,191,0.05)', label: 'LOW' },
}

const TYPE_ICON = {
  red_alert: '🚨',
  naval: '⚓',
  weather: '⛈️',
  cyber: '📡',
  default: '⚠️',
}

const TYPE_LABEL = {
  red_alert: 'RED ALERT',
  naval: 'NAVAL',
  weather: 'WEATHER',
  cyber: 'CYBER/SIGNAL',
  default: 'ALERT',
}

function AlertRow({ alert }) {
  const sev = SEV[alert.severity] || SEV.medium
  const icon = TYPE_ICON[alert.type] || TYPE_ICON.default
  const typeLabel = TYPE_LABEL[alert.type] || TYPE_LABEL.default

  return (
    <div style={{
      padding: '10px 12px',
      marginBottom: '4px',
      background: sev.bg,
      border: `1px solid ${sev.color}30`,
      borderLeft: `3px solid ${sev.color}`,
      borderRadius: '4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '14px', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: sev.color,
              background: `${sev.color}18`, padding: '1px 5px', borderRadius: '3px',
              letterSpacing: '0.08em',
            }}>
              {typeLabel}
            </span>
            <span style={{ fontSize: '9px', color: 'var(--t4)', letterSpacing: '0.05em' }}>
              {alert.source}
            </span>
            <span style={{ fontSize: '9px', color: 'var(--t4)', marginLeft: 'auto' }}>
              {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : ''}
            </span>
          </div>
          {alert.url ? (
            <a href={alert.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '12px', color: 'var(--t1)', textDecoration: 'none', lineHeight: '1.4', display: 'block' }}>
              {alert.title}
            </a>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: '1.4' }}>{alert.title}</div>
          )}
          {alert.detail && (
            <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '3px', lineHeight: '1.4' }}>
              {alert.detail}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LiveAlertsFeed() {
  const { alerts, loading, lastFetch, refresh } = useLiveAlerts()
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return alerts
    return alerts.filter(a => a.type === filter)
  }, [alerts, filter])

  const counts = useMemo(() => ({
    all: alerts.length,
    red_alert: alerts.filter(a => a.type === 'red_alert').length,
    naval: alerts.filter(a => a.type === 'naval').length,
    weather: alerts.filter(a => a.type === 'weather').length,
    cyber: alerts.filter(a => a.type === 'cyber').length,
  }), [alerts])

  const criticalCount = alerts.filter(a => a.severity === 'critical').length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--void)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
        background: criticalCount > 0 ? 'rgba(239,68,68,0.06)' : undefined,
      }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t1)', letterSpacing: '0.05em' }}>
          🚨 LIVE ALERTS
        </span>
        {criticalCount > 0 && (
          <span style={{
            fontSize: '11px', fontWeight: 700, color: '#ef4444',
            background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px',
            animation: 'pulse 2s infinite',
          }}>
            {criticalCount} CRITICAL
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--t4)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '4px' }}>
          {alerts.length} ACTIVE
        </span>
        {lastFetch && (
          <span style={{ fontSize: '10px', color: 'var(--t4)', marginLeft: 'auto' }}>
            ↻ {lastFetch.toLocaleTimeString()}
          </span>
        )}
        <button onClick={refresh} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px',
          padding: '3px 10px', fontSize: '11px', color: 'var(--t2)', cursor: 'pointer',
        }}>↻</button>
      </div>

      {/* Source filters */}
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: '4px', flexWrap: 'wrap', flexShrink: 0,
      }}>
        {[
          { key: 'all', label: `All (${counts.all})` },
          { key: 'red_alert', label: `🚨 Alerts (${counts.red_alert})` },
          { key: 'naval', label: `⚓ Naval (${counts.naval})` },
          { key: 'weather', label: `⛈️ Weather (${counts.weather})` },
          { key: 'cyber', label: `📡 Signal (${counts.cyber})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            background: filter === f.key ? 'var(--accent)' : 'var(--surface)',
            border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: '4px', padding: '3px 8px', fontSize: '11px',
            color: filter === f.key ? 'var(--void)' : 'var(--t3)',
            cursor: 'pointer', fontWeight: filter === f.key ? 700 : 400,
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Source attribution row */}
      <div style={{
        padding: '5px 14px', borderBottom: '1px solid var(--border)',
        fontSize: '10px', color: 'var(--t4)', flexShrink: 0,
        display: 'flex', gap: '10px', flexWrap: 'wrap',
      }}>
        <span>Sources:</span>
        <span>🇮🇱 Israel HFC (Oref)</span>
        <span>⚓ USNI Fleet Tracker</span>
        <span>🌩️ NWS / Meteoalarm</span>
        <span>📡 GPSJam.org</span>
        <span>🌐 Cloudflare Radar</span>
      </div>

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {loading && alerts.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t4)', fontSize: '13px' }}>
            Fetching live alerts…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>✅</div>
            <div style={{ fontSize: '13px', color: 'var(--t3)' }}>No active alerts</div>
            <div style={{ fontSize: '11px', color: 'var(--t4)', marginTop: '4px' }}>
              {filter !== 'all' ? `No ${filter} alerts at this time.` : 'All clear across monitored sources.'}
            </div>
          </div>
        )}
        {filtered.map(alert => <AlertRow key={alert.id} alert={alert} />)}
      </div>
    </div>
  )
}
