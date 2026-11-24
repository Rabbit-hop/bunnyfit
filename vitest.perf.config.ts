import 'dotenv/config'
import { defineConfig } from 'vitest/config'

// On-demand latency benchmark (AC-21a, SDS §9): `pnpm run test:perf`. Not part of `pnpm test`
// (vitest.config.ts excludes tests/performance/**) so the PR gate stays fast and unaffected
// by machine load; same real PostgreSQL test database and migrations as the other suites.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/performance/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
    // Same pool size as the Docker runtime image (Dockerfile ENV), so the benchmark measures what is deployed.
    env: { UV_THREADPOOL_SIZE: '8' },
    globalSetup: ['./tests/globalSetup.ts'],
  },
})
