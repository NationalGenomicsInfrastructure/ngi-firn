import 'dotenv/config'
import { visualizer } from 'rollup-plugin-visualizer'

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
    enabled: true,

    timeline: {
      enabled: true
    }
  },

  // Enable HTTPS in development if LOCALHOST_HTTPS_KEY and LOCALHOST_HTTPS_CERT are set
  ...(process.env.LOCALHOST_HTTPS_KEY && process.env.LOCALHOST_HTTPS_CERT ? {
    devServer: {
      https: {
        key: process.env.LOCALHOST_HTTPS_KEY,
        cert: process.env.LOCALHOST_HTTPS_CERT
      }
    }
  } : {}),

  build: {
    transpile: ['trpc-nuxt']
  },

  // Include custom CSS styles if needed
  // css: ['~/assets/css/main.css'],

  // Nuxt 4 is not released yet, but this project already uses the Nuxt4 directory structure, so we need to set the compatibility version to 4
  future: { compatibilityVersion: 4 },

  // Nuxt compatibility date
  compatibilityDate: '2025-04-02',

  // Nitro configuration for running the server with Bun
  nitro: {
    preset: 'bun'
  },

  vite: {
    optimizeDeps: {
      // Pre-bundle these heavy dependencies to avoid constant reoptimization
      include: [
        'jsbarcode',
        'qrcode',
        'luxon',
        '@vee-validate/zod'
      ],
      // Force these to be excluded from bundling
      exclude: ['jose', 'crypto', 'zxing-wasm']
    },
    plugins: [
      // Visualize the build stats to identify performance bottlenecks and large chunks
      visualizer({
        filename: 'build-size-stats.html',
        template: 'sunburst',
        gzipSize: true,
        brotliSize: true
      })
    ],
  },

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
})
