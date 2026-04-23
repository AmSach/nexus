// NEXUS v6 Mobile — True mobile-first, 5-tab layout, touch-optimized
import React, { Suspense, useState } from 'react'
import { useNewsFeed } from './hooks/useNewsFeed'
import { Rss, Bell, Cpu, Map, Settings, RefreshCw } from 'lucide-react'
import LiveFeed from './components/feed/LiveFeed'
import Situations from './components/feed/Situations'
import IntelMap from './components/map/IntelMap'
import { SavedPanel, SettingsPanel } from './components/panels'
import LiveFeedSidebar from './components/feed/LiveFeedSidebar'

const TABS = [
  { id: 'feed',       label: 'Feed',     Icon: Rss      },
  { id: 'alerts',     label: 'Signals',   Icon: Bell     },
  { id: 'situations', label: 'AI',        Icon: Cpu     },
  { id: 'map',        label: 'Map',       Icon: Map      },
  { id: 'settings',   label: 'Settings', Icon: Settings },
]

class ErrBound extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <div style={{ padding: '20px', color: 'var(--t3)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>
        ⚠ {this.state.err?.message?.slice(0, 80)}
      </div>
    )
    return this.props.children
  }
}

// ── Compact mobile top bar ──────────────────────────────────────────────
function MobileTopBar({ loading, liveCount, onRefresh }) {
  const [now, setNow] = useState(new Date())
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="mobile-topbar" style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '0 12px', background: 'var(--base)', borderBottom: '1px solid var(--border)',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <svg width="16" height="16" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="7.5" stroke="var(--accent)" strokeWidth="1" fill="none"/>
          <circle cx="9" cy="9" r="2.5" fill="var(--accent)"/>
          <line x1="9" y1="1.5" x2="9" y2="16.5" stroke="var(--accent)" strokeWidth="0.6" opacity="0.35"/>
          <line x1="1.5" y1="9" x2="16.5" y2="9" stroke="var(--accent)" strokeWidth="0.6" opacity="0.35"/>
        </svg>
        <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.2em' }}>
          NEXUS
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Live dot */}
      <span className={loading ? 'pulse' : ''} style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: loading ? 'var(--yellow)' : 'var(--green)',
        display: 'inline-block', flexShrink: 0,
      }}/>
      <span className="mono" style={{ fontSize: '9px', color: loading ? 'var(--yellow)' : 'var(--t3)' }}>
        {loading ? '…' : liveCount}
      </span>

      {/* Time */}
      <div className="mono" style={{ fontSize: '10px', color: 'var(--t2)' }}>
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="mobile-nav-btn"
        style={{
          background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          color: 'var(--t3)', padding: '4px', display: 'flex', alignItems: 'center',
          opacity: loading ? 0.4 : 1, minHeight: '32px', flex: 'none',
        }}
      >
        <RefreshCw size={13} className={loading ? 'spin' : ''} />
      </button>
    </div>
  )
}

// ── Mobile tab content wrapper ──────────────────────────────────────────
// Uses CSS classes for responsive scrolling
function MobileTab({ children }) {
  return (
    <div className="feed-panel-mobile" style={{
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
    }}>
      {children}
    </div>
  )
}

// ── Feed panel: single-column ─────────────────────────────────────────
function FeedPanel({ articles, loading }) {
  return (
    <MobileTab>
      <LiveFeed articles={articles} loading={loading} />
    </MobileTab>
  )
}

// ── Signals/Alerts panel ───────────────────────────────────────────────
function SignalsPanel({ articles }) {
  return (
    <div className="flex-col-mobile" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="sidebar-panel-mobile" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}>
        <LiveFeedSidebar articles={articles} />
      </div>
    </div>
  )
}

// ── AI/Situations panel ───────────────────────────────────────────────
function SituationsPanel({ articles }) {
  return (
    <MobileTab>
      <Situations articles={articles} />
    </MobileTab>
  )
}

// ── Map panel: full-screen globe ───────────────────────────────────────
function MapPanel({ articles }) {
  return (
    <div className="map-panel-mobile" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <IntelMap articles={articles} />
    </div>
  )
}

// ── Settings panel ─────────────────────────────────────────────────────
function SettingsPanel_() {
  return (
    <MobileTab>
      <SettingsPanel />
    </MobileTab>
  )
}

// ── Bottom nav ─────────────────────────────────────────────────────────
function BottomNav({ tab, setTab }) {
  return (
    <nav className="mobile-bottom-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', background: 'rgba(11,18,32,0.97)',
      borderTop: '1px solid var(--border)',
      padding: '0 0 env(safe-area-inset-bottom, 0px)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    }}>
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className={`mobile-nav-btn ${tab === id ? 'active' : ''}`}
          style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '3px', padding: '10px 4px',
            background: 'none', border: 'none',
            cursor: 'pointer', minHeight: '56px',
            color: tab === id ? 'var(--accent)' : 'var(--t3)',
            transition: 'color 0.15s',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
            position: 'relative',
          }}
          aria-label={label}
        >
          <Icon size={tab === id ? 20 : 18} strokeWidth={tab === id ? 2 : 1.5} />
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '8px', letterSpacing: '0.05em',
          }}>
            {label}
          </span>
          {tab === id && (
            <div style={{
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: '24px', height: '2px', borderRadius: '0 0 2px 2px',
              background: 'var(--accent)',
            }} />
          )}
        </button>
      ))}
    </nav>
  )
}

// ── Main App ────────────────────────────────────────────────────────────
export default function AppMobile() {
  const [tab, setTab] = useState('feed')
  const { articles, loading, synced, refetch } = useNewsFeed()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100dvh', overflow: 'hidden',
      background: 'var(--void)',
    }}>
      {/* Top bar */}
      <MobileTopBar
        loading={loading}
        liveCount={articles.length}
        onRefresh={refetch}
      />

      {/* Main content area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--t4)', fontSize: '12px' }}>
            Loading…
          </div>
        }>
          {tab === 'feed'       && <FeedPanel     articles={articles} loading={loading} />}
          {tab === 'alerts'     && <SignalsPanel  articles={articles} />}
          {tab === 'situations' && <SituationsPanel articles={articles} />}
          {tab === 'map'        && <MapPanel      articles={articles} />}
          {tab === 'settings'  && <SettingsPanel_ />}
        </Suspense>
      </div>

      {/* Bottom tab bar */}
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  )
}
