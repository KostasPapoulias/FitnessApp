import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // server: {
  //   port: 5173,
  //   strictPort: false,
  // },
  server: {
  port: 5173,
  strictPort: false,
  proxy: {
    '/api': {
      target: 'https://fitnessapp-production-29e7.up.railway.app',
      changeOrigin: true,
      secure: true,
    },
  },
},
  // MapLibre parses vector tiles in a worker and creates it as a module worker.
  // Vite's default 'iife' output cannot carry that worker's own imports, so it
  // is emitted as ESM to match.
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
