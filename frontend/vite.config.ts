import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const RAILWAY = 'https://fitnessapp-production-29e7.up.railway.app'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Where the dev proxy sends /api. Railway unless API_PROXY_TARGET says
  // otherwise — set it to http://localhost:3001 in .env.local to develop
  // against the local backend.
  //
  // Hardwired to Railway, a backend change could not be tried in the app at
  // all before it was deployed: the local server ran the new code and nothing
  // talked to it, while the page kept getting the old answers from production.
  // Pointing the PROXY at localhost (rather than VITE_API_URL) keeps the phone
  // case working — the proxy runs on this machine, so its localhost is the
  // right one even when the page was opened from a phone over the LAN.
  //
  // No VITE_ prefix on purpose: it is read here, in Node, and never needs to
  // reach the bundle.
  const apiTarget = loadEnv(mode, process.cwd(), '').API_PROXY_TARGET || RAILWAY

  return {
  plugins: [react()],
  // server: {
  //   port: 5173,
  //   strictPort: false,
  // },
  server: {
  port: 5173,
  strictPort: false,
  // Bind on every interface, not just localhost — a phone cannot reach a
  // server listening only on 127.0.0.1, and "it works on my laptop" is what
  // that failure looks like.
  host: true,
  // Vite 5.4.12+ rejects requests whose Host header it does not recognise, so
  // an HTTPS tunnel — which is the only way a phone gets geolocation, a wake
  // lock or a service worker, all of which need a secure context — is refused
  // with a blank "Blocked request" page until its domain is listed here.
  allowedHosts: ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app', '.ngrok.io'],
  proxy: {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      secure: true,
    },
    // Exercise animations live on the backend; the thumbnails are in this
    // app's own public/ and need no proxy. Mirrors the Netlify rewrite in
    // netlify.toml so the same relative URL works in dev and in production.
    '/exercise-media': {
      target: apiTarget,
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
  }
})
