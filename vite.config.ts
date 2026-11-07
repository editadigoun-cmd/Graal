import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['provisit-icon.svg'],
      manifest: {
        name: 'Provisit',
        short_name: 'Provisit',
        description: 'Plateforme de gestion des visites médicales, des délégués et de la performance terrain',
        theme_color: '#163E63',
        background_color: '#163E63',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/provisit-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        importScripts: ['sw-push.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/'),
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor_react: ['react', 'react-dom', 'react-router-dom'],
          vendor_charts: ['recharts'],
          vendor_motion: ['framer-motion'],
          vendor_supabase: ['@supabase/supabase-js']
        }
      }
    }
  }
})
