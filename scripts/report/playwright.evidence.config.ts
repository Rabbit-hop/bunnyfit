import { defineConfig, devices } from '@playwright/test'

// Config for scripts/report/ui-evidence.spec.ts. Same servers and viewport as playwright.config.ts
// (API on 8080, Vite on 5173, 360 x 800 mobile); it only points testDir at the evidence spec.
export default defineConfig({
  testDir: '.',
  testMatch: 'ui-evidence.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true } }],
  webServer: [
    { command: 'pnpm exec tsx server/index.ts', url: 'http://127.0.0.1:8080/api/health', env: { PORT: '8080', NODE_ENV: 'test' }, reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm run dev:web', url: 'http://127.0.0.1:5173', env: { PORT: '8080' }, reuseExistingServer: true, timeout: 120_000 },
  ],
})
