### Feature Engineering Contract: F-10 Monthly Progress Summary
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-10
**Sprint:**  3 (implementation after F-08 and F-11 are merged; plan §6.3)
**Contract Version:**  0.1.0
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

**Depends on:** F-06 (daily result, unrounded percent, monthly average, `GET /api/progress/monthly`; Sprint 2, AC-15), F-08 (current Streak; Sprint 2), F-11 (estimated kcal per entry and `WeightLog` lookup; Sprint 2), F-01 (registry, envelope, Clock). The F-08 and F-11 contracts are written in parallel in `docs/sprints/sprint-2/` and may not be merged yet; this contract does not wait for them.

**Assumptions (to be checked against the F-08 and F-11 contracts; listed again in §13):**
- Assumes F-08 exposes a pure function or service returning the current Streak for a user at the Clock's today, using the same unrounded `≥ 0.70` comparison (SRS A.4), and that `GET /api/streak` returns the same number.
- Assumes F-11 exposes pure calorie functions (`calcCalories`, F-11 §4 internal interfaces) that give an **unrounded** decimal kcal per entry from the `WeightLog` weight effective on the entry date (F-11 contract 0.1.0, `docs/sprints/sprint-2/F-11-calories.md`, read from a sibling worktree on 23 Nov, not yet merged). F-11 itself rounds each item value once to 1 decimal (A.4); F-10 needs the unrounded value (R7), see open item 8. F-11 returns `calories: null` with `calorieError: "BODY_WEIGHT_REQUIRED"` when no weight exists; how F-10 reports that is open item 9.
- Assumes F-06 `calcMonthly` returns `targetedDays`, `restDaysExcluded` and `averagePercent` as in F-06 §4.2 and that the F-06 `from`/`to` window rule (R10) is the one F-10 reuses.

--------------------------------------------------------------------------------

#### 3. Feature Design (Feature-Level SDS)
##### 3.1 Business Rules
| ID | Rule |
| ------ | ------ |
| R1 | Only role `PARTICIPANT` may call the route; authorization is checked before validation (as F-06 R1) |
| R2 | The summary covers the same window as F-06 R10: `from = max(first day of month, first effectiveFrom of the user)`, `to` = today for the current month, month end for a past month |
| R3 | `targetedDays` = days in `[from, to]` on which at least one plan item occurs; `restDaysExcluded` = the other days in `[from, to]` (same name and meaning as F-06 §4.2, so both routes agree) |
| R4 | `daysAtOrAbove70` = number of targeted days whose **unrounded** Daily Overall % is `≥ 70` (SRS A.4; no rounding before comparing) |
| R5 | `averagePercent` is the F-06 monthly average and **must equal** `GET /api/progress/monthly` for the same month and Clock (AC-26b); `null` when `targetedDays` is 0. F-10 calls the same domain function, it does not recompute with a second formula |
| R6 | `currentStreak` is the F-08 Streak at today (not "the streak inside the month"), see open item 1 |
| R7 | `totalKcal` = sum of the **unrounded** kcal of every entry dated in `[from, to]` (summed per day, then over the days), **rounded once at the end** to 1 decimal, half up (SRS A.4; decimal arithmetic). **All entries count**, including entries of exercises not planned on that day and free-form Rest Day entries (user decision, 23 Nov 2026): they stay unscored for percentages (F-06) but are counted for kcal. Monthly kcal fields belong to F-10 (Sprint 3), not to F-11 |
| R8 | `exercises[]` has one row per exercise with at least one entry in `[from, to]` (planned or not, Rest Day or not): the summed tracked value in that exercise's unit (reps, seconds or km) and its kcal (unrounded sum, rounded once); sorted by name, then id. `totalKcal` is the unrounded sum over all entries rounded once, so the rounded `exercises[].kcal` values may differ from `totalKcal` by rounding (0.1) |
| R9 | `month` defaults to the current month; a malformed value or a month after the current month → 400 `VALIDATION_ERROR` (as F-06 R13) |
| R10 | Read-only: no request changes any row; past months are computed from the plan versions and entries that existed for each date (BR-11) |

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
  "currentStreak": 0,
  "totalKcal": 0.0,
  "exercises": [
    { "userExerciseId": "uuid", "name": "Barbell Squat", "trackingMode": "WEIGHT", "unit": "reps", "total": 0, "kcal": 0.0 }
  ]
}
```
`currentStreak`, `totalKcal` and the kcal values above are placeholders: their values come from F-08 and F-11. Errors: 400, 401, 403.

##### 4.2 Internal interface
```ts
buildSummary(days: DailyResult[], entries: EntryWithKcal[], streak: number): MonthlySummary  // pure, no I/O, no Clock
```
The service loads the plan, the month's entries and the weight logs once (same two-query approach as F-06 §5), calls the F-06 `calcMonthly`, the F-08 streak function and the F-11 kcal function, and passes the results in.

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
| 2026-11-06 | Fri | 70 exactly (e.g. 7 of 10 score) | targeted, ≥ 70 (boundary, no rounding) |
| 2026-11-07, 08 | Sat, Sun | null (a 600 s free-form Plank entry on Sat is stored) | Rest Days |
| 2026-11-09 | Mon (today) | 0 (no log yet) | targeted |

Expected: `from` 2026-11-02, `to` 2026-11-09, `targetedDays` 6, `restDaysExcluded` 2, `daysAtOrAbove70` 3, `averagePercent` 50 (= 300 / 6; the Saturday Rest Day entry has no effect on the percentage), Nov 1 not counted (before first `effectiveFrom`). `currentStreak` must equal `GET /api/streak` at the same Clock. **kcal counting:** the 600 s free-form Plank entry on Saturday **is counted** in `totalKcal` and in the Plank row of `exercises[]` (it is unscored but not excluded from kcal); `totalKcal` = the unrounded sum of every seeded entry's kcal, rounded once. Per-exercise `total` is the sum of all seeded reps and seconds including that entry (Plank seconds include the 600 s). Their concrete numbers are fixed in the STS once the F-08 and F-11 contracts are approved (open item 5).

--------------------------------------------------------------------------------

#### 6. UI Specification
| Element | Behavior |
| ------ | ------ |
| Summary card (Progress tab, under the monthly average card of F-06) | Month selector (current and past months only); lines: "Targeted days", "Rest days", "Days at 70% or more", "Monthly average (targeted days only)", "Current streak", "Estimated calories (kcal)"; a per-exercise list (name, total with unit, kcal) |
| Empty month | "No targeted days in this month" when `averagePercent` is null |
| States | Loading skeleton; retry notice on 5xx; 401 back to Login; 403 access-denied screen (SDS §4.2); a 400 for `month` is shown as a field notice |
| Rounding | Percent and kcal displayed to 1 decimal (SRS A.4); the API stays unrounded for percent |
| Manager | No summary screen |

UI behavior is not a separate AC for F-10; the system tests below cover the data and the access rules.

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
Text is identical to RTM §3 (`docs/traceability.md`, AC-26a–c).

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
| `TEST-26a-2` | AC-26a | System | Same | Same | `currentStreak` equals `GET /api/streak`; `totalKcal` equals the unrounded sum of all seeded entries' kcal rounded once; each `exercises[].total` equals the seeded sum including the Saturday entry (numbers fixed after F-08/F-11 approval) |
| `TEST-26a-5` | AC-26a | System | Seed month plus an entry of an exercise that is not planned on a targeted day | Same | The entry is counted in `totalKcal` and `exercises[]` and does not change `averagePercent` |
| `TEST-26a-6` | AC-26a | System | Two entries whose item kcal are 18.375 and 5.25 on different days (decimal-exact) | Same | `totalKcal` = round(23.625) = 23.6, not 18.4 + 5.3 = 23.7 (round once) |
| `TEST-26a-3` | AC-26a | System | Fri 2026-11-06 stored as exactly 70% | Same | Fri counted in `daysAtOrAbove70` (no rounding drift); a variant with 69.99… is not counted |
| `TEST-26a-4` | AC-26a | System | New Participant with no plan; and Alice for `month=2026-10` (before her first `effectiveFrom`) | Same | 200; counts 0, `averagePercent` null, `exercises` empty, `totalKcal` 0 |
| `TEST-26b-1` | AC-26b | System | Seed month | `GET /api/summary?month=2026-11` and `GET /api/progress/monthly?month=2026-11` | `averagePercent` values are equal |
| `TEST-26b-2` | AC-26b | System | Past month fixture (October) | Both routes with `month=2026-10` | Equal |
| `TEST-26b-3` | AC-26b | System | Add a Rest Day free-form entry | Both routes | Both unchanged and still equal |
| `TEST-26c-1` | AC-26c | System | Alice and Bob have data | Alice `GET /api/summary?userId=<Bob>&month=2026-11` | 403 `FORBIDDEN`, envelope, no Bob data; Bob's own request → 200 |
| `TEST-26c-2` | AC-26c | System | Manager token; no token | Same route | 403 with no Participant data; 401 |
| `TEST-26c-3` | AC-26c | System | Alice | `month=2026-13`, `2026-11-05`, `abc`, `2026-12` (future) | 400 `VALIDATION_ERROR` each, `fields` names `month`; never 5xx; no rows written |
| `TEST-22c (F-10 route)` | AC-22c | Security | Registry contains `GET /api/summary` | No token; Manager token | 401; 403 (run in the SYS-01 matrix test) |

**Coverage check.** Each AC has at least one test (AC-26a: 6, AC-26b: 3, AC-26c: 3). The test IDs `TEST-26a-n` are children of RTM `TEST-26a` (same suffix, same file).

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
| Streak function and `GET /api/streak` | Needed from F-08 | Assumption in §2 |
| Per-entry kcal | Needed from F-11 | Assumption in §2 |
| Registry, `requireRole`, envelope, Clock | Needed from F-01 | |
| Access Matrix row | Provided to SYS-01 | AC-12c / AC-22c extension |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
None identified: SRS FR-05/FR-06, BR-07, A.3, A.4, SDS §5 (`GET /api/summary?month=`) and §6.1, RTM AC-26a–c already exist. Any change to them found while implementing is a new version of this contract plus a baseline revision row.

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | Is `currentStreak` the Streak at today, or the Streak as of the end of the requested past month? SRS/RTM say "current Streak" without defining it for past months | Open; this draft assumes "at today" (R6). Needs the F-08 contract and a decision by both members |
| 2 | Names and shapes of the F-08 Streak function (F-08 contract not read) and of the F-11 kcal functions (F-11 0.1.0 read; names to be confirmed at approval) | Open until the contracts are approved (§2 assumptions) |
| 3 | ~~Do free-form Rest Day entries and unplanned-exercise entries count in totals and kcal?~~ | **Closed in 0.1.1** by the user decision: they count (R7, R8) |
| 4 | Days before `from` (before the first `effectiveFrom`) with entries: counted in totals or not | Open; draft excludes them (window `[from, to]`) |
| 5 | Concrete expected numbers for streak, kcal and per-exercise totals in TEST-26a-2 | Fixed after F-08 and F-11 are approved (F-11 0.1.0 has its own worked kcal examples that can be reused) |
| 6 | ~~`restDays` vs `restDaysExcluded`~~ | **Closed in 0.1.1**: F-10 uses `restDaysExcluded` as F-06 does |
| 7 | Latency of this route (more reads than progress) | Measured in SYS-01 (AC-21b); no caching unless it fails |
| 8 | **Conflict with F-11 0.1.0 R6 / Q1:** F-11 sums the **rounded** item values for its daily `totalCalories` (open for its reviewer), while the decision for F-10 is unrounded values rounded once. The two differ by up to 0.1 (F-11 cites 368.1 vs 368.0 in TEST-28c-1). F-10 `totalKcal` may then differ from the sum of F-11 daily totals | Open; F-11 Q1 and F-10 R7 should be settled together, and F-11 must expose an unrounded value to F-10 |
| 9 | **F-11 §4.2 adds** `totalCalories`, `days[].totalCalories` and `calorieError` to `GET /api/progress/monthly` (its Q3), but the decision is that monthly kcal fields belong to F-10 | Open; F-11 Q3 needs to drop or mark those monthly fields as F-10's. Also open: how F-10 reports days without a body weight (F-11 returns `calories: null`, `calorieError: "BODY_WEIGHT_REQUIRED"`); this draft does not specify it |
