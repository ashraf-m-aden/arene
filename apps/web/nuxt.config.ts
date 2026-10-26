// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  /**
   * Devtools en développement seulement. Activé en dur, il est aussi chargé au
   * build de production, où il réclame `vite` — qu'il déclare en peerDependency.
   * Dans l'image Docker du web, seul ce workspace est installé : `vite` n'est
   * alors présent nulle part (en local il arrive par `vitest`, une dépendance de
   * dev de l'API) et le build échoue sur « Cannot find package 'vite' ».
   */
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  /** Un layer par module métier ; `base` porte tout ce qui est partagé. */
  extends: [
    './layers/base',
    './layers/editions',
    './layers/registrations',
    './layers/schools',
    './layers/slots',
    './layers/results',
    './layers/galleries',
    './layers/admin'
  ],

  modules: ['@pinia/nuxt', 'pinia-plugin-persistedstate/nuxt', '@nuxtjs/i18n', '@nuxt/image'],

  // Chaque layer déclare son store : il faut les ajouter à l'auto-import de Pinia.
  pinia: {
    storesDirs: ['./layers/*/stores/**']
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:4000/api/v1',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      youtubeChannel: process.env.NUXT_PUBLIC_YOUTUBE_CHANNEL || ''
    }
  },

  css: ['~/layers/base/assets/scss/main.scss'],

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          additionalData: '@use "~/layers/base/assets/scss/abstracts" as *;'
        }
      }
    }
  },

  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'fr',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'arene_locale',
      redirectOn: 'root',
      fallbackLocale: 'fr'
    },
    locales: [
      { code: 'fr', language: 'fr-DJ', name: 'Français', dir: 'ltr' },
      { code: 'ar', language: 'ar-DJ', name: 'العربية', dir: 'rtl' }
    ],
    vueI18n: 'i18n.config.ts',
    baseUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  },

  image: {
    quality: 78,
    format: ['webp', 'avif'],
    screens: { xs: 360, sm: 640, md: 900, lg: 1200, xl: 1536 }
  },

  nitro: {
    compressPublicAssets: true,
    routeRules: {
      // Pages publiques mises en cache courte, revalidées en arrière-plan.
      '/': { swr: 300 },
      '/editions/**': { swr: 300 },
      '/ecoles/**': { swr: 600 },
      '/galeries/**': { swr: 600 },
      '/reglement': { swr: 3600 },
      '/faq': { swr: 3600 },
      '/a-propos': { swr: 3600 },
      // Mon espace et back-office : jamais indexés, jamais mis en cache.
      '/compte/**': { index: false, robots: false, swr: false },
      '/staff/**': { index: false, robots: false, ssr: false },
      '/admin/**': { index: false, robots: false, ssr: false }
    }
  },

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#0b1b2b' }
      ],
      link: [
        /*
         * Trois tailles pour une seule marque. Le SVG ne montre que les deux
         * camps : dans un onglet, l'anneau et l'étoile du logo complet ne font
         * plus qu'un demi-pixel. Les deux PNG, eux, portent le logo entier —
         * iOS ignore les icônes SVG, et les raccourcis Android affichent grand.
         */
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/icon-512.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter:wght@400;500;600&display=swap'
        }
      ]
    }
  }
})
