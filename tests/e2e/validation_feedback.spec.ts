import { expect, test, type Page } from '@playwright/test'

// TEST-23 (AC-23, NFR-03): the UI shows an error notice that names the field and the limit.
// Sprint 1 cases per F-04 §8: TEST-23-1 (sets 21), TEST-23-2 (LOG_DATE_MISMATCH notice),
// TEST-23-3 (Quick Complete disabled on a Rest Day). The "editing an old entry" case belongs to F-05
// (Sprint 2) and TEST-23-4 (weight) is deferred with the Profile screen, so neither is here.
//
// These run against the REAL API and DB (no ?mock=). Each test creates its own uniquely named plan
// item through the API and only asserts on that card, so leftover rows from earlier runs do not
// matter. TEST-23-2 injects the server rejection on the wire (see the comment in that test).
const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }
const OTHER_PARTICIPANT = { email: 'bob@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }

async function loginAs(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(who.email)
  await page.getByTestId('login-password').fill(who.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/today$/)
  const token = await page.evaluate(() => sessionStorage.getItem('bunnyfit.token'))
  return { Authorization: `Bearer ${token}` }
}

function uniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

test('TEST-23-1 (AC-23): sets 21 is rejected by the server, the field error names the limit and keeps the value', async ({ page }) => {
  const headers = await loginAs(page, PARTICIPANT)
  const name = uniqueName('E2E Sets')
  const res = await page.request.post('/api/plan-items', {
    headers,
    data: {
      source: 'CUSTOM',
      exercise: { name, targetBodyPart: 'Core', trackingMode: 'BODYWEIGHT_REPS' },
      priorityWeight: 2,
      targetSets: 2,
      targetRepsPerSet: 5,
    },
  })
  expect(res.status()).toBe(201)
  await page.reload()
  const card = page.getByRole('listitem').filter({ hasText: name })
  await card.getByTestId('item-log').click()
  await page.getByTestId('log-sets').fill('21')
  await page.getByTestId('log-reps').fill('1')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('field-error-sets')).toContainText('20')
  await expect(page.getByTestId('log-dialog')).toBeVisible()
  await expect(page.getByTestId('log-sets')).toHaveValue('21')
})

test('TEST-23-2 (AC-23): LOG_DATE_MISMATCH closes the dialog and shows a reload notice', async ({ page }) => {
  const headers = await loginAs(page, PARTICIPANT)
  const name = uniqueName('E2E Date')
  const res = await page.request.post('/api/plan-items', {
    headers,
    data: {
      source: 'CUSTOM',
      exercise: { name, targetBodyPart: 'Legs', trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'WALKING' },
      priorityWeight: 2,
      targetDistanceKm: 4,
    },
  })
  expect(res.status()).toBe(201)
  await page.reload()
  // The server cannot be made to disagree about "today" from the browser, so the rejection is injected
  // on the wire: same status, code and envelope as API spec §6 (400 LOG_DATE_MISMATCH).
  await page.route('**/api/entries', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'LOG_DATE_MISMATCH', message: 'logDate must be today', fields: [] }),
    })
  })
  const card = page.getByRole('listitem').filter({ hasText: name })
  await card.getByTestId('item-log').click()
  await page.getByTestId('log-distance').fill('1')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('log-dialog')).toHaveCount(0)
  await expect(page.getByTestId('error-notice')).toContainText('not for today')
})

test('TEST-23-3 (AC-23 / AC-04b): on a real Rest Day Quick Complete is disabled with an explanation', async ({ page }) => {
  // Bob only gets plan items that start tomorrow, so for him today is a Rest Day that still has exercises.
  const headers = await loginAs(page, OTHER_PARTICIPANT)
  const plan = await page.request.get('/api/plan', { headers })
  const today: string = (await plan.json()).date
  const next = new Date(`${today}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const tomorrow = next.toISOString().slice(0, 10)
  const res = await page.request.post('/api/plan-items', {
    headers,
    data: {
      source: 'CUSTOM',
      exercise: { name: uniqueName('E2E Rest'), targetBodyPart: 'Legs', trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'WALKING' },
      priorityWeight: 2,
      targetDistanceKm: 2,
      effectiveFrom: tomorrow,
      endDate: tomorrow,
    },
  })
  expect(res.status()).toBe(201)
  await page.reload()
  await expect(page.getByTestId('rest-day-banner')).toBeVisible()
  await expect(page.getByTestId('today-overall-pct')).toHaveText('Rest day: no goal today')
  await expect(page.getByTestId('rest-day-quick-complete').first()).toBeDisabled()
  await expect(page.getByTestId('rest-day-picker')).toContainText('Quick Complete is not available for this exercise today')
})
