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
  await expect(squat.getByTestId('item-actual')).toContainText('40 reps of 40 reps')
  await expect(squat.getByTestId('item-quick-complete')).toHaveText('Completed')
  await squat.getByTestId('item-quick-complete').click()
  await expect(page.getByTestId('today-toast')).toHaveText('Already completed, nothing added')
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

test('Week row: a past day is view-only with no Quick Complete or Log, future days are disabled, Back to today restores', async ({ page }) => {
  await openToday(page, 'normal')
  await expect(page.getByTestId('item-ue-squat')).toBeVisible()
  // Mock "today" is Thu 2026-11-05: Mon 02 .. Wed 04 are past, Fri 06 .. Sun 08 are in the future.
  await expect(page.getByTestId('today-day-2026-11-06')).toBeDisabled()
  await expect(page.getByTestId('today-week-next')).toBeDisabled()

  await page.getByTestId('today-day-2026-11-03').click()
  await expect(page.getByTestId('today-readonly')).toBeVisible()
  await expect(page.getByTestId('today-date')).toHaveAttribute('data-date', '2026-11-03')
  await expect(page.getByTestId('item-ue-squat')).toBeVisible()
  await expect(page.getByTestId('item-quick-complete')).toHaveCount(0)
  await expect(page.getByTestId('item-log')).toHaveCount(0)

  await page.getByTestId('today-back').click()
  await expect(page.getByTestId('today-readonly')).toHaveCount(0)
  await expect(page.getByTestId('today-date')).toHaveAttribute('data-date', '2026-11-05')
  await expect(page.getByTestId('item-ue-squat').getByTestId('item-quick-complete')).toBeVisible()
})

test('Week row: the previous-week arrow opens the same weekday a week earlier, read-only', async ({ page }) => {
  await openToday(page, 'normal')
  await expect(page.getByTestId('item-ue-squat')).toBeVisible()
  await page.getByTestId('today-week-prev').click()
  await expect(page.getByTestId('today-date')).toHaveAttribute('data-date', '2026-10-29')
  await expect(page.getByTestId('today-readonly')).toBeVisible()
})
