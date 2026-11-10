import { expect, test, type Page } from '@playwright/test'

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
  const before = await page.locator('[data-testid^="plan-item-"]').count()

  await page.getByTestId('plan-add').click()
  await page.getByTestId('picker-mode').selectOption('BODYWEIGHT_REPS')
  const card = page.locator('[data-testid^="template-card-"]').first()
  await expect(card).toBeVisible()
  await card.click()
  await expect(page.getByTestId('target-sets')).toBeVisible()
  await expect(page.getByTestId('target-load')).toHaveCount(0)
  await expect(page.getByTestId('range-helper')).toContainText('Allowed range')
  await page.getByTestId('target-sets').fill('2')
  await page.getByTestId('target-reps').fill('5')
  await page.getByTestId('repeat-day-6').uncheck()
  await setTomorrow(page)
  await expect(page.getByTestId('plan-summary')).toContainText('2 × 5 reps')

  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('plan-toast')).toBeVisible()
  await expect(page.locator('[data-testid^="plan-item-"]')).toHaveCount(before + 1)
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
