/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': a new service worker waits until the player accepts the
      // update, so a running game is never swapped out from under them.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'WIPlife',
        short_name: 'WIPlife',
        description: 'A life simulator. Every life is a work in progress.',
        lang: 'en-US',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#12141c',
        theme_color: '#12141c',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,webmanifest}'],
        // P1: the portrait art (about 190 MB in public/portraits) is never precached. A portrait caches the layers it needs the
        // first time it is drawn, up to a cap; thumbnails in IndexedDB mean most screens never fetch them again.
        globIgnores: ['portraits/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/portraits/'),
            handler: 'CacheFirst',
            options: { cacheName: 'portrait-art', expiration: { maxEntries: 400 }, cacheableResponse: { statuses: [200] } },
          },
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/portraits\//],
        cleanupOutdatedCaches: true,
        // The game is its content: the compiled events, balance and text ship inside the app bundle, which grows with every
        // expansion and passed the 2 MiB default in E4. The whole bundle must be cached for the app to work offline.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
