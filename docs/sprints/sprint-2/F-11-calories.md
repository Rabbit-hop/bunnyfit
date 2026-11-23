### Feature Engineering Contract: F-11 Estimated Duration & Calorie Calculation via METs (Historical `WeightLog` Lookup)
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-11
**Sprint:**  2 (CHANGE-02; the Monthly Progress Summary that totals kcal is F-10, Sprint 3)
**Contract Version:**  0.1.0
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

*Rule: committed as a specification-only commit before any F-11 implementation; later changes are new versions with a reason, never silent rewrites.*

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
F-11 adds the **calorie estimate** to the progress result of F-06: for every planned exercise of a day it computes the **estimated minutes** and the **estimated calories burned** from the exercise's MET value, the Participant's body weight on that date and the logged activity, and it shows the per-exercise values and the daily total on Today. F-11 is a **read-only computation feature**: it stores nothing, adds no table, no column, no migration and **no route**. It extends the response of an existing route (`GET /api/progress/daily`) and, when that route exists, of `GET /api/progress/monthly`.

| In scope | Out of scope (and where it belongs) |
| ------ | ------ |
| Formula `metValue × bodyWeightKg × (estimatedMinutes ÷ 60)` and rounding to 1 decimal, half up (BR-12, Appendix A.4) | `GET /api/profile` and `PUT /api/profile`, the append-only `WeightLog` writes, the 1–800 kg validation and screen S-07 (AC-17a–d, **F-04, Sprint 2, CHANGE-04**): F-11 only reads `WeightLog` |
| Historical `WeightLog` lookup: latest row with `effectiveDate` on or before the activity date | Item Score, Daily Overall %, monthly average (F-06); body weight never changes a score (Decision 11, AC-06f) |
| Estimated minutes per `trackingMode` (sets × 1.5 min; duration ÷ 60; distance × standard pace) | Monthly Progress Summary report and its kcal totals (F-10, Sprint 3) |
| `calories`, `estimatedMinutes` per planned item and `totalCalories` in the daily response; `calories: null` with `calorieError: "BODY_WEIGHT_REQUIRED"` (HTTP 200) when no weight applies | Calories in the responses of `POST /api/entries` and Quick Complete (unchanged), and calories for entries of exercises that are not planned on the date (see §13, Q2) |
| Calorie display on Today: item card kcal, daily total, "Set your body weight" prompt | Editing or deleting entries (F-05); once it exists, the calorie values follow the entries because they are computed on read |
| Pure domain module `calorieCalc` with unit tests; integration tests for the lookup | Default MET values of custom exercises (AC-16a–b, CHANGE-05): F-11 reads the stored `metValue` |

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
3. `GET /api/progress/daily?date=D` resolves the plan items of date *D* (F-06), reads the cumulative values of *D* (`cumulativeFor`), looks up the body weight valid on *D* (R2) and calls the pure functions of §4.4 for each item. The response carries the F-06 fields unchanged plus the calorie fields of §4.1.
4. If no `WeightLog` row has `effectiveDate` ≤ *D*, every calorie value of the response is `null`, `calorieError` is `"BODY_WEIGHT_REQUIRED"`, the status stays `200`, and logging is never blocked (R8).
5. Today shows the kcal of each item card and the daily total; when `calorieError` is set it shows the prompt "Set your body weight" with a link to S-07 instead (§6).
6. Because values are computed on read, a later weight update never rewrites the calories of an earlier date (the lookup picks the row valid on that date), and a new ledger entry changes the value at the next read (no stale value).

##### 3.2 Business Rules
| ID | Rule | Status |
| ------ | ------ | ------ |
| R1 | `calories = metValue × bodyWeightKg × (estimatedMinutes ÷ 60)` (BR-12). `metValue` is the `UserExercise.metValue` of the Participant's snapshot (F-02/F-03; Decimal(4,1)); it is never read from the template at calculation time, so template edits cannot change history (AC-27) | Baseline BR-12 |
| R2 | **Weight lookup:** the body weight used for date *D* is the `weightKg` of the `WeightLog` row of that Participant with the **latest `effectiveDate` ≤ *D*** (a row whose `effectiveDate` equals *D* counts). If several rows share that `effectiveDate`, the one with the latest `createdAt` wins (same tie-break as the current weight of F-04 R16). Rows with `effectiveDate` > *D* are ignored | Baseline BR-12 / B6 / AC-28a; tie-break: see §13 Q4 |
| R3 | The **activity date** *D* is the `date` of the progress request (default today, Asia/Bangkok, through the injectable Clock). All entries counted are those whose `logDate` = *D* (F-04 R3: always the date of writing) | Baseline BR-01 / F-06 |
| R4 | **Estimated Minutes** (cumulative values of the day per exercise, F-04 R7): `WEIGHT`, `BODYWEIGHT_REPS` → `Σsets × 1.5`; `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME` → `Σ durationSec ÷ 60`; `CARDIO_DISTANCE` → `Σ distanceKm × standard pace (min/km)` of its `cardioCategory`: Running 6.0, Walking 10.0, Cycling 3.0, Swimming 20.0 (A.1). Distance entries carry no duration (F-04 R4), so the pace rule always applies to them. No logged activity → 0 minutes | Baseline BR-12 / A.1 |
| R5 | **Rounding:** all arithmetic is decimal (no binary floating point, same rule as SRS Q49). Only the final calories value is rounded, to **1 decimal place, half up** (A.4): 18.375 → 18.4, 5.25 → 5.3, 6.65 → 6.7. `estimatedMinutes` is returned unrounded (an exact decimal such as 4.5 or 7.5) | Baseline A.4 / Q49 |
| R6 | **Daily total:** `totalCalories` = the sum of the **already rounded** item `calories` of the response, so the numbers on the screen add up (this default is open for the reviewer, §13 Q1) | Design decision, open |
| R7 | A planned item with no entries on *D* has `estimatedMinutes` 0 and `calories` 0 when a weight applies. A planned day with no logs has `totalCalories` 0 | Design decision |
| R8 | **No weight:** when R2 finds no row, `calories` of every item and `totalCalories` are `null`, and `calorieError` is `"BODY_WEIGHT_REQUIRED"`, on the item and at top level; the HTTP status is `200`; scores and all F-06 fields are unaffected; `POST /api/entries` and Quick Complete are not blocked. `BODY_WEIGHT_REQUIRED` is **not** an error-envelope code and no new error code is added (SRS A.5, api-spec §1.1) | Baseline BR-12 / Q27 / AC-28b |
| R9 | `calorieError` has exactly two values: `null` (a value was computed) or `"BODY_WEIGHT_REQUIRED"`. `calories` and `calorieError` are never both set (calories is `null` iff `calorieError` is non-null) | Design decision |
| R10 | The weight applies to the **date**, not to the item: all items of one response share one weight, so either every item has a value or none has. This also holds on a Rest Day (`items: []`): the top-level `totalCalories` is `0` when a weight applies and `null` with `calorieError` when none does | Design decision |
| R11 | Nothing is stored (SDS §3.4). The calculation functions never call the Clock or the database; the service loads weight rows, plan items and entries and passes them in | Baseline SDS §3.4 |
| R12 | Calories are computed only for the items already returned by F-06 (planned on *D*). Entries of non-planned exercises and free-form Rest Day entries are shown in the ledger but are not part of `items` or `totalCalories` (see §13 Q2) | Design decision, open |
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
| B7 | Rest Day | `items: []`; `totalCalories` 0 with a weight or `null` + error without (R10) |
| B8 | Exercise with zero logged activity on a targeted day | `estimatedMinutes` 0, `calories` 0 (R7) |
| B9 | Quick Complete entry with raised `sets` (F-04 R9/R12) | Minutes use the **stored** `sets`; see §13 limitation 2 |
| B10 | Manager token; foreign `?userId=` | `403` (identity from the token only; unchanged F-06 policy) |

##### 3.4 Permissions (Access Matrix rows)
F-11 adds **no route**. The only changed route keeps the F-06 policy, so no row is added to the registry; the Endpoint Access Matrix (AC-12c / AC-22c) rows below stay valid and are the ones re-run with the new fields.

| Operation | Unauthenticated | Manager | Participant |
| ------ | ------ | ------ | ------ |
| `GET /api/progress/daily` (now with calorie fields; `featureId` stays `F-06`) | 401 | 403 | Allow (own data only; `userId` query parameter other than own → 403) |
| `GET /api/progress/monthly` *(Sprint 2, CHANGE-06; F-06 route, calorie fields added by F-11)* | 401 | 403 | Allow (own data only; foreign `userId` → 403) |

Identity comes from the token only; a Manager never receives Participant activity, weight or calorie data (BR-04, Exclusion 3). The weight value is not itself returned by these routes (it is only an input of the calculation); `GET /api/profile` is F-04's route.

--------------------------------------------------------------------------------

#### 4. API Specification
Conventions follow SDS §5.1 and api-spec §1 (JSON, error envelope of SRS Appendix A.5, dates `YYYY-MM-DD`).

##### 4.1 `GET /api/progress/daily?date=YYYY-MM-DD` (extension of F-06 §4.1)
**Request and errors are unchanged** (400, 401, 403). **Fields added (and only these):**

| Where | Field | Type | Meaning |
| ------ | ------ | ------ | ------ |
| each `items[]` element | `estimatedMinutes` | number | R4, unrounded decimal (0 when nothing is logged) |
| each `items[]` element | `calories` | number or `null` | R1/R5, 1 decimal; `null` when no weight applies |
| each `items[]` element | `calorieError` | `null` or `"BODY_WEIGHT_REQUIRED"` | R9 |
| top level | `totalCalories` | number or `null` | R6/R10 |
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
  "totalCalories": 368.1,
  "calorieError": null
}
```
(Squat: 3 sets × 1.5 = 4.5 min, 3.5 × 70 × 4.5/60 = 18.375 → 18.4. Plank: 90 s = 1.5 min, 3.8 × 70 × 1.5/60 = 6.65 → 6.7. Run: 5 km × 6.0 = 30 min, 9.8 × 70 × 30/60 = 343. Total 18.4 + 6.7 + 343 = 368.1.)

No weight for the date (HTTP `200`, **not** an error envelope):
```json
{
  "date": "2026-11-05", "isRestDay": false,
  "items": [ { "planItemId": "uuid", "userExerciseId": "uuid", "name": "Barbell Squat",
      "trackingMode": "WEIGHT", "unit": "reps", "priorityWeight": 3,
      "target": 40, "actual": 30, "ratio": 0.75, "itemScore": 2.25,
      "estimatedMinutes": 4.5, "calories": null, "calorieError": "BODY_WEIGHT_REQUIRED" } ],
  "totalScore": 2.25, "totalWeight": 3, "overallPercent": 75,
  "totalCalories": null, "calorieError": "BODY_WEIGHT_REQUIRED"
}
```
Rest Day with a weight: `{ "date": "...", "isRestDay": true, "items": [], "totalScore": 0, "totalWeight": 0, "overallPercent": null, "totalCalories": 0, "calorieError": null }`.

##### 4.2 `GET /api/progress/monthly?month=YYYY-MM` (extension of F-06 §4.2; applies only once CHANGE-06 delivers the route, see §13 Q3)
Request and errors unchanged. **Fields added:** `days[].totalCalories` (number or `null`, computed per day with that day's weight by R2, so a mid-month weight change is respected), `days[].calorieError` (`null` or `"BODY_WEIGHT_REQUIRED"`), and at top level `totalCalories` (sum of the non-null `days[].totalCalories`, or `null` when every counted day is `null`) and `calorieError` (`"BODY_WEIGHT_REQUIRED"` when at least one counted day has `null` calories, otherwise `null`). A month total that has `calorieError` set is therefore **incomplete by design**; the UI says so (§6). The existing monthly fields are unchanged.

##### 4.3 Route Policies
No route is added or changed in the registry: `GET /api/progress/daily` and `GET /api/progress/monthly` keep `featureId: 'F-06'`, `auth: 'required'`, `roles: ['PARTICIPANT']`, `ownership: 'self-scoped'` (F-06 §4.3). The generic registry ↔ matrix tests (TEST-22c) and the F-06 route cases keep covering them; nothing may be added to the registry by F-11.

##### 4.4 Internal interfaces (pure functions, no I/O; new module `server/domain/calorieCalc.ts`, name is a proposal)
```ts
pickBodyWeight(rows: { weightKg, effectiveDate, createdAt }[], date: string): Decimal | null   // R2
estimateMinutes(item: { trackingMode, cardioCategory, sets, durationSec, distanceKm }): Decimal  // R4
calcCalories(metValue: Decimal, weightKg: Decimal, estimatedMinutes: Decimal): Decimal          // R1 + R5, rounded once
withCalories(daily: DailyResult, items: CalorieInput[], weightKg: Decimal | null): DailyResult   // R6-R10
```
The standard paces of R4 are constants of this module (SRS A.1); `progressService` loads data and passes it in. No function calls the Clock or the database.

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
| **Daily total** (progress card) | "Calories today: ≈ 368.1 kcal" (`today-kcal`), shown whenever `totalCalories` is a number (also "0 kcal" on a day with no log) |
| **"Set your body weight" prompt** | When `calorieError` is `"BODY_WEIGHT_REQUIRED"`: item cards show "—" instead of kcal, the progress card shows the notice "Set your body weight to see calories" with a link to S-07 Profile (`today-weight-prompt`); the prompt is informational, **not an error**, and does not block Quick Complete or logging |
| Monthly card *(only when `/monthly` exists)* | Total kcal with the subtitle "Some days have no body weight and are not counted" when the month `calorieError` is set |
| Real time | The values refresh with the progress refetch after every entry (F-06 §6); after the Participant saves a weight in S-07 and returns to Today, the next fetch shows kcal |
| Manager | No Today screen, no calories |

Rounding for display: kcal to 1 decimal half up as returned; minutes to 1 decimal half up. Whether the item card keeps the "x kcal" visible for completed items (UI 0.8.0 moves them behind History) is left to `ui-spec.md`.

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
AC-20a–c and AC-28a–c use the IDs and wording of RTM 1.1.10 (Section 1, rows BR-12 / FR-08 / FR-05), refined only with the endpoints and fields above. No AC meaning or ID is changed.

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
Files: `tests/unit/calorie_calc.test.ts` (AC-20a–c), `tests/integration/calorie_weightlog.test.ts` (AC-28a–c). Fixtures: seeded Manager, Alice, Bob and a fresh Participant with no `WeightLog` row (the integration tests name it "Dana"); real PostgreSQL test database; injectable Clock fixed at **Thu 12 Nov 2026 10:00 Asia/Bangkok** unless stated; past dates are written through the historical helpers (`createHistoricalPlanItem`, `createHistoricalEntry`) and read with `GET /api/progress/daily?date=`. Dates and values are chosen so every expected result is exact; arithmetic is shown in the last column. "Dana" plan items apply on every weekday from 1 Nov 2026, so no day is a Rest Day unless stated.

**Unit tests (`calorie_calc.test.ts`)**

| Test ID | AC | Level | Inputs / preconditions | Expected result (worked arithmetic) |
| ------ | ------ | ------ | ------ | ------ |
| `TEST-20a-1` | AC-20a | Unit | `WEIGHT`, cumulative sets 3, 3.5 METs, 70 kg | minutes 3 × 1.5 = 4.5; 3.5 × 70 × (4.5/60) = 245 × 0.075 = 18.375 → **18.4** |
| `TEST-20a-2` | AC-20a | Unit | `BODYWEIGHT_REPS`, sets 4, 3.8 METs, 50 kg | minutes 6; 3.8 × 50 × 0.1 = **19.0** (19) |
| `TEST-20a-3` | AC-20a | Unit | Half-up tie: `WEIGHT`, sets 1, 3.5 METs, 60 kg | minutes 1.5; 3.5 × 60 × 0.025 = 5.25 → **5.3** (half up, not banker's 5.2) |
| `TEST-20a-4` | AC-20a | Unit | Sets taken from the day's cumulative: entries 2 + 1 sets, 3.5 METs, 70 kg | Σsets 3 → same as TEST-20a-1: **18.4** (not 2 or 1 entry alone) |
| `TEST-20a-5` | AC-20a | Unit | Boundary weight 1 kg: `WEIGHT`, sets 1, 3.5 METs | 3.5 × 1 × 0.025 = 0.0875 → **0.1** |
| `TEST-20a-6` | AC-20a | Unit | No activity: sets 0 (or no entry), 3.5 METs, 70 kg | minutes 0; calories **0** |
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
| `TEST-28a-6` | AC-28a | API/DB Integration | *(only when `GET /api/progress/monthly` exists, §13 Q3)* Dana: 70 kg (1 Nov), 68 kg (10 Nov); the same Squat 2-set entry on 2026-11-09 and 2026-11-10 | `GET /api/progress/monthly?month=2026-11` | `days[]` kcal 12.3 and 11.9; month `totalCalories` 24.2 (12.3 + 11.9); weight change is applied per day |
| `TEST-28b-1` | AC-28b | API/DB Integration | Bob (no `WeightLog` row); Squat planned; Bob logs `POST /api/entries` `{ sets: 2, totalReps: 20 }` | The POST, then `GET /api/progress/daily` | POST `201` (logging **not blocked**); GET **`200`**; item `calories: null`, `calorieError: "BODY_WEIGHT_REQUIRED"`; top level `totalCalories: null`, `calorieError: "BODY_WEIGHT_REQUIRED"` |
| `TEST-28b-2` | AC-28b | API/DB Integration | Dana's only row is 68 kg effective 2026-11-10; entry on 2026-11-05 and on 2026-11-12 | `GET` for each | 5 Nov: `calories: null` + `calorieError` (no row ≤ 5 Nov); 12 Nov: value **11.9** with `calorieError: null` |
| `TEST-28b-3` | AC-28b | API/DB Integration | Bob, no weight | `GET` response of 28b-1 | Status `200`, body has **no** `code`/`message`/`fields` envelope; `ratio`, `itemScore`, `overallPercent` are present and identical to the values computed without weights (scores unaffected) |
| `TEST-28b-4` | AC-28b | API/DB Integration | Bob, no weight; a Rest Day fixture (no plan item on the date) | `GET` for that date | `200`; `isRestDay: true`, `items: []`, `overallPercent: null`, `totalCalories: null`, `calorieError: "BODY_WEIGHT_REQUIRED"` |
| `TEST-28b-5` | AC-28b | API/DB Integration | Bob logs a first weight afterwards (row inserted for today) | `GET` today | `calories` now a number (value of the entry, e.g. 11.9 at 68 kg), `calorieError: null`; earlier dates without a row stay `null` |
| `TEST-28c-1` | AC-28c | API/DB Integration | Dana: 70 kg effective 2026-11-01; Squat `WEIGHT` 3.5 METs (3 sets logged), Plank `BODYWEIGHT_TIME` 3.8 METs (90 s), Outdoor Run `CARDIO_DISTANCE` Running 9.8 METs (5 km), all planned for 2026-11-05 | `GET /api/progress/daily?date=2026-11-05` | `items[].calories` **18.4**, **6.7**, **343**; `estimatedMinutes` 4.5, 1.5, 30; `totalCalories` **368.1** (18.4 + 6.7 + 343; the sum of the unrounded 18.375 + 6.65 + 343 = 368.025 would give 368.0, R6 / §13 Q1) |
| `TEST-28c-2` | AC-28c | API/DB Integration | Dana, today 2026-11-12, 68 kg; Squat planned, no entries; then Quick Complete for a 4-set target | `GET`, Quick Complete, `GET` | First: `estimatedMinutes` 0, `calories` 0, `totalCalories` 0; after Quick Complete the value is the new cumulative's (4 × 1.5 = 6 min → 3.5 × 68 × 0.1 = **23.8**) with no stale value |
| `TEST-28c-3` | AC-28c | API/DB Integration | Dana's data of 28c-1, then a second user with 40 kg and the same entries | `GET` for both | `itemScore`, `overallPercent` are **identical** for both (Decision 11, AC-06f); only calories differ |
| `TEST-28c-4` | AC-28c | API/DB Integration | Alice, Bob, Manager tokens | Manager `GET`; Alice with `?userId=<Bob>`; no token | Manager `403`; foreign `userId` `403` with no calorie data in the body; no token `401`; own request `200` |

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
| Step | Commit type | Content | Evidence kept |
| ------ | ------ | ------ | ------ |
| 1 | `docs` | This contract v0.1.0 (spec-only) | Commit ID |
| 2 | `test` (red) | TEST-20a-1 to 20c-4 (`calorie_calc.test.ts`) with the module absent | Failing run (import error) |
| 3 | `feat` (green) | `calorieCalc` pure functions (`estimateMinutes`, `calcCalories`, decimal half-up rounding) | Passing run |
| 4 | `test` (red) | TEST-28a-1 to 28a-5, 28b-1 to 28b-5, 28c-1 to 28c-4 | Failing run showing the missing fields / wrong weight used |
| 5 | `feat` (green) | `pickBodyWeight`, `progressService` extension, response fields of §4.1 | Passing run |
| 6 | `test` / `feat` | TEST-28a-6 and the §4.2 fields *(only if `/monthly` exists)*; Today UI (§6); Access Matrix re-run (TEST-12 / TEST-22c) | Passing run, screenshots |
| 7 | PR | Reviewed by Onsinee into `staging/sprint-2` | Review comment with a specific check |

--------------------------------------------------------------------------------

#### 10. Definition of Done for F-11
| # | Criterion | Evidence required |
| ------ | ------ | ------ |
| 1 | Contract reviewed and approved by Onsinee before implementation | Review comment; commit order |
| 2 | Pure calorie module and the §4.1 response fields implemented as specified; no migration, no new route, no new error code | Code on `staging/sprint-2`; schema check (no migration added) |
| 3 | All tests of §8 (except those conditional on `/monthly`, see §13 Q3) implemented and enabled, none skipped; names match the STS IDs | Test names |
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
| Per-day and per-month kcal | Provided to F-10 (total kcal, per-exercise totals) | Same pure functions are reused |
| `GET /api/progress/monthly` | Needed from F-06 (CHANGE-06) | Conditional, §13 Q3 |
| Entry edit / delete | F-05 | Calories follow edited entries automatically (computed on read) |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
Items for the lead / reviewer; none changes an AC, a test ID or a scope statement.

| # | Pending item | Document(s) affected | Status |
| ------ | ------ | ------ | ------ |
| P11-1 | Register rows AC-20a–c, AC-28a–c in RTM §3.1 (Implemented / Result / Commit) after implementation; a contract-approval-register row for this contract | `docs/traceability.md`, `docs/sprints/sprint-1/contract-approval-register.md` | To do (lead) |
| P11-2 | Add the §4.1 fields to the daily progress response and the calorie notes to S-02 | `docs/sprints/sprint-1/api-spec.md` (Onsinee), `docs/sprints/sprint-1/ui-spec.md` (Onsinee) | To do; both are Sprint 1 specs whose scope line says Sprint 2 items are "documented for completeness" |
| P11-3 | `docs/srs.md` Appendix A.5 lists `BODY_WEIGHT_REQUIRED` with HTTP 200 as a `calorieError`; no baseline change is needed | none | Resolved (read in SRS A.5 and api-spec §1.1) |

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
**Open questions (not decided here; the reviewer or the user must answer)**
| # | Question | Default used in this draft |
| ------ | ------ | ------ |
| Q1 | The daily total: sum of the rounded item values, or the sum of unrounded values rounded once? The SRS (A.4) only says calories are rounded to 1 decimal. The two differ in the example of TEST-28c-1 (368.1 vs 368.0) | Sum of the rounded item values (R6), so the displayed numbers add up |
| Q2 | Should calories of entries that are not part of `items` (exercises not planned on the date, free-form Rest Day entries, which F-04 R13 stores but F-06 never scores) be included in the daily total? BR-12 and FR-05 do not say. Including them would need an extra response field | Not included (R12); only planned items |
| Q3 | `GET /api/progress/monthly` belongs to F-06 (CHANGE-06, deferred) and the monthly summary kcal belongs to F-10 (Sprint 3). Is the monthly route built in Sprint 2 and does F-11 own its calorie fields? The issue asks to say where kcal appears "daily, monthly" | §4.2 specifies the fields conditionally; TEST-28a-6 runs only if the route exists, otherwise the fields move to F-10 |
| Q4 | Tie-break for two `WeightLog` rows with the same `effectiveDate`: SRS only says "latest row with `effectiveDate` ≤ `logDate`". F-04 R16 defines the current weight as latest `effectiveDate`, then `createdAt` | Same rule (latest `createdAt`) |
| Q5 | Is `estimatedMinutes` part of the response? The SRS calls for an estimated duration (F-11 title) but names no field | Added as an unrounded `estimatedMinutes` per item |
| Q6 | Does a day with no weight but a Rest Day return `null` (this draft) or `0` for `totalCalories`? Weight-dependence of a zero total is a convention, not a baseline statement | `null` with `calorieError` (R10) |

**Limitations**
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | Calories are estimates from a standard MET and a fixed 1.5 min per set; they are not measurements | By design (BR-12) |
| 2 | Quick Complete may raise `sets` above the bare formula (F-04 R9/R12), and the minutes use the stored `sets`, so a Quick Complete can look like more time | Accepted; follows the stored data |
| 3 | A past day's kcal can change if its entries are edited (F-05, same-day only) | By design (computed on read). A weight row cannot be backfilled through the API because `PUT /api/profile` always uses today as `effectiveDate` (F-04 R16); tests insert dated rows directly |
| 4 | There is no UI/E2E acceptance criterion for the calorie display in the RTM; the display is verified manually | Disclosed (DoD 7) |
| 5 | F-11 is a Sprint 2 cut candidate (plan §5.3 names F-08 and F-11 as the features that may slip); the cut line is decided by both team members, not by this contract | Open, outside this document |
