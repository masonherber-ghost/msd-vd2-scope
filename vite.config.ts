import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Most specific aliases first — the resolver matches in order.
    alias: [
      { find: /^@\/components\//, replacement: `${src('./src/components')}/` },
      { find: /^@\/hooks\//, replacement: `${src('./src/hooks')}/` },
      { find: /^@\/lib\//, replacement: `${src('./src/lib')}/` },
      { find: /^@\//, replacement: `${src('./src')}/` },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
