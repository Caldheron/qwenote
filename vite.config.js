import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' : fonctionne sur GitHub Pages (sous-dossier du dépôt) sans configuration.
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  plugins: [
    VitePWA({
      registerType: 'prompt', // bandeau « Nouvelle version disponible »
      includeAssets: ['apple-touch-icon.png', 'icon-192.png'],
      manifest: {
        name: 'Qwenote',
        short_name: 'Qwenote',
        description: 'Notes Markdown hors ligne, miroir de Qwenaëlle',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#15100C',
        theme_color: '#15100C',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,woff,png,svg}'], navigateFallback: 'index.html' },
    }),
  ],
});
