/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
  // Served from https://ha603438.github.io/babyflair/ (GitHub Pages); the hash router keeps every route under it.
  base: '/babyflair/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom worker (src/sw.ts): precache + navigation fallback as before, plus the Web Push handlers.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['logo.png', 'logo-mark.png', 'apple-touch-icon-180x180.png', 'favicon-48.png'],
      manifest: {
        name: 'BabyFlair',
        short_name: 'BabyFlair',
        description: 'Classement baby-foot du bureau',
        lang: 'fr',
        theme_color: '#1d4ed8',
        background_color: '#05070c',
        display: 'standalone',
        start_url: '/babyflair/',
        scope: '/babyflair/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
