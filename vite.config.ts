import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // Base path para GitHub Pages (https://usuario.github.io/gersup/)
  // Mude para '/' se usar um domínio próprio
  base: '/gersup/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api-compras': {
        target: 'https://dadosabertos.compras.gov.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-compras/, ''),
        secure: true,
      },
      '/api-pncp': {
        target: 'https://pncp.gov.br/api/pncp',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-pncp/, ''),
        secure: true,
      },
    },
  },
})
