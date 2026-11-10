import { expect, test, type Page } from '@playwright/test'

// Supplementary UI coverage for issue #8 (F-02 S-08/S-09). Not the RTM artifact for
// AC-02a-c / AC-11 (tests/integration/manager_template.test.ts, tests/unit/boundary_validation.test.ts)
// and not TEST-25 (main_journey.spec.ts). Runs against the real API and seed; uses
// run-unique names and deletes what it creates.
const MANAGER = { email: 'manager@exercise.test', password: process.env.SEED_MANAGER_PASSWORD ?? 'change-me' }

async function loginAsManager(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(MANAGER.email)
  await page.getByTestId('login-password').fill(MANAGER.password)
  await page.getByTestId('login-submit').click()
  // Login can still be pending ("Signing in…") after 5 s on a cold API/Vite start; allow more time here.
  await expect(page).toHaveURL(/\/manager\/library$/, { timeout: 20_000 })
}

test('AC-02a/b (UI): manager creates a category and a template, edits it, then deletes both', async ({ page }) => {
  const stamp = Date.now().toString(36)
  const category = `E2E Cat ${stamp}`
  const template = `E2E Run ${stamp}`
  await loginAsManager(page)

  await page.getByTestId('category-add-name').fill(category)
  await page.getByTestId('category-add').click()
  const catRow = page.locator('[data-testid^="category-row-"]', { hasText: category })
  await expect(catRow).toBeVisible()

  await page.getByTestId('template-new').click()
  await expect(page).toHaveURL(/\/templates\/new$/)
  await page.getByTestId('tpl-category').selectOption({ label: category })
  await page.getByTestId('tpl-name').fill(template)
  await page.getByTestId('tpl-body-part').fill('Legs')
  await page.getByTestId('tpl-mode').selectOption('CARDIO_DISTANCE')
  await page.getByTestId('tpl-cardio').selectOption('RUNNING')
  await page.getByTestId('tpl-met').fill('9.8')
  await page.getByTestId('tpl-save').click()

  await expect(page).toHaveURL(/\/manager\/library$/)
  await expect(page.getByTestId('library-toast')).toBeVisible()
  const row = page.locator('[data-testid^="template-row-"]', { hasText: template })
  await expect(row).toContainText('km')

  // Edit: mode is locked
  await row.getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByTestId('tpl-mode')).toBeDisabled()
  await page.getByTestId('tpl-met').fill('10')
  await page.getByTestId('tpl-save').click()
  await expect(page.locator('[data-testid^="template-row-"]', { hasText: template })).toContainText('10')

  // Category with a template cannot be deleted
  await catRow.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('error-notice')).toContainText('still has templates')

  // Delete template via confirm dialog, then the category
  await page.locator('[data-testid^="template-row-"]', { hasText: template }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByTestId('delete-dialog')).toContainText("Participants' existing plans are not affected")
  await page.getByTestId('delete-confirm').click()
  await expect(page.locator('[data-testid^="template-row-"]', { hasText: template })).toHaveCount(0)
  await catRow.getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('[data-testid^="category-row-"]', { hasText: category })).toHaveCount(0)
})

test('AC-11 (UI): out-of-range values show an inline error naming the field', async ({ page }) => {
  await loginAsManager(page)
  await page.getByTestId('template-new').click()
  await expect(page.getByTestId('tpl-category').locator('option')).not.toHaveCount(1)
  await page.getByTestId('tpl-category').selectOption({ index: 1 })
  await page.getByTestId('tpl-name').fill(`E2E Bad ${Date.now().toString(36)}`)
  await page.getByTestId('tpl-body-part').fill('Core')
  await page.getByTestId('tpl-met').fill('30')
  await page.getByTestId('tpl-save').click()

  await expect(page.getByTestId('field-error-metValue')).toBeVisible()
  await expect(page).toHaveURL(/\/templates\/new$/)
})
