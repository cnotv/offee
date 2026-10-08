import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5319,
    strictPort: true,
    proxy: {
      // The API refuses mutations whose Origin differs from its Host. In development the
      // browser's origin is this dev server, so the proxy rewrites the header to match.
      '/api': {
        target: 'http://127.0.0.1:8470',
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyRequest) => proxyRequest.setHeader('origin', 'http://127.0.0.1:8470')),
      },
    },
  },
})
