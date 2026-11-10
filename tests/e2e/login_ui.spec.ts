import { expect, test } from '@playwright/test'

// Supplementary UI-level coverage for issue #7 (F-01 login screen). This is NOT
// the RTM-designated verification artifact for AC-01f / AC-22a / AC-22b — those
// are tests/integration/auth.test.ts and tests/integration/security_access.test.ts
// (backend, already PASS) — and it is NOT TEST-25 (tests/e2e/main_journey.spec.ts,
// owned by issue #20). It exists to give issue #7 real, non-mocked confidence that
// the UI consequences described in its checklist (401 → clear + redirect, 403 →
// Access Denied screen, 400 field errors) actually happen end to end against the
// real backend + seeded users, ahead of the main-journey test landing.
const PARTICIPANT = { email: 'alice@exercise.test', password: 'change-me' }
const MANAGER = { email: 'manager@exercise.test', password: 'change-me' }

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
}

test('AC-01f (UI): invalid email format shows the field error next to the input', async ({ page }) => {
  await page.goto('/login')
  await page.getByTestId('login-email').fill('not-an-email')
  await page.getByTestId('login-password').fill('x')
  await page.getByTestId('login-submit').click()

  await expect(page.getByTestId('field-error-email')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('AC-22a (UI): a 401 on the next call clears the session and returns to Login', async ({ page }) => {
  await login(page, PARTICIPANT.email, PARTICIPANT.password)
  await expect(page).toHaveURL(/\/today$/)

  // Corrupt the stored JWT in place, then reload — AuthProvider's mount effect
  // calls GET /api/auth/me with it, the real backend rejects it with 401, and
  // the app's own 401 interceptor (lib/api.ts SESSION_EXPIRED_EVENT) must fire.
  await page.evaluate(() => sessionStorage.setItem('bunnyfit.token', 'invalid.token.value'))
  await page.reload()

  await expect(page).toHaveURL(/\/login\?reason=expired$/)
  await expect(page.getByTestId('session-banner')).toBeVisible()
  const token = await page.evaluate(() => sessionStorage.getItem('bunnyfit.token'))
  expect(token).toBeNull()
})

test('AC-22b (UI): a participant visiting a manager-only route lands on Access Denied, no manager data', async ({ page }) => {
  await login(page, PARTICIPANT.email, PARTICIPANT.password)
  await expect(page).toHaveURL(/\/today$/)

  await page.goto('/manager/library')

  await expect(page).toHaveURL(/\/403$/)
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  await expect(page.getByTestId('error-home')).toBeVisible()
  await expect(page.getByText('Exercise Library')).toHaveCount(0)
})

test('AC-22b (UI) manager side: a manager visiting a participant-only route also lands on Access Denied', async ({ page }) => {
  await login(page, MANAGER.email, MANAGER.password)
  await expect(page).toHaveURL(/\/manager\/library$/)

  await page.goto('/today')

  await expect(page).toHaveURL(/\/403$/)
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
})
