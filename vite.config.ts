import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname === '/ephemeral-token',
                handler: 'NetworkOnly',
              },
            ],
          },
          includeAssets: [
            'pwa-192x192.svg',
            'pwa-512x512.svg',
            'pwa-apple-180x180.svg',
            'pwa-maskable-192x192.svg',
          ],
          manifest: {
            name: 'MockMate - Resume, English & Interview Practice',
            short_name: 'MockMate',
            description: 'Build an ATS-friendly resume, practice spoken English, and prepare for interviews with calm guidance.',
            theme_color: '#002C4B',
            background_color: '#002C4B',
            display: 'standalone',
            orientation: 'portrait',
            scope: '/',
            start_url: '/',
            icons: [
              {
                src: 'pwa-192x192.svg',
                sizes: '192x192',
                type: 'image/svg+xml'
              },
              {
                src: 'pwa-512x512.svg',
                sizes: '512x512',
                type: 'image/svg+xml'
              },
              {
                src: 'pwa-apple-180x180.svg',
                sizes: '180x180',
                type: 'image/svg+xml',
                purpose: 'apple touch icon'
              },
              {
                src: 'pwa-maskable-192x192.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
                purpose: 'maskable'
              }
            ],
            shortcuts: [
              {
                name: 'Interview practice',
                short_name: 'Interview',
                description: 'Practice interview questions',
                url: '/?action=interview',
                icons: [{ src: 'pwa-192x192.svg', sizes: '192x192' }]
              },
              {
                name: 'Resume review',
                short_name: 'Resume',
                description: 'Review your resume for ATS fit',
                url: '/?action=resume',
                icons: [{ src: 'pwa-192x192.svg', sizes: '192x192' }]
              },
              {
                name: 'Speaking practice',
                short_name: 'Speak',
                description: 'Practice spoken English',
                url: '/?action=speaking',
                icons: [{ src: 'pwa-192x192.svg', sizes: '192x192' }]
              }
            ],
            categories: ['education', 'productivity', 'business'],
            lang: 'en',
            dir: 'ltr',
            prefer_related_applications: false
          }
        })
      ],
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
        'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || ''),
        'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
        'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },
      build: {
        rollupOptions: {
          external: ['@google/genai'],
          output: {
            manualChunks: {
                // Split vendor chunks
                vendor: ['react', 'react-dom', 'framer-motion', 'recharts'],
                // Split feature chunks
                dashboard: ['./components/GrowthDashboard.tsx'],
                reports: ['./components/InterviewReport.tsx'],
                session: ['./components/MockSession.tsx'],
                auth: ['./components/Login.tsx', './components/LandingPage.tsx', './components/OnboardingQuestions.tsx']
            }
          }
        },
        chunkSizeWarningLimit: 1000
      }
    };
});
