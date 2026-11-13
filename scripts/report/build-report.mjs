#!/usr/bin/env node
// Assembles the Deliverable 1 PDF (issue #12) from the baseline documents in git and the evidence
// files under the evidence directory. No new dependencies: Markdown is rendered with GitHub's
// `POST /markdown` (through the `gh` CLI, GFM mode) and printed to PDF with the Chromium that
// Playwright already ships with.
//
//   node scripts/report/build-report.mjs [--ref <git ref>] [--evidence <dir>] [--out <dir>] [--no-cache]
//
// --ref       git ref the documents are read from (default HEAD). Use the release commit/tag for the
//             submitted PDF, so the PDF states exactly which commit it describes.
// --evidence  directory with evidence parts (default docs/local/report/evidence), see readEvidence().
// --out       output directory (default docs/local/report, git-ignored).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const REF = opt('ref', 'HEAD')
const OUT = resolve(opt('out', 'docs/local/report'))
const EVIDENCE = resolve(opt('evidence', join(OUT, 'evidence')))
const USE_CACHE = !args.includes('--no-cache')
mkdirSync(join(OUT, 'cache'), { recursive: true })

const git = (...a) => {
  const r = spawnSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`git ${a.join(' ')} failed: ${r.stderr}`)
  return r.stdout
}
const COMMIT = git('rev-parse', REF).trim()
const COMMIT_DATE = git('show', '-s', '--format=%cI', COMMIT).trim()
const COMMIT_SUBJECT = git('show', '-s', '--format=%s', COMMIT).trim()

// ---- documents embedded from git (path relative to the repo root) ------------------------------
const PARTS = [
  {
    id: 'A',
    title: 'Requirements baseline',
    docs: [
      { id: 'srs', title: 'Software Requirements Specification (SRS)', path: 'docs/srs.md' },
      { id: 'features', title: 'Feature Inventory', path: 'docs/features.md' },
      { id: 'rtm', title: 'Requirements Traceability Matrix (RTM) with the Status Register', path: 'docs/traceability.md', landscape: true },
    ],
  },
  {
    id: 'B',
    title: 'Design',
    docs: [
      { id: 'sds', title: 'System-Level Software Design Specification (SDS)', path: 'docs/system-sds.md' },
      { id: 'api', title: 'API Specification (Sprint 1)', path: 'docs/sprints/sprint-1/api-spec.md' },
      { id: 'ui', title: 'UI Specification (Sprint 1)', path: 'docs/sprints/sprint-1/ui-spec.md' },
    ],
  },
  {
    id: 'C',
    title: 'Three-sprint plan',
    docs: [{ id: 'plan', title: 'Three-Sprint Plan', path: 'docs/sprints/plan.md' }],
  },
  {
    id: 'D',
    title: 'Sprint 1 feature contracts',
    docs: [
      { id: 'f01', title: 'F-01 Authentication', path: 'docs/sprints/sprint-1/F-01-authentication.md' },
      { id: 'f02', title: 'F-02 Exercise Library', path: 'docs/sprints/sprint-1/F-02-exercise-library.md' },
      { id: 'f03', title: 'F-03 Goal Setting and 4-Domain Plan', path: 'docs/sprints/sprint-1/F-03-goal-setting.md' },
      { id: 'f04', title: 'F-04 Daily Logging', path: 'docs/sprints/sprint-1/F-04-daily-logging.md' },
      { id: 'f06', title: 'F-06 Progress Display', path: 'docs/sprints/sprint-1/F-06-progress-display.md' },
      { id: 'reg', title: 'Contract Approval Register', path: 'docs/sprints/sprint-1/contract-approval-register.md' },
    ],
  },
]

// ---- Markdown -> HTML through GitHub's renderer (cached by content hash) -----------------------
function renderMarkdown(md) {
  const key = createHash('sha256').update(md).digest('hex').slice(0, 24)
  const cacheFile = join(OUT, 'cache', `${key}.html`)
  if (USE_CACHE && existsSync(cacheFile)) return readFileSync(cacheFile, 'utf8')
  const tmp = join(OUT, 'cache', `${key}.md`)
  writeFileSync(tmp, md)
  const r = spawnSync('gh', ['api', 'markdown', '-f', 'mode=gfm', '-f', 'context=Rabbit-hop/bunnyfit', '-F', `text=@${tmp}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0 || !r.stdout) throw new Error(`gh api markdown failed: ${r.stderr}`)
  writeFileSync(cacheFile, r.stdout)
  return r.stdout
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

/** Mermaid fences become <pre class="mermaid"> so Chromium can draw them. Images become data URIs. */
function finishHtml(html, baseDir) {
  // GitHub returns <pre lang="mermaid" ...>CODE</pre> (older renderers wrapped CODE in <code>)
  let out = html.replace(/<pre lang="mermaid"[^>]*>([\s\S]*?)<\/pre>/g, (_, code) => `<pre class="mermaid">${decode(code.replace(/^<code>|<\/code>$/g, ''))}</pre>`)
  out = out.replace(/<markdown-accessiblity-table>|<\/markdown-accessiblity-table>/g, '')
  if (baseDir) {
    out = out.replace(/<img([^>]*?)src="([^"]+)"/g, (m, pre, src) => {
      if (/^(https?:|data:)/.test(src)) return m
      const file = resolve(baseDir, src)
      if (!existsSync(file)) return m
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' }[extname(file).toLowerCase()] ?? 'application/octet-stream'
      return `<img${pre}src="data:${mime};base64,${readFileSync(file).toString('base64')}"`
    })
  }
  return out
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function versionOf(md) {
  const m = md.match(/\*\*(?:Document Version|Contract Version|Version):\*\*\s*([^\n]+)/)
  return m ? m[1].trim().replace(/\*\*/g, '') : '—'
}

// ---- evidence parts: <evidence>/NN-title.md (+ images next to them) ----------------------------
function readEvidence() {
  if (!existsSync(EVIDENCE)) return []
  return readdirSync(EVIDENCE)
    .filter((f) => /^\d\d-.+\.md$/.test(f))
    .sort()
    .map((f) => {
      const md = readFileSync(join(EVIDENCE, f), 'utf8')
      const title = (md.match(/^#\s+(.+)$/m) ?? [, basename(f, '.md')])[1]
      return { id: f.slice(0, 2), title, file: f, md }
    })
}

// ---- build the section list --------------------------------------------------------------------
const sections = []
for (const part of PARTS) {
  for (const doc of part.docs) {
    const md = git('show', `${COMMIT}:${doc.path}`)
    sections.push({
      key: doc.id,
      part: `Part ${part.id} — ${part.title}`,
      title: doc.title,
      version: versionOf(md),
      path: doc.path,
      landscape: Boolean(doc.landscape),
      html: finishHtml(renderMarkdown(md)),
    })
  }
}
const evidenceParts = readEvidence()
const EVIDENCE_LETTERS = ['E', 'F', 'G', 'H', 'I', 'J']
evidenceParts.forEach((ev, i) => {
  sections.push({
    key: `ev${ev.id}`,
    part: `Part ${EVIDENCE_LETTERS[i]} — Evidence`,
    title: ev.title,
    version: `generated ${new Date().toISOString().slice(0, 10)}`,
    path: `evidence/${ev.file}`,
    landscape: ev.md.includes('<!-- landscape -->'),
    html: finishHtml(renderMarkdown(ev.md), EVIDENCE),
  })
})

// ---- HTML shell --------------------------------------------------------------------------------
const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm 14mm; }
@page land { size: A4 landscape; margin: 14mm 10mm 16mm 10mm; }
html { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; color: #1f2430; line-height: 1.4; }
body { margin: 0; }
h1, h2, h3, h4 { color: #14192b; line-height: 1.25; break-after: avoid; }
h1 { font-size: 17pt; border-bottom: 2px solid #b6cbfe; padding-bottom: 3pt; }
h2 { font-size: 13pt; margin-top: 16pt; }
h3 { font-size: 11pt; } h4 { font-size: 10pt; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 7.6pt; table-layout: auto; }
th, td { border: 0.6pt solid #b8c0d4; padding: 2.5pt 4pt; vertical-align: top; overflow-wrap: break-word; word-break: normal; }
td:first-child, th:first-child { min-width: 2.4em; }
th { background: #e9eefc; text-align: left; }
tr { break-inside: avoid; }
code, pre { font-family: Consolas, "Courier New", monospace; font-size: 7.8pt; }
code { background: #f0f2f8; padding: 0 2pt; border-radius: 2pt; overflow-wrap: anywhere; }
pre { background: #f5f6fa; border: 0.6pt solid #d4d9e8; padding: 5pt; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; }
pre code { background: none; padding: 0; }
pre.mermaid { background: #fff; text-align: center; white-space: normal; }
pre.mermaid svg { max-width: 100%; height: auto; }
blockquote { margin: 6pt 0; padding: 2pt 8pt; border-left: 3pt solid #b6cbfe; color: #3f4560; }
img { max-width: 100%; }
hr { border: 0; border-top: 0.6pt solid #d4d9e8; }
a { color: #2b4fb8; text-decoration: none; }
.section { break-before: page; }
.section.land { page: land; }
.part-label { font-size: 8.5pt; letter-spacing: 0.5pt; text-transform: uppercase; color: #5a6385; margin: 0 0 2pt; }
.src { font-size: 7.5pt; color: #5a6385; margin: 0 0 8pt; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; }
.cover h1 { font-size: 26pt; border: 0; margin: 0 0 6pt; }
.cover .sub { font-size: 13pt; color: #3f4560; margin-bottom: 18pt; }
.cover table { font-size: 9pt; width: auto; }
.toc { break-before: page; }
.toc table { font-size: 9pt; }
.toc td.pg { text-align: right; width: 28pt; }
.toc tr.part td { background: #e9eefc; font-weight: 600; }
`
const MERMAID = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"></script>
<script>window.addEventListener('load', async () => { try { mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' }); await mermaid.run({ querySelector: 'pre.mermaid' }) } catch (e) { document.body.dataset.mermaidError = String(e) } document.body.dataset.ready = '1' })</script>`

const sectionHtml = (s) => `<section class="section${s.landscape ? ' land' : ''}" id="s-${s.key}">
<p class="part-label">${esc(s.part)}</p>
<p class="src">${esc(s.title)} · <code>${esc(s.path)}</code> · version ${esc(s.version)} · commit <code>${COMMIT.slice(0, 8)}</code></p>
${s.html}
</section>`

const shell = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Deliverable 1 report</title><style>${CSS}</style></head><body>${body}${MERMAID}</body></html>`

// ---- printing + page counting ------------------------------------------------------------------
const browser = await chromium.launch()
async function print(html, { footer = true } = {}) {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 }).catch(() => {})
  const err = await page.evaluate(() => document.body.dataset.mermaidError ?? '')
  if (err) console.warn('  mermaid:', err.slice(0, 120))
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: footer,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-size:7px;color:#5a6385;padding:0 14mm;display:flex;justify-content:space-between"><span>BunnyFit — Deliverable 1 report · commit ${COMMIT.slice(0, 8)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  })
  await page.close()
  return pdf
}
const pagesIn = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length

console.log(`Building report from ${COMMIT.slice(0, 8)} (${REF}): ${sections.length} sections`)
const counts = {}
for (const s of sections) {
  counts[s.key] = pagesIn(await print(shell(sectionHtml(s)), { footer: false }))
  console.log(`  ${s.key.padEnd(8)} ${String(counts[s.key]).padStart(3)} pages  ${s.title}`)
}

// Every evidence chapter names the commit it was collected on; show them so a mismatch with the documents is visible.
function evidenceCommitRows() {
  const rows = evidenceParts.map((ev) => {
    const m = ev.md.match(/(?:Commit under test |s*|on commit )`([0-9a-f]{40})`/)
    if (!m) return null
    const same = m[1] === COMMIT
    return `<tr><th>Evidence: ${esc(ev.title)}</th><td><code>${m[1].slice(0, 12)}</code> ${same ? '(same as the documents)' : '<b>differs from the documents commit</b>'}</td></tr>`
  })
  return rows.filter(Boolean).join(String.fromCharCode(10))
}

const cover = `<section class="cover">
<p class="part-label">CPE 334 Software Engineering</p>
<h1>BunnyFit — Habit and Activity Tracking System</h1>
<div class="sub">Deliverable 1 report · Sprint 1 (exercise domain)</div>
<table>
<tr><th>Team</th><td>Nakagamon Saengdara (67070501064) · Onsinee Chotchuangsakulchai (67070501078)</td></tr>
<tr><th>Repository</th><td>github.com/Rabbit-hop/bunnyfit</td></tr>
<tr><th>Documents read from</th><td><code>${esc(REF)}</code> = commit <code>${COMMIT}</code><br>${esc(COMMIT_SUBJECT)} (${esc(COMMIT_DATE)})</td></tr>
${evidenceCommitRows()}<tr><th>Report generated</th><td>${new Date().toISOString()}</td></tr>
<tr><th>Generator</th><td><code>scripts/report/build-report.mjs</code> (issue #12)</td></tr>
</table>
</section>`

const tocRows = (pageOf) => {
  let last = ''
  return sections
    .map((s) => {
      const head = s.part !== last ? `<tr class="part"><td colspan="3">${esc(s.part)}</td></tr>` : ''
      last = s.part
      return `${head}<tr><td><a href="#s-${s.key}">${esc(s.title)}</a></td><td><code>${esc(s.path)}</code> · ${esc(s.version)}</td><td class="pg">${pageOf(s)}</td></tr>`
    })
    .join('\n')
}
const tocHtml = (pageOf) => `<section class="toc"><h1>Table of contents</h1><table><thead><tr><th>Document</th><th>Source · version</th><th>Page</th></tr></thead><tbody>${tocRows(pageOf)}</tbody></table></section>`

// the TOC length does not depend on the numbers, so count it once with placeholders
const tocPages = pagesIn(await print(shell(tocHtml(() => '000')), { footer: false }))
let page = 1 + 1 + tocPages // cover (1) + TOC pages, then the first section starts on the next page
const start = {}
for (const s of sections) {
  start[s.key] = page
  page += counts[s.key]
}
const fullHtml = shell(cover + tocHtml((s) => start[s.key]) + sections.map(sectionHtml).join('\n'))
const pdf = await print(fullHtml)
const total = pagesIn(pdf)
if (total !== page - 1) console.warn(`  WARNING: expected ${page - 1} pages, PDF has ${total}; TOC numbers may be off`)
writeFileSync(join(OUT, 'report.html'), fullHtml)
writeFileSync(join(OUT, 'Deliverable1-Report.pdf'), pdf)
await browser.close()
console.log(`Wrote ${join(OUT, 'Deliverable1-Report.pdf')} (${total} pages)`)
