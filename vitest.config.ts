import 'dotenv/config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    pool: 'forks',
    // The integration suites share one real PostgreSQL test database and some assert
    // "no database change" by counting rows, so test files must not run concurrently.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    globalSetup: ['./tests/globalSetup.ts'],
  },
})
