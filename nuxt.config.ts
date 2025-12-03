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

  // Nitro configuration for running the server with Bun
  nitro: {
    preset: 'bun'
  },

  // Vite configuration for heavy client-only dependencies
    /* 
    pdfmake - PDF generation (DOM/Canvas dependent)
    jsbarcode - Barcode generation (Canvas dependent)
    qrcode - QR code generation (Canvas dependent)
    zxing-wasm - WASM barcode scanner (browser API dependent)
    */
  vite: {
    optimizeDeps: {
      // Force these to be excluded from bundling
      exclude: ['jose', 'crypto', 'zxing-wasm']
    },
    plugins: [
      // Visualize the build stats to identify performance bottlenecks and large chunks
      visualizer({
        filename: 'build-size-stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true
      })
    ]
  }
})