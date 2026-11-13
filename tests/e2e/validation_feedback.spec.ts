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

// Ledger rows the real API holds today for the exercise snapshot with this name (STS "no row added").
async function ledgerFor(page: Page, headers: Record<string, string>, name: string) {
  const exercises = (await (await page.request.get('/api/user-exercises', { headers })).json()) as { id: string; name: string }[]
  const exercise = exercises.find((e) => e.name === name)
  expect(exercise, `snapshot "${name}" exists`).toBeTruthy()
  const day = (await (await page.request.get('/api/entries', { headers })).json()) as { entries: { userExerciseId: string }[] }
  return { exerciseId: exercise!.id, rows: day.entries.filter((e) => e.userExerciseId === exercise!.id).length }
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
  expect((await ledgerFor(page, headers, name)).rows).toBe(0)
  const card = page.getByRole('listitem').filter({ hasText: name })
  await card.getByTestId('item-log').click()
  await page.getByTestId('log-sets').fill('21')
  await page.getByTestId('log-reps').fill('1')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('field-error-sets')).toContainText('20')
  await expect(page.getByTestId('log-dialog')).toBeVisible()
  await expect(page.getByTestId('log-sets')).toHaveValue('21')
  // STS TEST-23-1: no row added (the request reached the real server and was rejected).
  expect((await ledgerFor(page, headers, name)).rows).toBe(0)
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
  const restName = uniqueName('E2E Rest')
  const res = await page.request.post('/api/plan-items', {
    headers,
    data: {
      source: 'CUSTOM',
      exercise: { name: restName, targetBodyPart: 'Legs', trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'WALKING' },
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

  // STS TEST-23-3: a forced request (the UI control is disabled, so it is sent straight to the real API)
  // is rejected with QUICK_COMPLETE_NOT_AVAILABLE and adds no row.
  const before = await ledgerFor(page, headers, restName)
  expect(before.rows).toBe(0)
  const forced = await page.request.post('/api/entries/quick-complete', { headers, data: { userExerciseId: before.exerciseId } })
  expect(forced.status()).toBe(400)
  expect((await forced.json()).code).toBe('QUICK_COMPLETE_NOT_AVAILABLE')
  expect((await ledgerFor(page, headers, restName)).rows).toBe(0)
})

test('TEST-23-3 (AC-23): a Quick Complete rejected with QUICK_COMPLETE_NOT_AVAILABLE shows the notice on the card', async ({ page }) => {
  // The Rest Day control is disabled and has no click handler, so the notice text cannot be reached from
  // there. The only UI path that renders it is a Quick Complete the server rejects: the rejection is
  // injected on the wire (same status, code and envelope as API spec §6.2), like TEST-23-2.
  const headers = await loginAs(page, PARTICIPANT)
  const name = uniqueName('E2E Quick')
  const res = await page.request.post('/api/plan-items', {
    headers,
    data: {
      source: 'CUSTOM',
      exercise: { name, targetBodyPart: 'Legs', trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'WALKING' },
      priorityWeight: 2,
      targetDistanceKm: 3,
    },
  })
  expect(res.status()).toBe(201)
  await page.reload()
  await page.route('**/api/entries/quick-complete', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'QUICK_COMPLETE_NOT_AVAILABLE', message: 'not available today', fields: [] }),
    })
  })
  const card = page.getByRole('listitem').filter({ hasText: name })
  await card.getByTestId('item-quick-complete').click()
  await expect(card).toContainText('Quick Complete is not available for this exercise today')
  await expect(card.getByTestId('item-quick-complete')).toHaveText('Quick Complete')
})
