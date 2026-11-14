# Deliverable 1 report scripts (issue #12)

These scripts assemble the Deliverable 1 PDF from the documents in git and from evidence that is
produced by running commands. Nothing in the evidence chapters is typed by hand. No new dependency is
needed: Markdown is rendered by GitHub's `POST /markdown` (through `gh`), and the PDF is printed by the
Chromium that Playwright already installs.

| Script | What it does | Output (default `docs/local/report/`, git-ignored) |
| --- | --- | --- |
| `collect-evidence.mjs tests` | `tsc` x3, Vitest, Playwright, each with its JSON reporter | `evidence/10-test-execution.md`, `test-summary.json` |
| `ui-evidence.spec.ts` (run with `playwright.evidence.config.ts`) | screenshots: normal workflow, rule rejection, role restriction (403) | `evidence/30-ui-evidence.md`, `evidence/screens/*.png` |
| `collect-evidence.mjs register` | parses RTM section 3.1 and maps it to the test run | `evidence/20-rtm-status-register.md` |
| `collect-evidence.mjs git` | reviewed pull requests from the GitHub API and screenshots of their pages | `evidence/40-git-process.md`, `evidence/prs/*.png` |
| `build-report.mjs` | prints the baseline documents (read from a git ref) and every `evidence/NN-*.md` into one PDF with a cover, a table of contents with page numbers and page footers | `Deliverable1-Report.pdf`, `report.html` |

## Producing the submitted PDF

Do this on a clean checkout of the release commit (tag `sprint1-v1.0.0`), with PostgreSQL running and `pnpm`
working. Evidence must be collected on the same commit that `--ref` names, otherwise the PDF describes two
different states.

```powershell
git switch --detach sprint1-v1.0.0
pnpm exec prisma migrate reset --force   # optional: empties the dev DB so the screenshots are not cluttered by test rows
pnpm db:seed
node scripts/report/collect-evidence.mjs tests
$env:EVIDENCE_DIR = "docs/local/report/evidence"
pnpm exec playwright test -c scripts/report/playwright.evidence.config.ts
node scripts/report/collect-evidence.mjs register git
node scripts/report/build-report.mjs --ref sprint1-v1.0.0
```

`prisma migrate reset` deletes all data in the database named by `DATABASE_URL`; skip it if that data matters.

## What the report does and does not claim

- The Result column of the status register is copied from `docs/traceability.md` as its authors wrote it. The
  "This run" column only says whether the planned test file ran without failure in the collected run.
- An AC that was not run end to end (for example AC-23 and AC-25 while their E2E suites are open) stays PLANNED in
  the register and is listed as "not PASS" in the evidence chapter.
- If the working tree has uncommitted changes when evidence is collected, the evidence page says so.
- The PR screenshots are taken from the public GitHub pages (header and first review). Only pull requests that have
  a review in the GitHub API are listed as reviewed.
