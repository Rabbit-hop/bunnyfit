#!/usr/bin/env node
// Collects the execution evidence for the Deliverable 1 PDF (issue #12) into <out>/evidence/*.md.
// Everything written here is produced by running a command or reading a document in this session;
// nothing is typed by hand. Run it on a checkout of the commit that the report describes.
//
//   node scripts/report/collect-evidence.mjs <step...> [--out docs/local/report] [--pw-config <file>]
//
// steps:  tests     tsc x3, vitest (JSON reporter), Playwright (JSON reporter)  -> 10-test-execution.md
//         register  RTM section 3.1 status register -> Sprint 1 evidence mapping -> 20-rtm-status-register.md
//         git       reviewed pull requests (gh API)  -> 40-git-process.md (+ PR screenshots)
//         all       every step above
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import os from 'node:os'

const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const OUT = resolve(opt('out', 'docs/local/report'))
const EV = join(OUT, 'evidence')
const PW_CONFIG = opt('pw-config', 'playwright.config.ts')
const steps = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] ?? '').startsWith('--'))
const want = (s) => steps.includes('all') || steps.includes(s)
mkdirSync(EV, { recursive: true })

const sh = (cmd, args, extra = {}) => {
  const t0 = Date.now()
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: false, ...extra })
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, ms: Date.now() - t0 }
}
const git = (...a) => sh('git', a).out.trim()
const tail = (s, n) => s.split(/\r?\n/).filter((l) => l.trim() !== '').slice(-n).join('\n')
const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '')
const NODE = process.execPath
const COMMIT = git('rev-parse', 'HEAD')
const BRANCH = git('branch', '--show-current') || '(detached HEAD)'
// A throw-away Playwright config for a free port does not change the code under test, so it is not counted.
const DIRTY = git('status', '--short').split('\n').filter(Boolean).filter((l) => !l.includes('docs/local/') && !l.includes('.tmp.config.ts')).length
const STAMP = new Date().toISOString()

const header = (title, label = 'Commit under test') =>
  `# ${title}\n\n| | |\n| --- | --- |\n| ${label} | \`${COMMIT}\` (${COMMIT ? git('show', '-s', '--format=%s', COMMIT).slice(0, 90).replace(/\|/g, '/') : ''}) |\n| Branch | \`${BRANCH}\` |\n| Uncommitted changes | ${DIRTY === 0 ? 'none' : `**${DIRTY} file(s)**, so this run does not describe the commit exactly`} |\n| Collected | ${STAMP} |\n| Machine | ${os.type()} ${os.release()}, Node ${process.version} |\n\n`

// ------------------------------------------------------------------------------------------------
function collectTests() {
  console.log('tests: static checks')
  const tsc = ['tsconfig.json', 'tsconfig.web.json', 'tsconfig.node.json'].map((cfg) => ({
    cfg,
    ...sh(NODE, ['node_modules/typescript/bin/tsc', '-p', cfg, '--noEmit']),
  }))

  console.log('tests: vitest')
  const vjson = join(OUT, 'vitest.json')
  const vitest = sh(NODE, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${vjson}`])
  let vfiles = []
  let vsum = null
  if (existsSync(vjson)) {
    const j = JSON.parse(readFileSync(vjson, 'utf8'))
    vsum = { files: j.testResults.length, tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, pending: j.numPendingTests }
    vfiles = j.testResults.map((f) => ({
      file: relative(process.cwd(), f.name).replace(/\\/g, '/'),
      passed: f.assertionResults.filter((a) => a.status === 'passed').length,
      failed: f.assertionResults.filter((a) => a.status === 'failed').length,
      skipped: f.assertionResults.filter((a) => a.status !== 'passed' && a.status !== 'failed').length,
      status: f.status,
    }))
  }

  console.log('tests: playwright')
  const pjson = join(OUT, 'playwright.json')
  const pw = sh(NODE, ['node_modules/@playwright/test/cli.js', 'test', '-c', PW_CONFIG, '--reporter=json'], {
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: pjson },
  })
  const pfiles = []
  let psum = null
  if (existsSync(pjson)) {
    const j = JSON.parse(readFileSync(pjson, 'utf8'))
    psum = { expected: j.stats.expected, unexpected: j.stats.unexpected, flaky: j.stats.flaky, skipped: j.stats.skipped, ms: Math.round(j.stats.duration) }
    const walk = (suite, file) => {
      for (const s of suite.suites ?? []) walk(s, file ?? s.file)
      for (const spec of suite.specs ?? [])
        pfiles.push({ file: spec.file ?? file, title: spec.title, ok: spec.ok, ms: spec.tests?.[0]?.results?.[0]?.duration ?? 0 })
    }
    for (const s of j.suites) walk(s, s.file)
  }

  const row = (c) => `| \`${c.cfg}\` | ${c.code === 0 ? 'no errors' : `**exit ${c.code}**`} |`
  const md = [
    header('Test execution evidence'),
    '## Static checks\n\nCommand: `node node_modules/typescript/bin/tsc -p <config> --noEmit` (the same compiler as `pnpm run typecheck`).\n',
    '| Config | Result |\n| --- | --- |',
    ...tsc.map(row),
    '',
    '## Unit, integration and system tests (Vitest, real PostgreSQL test database)\n',
    vsum
      ? `Result: **${vsum.passed} passed, ${vsum.failed} failed, ${vsum.pending} skipped** in ${vsum.files} test files (exit code ${vitest.code}, ${(vitest.ms / 1000).toFixed(0)} s).\n`
      : `Vitest produced no JSON result (exit code ${vitest.code}). Last output:\n\n\`\`\`\n${tail(strip(vitest.out), 25)}\n\`\`\`\n`,
    vfiles.length ? '| Test file | Passed | Failed | Skipped |\n| --- | ---: | ---: | ---: |' : '',
    ...vfiles.sort((a, b) => a.file.localeCompare(b.file)).map((f) => `| \`${f.file}\` | ${f.passed} | ${f.failed} | ${f.skipped} |`),
    '',
    '## UI end-to-end tests (Playwright, real API and database)\n',
    psum
      ? `Result: **${psum.expected} passed, ${psum.unexpected} failed, ${psum.flaky} flaky, ${psum.skipped} skipped** (${(psum.ms / 1000).toFixed(0)} s, config \`${PW_CONFIG}\`, exit code ${pw.code}).\n`
      : `Playwright produced no JSON result (exit code ${pw.code}). Last output:\n\n\`\`\`\n${tail(strip(pw.out), 25)}\n\`\`\`\n`,
    pfiles.length ? '| Spec file | Test | Result |\n| --- | --- | --- |' : '',
    ...pfiles.map((t) => `| \`${t.file}\` | ${t.title.replace(/\|/g, '/')} | ${t.ok ? 'passed' : '**FAILED**'} |`),
    '',
    '## Raw output (last lines)\n',
    `Vitest:\n\n\`\`\`\n${tail(strip(vitest.out), 18)}\n\`\`\`\n`,
    `Playwright:\n\n\`\`\`\n${tail(strip(pw.out), 8)}\n\`\`\`\n`,
  ].join('\n')
  writeFileSync(join(EV, '10-test-execution.md'), md)
  writeFileSync(join(OUT, 'test-summary.json'), JSON.stringify({ commit: COMMIT, vitest: vsum, vfiles, playwright: psum, pfiles }, null, 1))
  console.log(`tests: vitest ${vsum ? `${vsum.passed}/${vsum.tests}` : 'no result'}, playwright ${psum ? `${psum.expected} passed ${psum.unexpected} failed` : 'no result'}`)
}

// ------------------------------------------------------------------------------------------------
function parseRegister(md) {
  const rows = []
  for (const line of md.split('\n')) {
    if (!/^\| AC-\d\d[a-z]? \|/.test(line)) continue
    const c = line.split('|').slice(1, -1).map((x) => x.trim())
    if (c.length < 10) continue
    rows.push({ ac: c[0], feature: c[1], sprint: c[2], test: c[3], file: c[4], actual: c[5], implemented: c[6], executed: c[7], result: c[8].replace(/\*\*/g, ''), commit: c[9] })
  }
  return rows
}

function collectRegister() {
  const rtm = readFileSync('docs/traceability.md', 'utf8')
  const version = (rtm.match(/\*\*Document Version:\*\*\s*([^\n]+)/) ?? [, '?'])[1].trim()
  const rows = parseRegister(rtm)
  const summaryFile = join(OUT, 'test-summary.json')
  const run = existsSync(summaryFile) ? JSON.parse(readFileSync(summaryFile, 'utf8')) : null
  const fileResult = (f) => {
    if (!run || !f || f === '-') return 'not run'
    const v = run.vfiles.find((x) => x.file === f)
    if (v) return v.failed > 0 ? `**${v.failed} failed**` : `${v.passed} passed`
    const p = run.pfiles.filter((x) => x.file === f.replace(/^tests\/e2e\//, ''))
    if (p.length) return p.every((x) => x.ok) ? `${p.length} passed (UI)` : '**UI failed**'
    return 'file not in this run'
  }
  const count = (rs, key) => rs.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {})
  // An AC that spans sprints ("1, 2, 3": e.g. AC-23, whose cases are delivered per sprint) counts in its first sprint,
  // which gives the 38 / 34 / 8 split of the RTM revision row.
  const primary = (r) => r.sprint.split(',')[0].trim()
  const bySprint = (s) => rows.filter((r) => primary(r) === s)
  const s1 = bySprint('1')
  const results = ['PASS', 'FAIL', 'SKIPPED', 'INCOMPLETE', 'PLANNED']
  const line = (label, rs) => `| ${label} | ${rs.length} | ${results.map((k) => rs.filter((r) => r.result === k).length).join(' | ')} | ${rs.filter((r) => !results.includes(r.result)).length} |`
  const sprints = [...new Set(rows.map(primary))].sort()
  const multi = rows.filter((r) => r.sprint.includes(','))

  const md = [
    header('RTM Status Register and Sprint 1 evidence mapping'),
    `Source: \`docs/traceability.md\` section 3.1, document version **${version}**. The Result column is copied from the register as written by its authors; this page adds the result of the test run in the previous chapter next to it. A planned test is never shown as PASS before it has run (register rule).\n`,
    '## Totals from the register\n',
    `| Sprint | AC | ${results.join(' | ')} | other |\n| --- | ---: | ${results.map(() => '---:').join(' | ')} | ---: |`,
    ...sprints.map((s) => line(`Sprint ${s}`, bySprint(s))),
    line('All', rows),
    '',
    `Counted by first sprint. ${multi.length} AC span several sprints (${multi.map((r) => `${r.ac} (${r.sprint})`).join(', ')}); they count in Sprint 1, so only the Sprint 1 cases of those AC are evidence for Sprint 1.`,
    '',
    `Sprint 1 target after CHANGE-03 to CHANGE-08: 38 AC; Sprint 2: 34 (the deferred AC are recorded as Sprint 2 evidence, not Sprint 1); the remaining ${rows.length - s1.length - bySprint('2').length} are Sprint 3. The register in this document version lists ${rows.length} atomic AC.\n`,
    '## Sprint 1 acceptance criteria\n',
    '| AC | Feature | Register result | Tested commit (per register) | Planned test file | This run: file result |\n| --- | --- | --- | --- | --- | --- |',
    ...s1.map((r) => `| ${r.ac} | ${r.feature} | **${r.result}** | ${r.commit} | \`${r.file}\` | ${fileResult(r.file)} |`),
    '',
    '### Sprint 1 AC that are not PASS in the register\n',
    ...(s1.filter((r) => r.result !== 'PASS').length
      ? s1.filter((r) => r.result !== 'PASS').map((r) => `- **${r.ac}** (${r.feature}): ${r.result}. ${r.actual === '-' ? 'No test run recorded.' : r.actual}`)
      : ['None.']),
    '',
    '### Consistency check against this run\n',
    ...(run
      ? (() => {
          const bad = s1.filter((r) => r.result === 'PASS' && /failed|not in this run|not run/.test(fileResult(r.file)) && r.file && r.file !== '-')
          return bad.length ? bad.map((r) => `- ${r.ac} is PASS in the register but its file \`${r.file}\`: ${fileResult(r.file)}.`) : ['Every Sprint 1 AC recorded as PASS has its planned test file in this run with no failure.']
        })()
      : ['No test run was collected next to this register, so the "This run" column reads "not run".']),
    '',
    '### Sprint 2 (deferred) acceptance criteria\n',
    `${bySprint('2').length} AC are Sprint 2 (CHANGE-03 to CHANGE-08 and the Sprint 2 features). Those with a PASS in the register were implemented early and are evidence for Sprint 2, not for the Sprint 1 count:\n`,
    ...(bySprint('2').filter((r) => r.result === 'PASS').length ? bySprint('2').filter((r) => r.result === 'PASS').map((r) => `- ${r.ac} (${r.feature}) ${r.commit}`) : ['- none']),
    '',
  ].join('\n')
  writeFileSync(join(EV, '20-rtm-status-register.md'), `<!-- landscape -->
${md}`)
  console.log(`register: ${rows.length} AC rows, Sprint 1 = ${s1.length} (PASS ${s1.filter((r) => r.result === 'PASS').length})`)
}

// ------------------------------------------------------------------------------------------------
async function collectGit() {
  const repo = git('config', '--get', 'remote.origin.url').replace(/.*github\.com[:/]/, '').replace(/\.git$/, '')
  const list = JSON.parse(sh('gh', ['pr', 'list', '--repo', repo, '--state', 'all', '--limit', '100', '--json', 'number,title,state,baseRefName,headRefName,author,mergedAt,mergeCommit']).out)
  const prs = []
  for (const p of list.sort((a, b) => a.number - b.number)) {
    const reviews = JSON.parse(sh('gh', ['api', `repos/${repo}/pulls/${p.number}/reviews`, '--paginate']).out || '[]')
    const comments = JSON.parse(sh('gh', ['api', `repos/${repo}/pulls/${p.number}/comments`, '--paginate']).out || '[]')
    const issueComments = JSON.parse(sh('gh', ['api', `repos/${repo}/issues/${p.number}/comments`, '--paginate']).out || '[]')
    // Only a teammate's review is evidence of review; the author's own comment on their PR is not.
    const peer = reviews.filter((r) => r.user?.login !== p.author?.login)
    prs.push({ ...p, reviews: peer, inline: comments.length, discussion: issueComments.length })
  }
  const authorOf = (p) => p.author?.login ?? '?'
  const reviewed = prs.filter((p) => p.reviews.length > 0)
  const states = (p) => [...new Set(p.reviews.map((r) => `${r.user?.login}: ${r.state}`))].join('; ')
  const plain = (t) => t.replace(/[`*#>|_]/g, '').replace(/\s+/g, ' ').trim()
  const excerpt = (p) => {
    const r = p.reviews.find((x) => (x.body ?? '').trim()) ?? { body: '' }
    const text = plain(r.body ?? '')
    const verdict = text.match(/Verdict:?\s*([^.]{3,130})/i)
    return verdict ? `Verdict: ${verdict[1].trim()}` : text.slice(0, 130)
  }
  const md = [
    header('Git process evidence: reviewed pull requests', 'Repository HEAD when collected'),
    `Source: GitHub API for \`${repo}\` (\`gh pr list\` and the pull request review and comment endpoints), read at collection time. Authors do not approve their own pull requests; reviews state a finding or a reason (repository rule). Pull requests without a review are listed separately and are not claimed as reviewed.\n`,
    `## Reviewed pull requests (${reviewed.length} of ${prs.length})\n`,
    '| PR | Title | Base ← head | State | Author | Reviews (reviewer: state) | Inline comments | Review text (first review with text) |\n| ---: | --- | --- | --- | --- | --- | ---: | --- |',
    ...reviewed.map((p) => `| #${p.number} | ${p.title.replace(/\|/g, '/').slice(0, 70)} | \`${p.baseRefName}\` ← \`${p.headRefName}\` | ${p.state}${p.mergedAt ? ` (${p.mergedAt.slice(0, 10)})` : ''} | ${authorOf(p)} | ${states(p)} | ${p.inline} | ${excerpt(p)} |`),
    '',
    '## Pull requests without a review\n',
    ...(prs.filter((p) => !reviewed.includes(p)).length ? prs.filter((p) => !reviewed.includes(p)).map((p) => `- #${p.number} ${p.title.slice(0, 80)} (${p.state})`) : ['None.']),
    '',
  ].join('\n')
  // Screenshots of the real GitHub pages (the repository is public): the pull request header and the first review.
  const shots = []
  if (!argv.includes('--no-screenshots')) {
    const { chromium } = await import('@playwright/test')
    mkdirSync(join(EV, 'prs'), { recursive: true })
    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 })
    for (const p of reviewed) {
      try {
        await page.goto(`https://github.com/${repo}/pull/${p.number}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForSelector('[id^="pullrequestreview-"], .js-discussion', { timeout: 30000 })
        const head = page.locator('#partial-discussion-header').first()
        const rev = page.locator('[id^="pullrequestreview-"]').first()
        const a = `prs/pr-${p.number}-header.png`
        if (await head.count()) await head.screenshot({ path: join(EV, a), timeout: 15000 })
        else await page.screenshot({ path: join(EV, a), clip: { x: 0, y: 160, width: 1100, height: 240 } })
        let b = null
        if (await rev.count()) {
          b = `prs/pr-${p.number}-review.png`
          await rev.evaluate((e) => { e.style.maxHeight = '900px'; e.style.overflow = 'hidden' })
          await rev.screenshot({ path: join(EV, b), timeout: 20000 })
        }
        shots.push({ p, a, b })
      } catch (e) {
        console.warn(`  screenshot of PR #${p.number} failed: ${String(e).slice(0, 100)}`)
      }
    }
    await browser.close()
  }
  const shotMd = shots.length
    ? [
        '## Screenshots of the reviewed pull requests\n',
        'Taken from the public GitHub pages at collection time: the pull request header (title, state, branches) and the first review on the conversation tab. Long reviews are cut at 900 px; the full text is on GitHub and in the table above.\n',
        ...shots.flatMap(({ p, a, b }) => [`### PR #${p.number} — ${p.title.replace(/[#|]/g, '').slice(0, 80)}\n`, `![PR #${p.number} header](${a})\n`, b ? `![PR #${p.number} first review](${b})\n` : '_No review block was found on the page._\n']),
      ].join('\n')
    : ''
  writeFileSync(join(EV, '40-git-process.md'), md + shotMd)
  writeFileSync(join(OUT, 'pr-list.json'), JSON.stringify(prs.map((p) => ({ n: p.number, reviewed: reviewed.includes(p) })), null, 1))
  console.log(`git: ${prs.length} PRs, ${reviewed.length} with reviews, ${shots.length} screenshotted`)
}

if (steps.length === 0) {
  console.error('usage: collect-evidence.mjs <tests|register|git|all> [--out dir] [--pw-config file]')
  process.exit(2)
}
if (want('tests')) collectTests()
if (want('register')) collectRegister()
if (want('git')) await collectGit()
