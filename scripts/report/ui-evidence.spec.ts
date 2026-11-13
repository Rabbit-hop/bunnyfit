import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

// Screenshots for the Deliverable 1 PDF (issue #12): normal workflow, rule rejection and role
// restriction (403). Run through scripts/report/playwright.evidence.config.ts against the real API and
// database; it is NOT part of the normal test suite and asserts only enough to be sure each picture shows
// what its caption says. Output: <EVIDENCE_DIR>/screens/*.png and 30-ui-evidence.md.
const OUT = process.env.EVIDENCE_DIR ?? 'docs/local/report/evidence'
const SHOTS = join(OUT, 'screens')
mkdirSync(SHOTS, { recursive: true })

const PARTICIPANT = { email: 'alice@exercise.test', password: process.env.SEED_PARTICIPANT_PASSWORD ?? 'change-me' }
const MANAGER = { email: 'manager@exercise.test', password: process.env.SEED_MANAGER_PASSWORD ?? 'change-me' }
const git = (...a: string[]) => {
  try {
    return execFileSync('git', a, { encoding: 'utf8' }).trim()
  } catch {
    return '?'
  }
}

type Shot = { group: string; file: string; title: string; caption: string }
const shots: Shot[] = []

async function snap(page: Page, group: string, name: string, title: string, caption: string, target?: ReturnType<Page['locator']>) {
  const file = `${name}.png`
  if (target) await target.screenshot({ path: join(SHOTS, file) })
  else await page.screenshot({ path: join(SHOTS, file) })
  shots.push({ group, file: `screens/${file}`, title, caption })
}

async function login(page: Page, who: { email: string; password: string }, landing: RegExp) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(who.email)
  await page.getByTestId('login-password').fill(who.password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(landing, { timeout: 20_000 })
}

async function token(page: Page) {
  return { Authorization: `Bearer ${await page.evaluate(() => sessionStorage.getItem('bunnyfit.token'))}` }
}

const unique = (p: string) => `${p} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`

test.afterAll(() => {
  const commit = git('rev-parse', 'HEAD')
  const groups = [...new Set(shots.map((s) => s.group))]
  const md = [
    '# UI screenshots',
    '',
    `Taken by \`scripts/report/ui-evidence.spec.ts\` (Playwright, Chromium, 360 × 800 mobile viewport) against the real API and PostgreSQL, on commit \`${commit}\` (${git('show', '-s', '--format=%s', 'HEAD').slice(0, 90)}), ${new Date().toISOString()}. Each picture is a real browser screenshot of the running application; the test data (user names, plan item names) are the seeded accounts and rows created by the script itself.`,
    '',
    ...groups.flatMap((g) => [
      `## ${g}`,
      '',
      ...shots.filter((s) => s.group === g).flatMap((s) => [`### ${s.title}`, '', `![${s.title}](${s.file})`, '', s.caption, '']),
    ]),
  ].join('\n')
  writeFileSync(join(OUT, '30-ui-evidence.md'), md)
})

test.describe.configure({ mode: 'serial' })

test('normal workflow: Participant logs in, plans, logs and completes an exercise; Manager opens the Library', async ({ page }) => {
  const G = 'Normal workflow'
  await page.goto('/login')
  await expect(page.getByTestId('login-submit')).toBeVisible()
  await snap(page, G, 'n01-login', 'Login screen (S-01)', 'The sign-in form served at `/login`.')

  await login(page, PARTICIPANT, /\/today$/)
  const headers = await token(page)
  const name = unique('Evidence walk')
  const created = await page.request.post('/api/plan-items', {
    headers,
    data: { source: 'CUSTOM', exercise: { name, targetBodyPart: 'Legs', trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'WALKING' }, priorityWeight: 3, targetDistanceKm: 2 },
  })
  expect(created.status()).toBe(201)
  await page.reload()
  const card = page.getByRole('listitem').filter({ hasText: name })
  await expect(card).toBeVisible()
  await snap(page, G, 'n02-today', 'Today after login (S-02)', 'Participant `alice@exercise.test` after signing in: overall progress and the plan item cards from `GET /api/progress/daily`.')
  await snap(page, G, 'n03-card-before', 'A plan item before Quick Complete', `Plan item "${name}": target 2 km, nothing logged yet (this item was added through \`POST /api/plan-items\` by the script).`, card)

  await card.getByTestId('item-quick-complete').click()
  await expect(card.getByTestId('item-quick-complete')).toHaveText('Completed')
  await snap(page, G, 'n04-card-after', 'The same item after Quick Complete', 'After one tap on Quick Complete the card shows 2 km of 2 km, 100 % and the button reads "Completed" (`POST /api/entries/quick-complete`, then `GET /api/progress/daily`).', card)

  await card.getByTestId('item-log').click()
  await expect(page.getByTestId('log-dialog')).toBeVisible()
  await snap(page, G, 'n05-log-dialog', 'Log Entry dialog (S-03)', 'The manual entry dialog for a distance exercise with the live remaining-limit helper text.')
  await page.getByRole('button', { name: /cancel/i }).click()

  await page.goto('/plan')
  await expect(page.getByTestId('plan-page')).toBeVisible()
  await expect(page.getByTestId('plan-loading')).toHaveCount(0)
  await snap(page, G, 'n06-plan', 'My Plan (S-05)', 'The plan calendar with the selected day and the exercises planned for it (`GET /api/plan-items`).')

  await page.getByTestId('plan-add').click()
  await expect(page.getByTestId('add-exercise-dialog')).toBeVisible()
  await page.getByTestId('picker-mode').selectOption('BODYWEIGHT_REPS')
  const tpl = page.locator('[data-testid^="template-card-"]').first()
  await expect(tpl).toBeVisible()
  await tpl.click()
  await expect(page.getByTestId('target-sets')).toBeVisible()
  await snap(page, G, 'n07-add-exercise', 'Add Exercise dialog (S-04)', 'A template chosen from the library: target fields follow the tracking mode, the allowed range is shown as helper text, plus priority, repeat days and dates. The selection is copied into the plan (Copy-on-Select).')
  await page.keyboard.press('Escape')

  const mgr = await page.context().browser()!.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, baseURL: page.url().split('/').slice(0, 3).join('/') })
  const mp = await mgr.newPage()
  await login(mp, MANAGER, /\/manager\/library$/)
  await expect(mp.getByRole('heading', { name: /exercise library/i }).first()).toBeVisible()
  await snap(mp, G, 'n08-library', 'Manager: Exercise Library (S-08)', 'Signed in as `manager@exercise.test`: the template library with categories and templates.')
  await mgr.close()
})

test('rule rejection: the UI shows the server and validation errors next to the field', async ({ page }) => {
  const G = 'Rule rejection'
  await page.goto('/login')
  await page.getByTestId('login-email').fill('not-an-email')
  await page.getByTestId('login-password').fill('x')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('field-error-email')).toBeVisible()
  await snap(page, G, 'r01-login-email', 'Invalid e-mail format (AC-01f)', 'An e-mail without the right format is rejected and the message appears next to the input; the user stays on `/login`.')

  await login(page, PARTICIPANT, /\/today$/)
  const headers = await token(page)
  const name = unique('Evidence sets')
  const created = await page.request.post('/api/plan-items', {
    headers,
    data: { source: 'CUSTOM', exercise: { name, targetBodyPart: 'Core', trackingMode: 'BODYWEIGHT_REPS' }, priorityWeight: 2, targetSets: 2, targetRepsPerSet: 5 },
  })
  expect(created.status()).toBe(201)
  await page.reload()
  const card = page.getByRole('listitem').filter({ hasText: name })
  await card.getByTestId('item-log').click()
  await page.getByTestId('log-sets').fill('21')
  await page.getByTestId('log-reps').fill('1')
  await page.getByTestId('log-save').click()
  await expect(page.getByTestId('field-error-sets')).toBeVisible()
  await snap(page, G, 'r02-sets-21', '21 sets rejected by the server (AC-23, Sprint 1 case 1)', 'A log entry with 21 sets: the server answers 400 `VALIDATION_ERROR` (limit 20 sets) and the dialog shows the limit under the field and keeps the entered values.')
  await page.getByRole('button', { name: /cancel/i }).click()

  await page.goto('/plan')
  await page.getByTestId('plan-add').click()
  await page.getByTestId('tab-custom').click()
  await page.getByTestId('custom-name').fill(unique('Evidence plank'))
  await page.getByTestId('custom-body-part').fill('Core')
  await page.getByTestId('custom-mode').selectOption('BODYWEIGHT_TIME')
  await page.getByTestId('target-duration-min').fill('200')
  await page.getByTestId('plan-save').click()
  await expect(page.getByTestId('field-error-targetDurationSec')).toBeVisible()
  await snap(page, G, 'r03-duration', 'Out-of-range target rejected (AC-03b, AC-11)', 'A 200-minute target is above the 10,800-second limit: the server answers 400 and the field error is shown inside the Add Exercise dialog, which stays open.')
})

test('role restriction: a role cannot open the other role\'s screens (403)', async ({ page, browser, baseURL }) => {
  const G = 'Role restriction (403)'
  await login(page, PARTICIPANT, /\/today$/)
  await page.goto('/manager/library')
  await expect(page).toHaveURL(/\/403$/)
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  await snap(page, G, 'p01-participant-403', 'Participant opens a Manager route (AC-22b)', 'Participant `alice@exercise.test` goes to `/manager/library`: the SPA shows "You don\'t have access to this page" and no Manager data.')

  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, baseURL: baseURL! })
  const mp = await ctx.newPage()
  await login(mp, MANAGER, /\/manager\/library$/)
  await mp.goto('/today')
  await expect(mp).toHaveURL(/\/403$/)
  await snap(mp, G, 'p02-manager-403', 'Manager opens a Participant route (AC-22b)', 'Manager `manager@exercise.test` goes to `/today`: the same Access Denied screen, with no participant activity data.')
  await ctx.close()
})
