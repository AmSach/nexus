import React, { Suspense } from 'react'
import { useStore } from './store'
import { useNewsFeed } from './hooks/useNewsFeed'
import TopBar from './components/shared/TopBar'
import Sidebar from './components/shared/Sidebar'
import { KalshiTicker } from './components/shared/KalshiTicker'
import LiveFeed from './components/feed/LiveFeed'
import LiveFeedSidebar from './components/feed/LiveFeedSidebar'
import Situations from './components/feed/Situations'
import IntelBoard from './components/board/IntelBoard'
import IntelMap from './components/map/IntelMap'
import FinancePanel from './components/finance/FinancePanel'
import { SavedPanel, SettingsPanel } from './components/panels'
import GDELTSearch from './components/feed/GDELTSearch'
import ViewMode from './components/ViewMode'
import HealthCheck from './components/HealthCheck'
import CIIDashboard from './components/feed/CIIDashboard'
import VoxSimulator from './components/feed/VoxSimulator'
import PalantirWorkbench from './components/ontology/PalantirWorkbench'

class ErrBound extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <div style={{ padding:'20px', color:'var(--t3)', fontSize:'12px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'10px' }}>
        <div>⚠ Component error: {this.state.err?.message?.slice(0,80)}</div>
        <button onClick={() => this.setState({ err: null })} style={{ fontSize:'11px', padding:'4px 12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px', color:'var(--t2)', cursor:'pointer' }}>Retry</button>
      </div>
    )
    return this.props.children
  }
}

export default function App() {
  const { tab, setTab, collapsed } = useStore()

  // Hash-based deep linking (e.g. #map, #board, #health, #vox, #ontology)
  React.useEffect(() => {
    const syncFromHash = () => {
      const h = window.location.hash.replace(/^#\/?/, '').toLowerCase()
      if (h && ['feed', 'situations', 'board', 'map', 'finnews', 'search', 'view', 'saved', 'settings', 'health', 'vox', 'ontology'].includes(h)) {
        setTab(h)
      } else if (h && ['palantir', 'ops', 'benchmark', 'calibration'].includes(h)) {
        setTab('ontology')
      } else if (h && ['econ', 'chokepoints', 'alpha', 'stress', 'macro', 'correlations'].includes(h)) {
        setTab('finnews')
      }
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [setTab])

  // Sync hash when tab changes, preserving finance subtab hashes
  React.useEffect(() => {
    const currentHash = window.location.hash.replace(/^#\/?/, '').toLowerCase()
    if (tab === 'finnews' && ['chokepoints', 'correlations', 'graph', 'alpha', 'stress'].includes(currentHash)) {
      return
    }
    if (tab && currentHash !== tab) {
      window.location.hash = tab
    }
  }, [tab])

  // Smart on-demand tab mounting: do not mount heavy tabs until first visited
  const [visited, setVisited] = React.useState(() => new Set([tab || 'feed']))
  React.useEffect(() => {
    if (tab) setVisited(prev => prev.has(tab) ? prev : new Set([...prev, tab]))
  }, [tab])

  const { articles = [], loading, synced, refetch, translating, translateCount } = useNewsFeed()
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', background:'var(--void)' }}>
      <TopBar loading={loading} synced={synced} liveCount={articles.length} onRefresh={refetch} translating={translating} translateCount={translateCount} />
      <ErrBound><KalshiTicker /></ErrBound>
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <Sidebar collapsed={collapsed} />
        <main style={{ flex:1, minWidth:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <Suspense fallback={<div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--t4)' }}>Loading…</div>}>
            {/* Standard tabs mounted on-demand and kept alive once opened */}
            {visited.has('feed') && (
              <div style={{ display: tab==='feed' ? 'flex' : 'none', height:'100%', overflow:'hidden', minWidth:0 }}>
                <div style={{ flex:1, minWidth:0, overflow:'hidden' }}>
                  <ErrBound><LiveFeed articles={articles} loading={loading} /></ErrBound>
                </div>
                <ErrBound><LiveFeedSidebar articles={articles} /></ErrBound>
              </div>
            )}
            {visited.has('situations') && (
              <div style={{ display: tab==='situations' ? 'flex' : 'none', height:'100%', overflow:'hidden' }}>
                <div style={{ flex:1, minWidth:0, overflow:'hidden' }}>
                  <ErrBound><Situations articles={articles} /></ErrBound>
                </div>
                <div style={{ width:'320px', flexShrink:0, borderLeft:'1px solid var(--border)', overflow:'hidden' }}>
                  <ErrBound><CIIDashboard articles={articles} /></ErrBound>
                </div>
              </div>
            )}
            {visited.has('board') && (
              <div style={{ display: tab==='board' ? 'contents' : 'none' }}><ErrBound><IntelBoard /></ErrBound></div>
            )}
            {visited.has('map') && (
              <div style={{ display: tab==='map' ? 'contents' : 'none' }}><ErrBound><IntelMap articles={articles} active={tab==='map'} /></ErrBound></div>
            )}
            {visited.has('finnews') && (
              <div style={{ display: tab==='finnews' ? 'contents' : 'none' }}><ErrBound><FinancePanel articles={articles} /></ErrBound></div>
            )}
            {visited.has('search') && (
              <div style={{ display: tab==='search' ? 'contents' : 'none' }}><ErrBound><GDELTSearch /></ErrBound></div>
            )}
            {visited.has('saved') && (
              <div style={{ display: tab==='saved' ? 'contents' : 'none' }}><ErrBound><SavedPanel /></ErrBound></div>
            )}
            {visited.has('settings') && (
              <div style={{ display: tab==='settings' ? 'contents' : 'none' }}><ErrBound><SettingsPanel /></ErrBound></div>
            )}
            {visited.has('health') && (
              <div style={{ display: tab==='health' ? 'contents' : 'none' }}><ErrBound><HealthCheck /></ErrBound></div>
            )}
            {visited.has('ontology') && (
              <div style={{ display: tab==='ontology' ? 'contents' : 'none' }}>
                <ErrBound><PalantirWorkbench onBackToTerminal={() => setTab('finnews')} /></ErrBound>
              </div>
            )}

            {/* Ultra-heavy compute tabs: unmounted immediately when leaving tab to free 100% CPU/GPU */}
            {tab === 'view' && (
              <div style={{ display: 'contents' }}><ErrBound><ViewMode articles={articles} active={true} /></ErrBound></div>
            )}
            {tab === 'vox' && (
              <div style={{ display: 'flex', height:'100%', overflow:'hidden', minWidth:0 }}><ErrBound><VoxSimulator articles={articles} /></ErrBound></div>
            )}
          </Suspense>
        </main>
      </div>
    </div>
  )
}
