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
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
