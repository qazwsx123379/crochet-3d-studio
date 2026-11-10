/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';

// `--mode preview` builds one self-contained HTML file for the claude.ai preview page.
// The real site is also an installable app that opens offline (view only).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'preview'
    ? [react(), viteSingleFile()]
    : [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon-192.png', 'icon-512.png'],
          manifest: {
            name: '鉤織 3D 工作室',
            short_name: '鉤織3D',
            description: '寫織圖、即時 3D 預覽、組裝與匯出',
            lang: 'zh-Hant',
            start_url: './',
            scope: './',
            display: 'standalone',
            background_color: '#f6f3ee',
            theme_color: '#2c6e62',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
            maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
            navigateFallback: 'index.html',
            runtimeCaching: [
              { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } } },
            ],
          },
        }),
      ],
  build: { outDir: mode === 'preview' ? 'dist-preview' : 'dist' },
  test: { environment: 'node' },
}));
