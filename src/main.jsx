import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Responsive — desktop vs mobile based on screen width
const isMobile = () => window.innerWidth < 768

function ResponsiveApp() {
  const [mobile, setMobile] = React.useState(isMobile())
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = () => setMobile(isMobile())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  if (mobile) {
    // Dynamic import for mobile to code-split
    const [MobileApp, setMobileApp] = React.useState(null)
    React.useEffect(() => {
      import('./App.mobile.jsx').then(m => setMobileApp(m.default))
    }, [])
    if (!MobileApp) return <div style={{padding:'20px',color:'#4ade80',fontFamily:'monospace'}}>Loading NEXUS…</div>
    return <MobileApp />
  }

  // Desktop — dynamic import for code-split
  const [DesktopApp, setDesktopApp] = React.useState(null)
  React.useEffect(() => {
    import('./App.desktop.jsx').then(m => setDesktopApp(m.default))
  }, [])
  if (!DesktopApp) return <div style={{padding:'20px',color:'#4ade80',fontFamily:'monospace'}}>Loading NEXUS…</div>
  return <DesktopApp />
}

createRoot(document.getElementById('root')).render(<ResponsiveApp />)
