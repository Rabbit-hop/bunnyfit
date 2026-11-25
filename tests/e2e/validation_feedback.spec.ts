import { PrismaClient } from '@prisma/client'
import { expect, test, type Page } from '@playwright/test'

// TEST-23 (AC-23, NFR-03): the UI shows an error notice that names the field and the limit.
// Sprint 1 cases per F-04 §8: TEST-23-1 (sets 21), TEST-23-2 (LOG_DATE_MISMATCH notice),
// TEST-23-3 (Quick Complete disabled on a Rest Day). The F-05 cases (Sprint 2) TEST-23-5..8 and
// `F-05 R11 (UI)` follow TEST-23-4 (weight, Profile screen S-07) at the end of this file.
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
  // Login can still be pending after 5 s on a cold API/Vite start (same allowance as library_ui.spec.ts).
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 })
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
  // AC-23: the notice names the field and the limit (server message: "cumulative sets ≤ 20").
  await expect(page.getByTestId('field-error-sets')).toContainText(/sets.*20/i)
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
  // Bob only gets plan items that start in the future, so for him today is a Rest Day that still has exercises.
  // The item is far ahead (not "tomorrow") because this test cannot delete it: a one-day offset would make
  // the leftover from every earlier run active on the next day and break the Rest Day. Assumption kept
  // visible: Bob must have NO plan item that applies today (seed gives him none).
  const headers = await loginAs(page, OTHER_PARTICIPANT)
  const plan = await page.request.get('/api/plan', { headers })
  const today: string = (await plan.json()).date
  const next = new Date(`${today}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 365)
  const startsLater = next.toISOString().slice(0, 10)
  const restName = uniqueName('E2E Rest')
  const res = await page.request.post('/api/plan-items', {
    headers,
    data: {
      source: 'CUSTOM',
      exercise: { name: restName, targetBodyPart: 'Legs', trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'WALKING' },
      priorityWeight: 2,
      targetDistanceKm: 2,
      effectiveFrom: startsLater,
      endDate: startsLater,
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

// ---- Profile cases (Sprint 2, F-04 §8 TEST-23-4 and S-07 of ui-spec.md; issue #71) -------------------------------------
// Rows the profile tests append are removed again through Prisma (the API has no delete, by design), so the seeded
// weight history stays as the other suites expect (Alice 4 rows, Bob none).

async function withWeightCleanup(email: string, body: (userId: string) => Promise<void>) {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } })
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    const keep = (await prisma.weightLog.findMany({ where: { userId: user.id }, select: { id: true } })).map((r) => r.id)
    try {
      await body(user.id)
    } finally {
      await prisma.weightLog.deleteMany({ where: { userId: user.id, id: { notIn: keep } } })
    }
  } finally {
    await prisma.$disconnect()
  }
}

async function weightRows(page: Page, headers: Record<string, string>) {
  return (await (await page.request.get('/api/profile', { headers })).json()) as { currentWeightKg: number | null; weightEffectiveDate: string | null }
}

// Both profile tests change or read Alice's weight, so they run one after the other (the file otherwise runs in parallel).
test.describe('Profile (S-07)', () => {
  test.describe.configure({ mode: 'serial' })

  test('TEST-23-4 (AC-23): 900 kg on the Profile screen shows an error naming weightKg and the 1-800 limit, keeps the value and saves nothing', async ({ page }) => {
    await withWeightCleanup(PARTICIPANT.email, async (userId) => {
      const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } })
      try {
        const headers = await loginAs(page, PARTICIPANT)
        const before = await weightRows(page, headers)
        const countBefore = await prisma.weightLog.count({ where: { userId } })
        await page.goto('/profile')
        await expect(page.getByTestId('profile-page')).toBeVisible()
        await page.getByTestId('profile-weight-input').fill('900')
        await page.getByTestId('profile-save').click()
        await expect(page.getByTestId('field-error-weightKg')).toContainText(/weightKg.*1.*800/i)
        await expect(page.getByTestId('profile-weight-input')).toHaveValue('900')
        await expect(page.getByTestId('profile-toast')).toHaveCount(0)
        expect(await weightRows(page, headers)).toEqual(before)
        expect(await prisma.weightLog.count({ where: { userId } })).toBe(countBefore)
      } finally {
        await prisma.$disconnect()
      }
    })
  })

  test('S-07 (UI): a valid weight is saved, shown as the current weight with a toast; a Participant without weight sees the empty state', async ({ page }) => {
    await withWeightCleanup(PARTICIPANT.email, async () => {
      const headers = await loginAs(page, PARTICIPANT)
      await page.goto('/profile')
      await expect(page.getByTestId('profile-email')).toHaveText(PARTICIPANT.email)
      await expect(page.getByTestId('profile-current-weight')).toBeVisible()
      await page.getByTestId('profile-weight-input').fill('68.5')
      await page.getByTestId('profile-save').click()
      await expect(page.getByTestId('profile-toast')).toBeVisible()
      await expect(page.getByTestId('profile-current-weight')).toContainText('68.5')
      expect((await weightRows(page, headers)).currentWeightKg).toBe(68.5)
    })
    // Bob has no WeightLog row in the seed: nothing is saved here, so nothing needs cleaning up.
    await page.evaluate(() => sessionStorage.clear()) // drop Alice's session so the login page is shown
    await loginAs(page, OTHER_PARTICIPANT)
    await page.goto('/profile')
    await expect(page.getByTestId('profile-no-weight')).toContainText('No weight set')
    await expect(page.getByTestId('profile-no-weight')).toContainText('Needed to estimate calories')
  })
})

// ---- F-05 cases (Sprint 2, docs/sprints/sprint-2/F-05-entry-modification.md §8) ----------------------------------------
// The target is large (4 x 200 = 800 reps) so a card with a few entries is not complete and stays on Today
// (completed cards move behind the History button).

async function createRepsExercise(page: Page, headers: Record<string, string>, name: string) {
  const res = await page.request.post('/api/plan-items', {
    headers,
    data: {
      source: 'CUSTOM',
      exercise: { name, targetBodyPart: 'Legs', trackingMode: 'BODYWEIGHT_REPS' },
      priorityWeight: 2,
      targetSets: 4,
      targetRepsPerSet: 200,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { userExercise: { id: string } }).userExercise.id
}

async function postEntry(page: Page, headers: Record<string, string>, userExerciseId: string, sets: number, totalReps: number) {
  const res = await page.request.post('/api/entries', { headers, data: { userExerciseId, sets, totalReps } })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { entry: { id: string } }).entry.id
}

async function entriesOf(page: Page, headers: Record<string, string>, userExerciseId: string) {
  const day = (await (await page.request.get('/api/entries', { headers })).json()) as {
    entries: { id: string; userExerciseId: string; sets: number; totalReps: number; logDate: string }[]
  }
  return day.entries.filter((e) => e.userExerciseId === userExerciseId)
}

test('TEST-23-5 (AC-23, third case): an ENTRY_NOT_EDITABLE rejection of an edit shows the notice, reports no success and leaves the entry', async ({ page }) => {
  const headers = await loginAs(page, PARTICIPANT)
  const name = uniqueName('E2E Edit')
  const exerciseId = await createRepsExercise(page, headers, name)
  await postEntry(page, headers, exerciseId, 2, 20)
  await page.reload()
  // The browser cannot make the server's date differ from the page's, so the rejection is injected on the wire
  // (same status, code and envelope as F-05 §4.4), like TEST-23-2. The request never reaches the server, so
  // "no row changed" is shown by TEST-23-6 with a real forced request.
  await page.route('**/api/entries/*', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'ENTRY_NOT_EDITABLE', message: 'Only entries dated today can be edited or deleted.', fields: [] }),
    })
  })
  const card = page.getByRole('listitem').filter({ hasText: name })
  await card.getByTestId('item-entries-toggle').click()
  await expect(card.getByTestId('item-entries')).toContainText('20 reps')
  await card.getByTestId('entry-edit').click()
  await page.getByTestId('entry-edit-sets').fill('3')
  await page.getByTestId('entry-edit-total-reps').fill('30')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('entry-notice')).toContainText("Only today's entries can be edited or deleted; this entry is not from today.")
  await expect(page.getByTestId('entry-edit-form')).toHaveCount(0)
  await expect(page.getByTestId('today-toast')).toHaveCount(0)
  await expect(card.getByTestId('item-entries')).toContainText('20 reps')
  await expect(card.getByTestId('item-entries')).not.toContainText('30 reps')
})

test('TEST-23-6 (AC-23, third case): a forced PUT and DELETE of an old entry are refused by the real API and change nothing', async ({ page }) => {
  const headers = await loginAs(page, PARTICIPANT)
  const name = uniqueName('E2E Old')
  const exerciseId = await createRepsExercise(page, headers, name)
  const today: string = (await (await page.request.get('/api/plan', { headers })).json()).date
  const yesterday = new Date(`${today}T00:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } })
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: PARTICIPANT.email } })
    // No icon exists for an old entry (Today lists today only), so it is inserted by the test setup.
    const old = await prisma.ledgerEntry.create({
      data: { userId: user.id, userExerciseId: exerciseId, logDate: yesterday, sets: 2, totalReps: 20, kind: 'MANUAL' },
    })
    try {
      const before = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: old.id } })
      const put = await page.request.put(`/api/entries/${old.id}`, { headers, data: { sets: 3, totalReps: 30 } })
      expect(put.status()).toBe(409)
      expect((await put.json()).code).toBe('ENTRY_NOT_EDITABLE')
      const del = await page.request.delete(`/api/entries/${old.id}`, { headers })
      expect(del.status()).toBe(409)
      expect((await del.json()).code).toBe('ENTRY_NOT_EDITABLE')
      expect(await prisma.ledgerEntry.findUnique({ where: { id: old.id } })).toEqual(before)
    } finally {
      await prisma.ledgerEntry.deleteMany({ where: { id: old.id } })
    }
  } finally {
    await prisma.$disconnect()
  }
})

test('TEST-23-7 (AC-23, UI element): edit and delete icons on today\'s entries; sets 21 shows the field error, delete removes only that entry', async ({ page }) => {
  const headers = await loginAs(page, PARTICIPANT)
  const name = uniqueName('E2E Two')
  const exerciseId = await createRepsExercise(page, headers, name)
  await postEntry(page, headers, exerciseId, 2, 20)
  const second = await postEntry(page, headers, exerciseId, 1, 8)
  await page.reload()
  const card = page.getByRole('listitem').filter({ hasText: name })
  await card.getByTestId('item-entries-toggle').click()
  await expect(card.getByTestId('entry-edit')).toHaveCount(2)
  await expect(card.getByTestId('entry-delete')).toHaveCount(2)

  // Edit the first entry to 21 sets: the field error names the field and the limit; nothing changes (as TEST-23-1).
  await card.getByTestId('entry-edit').first().click()
  await page.getByTestId('entry-edit-sets').fill('21')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('field-error-sets')).toContainText(/sets.*20/i)
  await expect(page.getByTestId('entry-edit-sets')).toHaveValue('21')
  await page.getByTestId('log-cancel').click()
  let rows = await entriesOf(page, headers, exerciseId)
  expect(rows.map((r) => [r.sets, r.totalReps])).toEqual([[2, 20], [1, 8]])

  // Delete the second entry with the confirmation: only that row goes.
  await card.getByTestId('entry-delete').nth(1).click()
  await page.getByTestId('entry-delete-confirm').click()
  await expect(card.getByTestId('entry-delete')).toHaveCount(1)
  rows = await entriesOf(page, headers, exerciseId)
  expect(rows.map((r) => r.id)).not.toContain(second)
  expect(rows.map((r) => [r.sets, r.totalReps])).toEqual([[2, 20]])
  await expect(card.getByTestId('item-actual')).toContainText('20 reps')
})

test('TEST-23-8 (AC-23, edit form): an entry of 4 sets / 799 reps opens with Sets 4 and Total reps 799 and saves unchanged', async ({ page }) => {
  const headers = await loginAs(page, PARTICIPANT)
  const name = uniqueName('E2E Odd')
  const exerciseId = await createRepsExercise(page, headers, name)
  // F-05 §8 names a Quick Complete-style entry; a manual entry of the same shape (4 / 799, valid under
  // totalReps <= sets x 200) is used because the E2E setup creates rows through the API only. The form
  // behaviour under test depends on the stored numbers, not on `kind`.
  await postEntry(page, headers, exerciseId, 4, 799)
  await page.reload()
  const card = page.getByRole('listitem').filter({ hasText: name })
  await card.getByTestId('item-entries-toggle').click()
  await card.getByTestId('entry-edit').click()
  await expect(page.getByTestId('entry-edit-sets')).toHaveValue('4')
  await expect(page.getByTestId('entry-edit-total-reps')).toHaveValue('799')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('entry-edit-form')).toHaveCount(0)
  const rows = await entriesOf(page, headers, exerciseId)
  expect(rows.map((r) => [r.sets, r.totalReps])).toEqual([[4, 799]])
})

test('F-05 R11 (UI): on a real Rest Day card the unscored entry has edit and delete buttons that work', async ({ page }) => {
  // Same Bob / far-future plan item setup as TEST-23-3 (today is a Rest Day for Bob). R11 is covered at API
  // level by TEST-05a-6; this checks the buttons on the Rest Day card itself.
  const headers = await loginAs(page, OTHER_PARTICIPANT)
  const today: string = (await (await page.request.get('/api/plan', { headers })).json()).date
  const next = new Date(`${today}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 365)
  const startsLater = next.toISOString().slice(0, 10)
  const name = uniqueName('E2E RestEdit')
  const created = await page.request.post('/api/plan-items', {
    headers,
    data: {
      source: 'CUSTOM',
      exercise: { name, targetBodyPart: 'Legs', trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'WALKING' },
      priorityWeight: 2,
      targetDistanceKm: 2,
      effectiveFrom: startsLater,
      endDate: startsLater,
    },
  })
  expect(created.status()).toBe(201)
  const exerciseId = ((await created.json()) as { userExercise: { id: string } }).userExercise.id
  const posted = await page.request.post('/api/entries', { headers, data: { userExerciseId: exerciseId, distanceKm: 1 } })
  expect(posted.status()).toBe(201)
  await page.reload()
  await expect(page.getByTestId('rest-day-banner')).toBeVisible()

  const card = page.getByTestId(`rest-${exerciseId}`)
  await card.getByTestId('rest-day-entries-toggle').click()
  await expect(card.getByTestId('entry-edit')).toHaveCount(1)
  await expect(card.getByTestId('entry-delete')).toHaveCount(1)

  await card.getByTestId('entry-edit').click()
  await expect(page.getByTestId('log-distance')).toHaveValue('1')
  await page.getByTestId('log-distance').fill('1.5')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('entry-edit-form')).toHaveCount(0)
  expect((await entriesOf(page, headers, exerciseId)).map((r) => (r as unknown as { distanceKm: number }).distanceKm)).toEqual([1.5])

  await card.getByTestId('entry-delete').click()
  await page.getByTestId('entry-delete-confirm').click()
  await expect(card.getByTestId('entry-delete')).toHaveCount(0)
  expect(await entriesOf(page, headers, exerciseId)).toHaveLength(0)
})
