export default defineNuxtConfig({

  // required for tRPC: transpile the tRPC Nuxt module

  // Directly loaded Nuxt modules
  modules: [
    '@nuxt/eslint',
    'nuxt-auth-utils',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    '@una-ui/nuxt'
  ],

  // Enable Nuxt Developer Tools
  devtools: {
    enabled: true
  },
  build: {
    transpile: ['trpc-nuxt']
  },

  // Include custom CSS styles if needed
  // css: ['~/assets/css/main.css'],

  // Nuxt 4 is not released yet, but this project already uses the Nuxt4 directory structure, so we need to set the compatibility version to 4
  future: { compatibilityVersion: 4 },

  // Nuxt compatibility date
  compatibilityDate: '2025-04-02',

  // Enable type checking during the build process.
  // For performance reasons, we don't enable it during development. Run `pnpm typecheck` to run it manually.
  typescript: {
    typeCheck: 'build'
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
    global: true
  },

  // Nitro configuration for standard Node.js SSR
  nitro: {
    preset: 'node-server'
  }
})
