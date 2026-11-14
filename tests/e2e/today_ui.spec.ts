import { expect, test, type Page } from '@playwright/test'

// Supplementary UI coverage for issue #10 phase 1: Today (S-02) and Log Entry (S-03) running on the
// mock API (`?mock=` scenarios in web/src/lib/today.ts). Login is real; the Today data is mock.
// This is NOT TEST-23 / TEST-25 evidence - those need the real API (phase 2).
const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }

async function openToday(page: Page, scenario: 'normal' | 'rest' | 'first') {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(PARTICIPANT.email)
  await page.getByTestId('login-password').fill(PARTICIPANT.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/today$/)
  await page.goto(`/today?mock=${scenario}`)
}

test('Today shows the overall card and plan item cards', async ({ page }) => {
  await openToday(page, 'normal')
  await expect(page.getByTestId('today-date')).toContainText('2026')
  await expect(page.getByTestId('today-overall-pct')).toContainText('%')
  await expect(page.getByTestId('item-ue-squat')).toContainText('Target 40 reps')
})

test('Quick Complete reaches 100% and a second click is a no-op notice', async ({ page }) => {
  await openToday(page, 'normal')
  const squat = page.getByTestId('item-ue-squat')
  await squat.getByTestId('item-quick-complete').click()
  // A completed activity leaves Today's list and is kept under History.
  await expect(page.getByTestId('today-toast')).toHaveText('Quick Complete added.')
  await expect(page.getByTestId('open-list').getByTestId('item-ue-squat')).toHaveCount(0)
  await page.getByTestId('history-toggle').click()
  const done = page.getByTestId('history-list').getByTestId('item-ue-squat')
  await expect(done.getByTestId('item-actual')).toContainText('40 reps of 40 reps')
  await expect(done.getByTestId('item-quick-complete')).toHaveText('Completed')
  await done.getByTestId('item-quick-complete').click()
  await expect(page.getByTestId('today-toast')).toHaveText('Already completed, nothing added')
})

test('History: Today lists only unfinished activities; completed ones are behind the History button', async ({ page }) => {
  await openToday(page, 'normal')
  await expect(page.getByTestId('open-list').getByTestId('item-ue-squat')).toBeVisible()
  await expect(page.getByTestId('history-toggle')).toHaveText('History')
  await page.getByTestId('history-toggle').click()
  await expect(page.getByTestId('history-empty')).toBeVisible()
  await page.getByTestId('history-toggle').click() // Back
  await expect(page.getByTestId('open-list')).toBeVisible()
  await page.getByTestId('open-list').getByTestId('item-ue-squat').getByTestId('item-quick-complete').click()
  await expect(page.getByTestId('history-toggle')).toHaveText(/History \(\d+\)/)
})

test('Log dialog: preview, inline server error keeps values, then a valid save', async ({ page }) => {
  await openToday(page, 'normal')
  const squat = page.getByTestId('item-ue-squat')
  await squat.getByTestId('item-log').click()
  await page.getByTestId('log-sets').fill('21')
  await page.getByTestId('log-reps').fill('1')
  await expect(page.getByTestId('log-preview')).toHaveText('Adds 21 reps (21 x 1)')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('field-error-sets')).toBeVisible()
  await expect(page.getByTestId('log-sets')).toHaveValue('21')
  await page.getByTestId('log-sets').fill('1')
  await page.getByTestId('log-reps').fill('5')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('log-dialog')).toHaveCount(0)
  await expect(squat.getByTestId('item-actual')).toContainText('33 reps')
})

test('Rest Day: banner, disabled Quick Complete with explanation, Log works and is not scored', async ({ page }) => {
  await openToday(page, 'rest')
  await expect(page.getByTestId('rest-day-banner')).toBeVisible()
  await expect(page.getByTestId('today-overall-pct')).toHaveText('Rest day: no goal today')
  await expect(page.getByTestId('rest-day-quick-complete').first()).toBeDisabled()
  await page.getByTestId('rest-ue-run').getByTestId('rest-day-log').click()
  await page.getByTestId('log-distance').fill('3.5')
  await page.getByTestId('log-save').click()
  await page.getByTestId('rest-ue-run').getByTestId('rest-day-entries-toggle').click()
  await expect(page.getByTestId('rest-ue-run').getByTestId('rest-day-entries')).toContainText('not scored')
})

test('First-time user is sent to My Plan', async ({ page }) => {
  await openToday(page, 'first')
  await expect(page.getByTestId('first-time')).toContainText('Add an exercise to your plan first')
  await expect(page.getByTestId('first-time-link')).toHaveAttribute('href', '/plan')
})

test('Week row: tapping another day shows a short message and changes nothing', async ({ page }) => {
  await openToday(page, 'normal')
  const squat = page.getByTestId('item-ue-squat')
  await expect(squat).toBeVisible()
  // Mock "today" is Thu 2026-11-05. A past day and a later day both only explain that Today is for today.
  await page.getByTestId('today-day-2026-11-03').click()
  await expect(page.getByTestId('today-toast')).toHaveText("Only today's activity can be viewed and logged.")
  await expect(page.getByTestId('today-date')).toHaveAttribute('data-date', '2026-11-05')
  await expect(squat.getByTestId('item-quick-complete')).toBeVisible()
  await page.getByTestId('today-day-2026-11-07').click()
  await expect(page.getByTestId('today-toast')).toHaveText("Only today's activity can be viewed and logged.")
  await expect(page.getByTestId('today-date')).toHaveAttribute('data-date', '2026-11-05')
})
