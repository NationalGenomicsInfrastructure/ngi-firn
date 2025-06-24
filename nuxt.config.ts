export default defineNuxtConfig({

  // required for tRPC: transpile the tRPC Nuxt module
  build: {
    transpile: ['trpc-nuxt']
  },

  // Enable type checking during the build process. 
  // For performance reasons, we don't enable it during development. Run `pnpm typecheck` to run it manually.
  typescript: {
    typeCheck: 'build'
  },

  // Directly loaded Nuxt modules
  modules: [
    '@nuxt/eslint',
    '@nuxthub/core',
    'nuxt-auth-utils',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    '@una-ui/nuxt'
  ],

  // Runtime configuration for the Nuxt app, mainly for the auth module.
  runtimeConfig: {
    public: {
      auth: {
        redirectUserTo: '/firn',
        redirectGuestTo: '/',
      },
    },
  },


  // Enable Nuxt Developer Tools
  devtools: {
    enabled: true
  },

  // Include custom CSS styles if needed
  // css: ['~/assets/css/main.css'],

  // Nuxt 4 is not released yet, but this project already uses the Nuxt4 directory structure, so we need to set the compatibility version to 4
  future: { compatibilityVersion: 4 },

  // Nuxt compatibility date
  compatibilityDate: '2025-04-02',

  // Settings for the Nuxt Hub, in case we wanted to deploy Firn on the edge instead on a custom server.
  // https://hub.nuxt.com/docs/getting-started/installation#options
  hub: {
    database: true,
    kv: true,
  },
  
  // Linting configuration
  eslint: {
    config: {
      stylistic: {
        quotes: 'single',
        commaDangle: 'never'
      }
    }
  },

  una: {
    prefix: 'N',
    themeable: true,
    global: true,
  },
})
