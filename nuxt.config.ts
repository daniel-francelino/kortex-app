// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    '@vueuse/nuxt',
    'nuxt-og-image',
    '@vite-pwa/nuxt',
    'motion-v/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['driver.js/dist/driver.css', '~/assets/css/main.css'],

  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    editorImageMaxBytes: process.env.EDITOR_IMAGE_MAX_BYTES ?? '',
    editorFileMaxBytes: process.env.EDITOR_FILE_MAX_BYTES ?? '',

    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeAllowedPriceIds: process.env.STRIPE_ALLOWED_PRICE_IDS,
    stripeBillingPortalConfigurationId: process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID,

    // Shared secret for endpoints meant to be called by the external CRON API
    // (see server/utils/require-cron-secret.ts). Unset only in local development.
    cronSecret: process.env.CRON_SECRET,

    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL ?? '',
      // Chave pública (SPKI, base64) do par de recuperação de suporte do
      // Diário de Bordo — ver docs/journal/PLANO_CRIPTOGRAFIA_PONTA_A_PONTA.md
      // e scripts/generate-journal-recovery-keypair.mjs. Só a metade pública
      // vive aqui; a privada nunca entra neste repositório.
      journalRecoveryPublicKey: process.env.NUXT_PUBLIC_JOURNAL_RECOVERY_PUBLIC_KEY ?? '',
      oneSignalEnabled: process.env.NODE_ENV === 'production' && process.env.NUXT_PUBLIC_ONESIGNAL_ENABLED === 'true',
      oneSignalAppId: process.env.NUXT_PUBLIC_ONESIGNAL_APP_ID ?? '',
      oneSignalServiceWorkerPath: process.env.NUXT_PUBLIC_ONESIGNAL_SERVICE_WORKER_PATH ?? '/push/onesignal/OneSignalSDKWorker.js',
      oneSignalServiceWorkerUpdaterPath: process.env.NUXT_PUBLIC_ONESIGNAL_SERVICE_WORKER_UPDATER_PATH ?? '/push/onesignal/OneSignalSDKUpdaterWorker.js',
      oneSignalServiceWorkerScope: process.env.NUXT_PUBLIC_ONESIGNAL_SERVICE_WORKER_SCOPE ?? '/push/onesignal/',
      posthogEnabled: process.env.NODE_ENV === 'production' && process.env.NUXT_PUBLIC_POSTHOG_ENABLED === 'true',
      posthogHost: process.env.NUXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      posthogKey: process.env.NUXT_PUBLIC_POSTHOG_KEY ?? ''
    }
  },

  routeRules: {
    '/docs': { redirect: '/docs/getting-started', prerender: false },
    '/app': { prerender: false },
    '/app/**': { prerender: false },
    '/api/**': {
      cors: true
    }
  },

  sourcemap: {
    server: false,
    client: true
  },

  compatibilityDate: '2024-07-11',

  nitro: {
    prerender: {
      routes: [
        '/'
      ],
      crawlLinks: true
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Kortex',
      short_name: 'Kortex',
      description: 'Sistema pessoal de conhecimento para capturar, organizar e transformar ideias em ação.',
      theme_color: '#00DC82',
      background_color: '#020618',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: '/app',
      lang: 'pt-BR',
      categories: ['productivity', 'lifestyle'],
      icons: [
        {
          src: '/icons/icon-72x72.png',
          sizes: '72x72',
          type: 'image/png'
        },
        {
          src: '/icons/icon-96x96.png',
          sizes: '96x96',
          type: 'image/png'
        },
        {
          src: '/icons/icon-128x128.png',
          sizes: '128x128',
          type: 'image/png'
        },
        {
          src: '/icons/icon-144x144.png',
          sizes: '144x144',
          type: 'image/png'
        },
        {
          src: '/icons/icon-152x152.png',
          sizes: '152x152',
          type: 'image/png'
        },
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icons/icon-384x384.png',
          sizes: '384x384',
          type: 'image/png'
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icons/icon-maskable-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable'
        },
        {
          src: '/icons/icon-maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      navigateFallback: undefined,
      skipWaiting: true,
      globPatterns: ['**/*.{js,css,png,svg,ico,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'google-fonts-cache',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'gstatic-fonts-cache',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        }
      ]
    },
    client: {
      installPrompt: true
    },
    devOptions: {
      enabled: false
    }
  }
})
