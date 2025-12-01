import 'dotenv/config'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineNuxtConfig({

  // required for tRPC: transpile the tRPC Nuxt module

  // Directly loaded Nuxt modules
  modules: ['@nuxt/eslint', '@nuxthub/core', 'nuxt-auth-utils', '@pinia/nuxt', '@pinia/colada-nuxt', '@una-ui/nuxt', 'nuxt-processor'],

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
    @ericblade/quagga2 - Barcode scanner (browser API dependent)
    */
  vite: {
    optimizeDeps: {
      // Pre-bundle these heavy dependencies to avoid constant reoptimization
      include: [
        'jsbarcode',
        'qrcode',
        'pdfmake/build/pdfmake',
        'pdfmake/build/vfs_fonts',
        'luxon',
        'zxing-wasm/reader',
        '@vee-validate/zod'
      ],
      // Force these to be excluded from bundling
      exclude: ['jose', 'crypto', 'zxing-wasm', '@ericblade/quagga2']
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

  // Processor configuration for asynchronous tasks with Redis powered by BullMQ
  processor: {
    redis: {
      // Prefer a single URL if available (takes precedence over other fields)
      // e.g. redis://user:pass@host:6379/0
      url: process.env.NUXT_REDIS_URL,
      host: process.env.NUXT_REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.NUXT_REDIS_PORT ?? 6379),
      password: process.env.NUXT_REDIS_PASSWORD ?? '',
      username: process.env.NUXT_REDIS_USERNAME,
      db: Number(process.env.NUXT_REDIS_DB ?? 0),
      // Optional connection behavior
      // Delay connecting until first Redis command (useful to avoid build-time connects)
      lazyConnect: process.env.NUXT_REDIS_LAZY_CONNECT
        ? process.env.NUXT_REDIS_LAZY_CONNECT === 'true'
        : undefined,
      // Milliseconds to wait before giving up when establishing the connection
      connectTimeout: process.env.NUXT_REDIS_CONNECT_TIMEOUT
        ? Number(process.env.NUXT_REDIS_CONNECT_TIMEOUT)
        : undefined,
    },
  },

  una: {
    prefix: 'N',
    themeable: true,
    global: true
  },

})
