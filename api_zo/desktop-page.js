// NEXUS Intelligence Platform — Desktop Full Version
// Serve the built React app with SPA fallback
export default async (c) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Cache-Control', 'public, max-age=3600')
  // Serve static files from dist if available
  const path = c.req.path === '/' ? '/index.html' : c.req.path
  const filePath = `/home/workspace/nexus/dist${path}`
  try {
    const fs = await import('fs')
    if (fs.existsSync(filePath)) {
      const ext = path.split('.').pop()
      const ct = { html:'text/html', js:'application/javascript', css:'text/css', json:'application/json', svg:'image/svg+xml', png:'image/png', ico:'image/x-icon' }[ext] || 'text/plain'
      c.header('Content-Type', ct)
      return c.body(fs.readFileSync(filePath))
    }
  } catch {}
  // SPA fallback
  try {
    const fs = await import('fs')
    const html = fs.readFileSync('/home/workspace/nexus/dist/index.html', 'utf8')
    c.header('Content-Type', 'text/html')
    return c.body(html)
  } catch {
    return c.html('<!doctype html><html><head><meta charset="UTF-8"/><title>NEXUS — Intelligence Platform</title></head><body><div id="root"><h1>NEXUS Intelligence Platform v4.3.8</h1><p>Loading...</p><script>window.location.href="/"</script></div></body></html>')
  }
}