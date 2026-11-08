# AGENTS.md

## Working rules (user-mandated — follow always)
1. **Read before deciding.** Before any decision about scope, behavior, tests, workflow or grading, read these first (in order of relevance): `docs/features.md`, `docs/srs.md`, `docs/system-sds.md`, `docs/traceability.md`, `docs/sprints/plan.md`, `docs/local/group_work_specs_v1.md`, `docs/local/project_deliverable_1_v1.md` (the `docs/local/` files are local-only and git-ignored, so they are not in the repo). Do not decide from filenames or memory — the docs are the contract. **Read them section-by-section, never whole-file:** consult `docs/local/docs_index.md` (line-map: question → file → line range) and open only the rows you need (~2k tokens instead of ~50k). Its line numbers drift when docs change — re-grep the heading first if the offset looks off. The index is navigation only; the doc itself is always the contract.
2. **Commit yes, push never.** Creating/updating local commits is allowed; **pushing anything is forbidden** (branches, tags, `main`, staging — nothing). No `git push`, no force-push, no `--set-upstream`. The user pushes manually when ready.
3. **PR drafts only after user confirmation.** When the user confirms a feature/issue is *actually done*, draft the pull request as an **English `.md` file** at `docs/local/pr-drafts/pr-<issue-or-feature-id>.md`. Never draft one speculatively; ask the user questions first if anything about the change is unclear.
4. **Keep the session log current.** Read the latest `docs/local/session_log_*.md` at session start (after AGENTS.md) and **update it before the session ends**: record decisions made, files/commits/PRs touched, resolved vs still-open questions, and the next concrete step — so any new session can continue from it alone. When the date rolls over, roll the log forward (new dated file + update the AGENTS.md pointer) instead of leaving a stale log. Always cross-check live state with `gh` (issues/PRs/labels/reviews) before trusting the log.
5. **Ask before installing.** Never install, add, remove or update any dependency or global tool without the user's explicit permission first — list the packages, versions and the reason, then wait for approval. (Granted retroactively: the 5 Nov pnpm install for the foundation.)
6. **pnpm only.** `pnpm` is the package manager for this repo (no `npm install`, no `yarn`, no `package-lock.json`); `package.json` keeps `"packageManager": "pnpm@…"`. This also applies to CI workflows when Lab 5 lands. Rule 5 still governs every install.
7. **PR text must not overclaim.** Every statement in a PR title/body/draft must be backed by something actually run or read in this session (command output, test counts, a doc line). Do not say "verified", "all", "no leaks" or "matches the contract" unless it was checked; say what was checked and what was not. Do not claim an AC is satisfied when only its preconditions are tested, do not list work as done that is out of scope or not yet committed, and state known gaps plainly.
8. **Re-check the PR draft after every update.** After any change to code, tests, docs, commits (amend/reset/rebase/new commit) or branch state, re-read `docs/local/pr-drafts/pr-<id>.md` and correct it against the current state — test counts, commit list/hashes, file names, base branch, scope statements — before reporting the work as done.

## What this repo is
- CPE 334 two-person course project **bunnyfit** (Habit & Activity Tracking, exercise domain). Graded deliverables cite repo tags/commits and `docs/` paths, so doc/commit/branch hygiene is part of the product.
- **Docs-first, contract-first:** each feature's contract (`docs/sprints/sprint-N/F-xx.md`: feature SDS, AC, STS, DoD) must be committed as a *spec-only commit before* its implementation. Never silently rewrite docs — add a version row in the revision history instead.
- Repo state (6 Nov 2026): the docs baseline (PR #13) and the Sprint 1 API/UI specs (PR #15) are merged into `staging/sprint-1`; code starts on `feature/sys01-foundation` (issue #1). No direct commits to staging (group_work_specs §5.3/§8.3); push remains forbidden per working rule 2. `docs/sprints/sprint-1/` contracts are committed as spec-only commits before implementation; **`docs/local/` is internal working notes and is git-ignored — never commit it.** Build/test commands live in `README.md`.

## Sources of truth (precedence on conflict)
1. `docs/system-sds.md` — stack, data model, API/auth/error conventions, route policy, config, CI plan. Rules that every contract must follow.
2. `docs/traceability.md` (RTM) — AC ↔ TEST mapping (`AC-01a` → `TEST-01a`, 1:1 same suffix), **fixed test file paths**, and the §3.1 status register that must be updated with actual results/commits.
3. `docs/sprints/plan.md` — sprint scope, workflow, Product Definition of Done.
4. `docs/sprints/sprint-N/F-xx.md` — exact per-feature endpoints and request/response shapes.
5. `docs/local/` — course brief + internal Thai working notes; superseded by the baseline docs on conflict.

### Local working files (`docs/local/`) — session handoff
- `plan_nakagamon_deliverable1.md` — operative day-by-day plan for Deliverable 1 (due Sun 8 Nov 2026, target submit before 20:00). Update it as work progresses; it maps Nakagamon's GitHub issues to days, AC/TEST IDs and PDF evidence.
- `docs_index.md` — section line-map for all baseline docs (question → file → line range). Use it to read only the needed section instead of whole files; line numbers drift on doc edits, so re-grep the heading if a read looks wrong.
- `session_log_2026-11-08.md` (latest; rolled forward — earlier `session_log_2026-11-0[5-7].md` files never existed on disk) — PR #19 review verdict (REQUEST CHANGES: B1 body overclaim, B2 Windows `startup.test` failure 165/167, M1–M6), evidence in `docs/local/review/pr19-review.md`. Read at session start for current state.
- `github_issues.md` — snapshot of GitHub issues taken 5 Nov 2026; may go stale. Get live state with `gh issue list --repo Rabbit-hop/bunnyfit --state all`.
- `pr-drafts/` — English PR drafts, created only per working rule 3.
- **De facto assignment (from GitHub issues, newer than `plan.md` §4.5):** Nakagamon = `fahsai-02` owns issues #1, #3, #4, #5, #6, #11 (foundation, backend F-01/F-03/F-04/F-06, contracts/test output); Onsinee = `justfepwx12` owns #2, #7–#10, #12 (Prisma+scaffold, all UI, PDF). Where `plan.md` §4.5 and the issues disagree, **the issues win** (they are the graded tracking artifact and were created later).
- Sprint 1 contracts F-01, F-02, F-03, F-04 and F-06 exist in `docs/sprints/sprint-1/`; Nakagamon is primary author of all five and Onsinee reviews (plan §8).

## Stack (decided — SDS §2.1)
TypeScript everywhere; Node + Express API that also serves the built React SPA (one origin, no CORS); PostgreSQL + Prisma (committed migrations: `prisma migrate dev` locally, `migrate deploy` in CI); Vitest + Supertest (integration tests hit a **real** Postgres test DB via `DATABASE_URL_TEST`, not mocks); Playwright E2E; multi-stage Docker; GitHub Actions → GCP (Lab 5).

Planned layout (SDS §2.5): `server/` (routes, middleware, services, domain, repositories, config), `web/`, `prisma/` (schema, migrations, seed), `tests/{unit,integration,e2e,system,performance}/`. `package.json` exists (pnpm); `server/` foundation is in place, `web/` and `prisma/` are pending (issue #2). Keep this layout and record exact commands in the README.

## Conventions easy to get wrong
- **Dates:** business "today" = Asia/Bangkok calendar date; the server reads time only through an injectable `Clock`; dates stored `YYYY-MM-DD`, timestamps UTC. Date-dependent tests (AC-10c, AC-18a, AC-19d) replace the Clock and use dated seed rows.
- **Identity from the token only:** participant data is never addressed by a `userId` in the path; self-scoped endpoints reject a foreign `userId` query param with 403.
- **Declarative route policy registry:** every route is registered with `{method, path, allowed roles, ownership, feature ID}`; AC-12c/AC-22c tests fail if a route lacks a policy or matrix entry. New endpoints cannot skip this.
- **Error envelope:** `{ code, message, fields }` using the fixed codes (`QUICK_COMPLETE_NOT_AVAILABLE`, `LOG_DATE_MISMATCH`, `ENTRY_NOT_EDITABLE`, `VALIDATION_ERROR`, `NOT_FOUND`, `CATEGORY_HAS_TEMPLATES`, `INTERNAL_ERROR`); never leak stack traces, SQL or tokens.
- **Derived values are computed on read** (scores, streak, calories, summary) by pure domain functions — never stored aggregates.
- **Invariants:** `PlanItem` rows are never updated in place (goal change = new version with `effectiveFrom` = today); `UserExercise.sourceTemplateId` is a plain column with **no FK** (template edits/deletes must not affect participant snapshots); `WeightLog` is append-only; Quick Complete is idempotent → 200 with `entry: null`.
- A Manager must never receive Participant activity data (BR-04 / Exclusion 3), and business rules are enforced server-side — UI checks are only a convenience.

## Testing
- Put each test in the exact file the RTM's "Target Verification File Path" column names; test IDs follow the AC suffix.
- Integration suites run against PostgreSQL from migrations + a known seed, with per-suite cleanup and no test-order dependence. Seed (`prisma/seed.ts`) must satisfy SRS Appendix A.6 (1 Manager, ≥2 Participants, 4 categories, all 6 `trackingMode` values) and can insert dated history rows.
- TDD with visible red/green commits for business-rule, defect and Lab 7 change work. Never weaken a test to make behavior pass.
- Planned CI gates (once Lab 5 lands): PR → staging = install, type-check, build, unit, API/DB integration; PR → `main` adds Playwright E2E + system tests; required checks block merge.

## Git workflow (plan §10, SDS §9.5)
- Branches: `main` (released) ← `staging/sprint-N` (e.g. `staging/sprint-1`, matching `plan.md` §10) ← `feature/F-xx-…` / `fix/…`. Release tags: `sprint1-v1.0.0`, `sprint2-v1.0.0`, `final-v1.0.0` — never move or replace a tag that was submitted.
- Issue → branch from staging → bounded change + tests + doc updates → PR into staging with teammate review → reviewed release PR to `main`. Authors never approve their own PRs; reviews must state a specific check, question or finding.
- Sprint 1 scope = **F-01, F-02, F-03, F-04, F-06** only (F-05 and F-11 are deferred to Sprint 2 as CHANGE-01/02). Build order: Foundation (schema, migrations, seed, route-policy registry, test harness, Clock) → F-01 → F-02 → F-03 → F-04 → F-06 → UI → AC-25 journey.

## Secrets and config
- Commit `.env.example` with placeholders only; real values live in untracked `.env` (`.gitignore` already excludes `.env` and `docs/local/`; keep it that way). Secrets are a graded check: never commit real credentials.
- Required vars (SDS §8): `DATABASE_URL`, `DATABASE_URL_TEST`, `JWT_SECRET`, `JWT_EXPIRES_IN_SECONDS`, `BCRYPT_COST`, `APP_TIMEZONE`, `SEED_MANAGER_PASSWORD`, `SEED_PARTICIPANT_PASSWORD`, `PORT`, `NODE_ENV`, `LOG_LEVEL`.
