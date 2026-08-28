import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Optional: proxy /api calls to the Java backend during dev so you
    // can call fetch('/api/ask') instead of the full localhost:4567 URL.
    proxy: {
      '/api': {
        target: 'http://localhost:4567',
        changeOrigin: true
      }
    }
  }
})
