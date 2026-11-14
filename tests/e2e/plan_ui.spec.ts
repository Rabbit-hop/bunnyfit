import { expect, test, type Page } from '@playwright/test'
import { addMonths } from '../../web/src/lib/dates.js'

// Supplementary UI coverage for issue #9 (F-03 S-04/S-05). Not the RTM artifact for
// AC-03a-c / AC-11 (tests/integration/goal_config.test.ts, tests/unit/boundary_validation.test.ts)
// and not TEST-25 (main_journey.spec.ts). Runs against the real API and seed.
// PlanItem rows are append-only (no delete endpoint), so created items start tomorrow and end the
// same day: they never occur "today" and do not change the seeded participant's Today screen.
const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }

async function loginAsParticipant(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(PARTICIPANT.email)
  await page.getByTestId('login-password').fill(PARTICIPANT.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 })
  await page.goto('/plan')
  await expect(page.getByTestId('plan-page')).toBeVisible()
}

/** Server "today" is the start-date default; tomorrow = string/UTC arithmetic on that value. */
async function setTomorrow(page: Page) {
  const today = await page.getByTestId('plan-start').inputValue()
  const next = new Date(`${today}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const tomorrow = next.toISOString().slice(0, 10)
  await page.getByTestId('plan-start').fill(tomorrow)
  await page.getByTestId('plan-end').fill(tomorrow)
}

test('S-04/S-05 (UI): add a custom distance exercise; it appears in My Plan with a toast', async ({ page }) => {
  const name = `E2E Walk ${Date.now().toString(36)}`
  await loginAsParticipant(page)

  await page.getByTestId('plan-add').click()
  await expect(page.getByTestId('add-exercise-dialog')).toBeVisible()
  await page.getByTestId('tab-custom').click()
  await page.getByTestId('custom-name').fill(name)
  await page.getByTestId('custom-body-part').fill('Legs')
  await page.getByTestId('custom-mode').selectOption('CARDIO_DISTANCE')
  await page.getByTestId('custom-cardio').selectOption('WALKING')
  await page.getByTestId('target-distance').fill('3.5')
  await page.getByTestId('priority-2').check()
  await setTomorrow(page)
  await expect(page.getByTestId('plan-summary')).toContainText('3.5 km')

  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('add-exercise-dialog')).toHaveCount(0)
  await expect(page.getByTestId('plan-toast')).toContainText(name)
  const card = page.locator('[data-testid^="plan-item-"]', { hasText: name })
  await expect(card).toContainText('3.5 km')
  await expect(card).toContainText('Priority 2')
})

test('S-04 (UI): add from the library, target fields follow the mode', async ({ page }) => {
  await loginAsParticipant(page)
  // Count only after the list has loaded, otherwise `before` is read while the skeleton shows.
  await expect(page.getByTestId('plan-loading')).toHaveCount(0)
  // The list shows the selected day. Items created below start tomorrow, so look at tomorrow.
  const todayIso = await page.locator('[data-testid^="day-"][aria-pressed="true"]').getAttribute('data-date')
  const next = new Date(`${todayIso}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const tomorrowIso = next.toISOString().slice(0, 10)
  if ((await page.getByTestId(`day-${tomorrowIso}`).count()) === 0) await page.getByTestId('cal-next').click()
  await page.getByTestId(`day-${tomorrowIso}`).click()
  await expect(page.getByTestId('plan-loading')).toHaveCount(0)
  const before = await page.locator('[data-testid^="plan-item-"]').count()

  await page.getByTestId('plan-add').click()
  // The list keeps showing the unfiltered templates until the filtered response arrives, so wait for it;
  // otherwise `.first()` can be a template of another mode (seen as a failure when the suite runs in parallel).
  const filtered = page.waitForResponse((r) => r.url().includes('/api/templates') && r.url().includes('trackingMode=BODYWEIGHT_REPS'))
  await page.getByTestId('picker-mode').selectOption('BODYWEIGHT_REPS')
  await filtered
  const card = page.locator('[data-testid^="template-card-"]').first()
  await expect(card).toBeVisible()
  await card.click()
  await expect(page.getByTestId('target-sets')).toBeVisible()
  await expect(page.getByTestId('target-load')).toHaveCount(0)
  await expect(page.getByTestId('range-helper')).toContainText('Allowed range')
  await page.getByTestId('target-sets').fill('2')
  await page.getByTestId('target-reps').fill('5')
  // Switch off one weekday, but never tomorrow's own, or the item would not occur on the day we watch.
  const tomorrowWeekday = next.getUTCDay() === 0 ? 7 : next.getUTCDay()
  await page.getByTestId(`repeat-day-${tomorrowWeekday === 6 ? 5 : 6}`).uncheck()
  await setTomorrow(page)
  await expect(page.getByTestId('plan-summary')).toContainText('2 × 5 reps')

  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('plan-toast')).toBeVisible()
  // Tests run in parallel and the other one also adds an item for tomorrow, so "grew" rather than "+1".
  await expect.poll(() => page.locator('[data-testid^="plan-item-"]').count()).toBeGreaterThan(before)
})

test('AC-03b/AC-11 (UI): an out-of-range duration shows an inline error and keeps the dialog open', async ({ page }) => {
  await loginAsParticipant(page)
  await page.getByTestId('plan-add').click()
  await page.getByTestId('tab-custom').click()
  await page.getByTestId('custom-name').fill(`E2E Bad ${Date.now().toString(36)}`)
  await page.getByTestId('custom-body-part').fill('Core')
  await page.getByTestId('custom-mode').selectOption('BODYWEIGHT_TIME')
  await page.getByTestId('target-duration-min').fill('200')
  await page.getByTestId('plan-save').click()

  await expect(page.getByTestId('field-error-targetDurationSec')).toBeVisible()
  await expect(page.getByTestId('add-exercise-dialog')).toBeVisible()
  await expect(page.getByTestId('target-duration-min')).toHaveValue('200')
})

test('S-04 (UI): nothing is saved without choosing a template', async ({ page }) => {
  await loginAsParticipant(page)
  await page.getByTestId('plan-add').click()
  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('error-notice')).toContainText('Choose an exercise')
})

test('bottom bar: Today and My Plan link to their pages; Progress and Profile say they come in Sprint 2', async ({ page }) => {
  await loginAsParticipant(page)
  await page.goto('/today')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()

  await page.getByTestId('nav-plan').click()
  await expect(page).toHaveURL(/\/plan$/)
  await expect(page.getByTestId('plan-page')).toBeVisible()

  await page.getByTestId('nav-progress').click()
  await expect(page.getByTestId('nav-coming-soon')).toContainText('Sprint 2')
  await expect(page).toHaveURL(/\/plan$/)

  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('nav-coming-soon')).toContainText('Profile')
  await expect(page).toHaveURL(/\/plan$/)
})

test('calendar (UI): stepping months from the 31st returns to the 31st instead of drifting to the 28th', async ({ page }) => {
  await loginAsParticipant(page)
  await expect(page.getByTestId('plan-loading')).toHaveCount(0)
  // Any 31st shown in the 6-week grid (it also lists the neighbouring months' days).
  const cell = page.locator('[data-testid^="day-"][data-date$="-31"]').first()
  await expect(cell).toBeVisible()
  const start = (await cell.getAttribute('data-date')) as string
  await cell.click()

  const selected = () => page.locator('[data-testid^="day-"][aria-pressed="true"]').first().getAttribute('data-date')
  const one = addMonths(start, 1, 31)
  const two = addMonths(one, 1, 31)
  await page.getByTestId('cal-next').click()
  await expect.poll(selected).toBe(one)
  await page.getByTestId('cal-next').click()
  await expect.poll(selected).toBe(two)
  await page.getByTestId('cal-prev').click()
  await expect.poll(selected).toBe(one)
  await page.getByTestId('cal-prev').click()
  await expect.poll(selected).toBe(start)
})

test('S-04 (UI): a cleared or past start date is rejected before anything is sent', async ({ page }) => {
  await loginAsParticipant(page)
  await page.getByTestId('plan-add').click()
  await page.getByTestId('tab-custom').click()
  await page.getByTestId('custom-name').fill(`E2E Date ${Date.now().toString(36)}`)
  await page.getByTestId('custom-body-part').fill('Core')
  await page.getByTestId('target-sets').fill('2')
  await page.getByTestId('target-reps').fill('5')

  let posted = false
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/plan-items')) posted = true
  })
  await page.getByTestId('plan-start').fill('')
  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('field-error-effectiveFrom')).toContainText('start date')
  await page.getByTestId('plan-start').fill('2000-01-01')
  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('field-error-effectiveFrom')).toContainText('before today')
  expect(posted).toBe(false)
  await expect(page.getByTestId('add-exercise-dialog')).toBeVisible()
})

test('S-04 (UI): Esc and the close button ask before discarding typed input, and picking another template clears the target', async ({ page }) => {
  await loginAsParticipant(page)
  await page.getByTestId('plan-add').click()
  await expect(page.getByTestId('add-exercise-dialog')).toBeVisible()

  // Untouched form: Esc closes without a prompt.
  let prompts = 0
  page.on('dialog', async (d) => {
    prompts += 1
    await d.dismiss()
  })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('add-exercise-dialog')).toHaveCount(0)
  expect(prompts).toBe(0)

  // Typed input: Esc asks; dismissing keeps the dialog and the input.
  await page.getByTestId('plan-add').click()
  await page.getByTestId('tab-custom').click()
  await page.getByTestId('custom-name').fill('Keep me')
  await page.keyboard.press('Escape')
  await expect.poll(() => prompts).toBe(1)
  await expect(page.getByTestId('add-exercise-dialog')).toBeVisible()
  await expect(page.getByTestId('custom-name')).toHaveValue('Keep me')
  await page.getByTestId('add-exercise-close').click()
  await expect.poll(() => prompts).toBe(2)
  await expect(page.getByTestId('add-exercise-dialog')).toBeVisible()

  // Accepting the prompt closes it.
  page.removeAllListeners('dialog')
  page.on('dialog', (d) => void d.accept())
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('add-exercise-dialog')).toHaveCount(0)
})

test('S-04 (UI): picking another template clears the target values and old errors', async ({ page }) => {
  await loginAsParticipant(page)
  await page.getByTestId('plan-add').click()
  const cards = page.locator('[data-testid^="template-card-"]')
  await expect(cards.nth(1)).toBeVisible()
  await cards.nth(0).click()
  const targets = page.locator('input[data-testid^="target-"]')
  await expect(targets.first()).toBeVisible()
  for (const input of await targets.all()) await input.fill('99999')
  await page.getByTestId('plan-save').click()
  await expect(page.locator('[data-testid^="field-error-"]').first()).toBeVisible()

  await cards.nth(1).click()
  for (const input of await targets.all()) await expect(input).toHaveValue('')
  await expect(page.locator('[data-testid^="field-error-"]')).toHaveCount(0)
})

test('plan (UI): a tab that becomes visible after midnight moves "today" and the selected day forward', async ({ page }) => {
  let shiftTo = ''
  await page.route(/\/api\/plan(\?.*)?$/, async (route) => {
    try {
      const response = await route.fetch()
      if (!shiftTo) return await route.fulfill({ response })
      const body = await response.json()
      await route.fulfill({ response, json: { ...body, date: shiftTo } })
    } catch {
      // The page was closed while a request was in flight (test teardown).
    }
  })
  await loginAsParticipant(page)
  await expect(page.getByTestId('plan-loading')).toHaveCount(0)
  const selected = () => page.locator('[data-testid^="day-"][aria-pressed="true"]').first().getAttribute('data-date')
  const today = (await selected()) as string
  const next = new Date(`${today}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  shiftTo = next.toISOString().slice(0, 10)

  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  await expect.poll(selected).toBe(shiftTo)
  await expect(page.locator('.cal-day-today')).toHaveAttribute('data-date', shiftTo)
})

// --- PR #36 review follow-ups ---------------------------------------------------------------

test('Add dialog: after a failed template reload the notice replaces the old cards', async ({ page }) => {
  await loginAsParticipant(page)
  await page.getByTestId('plan-add').click()
  await expect(page.locator('[data-testid^="template-card-"]').first()).toBeVisible()
  await page.route('**/api/templates**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Internal server error', fields: [] }) }),
  )
  await page.getByTestId('picker-mode').selectOption('BODYWEIGHT_REPS')
  await expect(page.getByTestId('picker-retry')).toBeVisible()
  await expect(page.locator('[data-testid^="template-card-"]')).toHaveCount(0)
})

test('Calendar: clicking the date that is already selected resets the month-arrow anchor', async ({ page }) => {
  await loginAsParticipant(page)
  const todayIso = (await page.locator('[data-testid^="day-"][aria-pressed="true"]').getAttribute('data-date'))!
  const [y = 0, m = 1] = todayIso.split('-').map(Number)
  const ymd = (year: number, month0: number, day: number) => new Date(Date.UTC(year, month0, day)).toISOString().slice(0, 10)
  const daysIn = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  // A = first month from now on whose next month is shorter than 31 days (Jan, Mar, May, Aug, Oct); then B = A + 1, C = B + 2.
  const SHORT_NEXT = [0, 2, 4, 7, 9]
  let k = 0
  while (!SHORT_NEXT.includes((m - 1 + k) % 12)) k++
  for (let i = 0; i < k; i++) await page.getByTestId('cal-next').click()
  const a = (m - 1 + k)
  await page.getByTestId(ymdTestId(ymd(y, a, 31))).click()
  await page.getByTestId('cal-next').click() // 31st clamps to the last day of B, anchor stays 31
  const bLast = daysIn(y, a + 1)
  await expect(page.getByTestId(ymdTestId(ymd(y, a + 1, bLast)))).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId(ymdTestId(ymd(y, a + 1, bLast))).click() // same date again: a deliberate choice
  await page.getByTestId('cal-next').click()
  // The anchor was forgotten, so the step keeps B's last day instead of jumping back to the 31st.
  await expect(page.getByTestId(ymdTestId(ymd(y, a + 2, Math.min(bLast, daysIn(y, a + 2)))))).toHaveAttribute('aria-pressed', 'true')
})

const ymdTestId = (iso: string) => `day-${iso}`
