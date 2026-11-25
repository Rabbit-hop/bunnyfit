import { expect, test, type Page, type Route } from '@playwright/test'

// Supplementary UI coverage for S-06 Monthly Progress (ui-spec S-06, F-06 §6 month card, issue #75 Part 1).
// Not RTM evidence for AC-15: the monthly average is proven by tests/integration/progress_api.test.ts and
// tests/unit/progress_calc.test.ts. Login is real. The first tests answer GET /api/progress/monthly and
// /daily with fixed bodies (page.route) so every display state is on screen whatever today's date is;
// the last test uses the real API and seed.
const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }

const NOVEMBER = {
  month: '2026-11',
  from: '2026-11-03',
  to: '2026-11-05',
  targetedDays: 2,
  restDaysExcluded: 1,
  averagePercent: 64.25,
  days: [
    { date: '2026-11-03', isRestDay: false, overallPercent: 82 },
    { date: '2026-11-04', isRestDay: true, overallPercent: null },
    { date: '2026-11-05', isRestDay: false, overallPercent: 46.5 },
  ],
}
const OCTOBER = { month: '2026-10', from: '2026-10-01', to: '2026-10-31', targetedDays: 0, restDaysExcluded: 4, averagePercent: null, days: [] }
const DAILY_NOV_3 = {
  date: '2026-11-03',
  isRestDay: false,
  items: [
    { planItemId: 'p1', userExerciseId: 'ue-squat', name: 'Squat', trackingMode: 'BODYWEIGHT_REPS', unit: 'reps', priorityWeight: 3, target: 40, actual: 30, ratio: 0.75, itemScore: 2.25 },
  ],
  totalScore: 2.25,
  totalWeight: 3,
  overallPercent: 75,
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(PARTICIPANT.email)
  await page.getByTestId('login-password').fill(PARTICIPANT.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 })
}

/** Fixed monthly/daily answers; every request is recorded so the test can check what the screen asked for. */
async function mockProgress(page: Page, requested: string[]) {
  await page.route('**/api/progress/monthly**', async (route: Route) => {
    const month = new URL(route.request().url()).searchParams.get('month')
    requested.push(month ?? '(default)')
    await route.fulfill({ json: month === '2026-10' ? OCTOBER : NOVEMBER })
  })
  await page.route('**/api/progress/daily**', async (route: Route) => {
    requested.push(`daily ${new URL(route.request().url()).searchParams.get('date')}`)
    await route.fulfill({ json: DAILY_NOV_3 })
  })
}

test('S-06: the Progress button opens the screen; month card shows the average and the counted and excluded days', async ({ page }) => {
  const requested: string[] = []
  await login(page)
  await mockProgress(page, requested)
  await page.getByTestId('nav-progress').click()
  await expect(page).toHaveURL(/\/progress$/)
  await expect(page.getByTestId('month-title')).toHaveText('November 2026')
  await expect(page.getByTestId('month-average')).toHaveText('64.3%')
  await expect(page.getByTestId('month-detail')).toHaveText('2 targeted days counted, 1 rest day excluded')
  // The first monthly request lets the server choose the month (server date, never the browser clock). Only monthly
  // requests are checked: Today's own GET /api/progress/daily can still be in flight after login and is recorded too.
  expect(requested.filter((r) => !r.startsWith('daily '))[0]).toBe('(default)')
})

test('S-06: day states (TARGETED percentage, REST, FUTURE disabled, before the plan disabled) and no next month past the current one', async ({ page }) => {
  const requested: string[] = []
  await login(page)
  await mockProgress(page, requested)
  await page.goto('/progress')
  await expect(page.getByTestId('month-day-2026-11-03')).toHaveAttribute('data-state', 'TARGETED')
  await expect(page.getByTestId('month-day-2026-11-03')).toContainText('82%')
  await expect(page.getByTestId('month-day-2026-11-04')).toHaveAttribute('data-state', 'REST')
  await expect(page.getByTestId('month-day-2026-11-04')).toContainText('Rest')
  await expect(page.getByTestId('month-day-2026-11-06')).toHaveAttribute('data-state', 'FUTURE')
  await expect(page.getByTestId('month-day-2026-11-06')).toBeDisabled()
  await expect(page.getByTestId('month-day-2026-11-01')).toHaveAttribute('data-state', 'NO_PLAN')
  await expect(page.getByTestId('month-day-2026-11-01')).toBeDisabled()
  await expect(page.getByTestId('month-next')).toBeDisabled()
})

test('S-06: previous month asks for ?month=2026-10; a month with no targeted days shows "No targeted days yet"; next returns', async ({ page }) => {
  const requested: string[] = []
  await login(page)
  await mockProgress(page, requested)
  await page.goto('/progress')
  await expect(page.getByTestId('month-average')).toHaveText('64.3%')
  await page.getByTestId('month-prev').click()
  await expect(page.getByTestId('month-title')).toHaveText('October 2026')
  await expect(page.getByTestId('month-detail')).toHaveText('No targeted days yet')
  await expect(page.getByTestId('month-average')).toHaveCount(0)
  expect(requested).toContain('2026-10')
  await expect(page.getByTestId('month-next')).toBeEnabled()
  await page.getByTestId('month-next').click()
  await expect(page.getByTestId('month-title')).toHaveText('November 2026')
  await expect(page.getByTestId('month-next')).toBeDisabled()
})

test('S-06: selecting a day opens a read-only drawer from GET /api/progress/daily, with no log buttons', async ({ page }) => {
  const requested: string[] = []
  await login(page)
  await mockProgress(page, requested)
  await page.goto('/progress')
  await page.getByTestId('month-day-2026-11-03').click()
  const drawer = page.getByTestId('day-drawer')
  await expect(drawer).toBeVisible()
  await expect(page.getByTestId('day-drawer-overall')).toHaveText('75.0%')
  await expect(page.getByTestId('day-drawer-item-ue-squat')).toContainText('30 reps of 40 reps')
  expect(requested).toContain('daily 2026-11-03')
  await expect(drawer.getByRole('button')).toHaveCount(1) // Close only
  await expect(drawer.getByTestId('item-log')).toHaveCount(0)
  await expect(drawer.getByTestId('item-quick-complete')).toHaveCount(0)
  await page.getByTestId('day-drawer-close').click()
  await expect(drawer).toHaveCount(0)
})

test('S-06: a server error shows the error notice and Retry loads the month', async ({ page }) => {
  // Fail until Retry is pressed: the dev build runs React StrictMode, which loads the page twice.
  let failing = true
  await login(page)
  await page.route('**/api/progress/monthly**', async (route) => {
    if (failing) return route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: 'boom', fields: [] } })
    return route.fulfill({ json: NOVEMBER })
  })
  await page.goto('/progress')
  await expect(page.getByTestId('error-notice')).toHaveText('Something went wrong. Please try again.')
  failing = false
  await page.getByTestId('progress-retry').click()
  await expect(page.getByTestId('month-average')).toHaveText('64.3%')
})

test('S-06 (real API): the current month loads from the seed and the next-month button is disabled', async ({ page }) => {
  await login(page)
  await page.goto('/progress')
  await expect(page.getByTestId('month-card')).toBeVisible()
  await expect(page.getByTestId('month-detail')).not.toHaveText('')
  await expect(page.getByTestId('month-next')).toBeDisabled()
  await expect(page.getByTestId('month-grid')).toBeVisible()
})

test('S-06: when the previous month fails to load, the title names that month and Retry asks for it again', async ({ page }) => {
  const requested: string[] = []
  let failOctober = true
  await login(page)
  await page.route('**/api/progress/monthly**', async (route: Route) => {
    const month = new URL(route.request().url()).searchParams.get('month')
    requested.push(month ?? '(default)')
    if (month === '2026-10' && failOctober) return route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: 'boom', fields: [] } })
    return route.fulfill({ json: month === '2026-10' ? OCTOBER : NOVEMBER })
  })
  await page.goto('/progress')
  await expect(page.getByTestId('month-average')).toHaveText('64.3%')
  await page.getByTestId('month-prev').click()
  await expect(page.getByTestId('error-notice')).toBeVisible()
  await expect(page.getByTestId('month-title')).toHaveText('October 2026')
  failOctober = false
  requested.length = 0
  await page.getByTestId('progress-retry').click()
  await expect(page.getByTestId('month-detail')).toHaveText('No targeted days yet')
  expect(requested).toEqual(['2026-10'])
})

test('S-06: a day drawer closed while it is still loading stays closed when the answer arrives', async ({ page }) => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await login(page)
  await mockProgress(page, [])
  await page.route('**/api/progress/daily**', async (route: Route) => {
    await gate
    await route.fulfill({ json: DAILY_NOV_3 })
  })
  await page.goto('/progress')
  await page.getByTestId('month-day-2026-11-03').click()
  await expect(page.getByTestId('day-drawer-loading')).toBeVisible()
  await page.getByTestId('day-drawer-close').click()
  await expect(page.getByTestId('day-drawer')).toHaveCount(0)
  const answered = page.waitForResponse('**/api/progress/daily**')
  release()
  await answered
  await page.waitForTimeout(300)
  await expect(page.getByTestId('day-drawer')).toHaveCount(0)
})

test('S-06 (real API): Progress shows the F-08 Streak badge (F-08 §6) and links to History', async ({ page }) => {
  await login(page)
  await page.goto('/progress')
  await expect(page.getByTestId('month-card')).toBeVisible()
  await expect(page.getByTestId('streak-badge')).toBeVisible()
  await expect(page.getByTestId('streak-value')).toHaveAttribute('data-streak', /^\d+$/)
  await page.getByTestId('progress-history-link').click()
  await expect(page).toHaveURL(/\/history$/)
})

// Review of PR #119: S-06 kept the "today" of its first load, so a tab left open past Asia/Bangkok midnight showed
// the new day as FUTURE and could not reach a new month. Like My Plan, it asks the server again when it becomes visible.
test('S-06: a tab that becomes visible after midnight asks the server for today; the new day is no longer FUTURE', async ({ page }) => {
  let shifted = false
  await login(page)
  await page.route('**/api/progress/monthly**', async (route: Route) => {
    if (!shifted) return route.fulfill({ json: NOVEMBER })
    return route.fulfill({
      json: { ...NOVEMBER, to: '2026-11-06', targetedDays: 3, days: [...NOVEMBER.days, { date: '2026-11-06', isRestDay: false, overallPercent: 0 }] },
    })
  })
  await page.goto('/progress')
  await expect(page.getByTestId('month-day-2026-11-06')).toHaveAttribute('data-state', 'FUTURE')
  shifted = true
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  await expect(page.getByTestId('month-day-2026-11-06')).toHaveAttribute('data-state', 'TARGETED')
  await expect(page.getByTestId('month-day-2026-11-06')).toContainText('0%')
})

test('S-06: after midnight on the last day of the month, a visible tab on the old current month moves to the new month', async ({ page }) => {
  let shifted = false
  await login(page)
  const DECEMBER = { month: '2026-12', from: '2026-12-01', to: '2026-12-01', targetedDays: 1, restDaysExcluded: 0, averagePercent: 0, days: [{ date: '2026-12-01', isRestDay: false, overallPercent: 0 }] }
  await page.route('**/api/progress/monthly**', async (route: Route) => {
    const month = new URL(route.request().url()).searchParams.get('month')
    if (month === '2026-11' || (!shifted && month === null)) return route.fulfill({ json: { ...NOVEMBER, to: '2026-11-30' } })
    return route.fulfill({ json: DECEMBER })
  })
  await page.goto('/progress')
  await expect(page.getByTestId('month-title')).toHaveText('November 2026')
  await expect(page.getByTestId('month-next')).toBeDisabled()
  shifted = true
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  await expect(page.getByTestId('month-title')).toHaveText('December 2026')
  await expect(page.getByTestId('month-next')).toBeDisabled()
  await page.getByTestId('month-prev').click()
  await expect(page.getByTestId('month-title')).toHaveText('November 2026')
  await expect(page.getByTestId('month-next')).toBeEnabled()
})
