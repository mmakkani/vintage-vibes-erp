import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['vintage_logo.svg', 'apple-touch-icon.png', 'logo192.png', 'logo512.png', 'pwa-192x192.png', 'pwa-512x512.png', 'manifest.json'],
        manifest: {
          id: '/',
          name: 'Vintage Vibes - Enterprise Apparel & Storefront',
          short_name: 'Vintage Vibes',
          description: 'Enterprise Apparel ERP and Luxury Storefront for garment processing and sales workflows.',
          theme_color: '#07080c',
          background_color: '#07080c',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/logo192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/logo512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: null,
          globPatterns: ['**/*.{css,ico,png,svg,woff,woff2}', 'index.html'],
          globIgnores: [
            '**/assets/*.js',
            '**/assets/**/*.js',
            '**/sw.js',
            '**/workbox-*.js'
          ],
          runtimeCaching: [
            {
              urlPattern: /\/assets\/.*\.js$/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'dynamic-chunks-cache',
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 1,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) return 'vendor-lucide';
              if (id.includes('@supabase')) return 'vendor-db';
              if (id.includes('motion')) return 'vendor-motion';
              if (id.includes('qrcode') || id.includes('jsbarcode') || id.includes('jszip')) return 'vendor-barcode';
              if (id.includes('@google/genai')) return 'vendor-ai';
              return 'vendor-core';
            }
            // AI Vision & OCR: bundle all Gemini OCR, valuation, camera & cropper assets reliably together
            if (
              id.includes('geminiOcrService') ||
              id.includes('geminiVintageValuation') ||
              id.includes('documentCropper') ||
              id.includes('AIOcrScannerModal')
            ) {
              return 'ai-vision-ocr';
            }
            // Shared security & audio utilities to prevent orphaned micro-chunks
            if (
              id.includes('securityMasterPin') ||
              id.includes('soundEffects')
            ) {
              return 'shared-security-audio';
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: true,
      port: 3000,
      allowedHosts: ['.ngrok-free.dev', '.loca.lt', '.trycloudflare.com', '.lhr.life', 'all'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/*.exe',
          '**/cloudflared*',
          '**/.data/**',
          '**/dist/**',
          '**/baileys_auth/**',
          '**/.system_generated/**',
          '**/scratch/**'
        ],
      },
    },
  };
});
