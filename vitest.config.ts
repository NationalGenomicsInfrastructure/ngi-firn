import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Nuxt auto-import aliases are not available outside the Nuxt build, so map the
// ones the server/schema modules use to their real directories. `~~`/`@@` point
// at the project root and `~`/`@` at the Nuxt 4 source directory (app/).
const rootDir = fileURLToPath(new URL('.', import.meta.url))
const appDir = fileURLToPath(new URL('./app', import.meta.url))

// Integration tests talk to a live CouchDB and mutate shared fixtures in order,
// so they must run sequentially: no file-level parallelism and no concurrent
// tests within a file. The generous timeouts accommodate real network round
// trips (view builds, bulk writes) rather than in-memory assertions.
export default defineConfig({
  resolve: {
    alias: {
      '~~': rootDir,
      '@@': rootDir,
      '~': appDir,
      '@': appDir
    }
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup/integration.ts'],
    globals: false,
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    sequence: {
      concurrent: false
    }
  }
})
