import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-api-to-dist',
      closeBundle() {
        const src = resolve(__dirname, 'api')
        const dest = resolve(__dirname, 'dist', 'api')
        if (existsSync(src)) {
          mkdirSync(dest, { recursive: true })
          cpSync(src, dest, { recursive: true })
          console.log('[copy-api-to-dist] copied api/ -> dist/api/')
        }
      }
    }
  ]
})
