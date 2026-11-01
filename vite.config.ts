import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'CodEX AI Terminal',
        short_name: 'CodEX AI',
        description: 'A focused terminal workspace powered by Gemini.',
        theme_color: '#050807',
        background_color: '#050807',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        icons: [
          { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html'
      }
    })
  ]
});
