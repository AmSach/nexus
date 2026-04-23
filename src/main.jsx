import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Responsive — desktop vs mobile based on screen width
const isMobile = () => window.innerWidth < 768

function ResponsiveApp() {
  const [mobile, setMobile] = React.useState(isMobile())
  const [App, setApp] = React.useState(null)
  
  // Media query listener
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = () => setMobile(isMobile())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  
  // Load correct app bundle based on screen size
  React.useEffect(() => {
    const loadApp = async () => {
      const mod = mobile 
        ? await import('./App.mobile.jsx')
        : await import('./App.desktop.jsx')
      setApp(() => mod.default)
    }
    loadApp().catch(console.error)
  }, [mobile])
  
  if (!App) return <div style={{padding:'20px',color:'#4ade80',fontFamily:'monospace'}}>Loading NEXUS…</div>
  return <App />
}

createRoot(document.getElementById('root')).render(<ResponsiveApp />)
