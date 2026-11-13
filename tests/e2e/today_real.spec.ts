import { expect, test, type Page } from '@playwright/test'

// Supplementary UI coverage for issue #10 phase 2: Today (S-02) and Log Entry (S-03) against the REAL
// API and DB (no ?mock=). Each test creates its own uniquely named plan item through the API and only
// asserts on that card, so leftover rows from earlier runs do not matter. Not TEST-23 / TEST-25
// (TEST-23 lives in validation_feedback.spec.ts).
const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }

async function loginAndPlan(page: Page, targetKm: number) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(PARTICIPANT.email)
  await page.getByTestId('login-password').fill(PARTICIPANT.password)
  await page.getByTestId('login-submit').click()
  // Login can still be pending after 5 s on a cold API/Vite start (same allowance as library_ui.spec.ts).
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 })
  const token = await page.evaluate(() => sessionStorage.getItem('bunnyfit.token'))
  const name = `E2E Today ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const res = await page.request.post('/api/plan-items', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      source: 'CUSTOM',
      exercise: { name, targetBodyPart: 'Legs', trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'WALKING' },
      priorityWeight: 2,
      targetDistanceKm: targetKm,
    },
  })
  expect(res.status()).toBe(201)
  await page.reload()
  return page.getByRole('listitem').filter({ hasText: name })
}

test('Quick Complete on a real plan item reaches its target; the next click is a no-op notice', async ({ page }) => {
  const card = await loginAndPlan(page, 3.5)
  await expect(card).toContainText('Target 3.5 km')
  await card.getByTestId('item-quick-complete').click()
  // The completed activity leaves Today's list (its card is gone until History is opened).
  await expect(card).toHaveCount(0)
  await page.getByTestId('history-toggle').click()
  await expect(card.getByTestId('item-actual')).toContainText('3.5 km of 3.5 km')
  await expect(card.getByTestId('item-quick-complete')).toHaveText('Completed')
  await card.getByTestId('item-entries-toggle').click()
  await expect(card.getByTestId('item-entries')).toContainText('Quick')
  await card.getByTestId('item-quick-complete').click()
  await expect(page.getByTestId('today-toast')).toHaveText('Already completed, nothing added')
})

test('Log dialog: server rejects 101 km inline, then a valid entry updates the card', async ({ page }) => {
  const card = await loginAndPlan(page, 5)
  await card.getByTestId('item-log').click()
  await page.getByTestId('log-distance').fill('101')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('field-error-distanceKm')).toBeVisible()
  await expect(page.getByTestId('log-distance')).toHaveValue('101')
  await page.getByTestId('log-distance').fill('1.25')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('log-dialog')).toHaveCount(0)
  await expect(card.getByTestId('item-actual')).toContainText('1.25 km of 5 km')
})

// --- Shared login helper (the AC-23 cases moved to validation_feedback.spec.ts) ------------------

async function loginAs(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(who.email)
  await page.getByTestId('login-password').fill(who.password)
  await page.getByTestId('login-submit').click()
  // Login can still be pending after 5 s on a cold API/Vite start (same allowance as library_ui.spec.ts).
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 })
  const token = await page.evaluate(() => sessionStorage.getItem('bunnyfit.token'))
  return { Authorization: `Bearer ${token}` }
}

// --- PR #37 review follow-ups ---------------------------------------------------------------

test('Week row (real API): tapping another day only shows a message; no other day is requested or opened', async ({ page }) => {
  await loginAs(page, PARTICIPANT)
  await expect(page.getByTestId('today-skeleton')).toHaveCount(0)
  const todayIso = (await page.getByTestId('today-date').getAttribute('data-date'))!
  const other: string[] = []
  page.on('request', (r) => {
    if (/\/api\/(progress\/daily|entries)/.test(r.url())) other.push(r.url())
  })
  await page.locator('[data-testid^="today-day-"]:not([aria-current="date"])').first().click()
  await expect(page.getByTestId('today-toast')).toHaveText("Only today's activity can be viewed and logged.")
  await expect(page.getByTestId('today-date')).toHaveAttribute('data-date', todayIso)
  expect(other).toHaveLength(0)
})

test('Log dialog: the helper shows the daily limit left, not the target (entries above the target are allowed)', async ({ page }) => {
  const card = await loginAndPlan(page, 2)
  await card.getByTestId('item-quick-complete').click()
  await page.getByTestId('history-toggle').click()
  await expect(card.getByTestId('item-actual')).toContainText('2 km of 2 km')
  await card.getByTestId('item-log').click()
  await expect(page.getByTestId('log-remaining')).toContainText('Daily limit left: 98 km')
})
