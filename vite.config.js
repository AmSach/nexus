import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function vercelApiDevPlugin() {
  return {
    name: 'vercel-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()

        try {
          const parsedUrl = new URL(req.url, 'http://localhost:5173')
          const endpoint = parsedUrl.pathname.replace(/^\/api\//, '').replace(/\.js$/, '')
          const filePath = path.resolve(process.cwd(), 'api', `${endpoint}.js`)

          if (!fs.existsSync(filePath)) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: `API route /api/${endpoint} not found` }))
            return
          }

          // Polyfill Vercel Serverless Function req / res properties
          req.query = Object.fromEntries(parsedUrl.searchParams.entries())

          res.status = (code) => {
            res.statusCode = code
            return res
          }
          res.json = (data) => {
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'application/json')
            }
            res.end(JSON.stringify(data))
            return res
          }
          res.send = (data) => {
            if (typeof data === 'object' && !(data instanceof Buffer)) {
              return res.json(data)
            }
            res.end(data)
            return res
          }

          // Load module with Vite SSR loader
          const mod = await server.ssrLoadModule(filePath)
          const handler = mod.default || mod
          if (typeof handler === 'function') {
            await handler(req, res)
          } else {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: `No default export handler in ${endpoint}.js` }))
          }
        } catch (err) {
          console.error(`[API Dev Server Error] ${req.url}:`, err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), vercelApiDevPlugin()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react'],
          'vendor-utils': ['date-fns', 'zustand'],
        }
      }
    }
  }
})

