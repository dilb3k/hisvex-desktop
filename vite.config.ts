import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  root: '.',
  base: './',
  build: {
    outDir: 'build/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    // No dev proxy: src/api/client.ts's axios instance always calls an
    // absolute baseURL (VITE_API_BASE_URL, defaulting to the prod API) —
    // nothing in this app makes relative `/api/...` requests that a Vite
    // dev-server proxy would need to intercept. A `/api` proxy entry was
    // here previously but was dead config; removed rather than kept as
    // unused drift.
  },
})
