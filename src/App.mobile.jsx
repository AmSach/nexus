// NEXUS v4 Mobile — Single-column, tab nav, all features
import React, { Suspense } from 'react'
import { useStore } from './store'
import { useNewsFeed } from './hooks/useNewsFeed'
import TopBar from './components/shared/TopBar'
import LiveFeed from './components/feed/LiveFeed'
import LiveFeedSidebar from './components/feed/LiveFeedSidebar'
import Situations from './components/feed/Situations'
import SavedPanel from './components/panels'
import SettingsPanel from './components/panels'
import CIIDashboard from './components/feed/CIIDashboard'
import NEXUSPredict from './components/NEXUSPredict'

const TABS = [
  { id:'feed', label:'Feed' },
  { id:'alerts', label:'Alerts' },
  { id:'situations', label:'AI' },
  { id:'saved', label:'Saved' },
  { id:'settings', label:'Settings' },
]

function MobileNav({ tab, setTab }) {
  return (
    <div style={{
      position:'fixed', bottom:0, left:0, right:0, zIndex:100,
      display:'flex', background:'var(--panel)', borderTop:'1px solid var(--border)',
      padding:'6px 0 env(safe-area-inset-bottom)',
    }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex:1, background:'none', border:'none', color: tab===t.id?'var(--accent)':'var(--t4)',
          fontSize:'10px', fontFamily:'JetBrains Mono', cursor:'pointer', padding:'4px 2px',
        }}>{t.label}</button>
      ))}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = React.useState('feed')
  const { articles, loading, synced, refetch, translating, translateCount } = useNewsFeed()
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', overflow:'hidden', background:'var(--void)' }}>
      <TopBar loading={loading} synced={synced} liveCount={articles.length} onRefresh={refetch} translating={translating} translateCount={translateCount} />
      <div style={{ flex:1, overflow:'auto', paddingBottom:'48px' }}>
        {tab==='feed' && <div style={{ display:'flex', flexDirection:'column', height:'100%' }}><LiveFeed articles={articles} loading={loading} /><LiveFeedSidebar articles={articles} /></div>}
        {tab==='alerts' && <LiveFeedSidebar articles={articles} />}
        {tab==='situations' && <div style={{ display:'flex', height:'100%' }}><Situations articles={articles} /><CIIDashboard articles={articles} /></div>}
        {tab==='saved' && <SavedPanel />}
        {tab==='settings' && <SettingsPanel />}
      </div>
      <MobileNav tab={tab} setTab={setTab} />
    </div>
  )
}
