import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const RAILWAY = 'https://fitnessapp-production-29e7.up.railway.app'

export default defineConfig(({ mode }) => {
  // Dev proxy target for /api: Railway unless API_PROXY_TARGET is set (e.g.
  // http://localhost:3001 in .env.local). Proxying keeps the LAN/phone case
  // working, since the proxy's localhost is this machine. Node-only, so no VITE_ prefix.
  const apiTarget = loadEnv(mode, process.cwd(), '').API_PROXY_TARGET || RAILWAY

  return {
  plugins: [react()],
  server: {
  port: 5173,
  strictPort: false,
  // Every interface, so a phone on the LAN can reach it
  host: true,
  // HTTPS tunnels (needed for geolocation, wake lock and the service worker on
  // a phone) must be allowlisted, or Vite blocks the Host header
  allowedHosts: ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app', '.ngrok.io'],
  proxy: {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      secure: true,
    },
    // Exercise animations live on the backend; mirrors the rewrite in netlify.toml
    '/exercise-media': {
      target: apiTarget,
      changeOrigin: true,
      secure: true,
    },
  },
},
  // MapLibre's tile worker is a module worker, so emit workers as ESM
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  }
})
