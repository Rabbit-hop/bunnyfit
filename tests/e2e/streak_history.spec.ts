import { PrismaClient } from '@prisma/client'
import { expect, test, type Page } from '@playwright/test'
import { createHistoricalEntry } from '../helpers/historicalEntry.js'
import { createHistoricalPlanItem } from '../helpers/historicalPlan.js'

// TEST-08b-1 / 08b-2 (F-08 §8): the Streak badge and the History screen show the server value of
// GET /api/streak. A throw-away Participant (password copied from Alice's hash) keeps the streak independent
// of the seeded users; dates come from the server date, so no fake clock is needed. Viewport 360 x 800.
test.use({ viewport: { width: 360, height: 800 } })
// Both tests reseed the same throw-away user, so they must not run in parallel.
test.describe.configure({ mode: 'serial' })

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } })
const PASSWORD = process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me'
const email = `streak-e2e-${Date.now().toString(36)}@exercise.test`
let userId = ''

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

test.beforeAll(async () => {
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })
  userId = (await prisma.user.create({ data: { email, passwordHash: alice.passwordHash, role: 'PARTICIPANT', displayName: 'Streak E2E' } })).id
})

test.afterAll(async () => {
  await prisma.ledgerEntry.deleteMany({ where: { userId } })
  await prisma.planItem.deleteMany({ where: { userId } })
  await prisma.userExercise.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.$disconnect()
})

async function loginAndSeed(page: Page) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(PASSWORD)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/today$/, { timeout: 20_000 })
  const token = await page.evaluate(() => sessionStorage.getItem('bunnyfit.token'))
  const headers = { Authorization: `Bearer ${token}` }
  const today = (await (await page.request.get('/api/progress/daily', { headers })).json()).date as string
  await prisma.ledgerEntry.deleteMany({ where: { userId } })
  await prisma.planItem.deleteMany({ where: { userId } })
  await prisma.userExercise.deleteMany({ where: { userId } })
  const item = await createHistoricalPlanItem(prisma, { userId, effectiveFrom: addDays(today, -5), priorityWeight: 3 })
  for (const n of [3, 2, 1]) await createHistoricalEntry(prisma, { userId, userExerciseId: item.userExerciseId, logDate: addDays(today, -n), totalReps: 40 })
  return { headers, today }
}

const apiStreak = async (page: Page, headers: Record<string, string>) =>
  (await (await page.request.get('/api/streak', { headers })).json()) as { streak: number; todayPending: boolean }

test('TEST-08b-1: History shows the same streak as GET /api/streak, the pending hint, newest first, qualifying days labelled', async ({ page }) => {
  const { headers, today } = await loginAndSeed(page)
  const api = await apiStreak(page, headers)
  expect(api).toMatchObject({ streak: 3, todayPending: true })

  await page.goto('/history')
  await expect(page.getByTestId('streak-value')).toHaveText('3-day streak')
  await expect(page.getByTestId('streak-value')).toHaveAttribute('data-streak', String(api.streak))
  await expect(page.getByTestId('streak-pending-hint')).toHaveText('Today counts once you reach 70%')
  const rows = page.getByTestId('history-days').locator('> li')
  await expect(rows.first()).toHaveAttribute('data-testid', `history-day-${today}`)
  for (const n of [1, 2, 3]) {
    await expect(page.getByTestId(`history-day-${addDays(today, -n)}`).getByTestId('history-day-status')).toHaveText('Counts toward your streak')
  }
})

test('TEST-08b-2: after Quick Complete the badge on Today and on History show 4 and the pending hint is gone', async ({ page }) => {
  const { headers } = await loginAndSeed(page)
  await page.goto('/today')
  await page.getByRole('button', { name: /quick complete/i }).first().click()
  await expect(page.getByTestId('streak-value')).toHaveText('4-day streak')
  await expect(page.getByTestId('streak-pending-hint')).toHaveCount(0)
  expect((await apiStreak(page, headers)).streak).toBe(4)

  await page.goto('/history')
  await expect(page.getByTestId('streak-value')).toHaveText('4-day streak')
  await expect(page.getByTestId('streak-pending-hint')).toHaveCount(0)
})
