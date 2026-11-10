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

test('protected route sends unauthenticated users to welcome', async ({ page }) => {
  await page.goto('/today')

  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByTestId('welcome-login')).toBeVisible()
})

test('forwards /api requests to the Express API', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})
