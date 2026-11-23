### Feature Engineering Contract: F-10 Monthly Progress Summary
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-10
**Sprint:**  3 (implementation after F-08 and F-11 are merged; plan §6.3)
**Contract Version:**  0.1.3
**SRS Baseline Version:**  1.1.0 (Feature Inventory, RTM and System-Level SDS as on `staging/sprint-2`)
**Date:**  23 November 2026
**Status:**  Draft: concise contract for Deliverable 2 Part C ("enough detail to control implementation, not a frozen final design"). No implementation is claimed
**Primary Author:**  Nakagamon  |  **Reviewer:**  Onsinee
**Repository Path:**  `docs/sprints/sprint-3/F-10-monthly-summary.md`

--------------------------------------------------------------------------------

#### Contract Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 23 Nov 2026 | Initial concise contract (issue #82): endpoint and response shape, rules, AC-26a–c, STS, Access Matrix rows, DoD, assumptions on F-06, F-08 and F-11, open items | Nakagamon | Draft |
| **0.1.1** | 23 Nov 2026 | Decisions by the user (issue #82): (1) entries of exercises not planned on the day and free-form Rest Day entries count toward kcal and per-exercise totals (still unscored for percentages); (2) the monthly kcal is the sum of the days' unrounded kcal values rounded once at the end; (3) monthly kcal fields belong to F-10 (Sprint 3), not F-11; (4) field `restDays` renamed `restDaysExcluded` to agree with F-06 §4.2. Open items 3 and 6 closed; new open items 8–9 (conflict with F-11 R6 and F-11 §4.2) | Nakagamon | Draft |
| **0.1.2** | 23 Nov 2026 | Decision (lead, delegated by the user): days without a `WeightLog` on or before the day are not counted in monthly kcal; new field `kcalDaysSkipped`; `totalKcal` is `null` only when every day with activity lacks a weight (new R11–R13, §3.2 rows, §4.1, STS TEST-26a-7..9). F-11 re-read at v0.1.1: F-11 no longer touches the monthly route and rounds its daily total once; open item 9 closed, open item 8 restated as a precise pending item for the F-11 reviewer | Nakagamon | Draft |
| **0.1.3** | 23 Nov 2026 | Changes after the review of PR #103 (Onsinee, 23 Nov, `afbf04a`), each checked against the repository before editing: (1) §4.2 states that the service builds the Streak window `[earliest effectiveFrom, today]` through the F-08 service function shared with `GET /api/streak` and what this costs (review item 2); (2) the seed month gives `currentStreak` **2** and `todayPending` true by F-08 R6 (item 3, hand walk below in §5); (3) R7/R8 now say that entries count when dated inside `[from, to]` and §13 item 4 states the decision needed from both members for entries before the first `effectiveFrom` and for a user without a plan (item 4; behaviour **not** changed here); (4) R8 no longer promises a 0.1 difference between rows and total (item 7); (5) §2, §4.2, §11 and §13 items 2 and 8 updated to the F-11 0.1.2 and F-08 0.1.0 interfaces (`calcStreak`, `pickBodyWeight`, `estimateMinutes`, `calcCalories`, `roundKcal`; not `withCalories`); unit is exercise-day (item 8); (6) `buildSummary` signature extended (item 9); (7) §5 fixtures insert explicit `WeightLog` rows, Friday made exact with Squat ratio 1.0 and Plank ratio 0.25 (item 10, nit); (8) §6 text for incomplete kcal (item 11); (9) §12 lists the baseline impact (item 6); (10) test-id order and Clock of TEST-26c-3 (nits). Not taken: concrete kcal numbers in TEST-26a-2 (needs a worked calculation per day; stays open item 5) | Nakagamon | Draft |

*Rule: later changes are new versions with a reason, never silent rewrites.*

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
F-10 is a **read-only report** for one Participant and one calendar month. It adds no table and stores nothing: every value is computed on read (SDS §2.4) from the plan (F-03/F-07), the ledger (F-04/F-05), the progress calculation (F-06), the Streak (F-08) and calories (F-11).

| In scope | Out of scope |
| ------ | ------ |
| `GET /api/summary?month=YYYY-MM` with the fields in §4 | Re-specifying the monthly average (F-06), Streak (F-08) or calories (F-11); F-10 only reuses them |
| Summary screen (one card list on the Progress tab, §6) | Charts, export, comparison between months, Manager views (BR-04, Exclusion 3) |
| Consistency with `GET /api/progress/monthly` (AC-26b) | Caching (computed on read) |

--------------------------------------------------------------------------------

#### 2. Linked Requirements and Dependencies
| Requirement / AC | How F-10 serves it |
| ------ | ------ |
| **FR-05**, **FR-06**, **BR-07** | Targeted-days-only average, Streak and calories shown as one monthly report |
| **BR-04 / NFR-02** | Summary is private: Manager 403, foreign `userId` 403, no token 401 |
| **NFR-01 / AC-21b** | The route is one of the "all protected endpoints" in the Sprint 3 latency run (see SYS-01) |

**Depends on:** F-06 (daily result, unrounded percent, monthly average, `GET /api/progress/monthly`; Sprint 2, AC-15), F-08 (current Streak; Sprint 2), F-11 (estimated kcal and `WeightLog` lookup; Sprint 2), F-01 (registry, envelope, Clock). The F-08 contract (0.1.0, PR #107) and the F-11 contract (0.1.2, PR #105, approved) are in `docs/sprints/sprint-2/`; the F-08 contract is not yet approved. This contract does not wait for them.

**Interfaces read from the F-08 (PR #107, 0.1.0) and F-11 (PR #105, 0.1.2) contracts on 23 Nov (listed again in §13):**
- F-08 §4.5 gives `calcStreak(days: DayPercent[], today)`, which needs one `DayPercent` for every date from the earliest plan `effectiveFrom` up to today, and F-08 §3.2 R6 defines the value; `GET /api/streak` returns the same number.
- F-11 (0.1.2, `docs/sprints/sprint-2/F-11-calories.md`) provides `pickBodyWeight(rows, date)` (latest `WeightLog` row with `effectiveDate` on or before the date; one weight per date, F-11 R2/R10), `estimateMinutes`, `calcCalories` (unrounded `Exact`) and `roundKcal`, and §4.2/§11 state that F-10 reuses them per day. F-10 must call these pure functions and round once itself; it must **not** call `withCalories` (it returns rounded values). F-11 computes minutes from the day's **cumulative** values per exercise (R4/R12), so the unit F-10 sums is the **exercise-day**, not the single entry; the three minute formulas are linear, so the numbers agree, but F-10 must not re-implement the minutes rule per entry.
- Assumes F-06 `calcMonthly` returns `targetedDays`, `restDaysExcluded` and `averagePercent` as in F-06 §4.2 and that the F-06 `from`/`to` window rule (R10) is the one F-10 reuses.

--------------------------------------------------------------------------------

#### 3. Feature Design (Feature-Level SDS)
##### 3.1 Business Rules
| ID | Rule |
| ------ | ------ |
| R1 | Only role `PARTICIPANT` may call the route; authorization is checked before validation (as F-06 R1) |
| R2 | The summary covers the same window as F-06 R10: `from = max(first day of month, first effectiveFrom of the user)`, `to` = today for the current month, month end for a past month. For a user without any plan item `from` is undefined and the window is empty (see §13 item 4) |
| R3 | `targetedDays` = days in `[from, to]` on which at least one plan item occurs; `restDaysExcluded` = the other days in `[from, to]` (same name and meaning as F-06 §4.2, so both routes agree) |
| R4 | `daysAtOrAbove70` = number of targeted days whose **unrounded** Daily Overall % is `≥ 70` (SRS A.4; no rounding before comparing) |
| R5 | `averagePercent` is the F-06 monthly average and **must equal** `GET /api/progress/monthly` for the same month and Clock (AC-26b); `null` when `targetedDays` is 0. F-10 calls the same domain function, it does not recompute with a second formula |
| R6 | `currentStreak` is the F-08 Streak at today (not "the streak inside the month"; reviewer confirmed on PR #103). For a past month it is the same number as `GET /api/streak` now, and the UI labels it "as of today". It is computed over the F-08 window `[earliest effectiveFrom, today]`, not over `[from, to]` (§4.2) |
| R7 | `totalKcal` = sum of the **unrounded** kcal of every entry dated in a **counted day** (R11) in `[from, to]` (entries dated outside `[from, to]` are not summed; §13 item 4) (summed per day, then over the days), **rounded once at the end** to 1 decimal, half up (SRS A.4; decimal arithmetic). **All entries count**, including entries of exercises not planned on that day and free-form Rest Day entries (user decision, 23 Nov 2026): they stay unscored for percentages (F-06) but are counted for kcal. Monthly kcal fields belong to F-10 (Sprint 3), not to F-11 |
| R8 | `exercises[]` has one row per exercise with at least one entry in `[from, to]` (planned or not, Rest Day or not): the summed tracked value in that exercise's unit (reps, seconds or km) and its kcal (unrounded sum, rounded once); sorted by name, then id. `totalKcal` is the unrounded sum over all entries rounded once; **no tolerance is promised** between the rounded `exercises[].kcal` values and `totalKcal` (each row can move by up to 0.05, so the gap can reach 0.05 × (n + 1) for n rows), and no test asserts that the rows add up to the total (same acceptance as F-11 R6). Only the kcal figures skip uncounted days (R11); `total` (reps, seconds, km) sums all entries |
| R9 | `month` defaults to the current month; a malformed value or a month after the current month → 400 `VALIDATION_ERROR` (as F-06 R13) |
| R10 | Read-only: no request changes any row; past months are computed from the plan versions and entries that existed for each date (BR-11) |
| R11 | **Day with activity** = a calendar day in `[from, to]` on which the Participant has at least one entry, of any exercise, planned or not, on a Rest Day or not (consistent with R7). A day with activity is **counted** for kcal when a `WeightLog` row with `effectiveDate` ≤ that day exists (F-11 lookup: weight set on day N applies from day N, so earlier days are not counted), and **skipped** otherwise. Days without activity are neither counted nor skipped |
| R12 | `kcalDaysSkipped` (integer ≥ 0) = number of skipped days; 0 when none. `totalKcal` is `null` only when at least one day with activity exists and **every** such day is skipped; a month with no activity at all gives `totalKcal` 0 and `kcalDaysSkipped` 0. `exercises[].kcal` is `null` when every day with activity of that exercise is skipped, otherwise the sum over its counted days |
| R13 | Skipping affects kcal fields only: percentages, `averagePercent`, `daysAtOrAbove70`, `currentStreak`, `targetedDays`, `restDaysExcluded` and `exercises[].total` are unchanged. A response with `kcalDaysSkipped > 0` tells the client the kcal figure is incomplete |

##### 3.2 Failure and Boundary Cases
| Case | Expected behavior |
| ------ | ------ |
| No token / expired / revoked | 401 `UNAUTHENTICATED` |
| Manager token | 403 `FORBIDDEN`, no Participant data in the body |
| `?userId=<other>` | 403 `FORBIDDEN`; `?userId=<own id>` is accepted |
| `month=2026-13`, `2026-11-05`, `abc`, or a future month | 400 `VALIDATION_ERROR` naming `month` |
| Month before the user's first `effectiveFrom`, or a user without a plan | 200; counts 0, `averagePercent` null, `exercises` empty, `totalKcal` 0 |
| Month with only Rest Days so far | 200; `targetedDays` 0, `averagePercent` null |
| Free-form entry on a Rest Day or of an unplanned exercise | Never scored (F-06 Q24/Q48); **counted** in `exercises[]` and `totalKcal` (R7, R8) |
| Month with activity on days before the first `WeightLog` (weight set mid-month) | Those days skipped (`kcalDaysSkipped` > 0); `totalKcal` sums the later days (R11, R12) |
| Month with activity and no `WeightLog` at all | `totalKcal` null, `kcalDaysSkipped` = number of days with activity, every `exercises[].kcal` null; all other fields normal |
| Any 4xx | Envelope `{code, message, fields}`; invalid input never gives 5xx (AC-26c) |

##### 3.3 Permissions (Access Matrix rows, for AC-12c / AC-22c)
| Route | Unauthenticated | Manager | Participant (own) | Participant (other's `userId`) |
| ------ | ------ | ------ | ------ | ------ |
| `GET /api/summary?month=` | 401 | 403 | Allow | 403 |

Registry policy: `featureId: 'F-10'`, `auth: 'required'`, `roles: ['PARTICIPANT']`, `ownership: 'self-scoped'`. F-10 has no owner-scoped (`:id`) route.

--------------------------------------------------------------------------------

#### 4. API Specification
Conventions follow SDS §5.1 (JSON, envelope of SRS A.5, `YYYY-MM-DD`, `YYYY-MM`).

##### 4.1 `GET /api/summary?month=YYYY-MM`  (Participant; `month` defaults to the current month)
Success `200 OK` (illustrative shape; field names are fixed, exact decimals follow R4–R8):
```json
{
  "month": "2026-11",
  "from": "2026-11-02",
  "to": "2026-11-09",
  "targetedDays": 6,
  "restDaysExcluded": 2,
  "daysAtOrAbove70": 3,
  "averagePercent": 50,
  "currentStreak": 2,
  "totalKcal": 0.0,
  "kcalDaysSkipped": 0,
  "exercises": [
    { "userExerciseId": "uuid", "name": "Barbell Squat", "trackingMode": "WEIGHT", "unit": "reps", "total": 0, "kcal": 0.0 }
  ]
}
```
`totalKcal` and the kcal values above are placeholders (numbers come from F-11 R1–R6); `currentStreak` 2 is the hand-computed value of the seed month in §5; `kcalDaysSkipped` is 0 because the test inserts a weight. Errors: 400, 401, 403.

##### 4.2 Internal interface
```ts
buildSummary(input: {
  month: string; from: string | null; to: string | null;
  monthly: { targetedDays: number; restDaysExcluded: number; averagePercent: number | null };  // result of F-06 calcMonthly
  days: DailyResult[]; exerciseDays: ExerciseDayKcal[];   // per exercise and day: totals and unrounded kcal | no-weight marker
  streak: number;
}): MonthlySummary  // pure, no I/O, no Clock
```
`exerciseDays` has one element per exercise and day with activity (unit = exercise-day, §2), built by the service with `pickBodyWeight`, `estimateMinutes` and `calcCalories`; a day without a weight is marked, which is how `kcalDaysSkipped` is derived (R11). The **service** calls F-06 `calcMonthly` (R5) and passes its three values in; `buildSummary` does not recompute them.

**Streak window.** The service builds the Streak with the F-08 service function over `[earliest plan effectiveFrom, today]`, the same function and data as `GET /api/streak`, not over the month's entries (a past month would otherwise load the wrong range and `currentStreak` would differ from `GET /api/streak`, which TEST-26a-2 asserts). One request therefore reads the plan (all versions) and the entries of the Streak window once and the weight rows once, and calls `calcMonthly` on the month; the Streak window grows with the age of the plan, so the route does more reads than F-06 and is one of the routes whose p95 the AC-21b run must show (SYS-01).

--------------------------------------------------------------------------------

#### 5. Data Specification
**No schema change and no migration.** Reads `UserExercise`, `PlanItem`, `LedgerEntry`, `WeightLog` only.

**Seed month (used by TEST-26a/b).** Clock fixed at Mon 2026-11-09. Alice's plan: Mon–Fri, `effectiveFrom` 2026-11-02, items Squat (WEIGHT, 4 × 10, weight 3) and Plank (BODYWEIGHT_TIME, 120 s, weight 2). Inserted with the historical helpers (`createHistoricalPlanItem`, `createHistoricalEntry`). Expected result by hand:

| Date | Day | Daily % (unrounded) | Counts as |
| ------ | ------ | ------ | ------ |
| 2026-11-02 | Mon | 100 | targeted, ≥ 70 |
| 2026-11-03 | Tue | 50 | targeted |
| 2026-11-04 | Wed | 0 (no log) | targeted |
| 2026-11-05 | Thu | 80 | targeted, ≥ 70 |
| 2026-11-06 | Fri | 70 exactly: Squat ratio 1.0 (4 × 10) and Plank ratio 0.25 (30 s of 120 s) = (3 × 1 + 2 × 0.25) / 5 | targeted, ≥ 70 (boundary, no rounding) |
| 2026-11-07, 08 | Sat, Sun | null (a 600 s free-form Plank entry on Sat is stored) | Rest Days |
| 2026-11-09 | Mon (today) | 0 (no log yet) | targeted |

Expected: `from` 2026-11-02, `to` 2026-11-09, `targetedDays` 6, `restDaysExcluded` 2, `daysAtOrAbove70` 3, `averagePercent` 50 (= 300 / 6; the Saturday Rest Day entry has no effect on the percentage). `currentStreak` **2** and `todayPending` true by F-08 R6 and BR-10: Sun 8 and Sat 7 are Rest Days (skipped), Fri 6 = 70 qualifies, Thu 5 = 80 qualifies, Wed 4 = 0 is a closed targeted day and stops the walk; today (Mon 9, 0 %) adds nothing. It must equal `GET /api/streak` at the same Clock. **kcal counting:** the fixture inserts explicit `WeightLog` rows (for example one row of 70 kg effective 2026-11-01) instead of relying on the seed, because `prisma/seed.ts` gives Alice four rows (71.2, 71.0, 70.8, 70.5 kg on 2026-11-01..04) and Bob none, and the kcal per day would then depend on the changing weight; so every day with activity is counted and `kcalDaysSkipped` is 0 (the no-weight cases are TEST-26a-7 to 26a-9). The 600 s free-form Plank entry on Saturday **is counted** in `totalKcal` and in the Plank row of `exercises[]` (it is unscored but not excluded from kcal); `totalKcal` = the unrounded sum of every seeded entry's kcal, rounded once. Per-exercise `total` is the sum of all seeded reps and seconds including that entry (Plank seconds include the 600 s). Their concrete numbers (F-11 R1–R6 are enough to compute them) are not in this version (open item 5). Entries dated before the first `effectiveFrom` (the boundary of §13 item 4) are not in this seed month, because 2026-11-01 is a Sunday; a separate fixture is needed once item 4 is decided.

--------------------------------------------------------------------------------

#### 6. UI Specification
| Element | Behavior |
| ------ | ------ |
| Summary card (Progress tab, under the monthly average card of F-06) | Month selector (current and past months only); lines: "Targeted days", "Rest days", "Days at 70% or more", "Monthly average (targeted days only)", "Current streak" (labelled "as of today" for a past month), "Estimated calories (kcal)"; a per-exercise list (name, total with unit, kcal). When `kcalDaysSkipped` > 0 the calories line adds "{n} days not counted: no body weight"; when `totalKcal` is `null` the line reads "Set your body weight to see calories" with a link to Profile (as F-11 does for `BODY_WEIGHT_REQUIRED`) |
| Empty month | "No targeted days in this month" when `averagePercent` is null |
| States | Loading skeleton; retry notice on 5xx; 401 back to Login; 403 access-denied screen (SDS §4.2); a 400 for `month` is shown as a field notice |
| Rounding | Percent and kcal displayed to 1 decimal (SRS A.4); the API stays unrounded for percent |
| Manager | No summary screen |

UI behavior is not a separate AC for F-10; the system tests below cover the data and the access rules.

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
Text is copied from RTM §3 (`docs/traceability.md`, AC-26a–c).

| AC | Observable outcome |
| ------ | ------ |
| **AC-26a** | Seeded month with known values → the summary matches exactly: targeted / Rest Day counts, days ≥ 70%, monthly average, current Streak, total kcal, per-exercise totals. |
| **AC-26b** | The monthly average in the summary equals the progress endpoint's value (consistent with AC-15). |
| **AC-26c** | Another user's summary → 403; all 4xx errors use the envelope `{code, message, fields}`; invalid input never produces a 5xx. |

--------------------------------------------------------------------------------

#### 8. Software Test Specification (STS)
File: `tests/system/monthly_summary.test.ts` (RTM §2 and §3.1, Level: System, Vitest + Supertest against the real test database). Fixtures: seeded Manager, Alice, Bob; seed month of §5; replaceable Clock.

| Test ID | AC | Level | Precondition / Input | Action | Expected result |
| ------ | ------ | ------ | ------ | ------ | ------ |
| `TEST-26a-1` | AC-26a | System | Seed month of §5, Alice token | `GET /api/summary?month=2026-11` | 200; `from` 2026-11-02, `to` 2026-11-09, `targetedDays` 6, `restDaysExcluded` 2, `daysAtOrAbove70` 3, `averagePercent` 50 |
| `TEST-26a-2` | AC-26a | System | Same | Same | `currentStreak` **2** and `todayPending` computed by F-08 equal `GET /api/streak`; `totalKcal` equals the unrounded sum of all seeded entries' kcal rounded once; each `exercises[].total` equals the seeded sum including the Saturday entry (numbers fixed after F-08/F-11 approval) |
| `TEST-26a-5` | AC-26a | System | Seed month plus an entry of an exercise that is not planned on a targeted day | Same | The entry is counted in `totalKcal` and `exercises[]` and does not change `averagePercent` |
| `TEST-26a-7` | AC-26a | System | Dana: no `WeightLog` before 2026-11-05, a row effective 2026-11-05; entries on Nov 3, Nov 5 and Nov 6 (Nov 3 is a Rest Day free-form entry) | Same month, Clock 2026-11-09 | `kcalDaysSkipped` 1 (Nov 3); `totalKcal` = Nov 5 + Nov 6 unrounded sum rounded once; `averagePercent`, `currentStreak` and counts identical to a run with a weight from Nov 1 |
| `TEST-26a-8` | AC-26a | System | Bob: no `WeightLog` row at all; entries on 3 different days | Same | `totalKcal` null; `kcalDaysSkipped` 3; every `exercises[].kcal` null while `exercises[].total` is the summed value; 200, no error envelope |
| `TEST-26a-9` | AC-26a | System | Dana: weight effective exactly on 2026-11-05 and a later row on 2026-11-07 with a different weight; entries on Nov 4, 5, 7 | Same | Nov 4 skipped; Nov 5 uses the first weight (lookup `effectiveDate` ≤ day), Nov 7 the second; `kcalDaysSkipped` 1 |
| `TEST-26a-6` | AC-26a | System | Two entries whose item kcal are 18.375 and 5.25 on different days (decimal-exact) | Same | `totalKcal` = round(23.625) = 23.6, not 18.4 + 5.3 = 23.7 (round once) |
| `TEST-26a-3` | AC-26a | System | Fri 2026-11-06 stored as exactly 70% (Squat ratio 1.0, Plank ratio 0.25) | Same | Fri counted in `daysAtOrAbove70` (no rounding drift); a variant with 69.99… is not counted |
| `TEST-26a-4` | AC-26a | System | New Participant with no plan; and Alice for `month=2026-10` (before her first `effectiveFrom`) | Same | 200; counts 0, `averagePercent` null, `exercises` empty, `totalKcal` 0 |
| `TEST-26a-10` | AC-26a | System | Seed month; Clock 2026-11-09 | `GET /api/summary?month=2026-10` and `GET /api/streak` | `currentStreak` of the past month equals `GET /api/streak` (R6, §4.2) |
| `TEST-26b-1` | AC-26b | System | Seed month | `GET /api/summary?month=2026-11` and `GET /api/progress/monthly?month=2026-11` | `averagePercent` values are equal |
| `TEST-26b-2` | AC-26b | System | Past month fixture (October) | Both routes with `month=2026-10` | Equal |
| `TEST-26b-3` | AC-26b | System | Add a Rest Day free-form entry | Both routes | Both unchanged and still equal |
| `TEST-26c-1` | AC-26c | System | Alice and Bob have data | Alice `GET /api/summary?userId=<Bob>&month=2026-11` | 403 `FORBIDDEN`, envelope, no Bob data; Bob's own request → 200 |
| `TEST-26c-2` | AC-26c | System | Manager token; no token | Same route | 403 with no Participant data; 401 |
| `TEST-26c-3` | AC-26c | System | Alice; Clock fixed at 2026-11-09 (so `2026-12` is in the future) | `month=2026-13`, `2026-11-05`, `abc`, `2026-12` (future) | 400 `VALIDATION_ERROR` each, `fields` names `month`; never 5xx; no rows written |
| `TEST-22c (F-10 route)` | AC-22c | Security | Registry contains `GET /api/summary` | No token; Manager token | 401; 403 (run in the SYS-01 matrix test) |

**Coverage check.** Each AC has at least one test (AC-26a: 10, AC-26b: 3, AC-26c: 3). The ids in this table are not in numeric order. The test IDs `TEST-26a-n` are children of RTM `TEST-26a` (same suffix, same file).

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
| Step | Commit type | Content |
| ------ | ------ | ------ |
| 1 | `docs` | This contract (spec-only), reviewed before implementation |
| 2 | `test` (red) | TEST-26a to 26c with the route absent; failing run recorded |
| 3 | `feat` (green) | `buildSummary`, service, route, registry policy |
| 4 | `test` / `feat` | Matrix rows, summary card UI |
| 5 | PR | Reviewed by the teammate into the sprint staging branch |

--------------------------------------------------------------------------------

#### 10. Definition of Done for F-10
| # | Criterion | Evidence required |
| ------ | ------ | ------ |
| 1 | Contract reviewed and approved before implementation | Review comment; commit order |
| 2 | F-08 and F-11 merged and their open items in §13 resolved | Merge commits |
| 3 | Route, service, pure `buildSummary` and registry policy implemented as in §3–4 | Code matches this contract |
| 4 | All tests in §8 implemented and enabled (none skipped), run on the merge commit | Passed / failed / skipped counts |
| 5 | `GET /api/summary` is in the Endpoint Access Matrix (AC-12c / AC-22c) | Matrix test output |
| 6 | TDD red/green evidence for AC-26a and AC-26b | Failing and passing runs with commit IDs |
| 7 | RTM §3.1 rows AC-26a–c updated with actual test names, result and commit | Updated register |
| 8 | No secret committed; README test commands current | Clean-clone run |

--------------------------------------------------------------------------------

#### 11. Dependencies on Other Contracts
| Item | Direction | Note |
| ------ | ------ | ------ |
| `calcMonthly`, `calcDaily`, `GET /api/progress/monthly` | Needed from F-06 | AC-26b compares with it |
| `calcStreak(days, today)` and the F-08 service function, `GET /api/streak` | Needed from F-08 | §2, §4.2 |
| `pickBodyWeight`, `estimateMinutes`, `calcCalories`, `roundKcal` (not `withCalories`) | Needed from F-11 | §2; unit is exercise-day |
| Registry, `requireRole`, envelope, Clock | Needed from F-01 | |
| Access Matrix row | Provided to SYS-01 | AC-12c / AC-22c extension |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
The route, AC-26a–c, SDS §5 (`GET /api/summary?month=`) and §6.1 exist, but this contract adds behaviour that no baseline text states. These are **proposals for the lead to apply**; this contract edits no baseline document.

| # | Pending item | Document | Status |
| ------ | ------ | ------ | ------ |
| P10-1 | SDS §5 response shape of `GET /api/summary`: `totalKcal` nullable, `kcalDaysSkipped`, `restDaysExcluded`, `currentStreak` as of today | SDS | Pending review |
| P10-2 | RTM note on AC-26a: "total kcal" means the kcal rule of R7, R11–R13 (all entries count; days without weight skipped; rounded once) | RTM | Pending review |

Decisions recorded in this contract: 0.1.1 (1)–(4) were made by the user on 23 Nov 2026 (issue #82); 0.1.2 (skip rule R11–R13) was decided by Nakagamon as the lead, delegated by the user. Both are the author's decisions until Onsinee approves.

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | Is `currentStreak` the Streak at today, or the Streak as of the end of the requested past month? SRS/RTM say "current Streak" without defining it for past months | Open; this draft assumes "at today" (R6). Needs the F-08 contract and a decision by both members |
| 2 | Names and shapes of the F-08 Streak function and of the F-11 kcal functions | **Answered at interface level in 0.1.3** (§2): `calcStreak`, `pickBodyWeight`, `estimateMinutes`, `calcCalories`, `roundKcal`; confirm again when F-08 (PR #107) is approved |
| 3 | ~~Do free-form Rest Day entries and unplanned-exercise entries count in totals and kcal?~~ | **Closed in 0.1.1** by the user decision: they count (R7, R8) |
| 4 | **Needs both members.** R7/R8 say every entry counts, but the window `[from, to]` drops entries dated before the first `effectiveFrom`, and for a user without a plan `from` is undefined (then `TEST-26a-4` is only true if the user logged nothing). The reviewer recommends: activity fields (`totalKcal`, `kcalDaysSkipped`, `exercises[]`) use `[first day of month, to]`, and `[from, to]` stays for the percentage fields (`targetedDays`, `restDaysExcluded`, `daysAtOrAbove70`, `averagePercent`); `from` is `null` for a user without a plan; a test with an entry before the first `effectiveFrom`. It changes R2, R7, R8, R11 and §3.2 | Open; **this version keeps `[from, to]` and the exclusion** (R7 says so explicitly) and does not apply the recommendation until both members decide |
| 5 | Concrete expected kcal and per-exercise totals in TEST-26a-2 (the Streak value 2 is fixed in 0.1.3) | Open; computable from F-11 R1–R6 with the explicit `WeightLog` rows of §5, not done in this version |
| 6 | ~~`restDays` vs `restDaysExcluded`~~ | **Closed in 0.1.1**: F-10 uses `restDaysExcluded` as F-06 does |
| 7 | Latency of this route (more reads than progress) | Measured in SYS-01 (AC-21b); no caching unless it fails |
| 8 | ~~Pending item for the F-11 reviewer~~ **Answered in 0.1.3 at interface level** (F-11 0.1.2 §4.4 and §11: the pure functions are reusable and unrounded; use them, not `withCalories`). Original text: F-11 0.1.1 decided R6 (daily `totalCalories` = unrounded sum rounded once; the 0.1.0 conflict is gone) and R12 (`otherActivity` counts), but its API exposes only rounded values: item `calories` rounded to 1 decimal and a rounded daily `totalCalories`; it exposes no unrounded per-day value. Summing the daily totals would round up to ~0.05 per day and break R7 (round once for the month). F-10 needs, from F-11's pure module (not the HTTP response): (a) an unrounded decimal kcal per exercise per day, covering planned items and `otherActivity` alike, plus (b) the weight lookup result per date (found / not found) so F-10 can apply R11. F-11 §11 says the pure functions are reused, which would satisfy this, but its interfaces list (§4) only shows `calcCalories` rounded once | Closed unless the F-11 implementation changes the pure interfaces |
| 9 | ~~F-11 adds monthly kcal fields; days without a body weight~~ | **Closed in 0.1.2**: F-11 0.1.1 §4.2 moved all monthly kcal to F-10 and leaves `GET /api/progress/monthly` unchanged; days without weight are handled by R11–R13 and `kcalDaysSkipped` |
