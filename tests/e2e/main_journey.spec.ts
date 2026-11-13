import { expect, test, type Page } from '@playwright/test'

// TEST-25 (AC-25, Main Journey), issue #20. Real API + real PostgreSQL + the seed; nothing is mocked.
//
// Manager creates a template -> Participant logs in -> selects the template (3 x 10, weight 4)
// -> records 1 set / 10 reps -> Quick Complete -> progress 100% -> logout, login again -> values persist.
//
// Preconditions: the API behind the dev server points at a seeded database (`pnpm prisma db seed`);
// SEED_MANAGER_PASSWORD / SEED_PARTICIPANT_PASSWORD match the seed (defaults to `change-me`, as in .env.example).
//
// Shared database, so this test must not disturb the others:
// - It uses Alice. validation_feedback.spec.ts (TEST-23-3) needs Bob to have NO plan item for today
//   (a Rest Day that still lists exercises); a journey item for Bob would break it.
// - The plan item ends today (End date = today), so it never counts toward a later day's progress and a
//   re-run on a later day needs no reseed. The template is deleted at the end (participant snapshots are
//   unaffected by design, F-03 / AC-27) if the test reaches that step.
// - "Progress 100%" is asserted for the journey's exercise (item ratio === 1 from GET /api/progress/daily and
//   the 100% card in History). Alice may hold other items today (validation_feedback.spec.ts adds some), so
//   the day's overall percentage is NOT required to be 100; the UI's overall must equal the API's overall.
const MANAGER = { email: 'manager@exercise.test', password: process.env.SEED_MANAGER_PASSWORD ?? 'change-me' }
const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }

// After logout the app navigates to /login, and the route guard then forwards a signed-out visitor to /welcome.
const LOGGED_OUT = /\/(login|welcome)$/

async function login(page: Page, who: { email: string; password: string }, landing: RegExp) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(who.email)
  await page.getByTestId('login-password').fill(who.password)
  await page.getByTestId('login-submit').click()
  // Allow for a cold API / Vite start (same allowance as library_ui.spec.ts).
  await expect(page).toHaveURL(landing, { timeout: 20_000 })
}

type DailyItem = { name: string; ratio: number }
type Daily = { items: DailyItem[]; overallPercent: number | null }

async function dailyProgress(page: Page): Promise<Daily> {
  const token = await page.evaluate(() => sessionStorage.getItem('bunnyfit.token'))
  const res = await page.request.get('/api/progress/daily', { headers: { Authorization: `Bearer ${token}` } })
  expect(res.status()).toBe(200)
  return (await res.json()) as Daily
}

test('AC-25 (Main Journey): template -> plan 3x10 weight 4 -> record 1x10 -> Quick Complete -> 100% -> relogin keeps it', async ({
  page,
}) => {
  const name = `E2E Journey ${Date.now().toString(36)}`

  // 1. Manager creates a BODYWEIGHT_REPS template.
  await login(page, MANAGER, /\/manager\/library$/)
  await page.getByTestId('template-new').click()
  await expect(page.getByTestId('tpl-category').locator('option')).not.toHaveCount(1)
  await page.getByTestId('tpl-category').selectOption({ index: 1 })
  await page.getByTestId('tpl-name').fill(name)
  await page.getByTestId('tpl-body-part').fill('Core')
  await page.getByTestId('tpl-mode').selectOption('BODYWEIGHT_REPS')
  await page.getByTestId('tpl-met').fill('3.5')
  await page.getByTestId('tpl-save').click()
  await expect(page).toHaveURL(/\/manager\/library$/)
  await expect(page.locator('[data-testid^="template-row-"]', { hasText: name })).toBeVisible()
  await page.getByTestId('logout-button').click()
  await expect(page).toHaveURL(LOGGED_OUT)

  // 2. Participant logs in and adds the template with 3 sets x 10 reps, priority weight 4, ending today.
  await login(page, PARTICIPANT, /\/today$/)
  await page.goto('/plan?add=1')
  await expect(page.getByTestId('add-exercise-dialog')).toBeVisible()
  await page.getByTestId('picker-search').fill(name)
  await page.locator('[data-testid^="template-card-"]', { hasText: name }).click()
  await page.getByTestId('target-sets').fill('3')
  await page.getByTestId('target-reps').fill('10')
  await page.getByTestId('priority-4').check()
  // The start date defaults to today (the business date); end the item on the same day.
  const today = await page.getByTestId('plan-start').inputValue()
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await page.getByTestId('plan-end').fill(today)
  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('add-exercise-dialog')).toHaveCount(0)
  const planCard = page.locator('[data-testid^="plan-item-"]', { hasText: name })
  await expect(planCard).toBeVisible()
  await expect(planCard).toContainText('Priority 4')
  await expect(planCard).toContainText('3 × 10 reps')

  // 3. Today: record 1 set x 10 reps -> 10 of 30 reps = 33%.
  await page.goto('/today')
  const card = page.locator('[data-testid^="item-"]', { hasText: name }).first()
  await expect(card).toBeVisible()
  await card.getByTestId('item-log').click()
  await page.getByTestId('log-sets').fill('1')
  await page.getByTestId('log-reps').fill('10')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('log-dialog')).toHaveCount(0)
  await expect(card.getByTestId('item-pct')).toHaveText('33%')

  // 4. Quick Complete -> the item reaches 100% (server value), the finished card sits under History.
  await card.getByTestId('item-quick-complete').click()
  await expect.poll(async () => (await dailyProgress(page)).items.find((i) => i.name === name)?.ratio).toBe(1)
  await page.getByTestId('history-toggle').click()
  await expect(
    page.locator('[data-testid^="item-"]', { hasText: name }).first().getByTestId('item-pct'),
  ).toHaveText('100%')

  // 5. Logout, login again: the values persist (server-side, not client state).
  await page.getByTestId('logout-button').click()
  await expect(page).toHaveURL(LOGGED_OUT)
  await login(page, PARTICIPANT, /\/today$/)
  const after = await dailyProgress(page)
  expect(after.items.find((i) => i.name === name)?.ratio).toBe(1)
  if (after.overallPercent !== null) {
    await expect(page.getByTestId('today-overall-pct')).toContainText(String(Math.round(after.overallPercent)))
  }
  await page.getByTestId('history-toggle').click()
  await expect(
    page.locator('[data-testid^="item-"]', { hasText: name }).first().getByTestId('item-pct'),
  ).toHaveText('100%')

  // Cleanup: remove the template (Manager); the participant's snapshot is untouched by design.
  await page.getByTestId('logout-button').click()
  await login(page, MANAGER, /\/manager\/library$/)
  await page
    .locator('[data-testid^="template-row-"]', { hasText: name })
    .getByRole('button', { name: 'Delete' })
    .click()
  await page.getByTestId('delete-confirm').click()
  await expect(page.locator('[data-testid^="template-row-"]', { hasText: name })).toHaveCount(0)
})
