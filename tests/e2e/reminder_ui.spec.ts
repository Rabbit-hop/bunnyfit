import { expect, test, type Page } from '@playwright/test'

// Supplementary UI coverage for F-09 (contract §8 "not in the RTM"): the Schedule & reminders screen against
// the REAL API and DB. Each test uses a uniquely named reminder / plan item and asserts only on it, so rows
// from other tests or earlier runs do not matter. AC-09 evidence is tests/integration/reminder.test.ts.
const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }
const NOTICE = 'Reminders are saved and shown in the app only. Nothing is sent: no email, push or SMS.'

const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

async function login(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(PARTICIPANT.email)
  await page.getByTestId('login-password').fill(PARTICIPANT.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 })
}

async function openSchedule(page: Page) {
  await page.goto('/plan')
  await page.getByTestId('plan-schedule-link').click()
  await expect(page).toHaveURL(/\/schedule$/)
  await expect(page.getByTestId('reminder-notice')).toHaveText(NOTICE)
}

test('reminder: add, edit, switch off and delete through the Schedule screen', async ({ page }) => {
  await login(page)
  await openSchedule(page)
  const label = unique('E2E Reminder')

  // Add: 06:15 on Mon, Wed, Fri.
  await page.getByTestId('reminder-add').click()
  await page.getByTestId('reminder-time-input').fill('06:15')
  await page.getByTestId('reminder-label-input').fill(label)
  for (const day of [2, 4, 6, 7]) await page.getByTestId(`reminder-day-${day}`).click()
  await page.getByTestId('reminder-save').click()
  await expect(page.getByTestId('reminder-toast')).toHaveText('Reminder added')
  const row = page.getByTestId('reminder-row').filter({ hasText: label })
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('reminder-time')).toHaveText('06:15')
  await expect(row.getByTestId('reminder-days')).toHaveText('Mon, Wed, Fri')
  await expect(row.getByTestId('reminder-toggle')).toHaveText('On')

  // Edit the time; the label and days stay.
  await row.getByTestId('reminder-edit').click()
  await page.getByTestId('reminder-time-input').fill('06:45')
  await page.getByTestId('reminder-save').click()
  await expect(page.getByTestId('reminder-toast')).toHaveText('Reminder updated')
  await expect(row.getByTestId('reminder-time')).toHaveText('06:45')
  await expect(row.getByTestId('reminder-days')).toHaveText('Mon, Wed, Fri')

  // Switch off, and it stays off after a reload (persisted).
  await row.getByTestId('reminder-toggle').click()
  await expect(row.getByTestId('reminder-toggle')).toHaveText('Off')
  await page.reload()
  await expect(page.getByTestId('reminder-row').filter({ hasText: label }).getByTestId('reminder-toggle')).toHaveText('Off')

  // Delete after confirming.
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByTestId('reminder-row').filter({ hasText: label }).getByTestId('reminder-delete').click()
  await expect(page.getByTestId('reminder-toast')).toHaveText('Reminder deleted')
  await expect(page.getByTestId('reminder-row').filter({ hasText: label })).toHaveCount(0)
})

test('reminder: an empty label is rejected by the server and shown under the label field', async ({ page }) => {
  await login(page)
  await openSchedule(page)
  await page.getByTestId('reminder-add').click()
  await page.getByTestId('reminder-label-input').fill('   ')
  await page.getByTestId('reminder-save').click()
  await expect(page.getByTestId('field-error-label')).toBeVisible()
  // The form stays open with the typed values.
  await expect(page.getByTestId('reminder-form')).toBeVisible()
})

test('schedule: a Monday-only plan item shows on next week\'s Monday only; month view lists every day', async ({ page }) => {
  await login(page)
  const token = await page.evaluate(() => sessionStorage.getItem('bunnyfit.token'))
  const name = unique('E2E Sched')
  const res = await page.request.post('/api/plan-items', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      source: 'CUSTOM',
      exercise: { name, targetBodyPart: 'Legs', trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'WALKING' },
      priorityWeight: 2,
      targetDistanceKm: 2,
      repeatDays: [1],
    },
  })
  expect(res.status()).toBe(201)

  await openSchedule(page)
  await expect(page.getByTestId('schedule-day')).toHaveCount(7)
  await page.getByTestId('schedule-next').click()
  const days = page.getByTestId('schedule-day')
  await expect(days).toHaveCount(7)
  await expect(days.first()).toContainText(name)
  for (let i = 1; i < 7; i += 1) await expect(days.nth(i)).not.toContainText(name)

  await page.getByTestId('schedule-view-month').click()
  // count() does not wait: poll until the month has replaced the loading state.
  await expect.poll(() => page.getByTestId('schedule-day').count()).toBeGreaterThanOrEqual(28)
  expect(await page.getByTestId('schedule-day').count()).toBeLessThanOrEqual(31)
})
