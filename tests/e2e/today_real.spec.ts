import { expect, test, type Page } from '@playwright/test'

// Supplementary UI coverage for issue #10 phase 2: Today (S-02) and Log Entry (S-03) against the REAL
// API and DB (no ?mock=). Each test creates its own uniquely named plan item through the API and only
// asserts on that card, so leftover rows from earlier runs do not matter. Not TEST-23 / TEST-25.
const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }

async function loginAndPlan(page: Page, targetKm: number) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(PARTICIPANT.email)
  await page.getByTestId('login-password').fill(PARTICIPANT.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/today$/)
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

// --- AC-23 (Sprint 1 UI cases) and Rest Day against the real API -------------------------------
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

test('AC-23 case 1 (UI): sets 21 is rejected by the server, the field error names the limit and keeps the value', async ({ page }) => {
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

test('AC-23 case 2 (UI): LOG_DATE_MISMATCH closes the dialog and shows a reload notice', async ({ page }) => {
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

test('AC-23 case 3 / AC-04b (UI): on a real Rest Day Quick Complete is disabled with an explanation', async ({ page }) => {
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

test('Week row (real API): yesterday opens read-only from GET /api/progress/daily?date=, then Back to today', async ({ page }) => {
  await loginAs(page, PARTICIPANT)
  await expect(page.getByTestId('today-skeleton')).toHaveCount(0)
  const todayIso = (await page.getByTestId('today-date').getAttribute('data-date'))!
  const prev = new Date(`${todayIso}T00:00:00Z`)
  prev.setUTCDate(prev.getUTCDate() - 1)
  const yesterday = prev.toISOString().slice(0, 10)
  // Yesterday may be in the previous week: the arrow moves a week back, then the day button is clickable.
  const dayButton = page.getByTestId(`today-day-${yesterday}`)
  if ((await dayButton.count()) === 0) await page.getByTestId('today-week-prev').click()
  const responded = page.waitForResponse((r) => r.url().includes(`/api/progress/daily?date=`) && r.status() === 200)
  await page.getByTestId(`today-day-${yesterday}`).click()
  await responded
  await expect(page.getByTestId('today-readonly')).toBeVisible()
  await expect(page.getByTestId('today-date')).toHaveAttribute('data-date', yesterday)
  await expect(page.getByTestId('item-quick-complete')).toHaveCount(0)
  await expect(page.getByTestId('rest-day-quick-complete')).toHaveCount(0)
  await page.getByTestId('today-back').click()
  await expect(page.getByTestId('today-date')).toHaveAttribute('data-date', todayIso)
})

// --- PR #37 review follow-ups ---------------------------------------------------------------

test('Past day that fails to load keeps the heading and the week row, and today is one tap away', async ({ page }) => {
  await loginAs(page, PARTICIPANT)
  await expect(page.getByTestId('today-skeleton')).toHaveCount(0)
  const todayIso = (await page.getByTestId('today-date').getAttribute('data-date'))!
  await page.route('**/api/progress/daily?date=*', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Internal server error', fields: [] }) }),
  )
  await page.getByTestId('today-week-prev').click()
  await expect(page.getByTestId('today-retry')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Past day' })).toBeVisible()
  await expect(page.getByTestId('today-week')).toBeVisible()
  await page.unroute('**/api/progress/daily?date=*')
  // The previous week is shown, so the way back is the next-week arrow (it never goes past today).
  await page.getByTestId('today-week-next').click()
  await expect(page.getByTestId('today-date')).toHaveAttribute('data-date', todayIso)
  await expect(page.getByTestId('today-readonly')).toHaveCount(0)
})

test('Log dialog: the helper shows the daily limit left, not the target (entries above the target are allowed)', async ({ page }) => {
  const card = await loginAndPlan(page, 2)
  await card.getByTestId('item-quick-complete').click()
  await expect(card.getByTestId('item-actual')).toContainText('2 km of 2 km')
  await card.getByTestId('item-log').click()
  await expect(page.getByTestId('log-remaining')).toContainText('Daily limit left: 98 km')
})
