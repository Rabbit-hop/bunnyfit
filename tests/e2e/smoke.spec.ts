import { expect, test } from '@playwright/test'

test('unauthenticated / redirects to welcome with a delayed Login button', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/welcome$/)
  const loginButton = page.getByTestId('welcome-login')
  await expect(loginButton).toBeVisible()

  // Button starts faded out and becomes opaque only after the 1.8 s delay.
  // (el: any — this tsconfig has no DOM lib, so no getComputedStyle/HTMLElement globals)
  const opacity = (el: any) => el.ownerDocument.defaultView.getComputedStyle(el).opacity
  expect(await loginButton.evaluate(opacity)).toBe('0')
  await expect.poll(() => loginButton.evaluate(opacity)).toBe('1')

  await loginButton.click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible()
  await expect(page.getByText('Sign in to continue your journey')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

// Issue #122: ui-spec 3.1 / Section 2 send a visitor without a session to /login (only `/` shows Welcome).
test('protected routes send unauthenticated users to the login form, not welcome', async ({ page }) => {
  for (const path of ['/today', '/manager/library']) {
    await page.goto(path)

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByTestId('login-email')).toBeVisible()
  }
})

test('forwards /api requests to the Express API', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})
