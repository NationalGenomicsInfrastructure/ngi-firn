export default defineNuxtConfig({

  // required for tRPC: transpile the tRPC Nuxt module
  build: {
    transpile: ['trpc-nuxt']
  },

  // Directly loaded Nuxt modules
  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '@nuxthub/core',
    'nuxt-auth-utils',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    'trpc-nuxt'
  ],

  // Enable Nuxt Developer Tools
  devtools: {
    enabled: true
  },

  // Include custom CSS styles
  css: ['~/assets/main.css'],

  // Nuxt 4 is not released yet, but this project already uses the Nuxt4 directory structure, so we need to set the compatibility version to 4
  future: { compatibilityVersion: 4 },

  // Nuxt compatibility date
  compatibilityDate: '2025-04-02',

  // Settings for the Nuxt Hub, in case we wanted to deploy Noetic on the edge instead on a custom server.
  hub: {
    database: true
  },
  
  // Linting configuration
  eslint: {
    config: {
      stylistic: {
        quotes: 'single',
        commaDangle: 'never'
      }
    }
  }
})
