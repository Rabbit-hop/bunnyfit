import { expect, test, type Page } from '@playwright/test'

// F-07 §6 (S-05 My Plan): Edit and End with their confirmations. The RTM maps no AC to the F-07 UI
// (contract §6), so these are supplementary UI checks, not an AC result. They run against the REAL
// API and DB; each test creates its own uniquely named plan item and only looks at that card.
const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }

async function loginAs(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(PARTICIPANT.email)
  await page.getByTestId('login-password').fill(PARTICIPANT.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 })
  const token = await page.evaluate(() => sessionStorage.getItem('bunnyfit.token'))
  return { Authorization: `Bearer ${token}` }
}

const uniqueName = (prefix: string) => `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

async function createItem(page: Page, headers: Record<string, string>, name: string) {
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
  return (await res.json()).planItem as { id: string; planKey: string }
}

const versionsOf = async (page: Page, headers: Record<string, string>, planKey: string) => {
  const all = (await (await page.request.get('/api/plan-items', { headers })).json()) as { planItem: { planKey: string; version: number; targetSets: number; endDate: string | null } }[]
  return all.map((e) => e.planItem).filter((p) => p.planKey === planKey)
}

test('F-07 Edit: the confirmation states the effect, Save changes inserts version 2 and the card shows the new target', async ({ page }) => {
  const headers = await loginAs(page)
  const name = uniqueName('E2E Edit')
  const item = await createItem(page, headers, name)
  await page.goto('/plan')
  const card = page.locator('.plan-card', { hasText: name })
  await expect(card.getByTestId(/^plan-target-/)).toHaveText('2 × 5 reps')
  await card.getByTestId('plan-item-edit').click()
  await expect(page.getByTestId('edit-plan-dialog')).toBeVisible()
  await page.getByTestId('target-sets').fill('3')
  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('plan-edit-confirm-text')).toContainText('Past days keep the goal they had')
  await page.getByTestId('plan-edit-save').click()
  await expect(page.getByTestId('plan-toast')).toHaveText('Goal updated from today.')
  await expect(card.getByTestId(/^plan-target-/)).toHaveText('3 × 5 reps')
  const versions = await versionsOf(page, headers, item.planKey)
  expect(versions.map((v) => [v.version, v.targetSets])).toEqual([[1, 2], [2, 3]])
})

test('F-07 Edit: a server rejection (sets 21) shows the field error and keeps the typed value; nothing is stored', async ({ page }) => {
  const headers = await loginAs(page)
  const name = uniqueName('E2E Reject')
  const item = await createItem(page, headers, name)
  await page.goto('/plan')
  const card = page.locator('.plan-card', { hasText: name })
  await card.getByTestId('plan-item-edit').click()
  await page.getByTestId('target-sets').fill('21')
  await page.getByTestId('plan-save').click()
  await page.getByTestId('plan-edit-save').click()
  await expect(page.getByTestId('field-error-targetSets')).toContainText('1-20')
  await expect(page.getByTestId('target-sets')).toHaveValue('21')
  expect(await versionsOf(page, headers, item.planKey)).toHaveLength(1)
})

test('F-07 End: the confirmation says the item stays through today; End exercise stores endDate = today', async ({ page }) => {
  const headers = await loginAs(page)
  const name = uniqueName('E2E End')
  const item = await createItem(page, headers, name)
  await page.goto('/plan')
  const card = page.locator('.plan-card', { hasText: name })
  await card.getByTestId('plan-item-end').click()
  await expect(page.getByTestId('plan-end-confirm-text')).toContainText('stays in your plan through today')
  await page.getByTestId('plan-end-confirm').click()
  await expect(page.getByTestId('plan-toast')).toHaveText('Exercise ended after today.')
  const today = (await (await page.request.get('/api/plan', { headers })).json()).date as string
  const versions = await versionsOf(page, headers, item.planKey)
  expect(versions.map((v) => [v.version, v.endDate])).toEqual([[1, null], [2, today]])
})
