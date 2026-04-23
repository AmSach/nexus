import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, writeFileSync, existsSync } from 'fs'

function nexusMultiTargetPlugin() {
  return {
    name: 'nexus-multi-target',
    closeBundle() {
      const dist = resolve(__dirname, 'dist')
      const base = 'https://man44.zo.space'
      
      // Desktop: index.html pointing to /assets/
      const desktopHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>NEXUS — Intelligence Platform</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Inter:wght@300;400;500;600&family=Orbitron:wght@600;700&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="/nexus/assets/App.index.css"/>
  <script type="module" crossorigin src="/nexus/assets/App.main.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`
      
      // Mobile: pointing to /nexus/assets/ too (same assets, mobile entry only)
      const mobileHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
  <meta name="theme-color" content="#03050a"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
  <title>NEXUS — Mobile</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Inter:wght@300;400;500;600&family=Orbitron:wght@600;700&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="/nexus/assets/App.index.css"/>
  <script type="module" crossorigin src="/nexus/assets/App.mobile.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`
      
      writeFileSync(resolve(dist, 'index.html'), desktopHtml)
      writeFileSync(resolve(dist, 'mobile.html'), mobileHtml)
      console.log('[nexus-multi-target] Generated index.html and mobile.html with /nexus/assets/* paths')
    }
  }
}

export default defineConfig({
  plugins: [react(), nexusMultiTargetPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/main.jsx'),
        mobile: resolve(__dirname, 'src/main-mobile.jsx'),
      },
      output: {
        entryFileNames: 'assets/App.[name].js',
        chunkFileNames: 'assets/App.[name].js',
        assetFileNames: 'assets/App.[name].[ext]',
        manualChunks(id) {
          if (id.includes('/node_modules/')) return 'vendor'
        },
      },
    },
  },
})