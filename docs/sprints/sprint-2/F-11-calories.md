### Feature Engineering Contract: F-11 Estimated Duration & Calorie Calculation via METs (Historical `WeightLog` Lookup)
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-11
**Sprint:**  2 (CHANGE-02; all monthly kcal, including the monthly total, is F-10, Sprint 3)
**Contract Version:**  0.1.3
**SRS Baseline Version:**  1.1.0 (Feature Inventory 1.1.0, RTM 1.1.10, System-Level SDS 1.1.1, Sprint Plan 1.2.0, F-04 contract 0.3.1, F-06 contract 0.3.1)
**Date:**  23 November 2026
**Status:**  Draft (review pending; implementation must not start before the reviewer approves)
**Primary Author:**  Nakagamon  |  **Reviewer:**  Onsinee
**Repository Path:**  `docs/sprints/sprint-2/F-11-calories.md`

--------------------------------------------------------------------------------

#### Contract Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 23 Nov 2026 | Initial contract (issue #66, Part 2): formula, `WeightLog` lookup, estimated minutes per `trackingMode`, calorie fields added to `GET /api/progress/daily` (and to `GET /api/progress/monthly` once it ships), Today UI, AC-20a–c and AC-28a–c with the STS and worked arithmetic, DoD and evidence list. No new route, no schema change, no new error code. Open questions are listed in §13 | Nakagamon | Draft |
| **0.1.1** | 23 Nov 2026 | User decisions on the open questions of 0.1.0 (relayed by the lead, 23 Nov 2026): Q1 the daily total is the sum of the **unrounded** values rounded once (R6, TEST-28c-1 now 368.0, new TEST-20a-7); Q2 activity of exercises not planned on the date and free-form Rest Day entries **count** toward `totalCalories` and appear in a new top-level `otherActivity` array (R12, §4.1, TEST-28c-5 to 28c-7); Q3 monthly kcal is **not** part of F-11 and moves to F-10 (former §4.2, TEST-28a-6 and the monthly UI card removed); Q4, Q5, Q6 confirmed unchanged. No AC meaning, AC ID, test file path or schema change | Nakagamon | Draft |
| **0.1.2** | 23 Nov 2026 | Changes after the review of Onsinee on `f27bd1c` (PR #105): table fixed; STS fixtures made self-contained (each test creates its own Participant, every day is a planned day unless stated, reps target given in TEST-28c-2); §9 now names the existing code and test that the change touches; §4.4 uses exact BigInt rational arithmetic like `progressCalc.ts` (no new dependency); "Set your body weight" wording aligned with `ui-spec.md`; AC-28c wording note; F-10 reuse stated; row order nits; limitation 6 on performance. Not taken: a DoD item to re-run `pnpm run test:perf`, and the F-11 cut decision (see §13). No AC ID, test file path or schema change | Nakagamon | Draft |
| **0.1.3** | 26 Nov 2026 | §9 item (e) added after the review of PR #117 (Nakagamon, 25 Nov 2026, item 1): names TEST-06f-1 in `tests/integration/progress_api.test.ts` as a second existing F-06 expectation changed by F-11 (items compared without `calories`/`calorieError`, every other item field, `overallPercent` and `totalScore` still exact), with the commit and the reason. Records a deviation found during implementation; no rule, field, AC, STS or DoD item changed. Needs re-review by Nakagamon | Onsinee | Draft |

*Rule: committed as a specification-only commit before any F-11 implementation; later changes are new versions with a reason, never silent rewrites.*

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
F-11 adds the **calorie estimate** to the progress result of F-06: for every planned exercise of a day it computes the **estimated minutes** and the **estimated calories burned** from the exercise's MET value, the Participant's body weight on that date and the logged activity, and it shows the per-exercise values and the daily total on Today. F-11 is a **read-only computation feature**: it stores nothing, adds no table, no column, no migration and **no route**. It extends the response of one existing route, `GET /api/progress/daily`. Monthly kcal is **not** part of F-11 (F-10, Sprint 3).

| In scope | Out of scope (and where it belongs) |
| ------ | ------ |
| Formula `metValue × bodyWeightKg × (estimatedMinutes ÷ 60)` and rounding to 1 decimal, half up (BR-12, Appendix A.4) | `GET /api/profile` and `PUT /api/profile`, the append-only `WeightLog` writes, the 1–800 kg validation and screen S-07 (AC-17a–d, **F-04, Sprint 2, CHANGE-04**): F-11 only reads `WeightLog` |
| Historical `WeightLog` lookup: latest row with `effectiveDate` on or before the activity date | Item Score, Daily Overall %, monthly average (F-06); body weight never changes a score (Decision 11, AC-06f) |
| Estimated minutes per `trackingMode` (sets × 1.5 min; duration ÷ 60; distance × standard pace) | Monthly Progress Summary report and its kcal totals (F-10, Sprint 3) |
| `calories`, `estimatedMinutes` per planned item, `otherActivity` (exercises logged but not planned on the date, including Rest Day entries) and `totalCalories` in the daily response; `calories: null` with `calorieError: "BODY_WEIGHT_REQUIRED"` (HTTP 200) when no weight applies | Calories in the responses of `POST /api/entries` and Quick Complete (unchanged) |
| Calorie display on Today: item card kcal, daily total, "Set your body weight" prompt | Editing or deleting entries (F-05); once it exists, the calorie values follow the entries because they are computed on read |
| Pure domain module `calorieCalc` with unit tests; integration tests for the lookup | Monthly kcal: `GET /api/progress/monthly` fields and the monthly summary totals (**F-10, Sprint 3**); default MET values of custom exercises (AC-16a–b, CHANGE-05): F-11 reads the stored `metValue` |

--------------------------------------------------------------------------------

#### 2. Linked Requirements and Dependencies
| Requirement | How F-11 serves it |
| ------ | ------ |
| **BR-12** | Calorie formula, `WeightLog` lookup on or before the activity date, `200` with `calories: null` and `calorieError: "BODY_WEIGHT_REQUIRED"` when no weight exists (Q27), rounding half up to 1 decimal (A.4), estimated minutes for non-duration exercises |
| **FR-05** | Calorie Estimation Display: kcal per exercise and the daily total in the progress response (AC-28c) |
| **FR-08** | Reads the weight history that the profile endpoints (F-04, Sprint 2) append to; weight bounds 1–800 kg come from the table check of SDS §3.2 and from F-04 R16 |
| Decision 11 | Calories use body weight; scores never do |
| SRS Appendix A.1, A.4, A.5 | METs and standard paces; rounding; `BODY_WEIGHT_REQUIRED` is a `200` `calorieError`, **not** an error-envelope code (api-spec §1.1 says the same) |
| SDS §2.4 / §3.4 | Calories are a **derived value, computed on read** by a pure domain function from plan resolution, ledger entries and `WeightLog`; never stored |
| **BR-04 / NFR-02** (shared) | Progress and weight are private: Manager → 403, cross-user → 403 |

**Depends on:** F-02 (`metValue`, `cardioCategory`, `trackingMode` of the snapshot), F-03 (`resolvePlan`: which items occur on a date), F-04 (`LedgerEntry`, `cumulativeFor`; **profile endpoints and S-07 as a dependency only**), F-06 (`GET /api/progress/daily`, the daily result shape, `progressService`). **Downstream:** F-10 (total kcal, per-exercise totals; Sprint 3), F-05 (entry edits change the computed value).

--------------------------------------------------------------------------------

#### 3. Feature Design (Feature-Level SDS)
##### 3.1 Behavior and Workflow
1. The Participant sets a body weight in Profile (F-04 `PUT /api/profile`, S-07; not part of F-11). Each save appends a `WeightLog` row.
2. The Participant logs activity (F-04) on Today. Nothing about calories happens at write time.
3. `GET /api/progress/daily?date=D` resolves the plan items of date *D* (F-06), reads the cumulative values of *D* (`cumulativeFor`) for **every** exercise with entries on *D* (planned or not), looks up the body weight valid on *D* (R2) and calls the pure functions of §4.4 for each planned item and each unplanned exercise. The response carries the F-06 fields unchanged plus the calorie fields of §4.1.
4. If no `WeightLog` row has `effectiveDate` ≤ *D*, every calorie value of the response (planned items, `otherActivity`, total) is `null`, `calorieError` is `"BODY_WEIGHT_REQUIRED"`, the status stays `200`, and logging is never blocked (R8).
5. Today shows the kcal of each item card and the daily total (which includes unplanned and Rest Day activity); when `calorieError` is set it shows the prompt "Set your body weight" with a link to S-07 instead (§6).
6. Because values are computed on read, a later weight update never rewrites the calories of an earlier date (the lookup picks the row valid on that date), and a new ledger entry changes the value at the next read (no stale value).

##### 3.2 Business Rules
| ID | Rule | Status |
| ------ | ------ | ------ |
| R1 | `calories = metValue × bodyWeightKg × (estimatedMinutes ÷ 60)` (BR-12). `metValue` is the `UserExercise.metValue` of the Participant's snapshot (F-02/F-03; Decimal(4,1)); it is never read from the template at calculation time, so template edits cannot change history (AC-27) | Baseline BR-12 |
| R2 | **Weight lookup:** the body weight used for date *D* is the `weightKg` of the `WeightLog` row of that Participant with the **latest `effectiveDate` ≤ *D*** (a row whose `effectiveDate` equals *D* counts). If several rows share that `effectiveDate`, the one with the latest `createdAt` wins (same tie-break as the current weight of F-04 R16). Rows with `effectiveDate` > *D* are ignored | Baseline BR-12 / B6 / AC-28a; tie-break: see §13 Q4 |
| R3 | The **activity date** *D* is the `date` of the progress request (default today, Asia/Bangkok, through the injectable Clock). All entries counted are those whose `logDate` = *D* (F-04 R3: always the date of writing) | Baseline BR-01 / F-06 |
| R4 | **Estimated Minutes** (cumulative values of the day per exercise, F-04 R7): `WEIGHT`, `BODYWEIGHT_REPS` → `Σsets × 1.5`; `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME` → `Σ durationSec ÷ 60`; `CARDIO_DISTANCE` → `Σ distanceKm × standard pace (min/km)` of its `cardioCategory`: Running 6.0, Walking 10.0, Cycling 3.0, Swimming 20.0 (A.1). Distance entries carry no duration (F-04 R4), so the pace rule always applies to them. No logged activity → 0 minutes | Baseline BR-12 / A.1 |
| R5 | **Rounding:** all arithmetic is decimal (no binary floating point, same rule as SRS Q49). Only the final calories value is rounded, to **1 decimal place, half up** (A.4): 18.375 → 18.4, 5.25 → 5.3, 6.65 → 6.7. `estimatedMinutes` is returned unrounded (an exact decimal such as 4.5 or 7.5) | Baseline A.4 / Q49 |
| R6 | **Daily total (decided, Q1):** `totalCalories` = the sum of the **unrounded** calorie values of every counted exercise (planned items and `otherActivity`), **rounded once** to 1 decimal, half up (R5). The item values shown in the response are each rounded on their own, so the displayed item values may not add up to the total (e.g. 18.4 + 6.7 + 343 = 368.1, total 368.0 from 368.025); this is accepted | User decision, 23 Nov 2026 |
| R7 | A planned item with no entries on *D* has `estimatedMinutes` 0 and `calories` 0 when a weight applies. A planned day with no logs has `totalCalories` 0 | Design decision |
| R8 | **No weight:** when R2 finds no row, `calories` of every item and `totalCalories` are `null`, and `calorieError` is `"BODY_WEIGHT_REQUIRED"`, on the item and at top level; the HTTP status is `200`; scores and all F-06 fields are unaffected; `POST /api/entries` and Quick Complete are not blocked. `BODY_WEIGHT_REQUIRED` is **not** an error-envelope code and no new error code is added (SRS A.5, api-spec §1.1) | Baseline BR-12 / Q27 / AC-28b |
| R9 | `calorieError` has exactly two values: `null` (a value was computed) or `"BODY_WEIGHT_REQUIRED"`. `calories` and `calorieError` are never both set (calories is `null` iff `calorieError` is non-null) | Design decision |
| R10 | The weight applies to the **date**, not to the item: all items and `otherActivity` entries of one response share one weight, so either every value is a number or none is. This also holds on a Rest Day (`items: []`): `totalCalories` is `0` when a weight applies and nothing was logged, and `null` with `calorieError` when none applies (Q6, decided) | User decision (Q6), 23 Nov 2026 |
| R11 | Nothing is stored (SDS §3.4). The calculation functions never call the Clock or the database; the service loads weight rows, plan items and entries and passes them in | Baseline SDS §3.4 |
| R12 | **Unplanned and Rest Day activity counts (decided, Q2):** every exercise of the Participant with entries on *D* that is **not** an item of F-06's `items` for *D* (an exercise that has no plan item on *D*, or any exercise on a Rest Day) gets an element in the top-level `otherActivity` array (§4.1) and its calories are part of `totalCalories`. Such activity stays **unscored**: it is never in `items`, never in `totalScore`, `totalWeight` or `overallPercent` (F-04 R13, Q24, AC-06g). Entries are summed per exercise (R4 uses the day's cumulative values); `otherActivity` is ordered by `name` ascending, then `userExerciseId`; it is `[]` when there is none | User decision (Q2), 23 Nov 2026 |
| R13 | Calories never feed back into scores, streaks or Quick Complete (Decision 11, AC-06f) | Baseline Decision 11 |

##### 3.3 Failure and Boundary Cases
| # | Case | Expected behavior |
| ------ | ------ | ------ |
| B1 | Participant has no `WeightLog` row at all (seeded Bob) | `200`, `calories: null`, `calorieError: "BODY_WEIGHT_REQUIRED"` (AC-28b) |
| B2 | Rows exist but all are dated after *D* (first weight set on 10 Nov, request for 5 Nov) | Same as B1 for 5 Nov; 10 Nov and later get a value |
| B3 | Weight changed mid-month (70 kg from 1 Nov, 68 kg from 10 Nov) | Each date uses its own valid row: 9 Nov → 70, 10 Nov → 68 (equal `effectiveDate` counts), 12 Nov → 68; 5 Nov stays on 70 after the later update (AC-28a) |
| B4 | Body weight 1.0 kg and 800.0 kg (the lowest and highest stored value, F-04 R16 / SDS §3.2) | Computed normally: see TEST-20b-3 and TEST-28a-5 |
| B5 | Two rows with the same `effectiveDate` (two updates on the same day) | The latest `createdAt` is used (R2) |
| B6 | `date` in the future | Unchanged F-06 rule: `400 VALIDATION_ERROR` (SRS Q47); no calorie logic runs |
| B7 | Rest Day, nothing logged | `items: []`, `otherActivity: []`; `totalCalories` 0 with a weight or `null` + error without (R10) |
| B8 | Exercise with zero logged activity on a targeted day | `estimatedMinutes` 0, `calories` 0 (R7) |
| B9 | Quick Complete entry with raised `sets` (F-04 R9/R12) | Minutes use the **stored** `sets`; see §13 limitation 2 |
| B10 | Manager token; foreign `?userId=` | `403` (identity from the token only; unchanged F-06 policy) |
| B11 | Rest Day with free-form entries, or a day with an exercise that is not planned on it (e.g. *Walk* planned Mon/Wed/Fri, logged on Tuesday) | The exercise appears in `otherActivity` with its calories; `totalCalories` includes it; scores and `items` are unchanged (R12) |

##### 3.4 Permissions (Access Matrix rows)
F-11 adds **no route**. The only changed route keeps the F-06 policy, so no row is added to the registry; the Endpoint Access Matrix (AC-12c / AC-22c) row below stays valid and is the one re-run with the new fields.

| Operation | Unauthenticated | Manager | Participant |
| ------ | ------ | ------ | ------ |
| `GET /api/progress/daily` (now with calorie fields; `featureId` stays `F-06`) | 401 | 403 | Allow (own data only; `userId` query parameter other than own → 403) |

Identity comes from the token only; a Manager never receives Participant activity, weight or calorie data (BR-04, Exclusion 3). The weight value is not itself returned by these routes (it is only an input of the calculation); `GET /api/profile` is F-04's route.

--------------------------------------------------------------------------------

#### 4. API Specification
Conventions follow SDS §5.1 and api-spec §1 (JSON, error envelope of SRS Appendix A.5, dates `YYYY-MM-DD`).

##### 4.1 `GET /api/progress/daily?date=YYYY-MM-DD` (extension of F-06 §4.1)
**Request and errors are unchanged** (400, 401, 403). **Fields added (and only these), and why `otherActivity` is a separate array:** `items` is defined by F-06 as the scored planned items, and `totalScore` / `overallPercent` are computed from it, so adding unscored rows to `items` would break F-06 consumers and AC-06g. A total-only effect would hide where the kcal come from (AC-28c asks for kcal per exercise). A separate additive array leaves every F-06 field and test untouched and still gives kcal per exercise.

| Where | Field | Type | Meaning |
| ------ | ------ | ------ | ------ |
| each `items[]` element | `estimatedMinutes` | number | R4, unrounded decimal (0 when nothing is logged) |
| each `items[]` element | `calories` | number or `null` | R1/R5, 1 decimal; `null` when no weight applies |
| each `items[]` element | `calorieError` | `null` or `"BODY_WEIGHT_REQUIRED"` | R9 |
| top level | `otherActivity` | array | R12: exercises logged on the date that are not in `items` (unplanned, or any exercise on a Rest Day); `[]` when none |
| each `otherActivity[]` element | `userExerciseId`, `name`, `trackingMode`, `unit`, `actual`, `estimatedMinutes`, `calories`, `calorieError` | as the same-named fields of `items[]` | `actual` is the day's cumulative value in `unit`; there is no `target`, `ratio`, `itemScore` or `priorityWeight` because the activity is unscored |
| top level | `totalCalories` | number or `null` | R6/R10/R12: unrounded sum of planned items and `otherActivity`, rounded once |
| top level | `calorieError` | `null` or `"BODY_WEIGHT_REQUIRED"` | R9/R10 |

Every F-06 field (`date`, `isRestDay`, `items[].…`, `totalScore`, `totalWeight`, `overallPercent`) keeps its name, type and value. Success `200 OK` (Alice-style fixture, weight 70 kg on the date; JSON numbers, so `343.0` is serialised as `343`):
```json
{
  "date": "2026-11-05",
  "isRestDay": false,
  "items": [
    { "planItemId": "uuid", "userExerciseId": "uuid", "name": "Barbell Squat",
      "trackingMode": "WEIGHT", "unit": "reps", "priorityWeight": 3,
      "target": 40, "actual": 30, "ratio": 0.75, "itemScore": 2.25,
      "estimatedMinutes": 4.5, "calories": 18.4, "calorieError": null },
    { "planItemId": "uuid", "userExerciseId": "uuid", "name": "Plank",
      "trackingMode": "BODYWEIGHT_TIME", "unit": "seconds", "priorityWeight": 2,
      "target": 120, "actual": 90, "ratio": 0.75, "itemScore": 1.5,
      "estimatedMinutes": 1.5, "calories": 6.7, "calorieError": null },
    { "planItemId": "uuid", "userExerciseId": "uuid", "name": "Outdoor Run",
      "trackingMode": "CARDIO_DISTANCE", "unit": "km", "priorityWeight": 5,
      "target": 5, "actual": 5, "ratio": 1, "itemScore": 5,
      "estimatedMinutes": 30, "calories": 343, "calorieError": null }
  ],
  "totalScore": 8.75,
  "totalWeight": 10,
  "overallPercent": 87.5,
  "otherActivity": [],
  "totalCalories": 368.0,
  "calorieError": null
}
```
(Squat: 3 sets × 1.5 = 4.5 min, 3.5 × 70 × 4.5/60 = 18.375 → 18.4. Plank: 90 s = 1.5 min, 3.8 × 70 × 1.5/60 = 6.65 → 6.7. Run: 5 km × 6.0 = 30 min, 9.8 × 70 × 30/60 = 343. Total: unrounded 18.375 + 6.65 + 343 = 368.025, rounded once → 368.0; the rounded item values add to 368.1, which is not the total, by decision Q1.)

No weight for the date (HTTP `200`, **not** an error envelope):
```json
{
  "date": "2026-11-05", "isRestDay": false,
  "items": [ { "planItemId": "uuid", "userExerciseId": "uuid", "name": "Barbell Squat",
      "trackingMode": "WEIGHT", "unit": "reps", "priorityWeight": 3,
      "target": 40, "actual": 30, "ratio": 0.75, "itemScore": 2.25,
      "estimatedMinutes": 4.5, "calories": null, "calorieError": "BODY_WEIGHT_REQUIRED" } ],
  "totalScore": 2.25, "totalWeight": 3, "overallPercent": 75,
  "otherActivity": [],
  "totalCalories": null, "calorieError": "BODY_WEIGHT_REQUIRED"
}
```
Rest Day with a weight, nothing logged: `{ "date": "...", "isRestDay": true, "items": [], "totalScore": 0, "totalWeight": 0, "overallPercent": null, "otherActivity": [], "totalCalories": 0, "calorieError": null }`.

Rest Day with free-form entries (70 kg; 30 min of Yoga at 2.5 METs and 3 km of Walking at 4.3 METs, 30 min at the standard pace): Yoga 2.5 × 70 × 0.5 = 87.5, Walking 4.3 × 70 × 0.5 = 150.5, total 238:
```json
{ "date": "2026-11-10", "isRestDay": true, "items": [], "totalScore": 0, "totalWeight": 0, "overallPercent": null,
  "otherActivity": [
    { "userExerciseId": "uuid", "name": "Easy Walk", "trackingMode": "CARDIO_DISTANCE", "unit": "km", "actual": 3, "estimatedMinutes": 30, "calories": 150.5, "calorieError": null },
    { "userExerciseId": "uuid", "name": "Morning Yoga", "trackingMode": "YOGA", "unit": "seconds", "actual": 1800, "estimatedMinutes": 30, "calories": 87.5, "calorieError": null }
  ],
  "totalCalories": 238, "calorieError": null }
```

##### 4.2 Monthly kcal (not part of F-11)
Decided by the lead on 23 Nov 2026: calorie fields of `GET /api/progress/monthly` and the kcal totals of the monthly summary belong to **F-10** (Sprint 3, `GET /api/summary`). F-11 does not touch `/api/progress/monthly`. F-10 will reuse the pure functions of §4.4 per day, with the weight valid on each day (R2).

##### 4.3 Route Policies
No route is added or changed in the registry: `GET /api/progress/daily` keeps `featureId: 'F-06'`, `auth: 'required'`, `roles: ['PARTICIPANT']`, `ownership: 'self-scoped'` (F-06 §4.3). The generic registry ↔ matrix tests (TEST-22c) and the F-06 route cases keep covering them; nothing may be added to the registry by F-11.

##### 4.4 Internal interfaces (pure functions, no I/O; new module `server/domain/calorieCalc.ts`, name is a proposal)
```ts
pickBodyWeight(rows: { weightKg, effectiveDate, createdAt }[], date: string): Exact | null   // R2
estimateMinutes(item: { trackingMode, cardioCategory, sets, durationSec, distanceKm }): Exact  // R4
calcCalories(metValue: Exact, weightKg: Exact, estimatedMinutes: Exact): Exact          // R1, unrounded; roundKcal() applies R5 (half up, 1 dp)
withCalories(daily: DailyResult, planned: CalorieInput[], other: CalorieInput[], weightKg: Exact | null): DailyResult   // R6-R10, R12: total = round once of the unrounded sum
```
`Exact` is an exact decimal value implemented with BigInt rationals, the same approach as `server/domain/progressCalc.ts` (R5: no binary floating point); no decimal library is added, because `package.json` has none and a new dependency needs the user's approval (working rule 5). The standard paces of R4 are constants of this module (SRS A.1); `progressService` loads data and passes it in. No function calls the Clock or the database.

--------------------------------------------------------------------------------

#### 5. Data Specification
**No schema change and no migration.** `WeightLog` already exists in `prisma/schema.prisma` (`id`, `userId`, `weightKg` Decimal(4,1), `effectiveDate` Date, `createdAt`, index `(userId, effectiveDate)`), as do `UserExercise.metValue` (Decimal(4,1)), `UserExercise.cardioCategory`, `UserExercise.trackingMode` and `LedgerEntry.sets / durationSec / distanceKm`; this was checked in the file, not assumed. The lookup is served by the existing index `WeightLog(userId, effectiveDate)`. The append-only rule of `WeightLog` (no update/delete operation) is F-04's.

**Seed.** No change to `prisma/seed.ts` is required by this contract: Alice has WeightLog rows (RTM §3.1 records four rows, 71.2 to 70.5 kg) and Bob has none (SRS A.6). **STS tests do not assert on seeded weights**; they create their own fixtures (a fresh Participant, `WeightLog` rows inserted directly with explicit `effectiveDate` values, dated plan items and entries through the F-03/F-04 historical helpers) so that every expected value below is exact.

--------------------------------------------------------------------------------

#### 6. UI Specification
UI behavior of screens is owned by `ui-spec.md` (Onsinee); the elements below are the **F-11 additions** to S-02 Today, to be mirrored there. Test ids are proposals following the ui-spec naming style.

| Element | Behavior |
| ------ | ------ |
| **Item card** (S-02) | When `calories` is a number: "≈ 18.4 kcal" (`item-kcal`), with the estimated minutes as secondary text ("4.5 min") |
| **Daily total** (progress card) | "Calories today: ≈ 368.0 kcal" (`today-kcal`), shown whenever `totalCalories` is a number (also "0 kcal" on a day with no log); it includes unplanned and Rest Day activity |
| **Other activity** | When `otherActivity` is not empty: a list "Not in today's plan" (`today-other-activity`) with name and kcal per exercise, labelled "not scored" (as F-04 UI); on a Rest Day this list is the only calorie content besides the total |
| **"Set your body weight" prompt** | When `calorieError` is `"BODY_WEIGHT_REQUIRED"`: item cards and the progress card show "Set your body weight" instead of a number (the wording of `ui-spec.md` S-02), with a link to S-07 Profile (`today-weight-prompt`); the prompt is informational, **not an error**, and does not block Quick Complete or logging |
| Real time | The values refresh with the progress refetch after every entry (F-06 §6); after the Participant saves a weight in S-07 and returns to Today, the next fetch shows kcal |
| Manager | No Today screen, no calories |

Rounding for display: kcal to 1 decimal half up as returned; minutes to 1 decimal half up. Whether the item card keeps the "x kcal" visible for completed items (UI 0.8.0 moves them behind History) is left to `ui-spec.md`.

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
AC-20a–c and AC-28a–c use the IDs and wording of RTM 1.1.10 (Section 1, rows BR-12 / FR-08 / FR-05), refined only with the endpoints and fields above. No AC ID or test file path is changed. AC-28c says "per exercise"; this contract reads it to include exercises that are not in the plan on that date (R12), which is wider than the RTM wording, so the RTM revision that registers F-11 (P11-1) must say so.

| AC | Observable outcome (RTM text) |
| ------ | ------ |
| **AC-20a** | `WEIGHT`, 3 sets → 4.5 min; 3.5 METs, 70 kg → 3.5 × 70 × (4.5/60) = 18.375 → 18.4 kcal |
| **AC-20b** | `CARDIO_TIME` 1,800 s, 7.0 METs, 60 kg → 210 kcal |
| **AC-20c** | Running 5 km without duration → 5 × 6.0 = 30 min; 9.8 METs, 70 kg → 343 kcal |
| **AC-28a** | `WeightLog` 70 kg (1 Nov) and 68 kg (10 Nov): an entry on 5 Nov uses 70 and stays unchanged after later updates; an entry on 12 Nov uses 68 |
| **AC-28b** | No `WeightLog` with `effectiveDate` ≤ `logDate` → 200, `calories: null`, `calorieError: BODY_WEIGHT_REQUIRED`; logging is not blocked |
| **AC-28c** | The API returns kcal per exercise and the daily total |

**Shared AC with other features.** AC-17a–d (profile endpoints, F-04, `tests/integration/profile.test.ts`) are a **dependency**, not re-specified here; AC-12a/b/c and AC-22c (Endpoint Access Matrix): the changed route is already in the matrix (§3.4); AC-06f (F-06): body weight never changes a score, re-checked by TEST-28c-3; AC-27 (template snapshot): `metValue` is read from the snapshot (R1).

--------------------------------------------------------------------------------

#### 8. Software Test Specification (STS)
Files: `tests/unit/calorie_calc.test.ts` (AC-20a–c), `tests/integration/calorie_weightlog.test.ts` (AC-28a–c). Fixtures: seeded Manager, Alice, Bob and a fresh Participant with no `WeightLog` row (the integration tests name it "Dana"); real PostgreSQL test database; injectable Clock fixed at **Thu 12 Nov 2026 10:00 Asia/Bangkok** unless stated; past dates are written through the historical helpers (`createHistoricalPlanItem`, `createHistoricalEntry`) and read with `GET /api/progress/daily?date=`. Dates and values are chosen so every expected result is exact; arithmetic is shown in the last column. **Each integration test creates its own fresh Participant** (the table calls it "Dana" for readability) so that `WeightLog` rows and entries of one test cannot affect another. Plan items repeat on **every day of the week** from 1 Nov 2026 unless the test says otherwise, so no date is a Rest Day unless the test says it is (a Rest Day is a date on which no plan item of that Participant resolves).

**Unit tests (`calorie_calc.test.ts`)**

| Test ID | AC | Level | Inputs / preconditions | Expected result (worked arithmetic) |
| ------ | ------ | ------ | ------ | ------ |
| `TEST-20a-1` | AC-20a | Unit | `WEIGHT`, cumulative sets 3, 3.5 METs, 70 kg | minutes 3 × 1.5 = 4.5; 3.5 × 70 × (4.5/60) = 245 × 0.075 = 18.375 → **18.4** |
| `TEST-20a-2` | AC-20a | Unit | `BODYWEIGHT_REPS`, sets 4, 3.8 METs, 50 kg | minutes 6; 3.8 × 50 × 0.1 = **19.0** (19) |
| `TEST-20a-3` | AC-20a | Unit | Half-up tie: `WEIGHT`, sets 1, 3.5 METs, 60 kg | minutes 1.5; 3.5 × 60 × 0.025 = 5.25 → **5.3** (half up, not banker's 5.2) |
| `TEST-20a-4` | AC-20a | Unit | Sets taken from the day's cumulative: entries 2 + 1 sets, 3.5 METs, 70 kg | Σsets 3 → same as TEST-20a-1: **18.4** (not 2 or 1 entry alone) |
| `TEST-20a-5` | AC-20a | Unit | Boundary weight 1 kg: `WEIGHT`, sets 1, 3.5 METs | 3.5 × 1 × 0.025 = 0.0875 → **0.1** |
| `TEST-20a-6` | AC-20a | Unit | No activity: sets 0 (or no entry), 3.5 METs, 70 kg | minutes 0; calories **0** |
| `TEST-20a-7` | AC-20a | Unit | `withCalories` total (Q1): unrounded item values 18.375, 6.65, 343, weight known | item values 18.4, 6.7, 343; `totalCalories` = round(368.025) = **368.0** (not 368.1 = sum of rounded values); with `otherActivity` value 73.5 added: 441.525 → **441.5** |
| `TEST-20b-1` | AC-20b | Unit | `CARDIO_TIME`, 1,800 s, 7.0 METs, 60 kg | minutes 1800/60 = 30; 7.0 × 60 × (30/60) = **210** |
| `TEST-20b-2` | AC-20b | Unit | `BODYWEIGHT_TIME` 90 s, 3.8 METs, 70 kg; `YOGA` 600 s, 2.5 METs, 55.5 kg | 1.5 min: 3.8 × 70 × 0.025 = 6.65 → **6.7** (decimal, no float drift); 10 min: 2.5 × 55.5 × (10/60) = 23.125 → **23.1** |
| `TEST-20b-3` | AC-20b | Unit | Boundary weights, `CARDIO_TIME` 1,800 s, 7.0 METs: 1 kg and 800 kg | 7.0 × 1 × 0.5 = **3.5**; 7.0 × 800 × 0.5 = **2800** |
| `TEST-20c-1` | AC-20c | Unit | `CARDIO_DISTANCE` Running, 5 km, no duration, 9.8 METs, 70 kg | minutes 5 × 6.0 = 30; 9.8 × 70 × 0.5 = **343** |
| `TEST-20c-2` | AC-20c | Unit | Other categories, 70 kg, same distance logic: Walking 3 km (4.3 METs); Cycling 10 km (8.0); Swimming 1.5 km (5.8) | 3 × 10.0 = 30 min → 4.3 × 70 × 0.5 = **150.5**; 10 × 3.0 = 30 min → 8.0 × 70 × 0.5 = **280**; 1.5 × 20.0 = 30 min → 5.8 × 70 × 0.5 = **203** |
| `TEST-20c-3` | AC-20c | Unit | Running 0.5 km, 9.8 METs, 70 kg | 0.5 × 6.0 = 3 min; 9.8 × 70 × 0.05 = **34.3** |
| `TEST-20c-4` | AC-20c | Unit | Boundary weights, Running 5 km, 9.8 METs: 1 kg and 800 kg | 9.8 × 1 × 0.5 = **4.9**; 9.8 × 800 × 0.5 = **3920** |

**API/DB integration tests (`calorie_weightlog.test.ts`)**

| Test ID | AC | Level | Preconditions | Action | Expected result (worked arithmetic) |
| ------ | ------ | ------ | ------ | ------ | ------ |
| `TEST-28a-1` | AC-28a | API/DB Integration | Dana: `WeightLog` 70 kg effective 2026-11-01; Squat (`WEIGHT`, 3.5 METs) planned daily; entry on 2026-11-05 with 2 sets / 20 reps | `GET /api/progress/daily?date=2026-11-05` | `200`; item `estimatedMinutes` 3, `calories` **12.3** (3.5 × 70 × 0.05 = 12.25, half up) |
| `TEST-28a-2` | AC-28a | API/DB Integration | After 28a-1: append `WeightLog` 68 kg effective 2026-11-10; same 2-set entry also on 2026-11-12 | `GET` for 2026-11-05, then for 2026-11-12 | 5 Nov **still 12.3** (unchanged after the later update); 12 Nov **11.9** (3.5 × 68 × 0.05 = 11.9) |
| `TEST-28a-3` | AC-28a | API/DB Integration | Same weights; same 2-set entry on 2026-11-09 and 2026-11-10 | `GET` for each | 9 Nov **12.3** (70 kg); 10 Nov **11.9** (a row with `effectiveDate` = date counts: mid-month change, boundary) |
| `TEST-28a-4` | AC-28a | API/DB Integration | Dana has two rows with `effectiveDate` 2026-11-10: 68 kg (older `createdAt`) and 66 kg (newer) | `GET` for 2026-11-12 | Uses 66 kg: 3.5 × 66 × 0.05 = **11.6** (11.55 → 11.6); a row dated 2026-11-13 (67 kg, inserted) is ignored |
| `TEST-28a-5` | AC-28a | API/DB Integration | Boundary weights inserted directly: user with only 1.0 kg, then (new fixture) only 800.0 kg; `CARDIO_TIME` exercise 7.0 METs, entry 1,800 s | `GET` | 1 kg: **3.5**; 800 kg: **2800** (7.0 × W × 0.5) |
| `TEST-28b-1` | AC-28b | API/DB Integration | Bob (no `WeightLog` row); Squat planned; Bob logs `POST /api/entries` `{ sets: 2, totalReps: 20 }` | The POST, then `GET /api/progress/daily` | POST `201` (logging **not blocked**); GET **`200`**; item `calories: null`, `calorieError: "BODY_WEIGHT_REQUIRED"`; top level `totalCalories: null`, `calorieError: "BODY_WEIGHT_REQUIRED"` |
| `TEST-28b-2` | AC-28b | API/DB Integration | Dana's only row is 68 kg effective 2026-11-10; entry on 2026-11-05 and on 2026-11-12 | `GET` for each | 5 Nov: `calories: null` + `calorieError` (no row ≤ 5 Nov); 12 Nov: value **11.9** with `calorieError: null` |
| `TEST-28b-3` | AC-28b | API/DB Integration | Bob, no weight | `GET` response of 28b-1 | Status `200`, body has **no** `code`/`message`/`fields` envelope; `ratio`, `itemScore`, `overallPercent` are present and identical to the values computed without weights (scores unaffected) |
| `TEST-28b-4` | AC-28b | API/DB Integration | Bob, no weight; a Rest Day fixture (no plan item on the date) | `GET` for that date | `200`; `isRestDay: true`, `items: []`, `overallPercent: null`, `totalCalories: null`, `calorieError: "BODY_WEIGHT_REQUIRED"` |
| `TEST-28b-5` | AC-28b | API/DB Integration | Bob logs a first weight afterwards (row inserted for today) | `GET` today | `calories` now a number (value of the entry, e.g. 11.9 at 68 kg), `calorieError: null`; earlier dates without a row stay `null` |
| `TEST-28c-1` | AC-28c | API/DB Integration | Dana: 70 kg effective 2026-11-01; Squat `WEIGHT` 3.5 METs (3 sets logged), Plank `BODYWEIGHT_TIME` 3.8 METs (90 s), Outdoor Run `CARDIO_DISTANCE` Running 9.8 METs (5 km), all planned for 2026-11-05 | `GET /api/progress/daily?date=2026-11-05` | `items[].calories` **18.4**, **6.7**, **343**; `estimatedMinutes` 4.5, 1.5, 30; `otherActivity` `[]`; `totalCalories` **368.0** (unrounded sum 18.375 + 6.65 + 343 = 368.025, rounded once; the rounded item values would add to 368.1, which is **not** the expected total, R6 / Q1) |
| `TEST-28c-2` | AC-28c | API/DB Integration | Dana, today 2026-11-12, 68 kg; Squat planned, no entries; then Quick Complete for a 4 sets × 10 reps target (40 reps, nothing logged) | `GET`, Quick Complete, `GET` | First: `estimatedMinutes` 0, `calories` 0, `totalCalories` 0; after Quick Complete the value is the new cumulative's (Quick Complete adds 4 sets / 40 reps: 4 × 1.5 = 6 min → 3.5 × 68 × 0.1 = **23.8**; `ceil(40 ÷ 200)` = 1 does not raise `sets`) with no stale value |
| `TEST-28c-3` | AC-28c | API/DB Integration | Dana's data of 28c-1, then a second user with 40 kg and the same entries | `GET` for both | `itemScore`, `overallPercent` are **identical** for both (Decision 11, AC-06f); only calories differ |
| `TEST-28c-4` | AC-28c | API/DB Integration | Alice, Bob, Manager tokens | Manager `GET`; Alice with `?userId=<Bob>`; no token | Manager `403`; foreign `userId` `403` with no calorie data in the body; no token `401`; own request `200` |
| `TEST-28c-5` | AC-28c | API/DB Integration | Dana, 70 kg effective 2026-11-01; Squat planned for 2026-11-05 with 3 sets logged; custom *Jump Rope* (`CARDIO_TIME`, 7.0 METs) has **no plan item**, entries 300 s and 240 s on that date | `GET /api/progress/daily?date=2026-11-05` | `items` has only Squat (calories 18.4); `otherActivity` has one element for *Jump Rope* (entries summed): `actual` 540, `estimatedMinutes` 9, `calories` **73.5** (7.0 × 70 × 9/60); `totalCalories` **91.9** (18.375 + 73.5 = 91.875 → 91.9); `totalScore`, `totalWeight`, `overallPercent` identical to the same day without the Jump Rope entries (unscored) |
| `TEST-28c-6` | AC-28c | API/DB Integration | Own Participant with 70 kg whose plan items do not resolve on 2026-11-10 (a Tuesday), so it is a Rest Day; free-form entries Yoga 1,800 s (2.5 METs) and Walking 3 km (4.3 METs, no duration) | `GET` for 2026-11-10 | `isRestDay: true`, `items: []`, `overallPercent: null`; `otherActivity` ordered by name, Yoga **87.5** (30 min: 2.5 × 70 × 0.5), Walking **150.5** (3 × 10.0 = 30 min: 4.3 × 70 × 0.5); `totalCalories` **238** |
| `TEST-28c-7` | AC-28c | API/DB Integration | Bob (no weight); an exercise not planned on the date with a manual entry | `GET` for that date | `200`; the `otherActivity` element has `calories: null` and `calorieError: "BODY_WEIGHT_REQUIRED"`; `totalCalories: null`, `calorieError: "BODY_WEIGHT_REQUIRED"`; the entry was accepted (not blocked) |
| `TEST-28c-8` | AC-28c | API/DB Integration | Own Participant with 70 kg; *Walk* planned only Mon/Wed/Fri and another item planned every day, so 2026-11-10 (a Tuesday) is not a Rest Day; a Walk entry of 3 km on that date | `GET` for 2026-11-10 | *Walk* is in `otherActivity` (not in `items`), 150.5 kcal, counted in `totalCalories`; scores unchanged |

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
| Step | Commit type | Content | Evidence kept |
| ------ | ------ | ------ | ------ |
| 1 | `docs` | This contract v0.1.0 (spec-only) | Commit ID |
| 2 | `test` (red) | TEST-20a-1 to 20c-4 (`calorie_calc.test.ts`) with the module absent | Failing run (import error) |
| 3 | `feat` (green) | `calorieCalc` pure functions (`estimateMinutes`, `calcCalories`, decimal half-up rounding) | Passing run |
| 4 | `test` (red) | TEST-28a-1 to 28a-5, 28b-1 to 28b-5, 28c-1 to 28c-8 | Failing run showing the missing fields / wrong weight used |
| 5 | `feat` (green) | `pickBodyWeight`, `progressService` extension, response fields of §4.1 | Passing run |
| 6 | `test` / `feat` | Today UI (§6); Access Matrix re-run (TEST-12 / TEST-22c) | Passing run, screenshots |
| 7 | PR | Reviewed by Onsinee into `staging/sprint-2` | Review comment with a specific check |

**Existing code and tests this change touches (read in `staging/sprint-1`, 23 Nov 2026).** (a) `server/domain/progressService.ts` (`dailyProgress`, line 19) returns early on a Rest Day without reading entries; R10 and R12 need the entries of a Rest Day, so the early return must change. (b) `tests/integration/progress_api.test.ts` lines 180–188 compare the Rest Day body with `toEqual`; it fails once `otherActivity`, `totalCalories` and `calorieError` exist, so its expected body is updated in a visible commit whose reason is this contract (a contract-driven expectation change, not a weakened assertion). (c) `otherActivity` needs name, `trackingMode`, `unit`, `metValue` and `cardioCategory` of exercises that are not plan items on the date, so a new query (or an extension of the entry listing) is needed; the method name is left to the implementation. (d) Arithmetic follows §4.4: no new dependency. (e) *Added in 0.1.3, recorded after implementation:* `tests/integration/progress_api.test.ts` TEST-06f-1 (AC-06f: a body weight change does not change the score) compared the whole `items` array of `GET /api/progress/daily` before and after the weight change with `toEqual`. Under §4.1 each item carries `calories` and `calorieError`, and body weight is meant to change `calories`, so that assertion fails by design. Its expected value is updated in a visible commit (`b806bac`): `items` are compared without `calories`/`calorieError`, `overallPercent` and `totalScore` are still compared exactly, and the kcal of the fixture item is asserted on both sides (12.3 at Alice's seeded 70.5 kg, 21 at 120 kg). Like (b), this is a contract-driven expectation change, not a weakened assertion; it was not named here before implementation, which the PR #117 review flagged.

--------------------------------------------------------------------------------

#### 10. Definition of Done for F-11
| # | Criterion | Evidence required |
| ------ | ------ | ------ |
| 1 | Contract reviewed and approved by Onsinee before implementation | Review comment; commit order |
| 2 | Pure calorie module and the §4.1 response fields implemented as specified; no migration, no new route, no new error code | Code on `staging/sprint-2`; schema check (no migration added) |
| 3 | All tests of §8 implemented and enabled, none skipped; names match the STS IDs | Test names |
| 4 | Tests executed on the merge commit with counts (F-11 tests insert `WeightLog` rows directly, so they do not depend on TEST-17a–d) | Passed / failed / skipped counts |
| 5 | TDD red/green evidence for AC-28a (historical lookup) and AC-28b (no weight, not blocked) | Failing and passing runs with commit IDs |
| 6 | Hand-checked arithmetic of AC-20a–c reproduced in the tests (18.4, 210, 343) and the boundary weights 1 and 800 covered | Test output |
| 7 | Today UI shows item kcal, total and the "Set your body weight" prompt; verified by a manual run, screenshot with commit ID (no E2E AC exists for F-11 in the RTM) | Screenshots |
| 8 | The F-06 routes still pass the Endpoint Access Matrix run (AC-12c / AC-22c) and AC-06f | Integration output |
| 9 | Teammate-reviewed PR with a substantive comment; integrated on staging | PR link, reviewer, comment |
| 10 | RTM §3.1 rows for AC-20a–c and AC-28a–c updated with actual test names, result and commit; `api-spec.md` / `ui-spec.md` updated with the §4.1 / §6 fields; README unchanged or current; no secret committed | Updated register and docs |
| 11 | Incomplete work and limitations disclosed (§13) | §13 updated |

**Evidence list for the final evidence package:** commit IDs of steps 1–6; red and green run outputs; the test run counts on the merge commit; the PR review comment; screenshots of Today with kcal and with the weight prompt; the updated RTM §3.1 rows; the contract-approval-register row.

--------------------------------------------------------------------------------

#### 11. Dependencies on Other Contracts
| Item | Provided to / needed from | Note |
| ------ | ------ | ------ |
| `GET /api/progress/daily`, `progressService`, `calcDaily`, the daily result shape | Needed from F-06 | F-11 only adds fields (F-06 §11 already reserved this) |
| `resolvePlan`, `UserExercise` (`metValue`, `cardioCategory`, `trackingMode`) | Needed from F-03 / F-02 | Snapshot values, AC-27 |
| `LedgerEntry`, `cumulativeFor` | Needed from F-04 | Source of `sets`, `durationSec`, `distanceKm` |
| `GET/PUT /api/profile`, `WeightLog` writes, S-07 | Needed from F-04 (CHANGE-04, AC-17a–d) | **Dependency only**; F-11 tests insert `WeightLog` rows directly so they do not wait for it, but the user-visible flow needs it |
| Registry, `requireRole`, error envelope, Clock | Needed from F-01 | No new policy |
| Per-day kcal functions | Provided to F-10 (monthly total kcal, per-exercise totals) | F-10 reuses `calcCalories` (unrounded), `roundKcal`, `pickBodyWeight` and `estimateMinutes`, including the `otherActivity` rules (R12); the unrounded per-exercise value is what F-10 needs for its own totals |
| `GET /api/progress/monthly` kcal fields | Moved to F-10 (Sprint 3) | Not part of F-11 (§4.2) |
| Entry edit / delete | F-05 | Calories follow edited entries automatically (computed on read) |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
Items for the lead / reviewer; none changes an AC, a test ID or a scope statement.

| # | Pending item | Document(s) affected | Status |
| ------ | ------ | ------ | ------ |
| P11-1 | Register rows AC-20a–c, AC-28a–c in RTM §3.1 (Implemented / Result / Commit) after implementation; a contract-approval-register row for this contract | `docs/traceability.md`, `docs/sprints/sprint-1/contract-approval-register.md` | To do (lead) |
| P11-2 | Add the §4.1 fields to the daily progress response and the calorie notes to S-02 | `docs/sprints/sprint-1/api-spec.md` (Onsinee), `docs/sprints/sprint-1/ui-spec.md` (Onsinee) | To do; both are Sprint 1 specs whose scope line says Sprint 2 items are "documented for completeness" |
| P11-3 | `docs/srs.md` Appendix A.5 lists `BODY_WEIGHT_REQUIRED` with HTTP 200 as a `calorieError`; no baseline change is needed | none | Resolved (read in SRS A.5 and api-spec §1.1) |
| P11-4 | F-10 must specify the monthly kcal fields (and decide how `otherActivity` and days without weight enter the month total); F-06 §4.2 stays unchanged | `docs/sprints/sprint-3/` F-10 contract (to be written) | To do (lead) |

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
**Decided questions (the open questions of 0.1.0, decided on 23 Nov 2026: Q1 and Q2 by the user; Q3 to Q6 by the lead, to whom the user delegated the decision. The Onsinee review of this contract can still change any of them)**
| # | Question | Decision | Where applied |
| ------ | ------ | ------ | ------ |
| Q1 | Daily total: sum of rounded item values, or sum of unrounded values rounded once? | **Decided (user):** sum of the unrounded values, rounded once, half up | R6, TEST-20a-7, TEST-28c-1 |
| Q2 | Do calories of unplanned exercises and free-form Rest Day entries count? | **Decided (user):** yes, they count toward `totalCalories`; they stay unscored. Shape chosen by the author for review: additive top-level `otherActivity` array | R12, §4.1, TEST-28c-5 to 28c-8 |
| Q3 | Monthly route fields and monthly kcal | **Decided (lead, delegated by the user):** not F-11; moves to F-10 (Sprint 3) | §4.2, §11, P11-4 |
| Q4 | Tie-break for two `WeightLog` rows with the same `effectiveDate` | **Decided (lead, delegated by the user):** latest `createdAt` | R2, TEST-28a-4 |
| Q5 | `estimatedMinutes` in the response | **Decided (lead, delegated by the user):** keep, unrounded | R5, §4.1 |
| Q6 | `totalCalories` when no weight (including a Rest Day) | **Decided (lead, delegated by the user):** `null` with `calorieError` | R8, R10, TEST-28b-4 |

**Open for review:** the `otherActivity` shape (name, fields, ordering by name) is the author's proposal inside decision Q2 and is open for the reviewer's comment.

**Limitations**
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | Calories are estimates from a standard MET and a fixed 1.5 min per set; they are not measurements | By design (BR-12) |
| 2 | Quick Complete may raise `sets` above the bare formula (F-04 R9/R12), and the minutes use the stored `sets`, so a Quick Complete can look like more time | Accepted; follows the stored data |
| 3 | A past day's kcal can change if its entries are edited (F-05, same-day only) | By design (computed on read). A weight row cannot be backfilled through the API because `PUT /api/profile` always uses today as `effectiveDate` (F-04 R16); tests insert dated rows directly |
| 4 | There is no UI/E2E acceptance criterion for the calorie display in the RTM; the display is verified manually | Disclosed (DoD 7) |
| 5 | F-11 is a Sprint 2 cut candidate (plan §5.3 names F-08 and F-11 as the features that may slip); the cut line is decided by both team members, not by this contract | Open, outside this document |
| 6 | `GET /api/progress/daily` does more work after F-11 and this contract adds no performance criterion. The reviewer cites latency runs recorded in RTM 1.1.14 for AC-21a (p95 437 and 328 ms against 500 ms, from the unmerged `feature/75-deferred-ac`); I did not re-run or re-read them. Latency is re-measured in Sprint 3 by SYS-01 AC-21b, whose contract does not name this endpoint (checked with a text search only) | Disclosed; not made a DoD item of F-11 (reason in the PR reply) |
