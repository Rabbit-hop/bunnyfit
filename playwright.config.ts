import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

// E2E tests write data (templates, plan items, entries), so the spawned API must never use the dev
// database: it always runs against DATABASE_URL_TEST (migrated + seeded; see README).
const e2eDatabaseUrl = process.env.DATABASE_URL_TEST
if (!e2eDatabaseUrl) {
  throw new Error('DATABASE_URL_TEST is not set. E2E runs against the test database only; define it in .env or the environment.')
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  // Start both halves of the modular monolith (SDS §2.1): the API and the Vite
  // dev server that proxies `/api` to it. The API currently only exposes
  // `/api/health`; the API is pointed at DATABASE_URL_TEST (required, see top of file).
  webServer: [
    {
      command: 'pnpm exec tsx server/index.ts',
      url: 'http://127.0.0.1:8080/api/health',
      env: { PORT: '8080', NODE_ENV: 'test', DATABASE_URL: e2eDatabaseUrl },
      // Never reuse a running API: it is already bound to whatever DATABASE_URL it started with
      // (usually the dev database), so a reused server silently ignores the DATABASE_URL given to
      // this run and the E2E tests write into the wrong database. If port 8080 is busy, Playwright
      // now fails loudly: stop `pnpm dev` first.
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm run dev:web',
      url: 'http://127.0.0.1:5173',
      env: { PORT: '8080' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
