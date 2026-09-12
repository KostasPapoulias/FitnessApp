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
