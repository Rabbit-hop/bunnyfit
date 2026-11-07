import { defineConfig, devices } from '@playwright/test'

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
  // `/api/health`; E2E tests that need PostgreSQL must set DATABASE_URL_TEST.
  webServer: [
    {
      command: 'pnpm exec tsx server/index.ts',
      url: 'http://127.0.0.1:8080/api/health',
      env: { PORT: '8080', NODE_ENV: 'test' },
      reuseExistingServer: !process.env.CI,
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
