import React, { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { RefreshCw, Bell, Settings, Menu } from 'lucide-react'

export default function TopBar({ loading, synced, liveCount, onRefresh, translating, translateCount }) {
  const { alerts, clearAlerts, setTab, toggleCollapsed } = useStore()
  const [now, setNow] = useState(new Date())
  const [bellOpen, setBellOpen] = useState(false)
  const [amoled, setAmoled] = useState(() => document.body.classList.contains('amoled'))
  const toggleAmoled = useCallback(() => {
    setAmoled(a => {
      const next = !a
      document.body.classList.toggle('amoled', next)
      try { localStorage.setItem('nexus-amoled', next ? '1' : '0') } catch {}
      return next
    })
  }, [])
  // Restore on mount
  useEffect(() => {
    try {
      if (localStorage.getItem('nexus-amoled') === '1') {
        document.body.classList.add('amoled')
        setAmoled(true)
      }
    } catch {}
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '0 12px', height: '40px', flexShrink: 0,
      background: 'var(--base)', borderBottom: '1px solid var(--border)',
    }}>
      <button className="btn" style={{ padding: '4px 6px', border: 'none' }} onClick={toggleCollapsed}>
        <Menu size={13} />
      </button>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="7.5" stroke="var(--accent)" strokeWidth="1" fill="none"/>
          <circle cx="9" cy="9" r="2.5" fill="var(--accent)"/>
          <line x1="9" y1="1.5" x2="9" y2="16.5" stroke="var(--accent)" strokeWidth="0.6" opacity="0.35"/>
          <line x1="1.5" y1="9" x2="16.5" y2="9" stroke="var(--accent)" strokeWidth="0.6" opacity="0.35"/>
        </svg>
        <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '11px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.2em' }}>
          NEXUS
        </span>
      </div>

      {/* AMOLED toggle */}
      <button onClick={toggleAmoled} title={amoled ? 'Switch to Default theme' : 'Switch to AMOLED Black'}
        style={{ padding:'2px 8px', borderRadius:'3px', border:`1px solid ${amoled?'#333':'var(--border)'}`,
          background: amoled ? '#111' : 'transparent',
          color: amoled ? '#aaa' : 'var(--t4)', cursor:'pointer', fontSize:'9px',
          fontFamily:'JetBrains Mono,monospace', letterSpacing:'0.08em', flexShrink:0 }}>
        {amoled ? '◼ AMOLED' : '◻ AMOLED'}
      </button>

      {/* Live status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className={loading ? 'pulse' : ''} style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: loading ? 'var(--yellow)' : 'var(--green)',
          display: 'inline-block', flexShrink: 0,
        }}/>
        <span className="mono" style={{ fontSize: '10px', color: loading ? 'var(--yellow)' : 'var(--t3)' }}>
          {loading ? 'fetching' : `${liveCount} articles`}
        </span>
        {synced && (
          <span className="mono" style={{ fontSize: '9px', color: 'var(--t4)' }}>
            · synced {synced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {translating && (
          <span className="mono" style={{ fontSize: '9px', color: '#a78bfa', animation: 'vmpulse 1.5s infinite' }}>
            · translating {translateCount > 0 ? translateCount + ' titles' : '…'}
          </span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <button className="btn" style={{ padding: '4px 6px', border: 'none' }}
        onClick={onRefresh} disabled={loading} title="Refresh">
        <RefreshCw size={12} className={loading ? 'spin' : ''} />
      </button>

      {/* Alerts */}
      <div style={{ position: 'relative' }}>
        <button className="btn" style={{ padding: '4px 6px', border: 'none', position: 'relative' }}
          onClick={() => setBellOpen(o => !o)}>
          <Bell size={13} style={{ color: alerts.length ? 'var(--orange)' : 'var(--t3)' }} />
          {alerts.length > 0 && (
            <span style={{
              position: 'absolute', top: '-2px', right: '-2px',
              width: '13px', height: '13px', borderRadius: '50%',
              background: 'var(--red)', fontSize: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#fff',
              border: '1px solid var(--base)',
            }}>{Math.min(alerts.length, 9)}</span>
          )}
        </button>
        {bellOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            width: '300px', background: 'var(--raised)',
            border: '1px solid var(--border2)', borderRadius: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 100,
          }} className="fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
              <span className="mono" style={{ fontSize: '9px', color: 'var(--orange)' }}>
                {alerts.length} watchlist alert{alerts.length !== 1 ? 's' : ''}
              </span>
              <button className="btn" style={{ fontSize: '9px', padding: '2px 6px' }} onClick={() => { clearAlerts(); setBellOpen(false) }}>
                clear
              </button>
            </div>
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              {alerts.length === 0
                ? <div style={{ padding: '12px', textAlign: 'center', color: 'var(--t3)', fontSize: '11px' }}>No alerts</div>
                : alerts.map(a => (
                  <div key={a.id} style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                      <span className="chip chip-orange" style={{ flexShrink: 0 }}>{a.term}</span>
                      <span style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.4 }}>{a.title.slice(0, 80)}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '2px' }}>{a.source}</div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <button className="btn" style={{ padding: '4px 6px', border: 'none' }} onClick={() => setTab('settings')}>
        <Settings size={12} />
      </button>

      {/* Local time */}
      <div className="mono" style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1 }}>
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        <span style={{ fontSize: '8px', color: 'var(--t4)', marginLeft: '4px' }}>
          {tz.split('/').pop().replace('_', ' ')}
        </span>
      </div>
    </div>
  )
}
