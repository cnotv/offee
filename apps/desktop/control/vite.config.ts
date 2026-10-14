import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Loaded from file:// inside the app, so every asset path is relative.
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  build: { outDir: '../dist/control', emptyOutDir: true },
})
