### Feature Engineering Contract: F-03 Goal Setting, Custom Exercise & 4-Domain Plan Specification
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-03
**Sprint:**  1 (plan creation only; goal reconfiguration is F-07, Sprint 2)
**Contract Version:**  0.2.0
**SRS Baseline Version:**  1.0.0 (Feature Inventory 1.0.0, RTM 1.0.0, System-Level SDS 1.0.0, F-01 contract 0.1.2, F-02 contract 0.2.0)
**Date:**  6 November 2026
**Status:**  Draft: specification-only, awaiting reviewer approval before implementation
**Primary Author:**  Nakagamon  |  **Reviewer:**  Onsinee
**Repository Path:**  `docs/sprints/sprint-1/F-03-goal-setting.md`

--------------------------------------------------------------------------------

#### Contract Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 4 Nov 2026 | Initial contract: behavior, API/data/UI specification, AC (AC-03a–c, AC-16a–b, AC-27; proposed AC-03d), STS, Definition of Done, list of pending baseline changes (§12) | Nakagamon | Draft |
| **0.2.0** | 6 Nov 2026 | Baseline reconciliation with SRS / RTM / SDS / plan 1.0.0: baseline citation corrected from the nonexistent "RTM 1.2.0" to RTM 1.0.0 (F-01 contract 0.1.2, F-02 contract 0.2.0); AC restored to the RTM 1.0.0 numbering — AC-03b is again the validation criterion and AC-03c again the `repeatDays` / `endDate` occurrence criterion, the plan-resolution endpoint is folded into AC-03c as its observable, and the only genuinely new criterion (custom exercise for each of the 6 `trackingMode` values) is proposed as AC-03d; test IDs realigned to the AC suffix (old TEST-03b→03d, old TEST-03c→03b, old TEST-03d→03c); schema aligned with SDS §3.2/§3.3 (`planKey`, `version`, `@@unique([planKey, version])`, `repeatDays` stored as the Monday–Sunday bitmask, plan resolution tie-break by `version`); a well-formed `templateId` that does not exist now returns 404 `NOT_FOUND` instead of 400 | Nakagamon | Draft |

*Rule: committed as a specification-only commit before any F-03 implementation; later changes are new versions with a reason, never silent rewrites.*

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
F-03 is the **Participant's goal-setting step** of the Sprint 1 journey. A Participant builds a monthly plan of daily targets by either **selecting a base exercise template** (Copy-on-Select Snapshot, Decision 12) or **creating a Custom Exercise**, then sets target, Priority Weight, start date, weekly repeat days and an optional end date. F-03 also provides the **plan-resolution rule** ("which exercises are planned on date D, and is D a Rest Day?") that F-04 and F-06 rely on.

| In scope | Out of scope (and where it belongs) |
| ------ | ------ |
| Select a template → create `UserExercise` snapshot + `PlanItem` in one transaction | Changing or ending a goal after creation, plan versioning behavior beyond the first version (F-07, Sprint 2) |
| Create a Custom Exercise (all 6 `trackingMode` values) with default METs and default Valid Range (BR-08) | Template CRUD (F-02) |
| Target fields per `trackingMode` (Q21), Priority Weight 1–5, `effectiveFrom`, repeat days, `endDate` | Logging activity and Quick Complete (F-04) |
| Read own plan items and own exercises; resolve the plan for a date (`GET /api/plan?date=`) | Score calculation (F-06); schedule/calendar view and reminders (F-09) |
| Plan screen (Participant): "My Plan", template picker, custom exercise form | Using `metValue` for calories (F-11) |
| Seed/test helpers needed for historical plan rows (SRS Assumption 4) | Editing or deleting `PlanItem` / `UserExercise` (F-07); no such endpoint exists in Sprint 1 |

--------------------------------------------------------------------------------

#### 2. Linked Requirements and Dependencies
| Requirement | How F-03 serves it |
| ------ | ------ |
| **FR-03** | Select template or create custom exercise across 4 domains; Target > 0, Priority Weight 1–5, `effectiveFrom`, weekly repeat, optional end date; snapshots in `UserExercise` and `PlanItem` |
| **BR-02** (shared with F-02, F-04) | Target boundaries: sets 1–20, reps/set 1–200, duration 1–10,800 s, distance > 0 and ≤ 100 km, load > 0 and ≤ 500 kg; template Valid Range stricter limit applies (Q26) |
| **BR-08** | Custom exercise defaults: METs by `trackingMode` / `cardioCategory` (SRS Appendix A.1), default Valid Range, forced `cardioCategory` for `CARDIO_DISTANCE` (B3) |
| **BR-04 / NFR-02** (shared) | `UserExercise` and `PlanItem` are owned by one Participant; routes are registered in the F-01 policy registry (Manager → 403, cross-user → 403) |
| Decision 12 / B8 / Q10 | Snapshot isolation: later template update/delete never changes `UserExercise` (AC-27) |
| Q22, Q24 | No monthly-goal entity; Rest Day = a day on which no `PlanItem` occurs |

**Depends on:** F-01 (authentication, role middleware, registry, Clock) and F-02 (template read endpoints and fields). **Downstream:** F-04 (plan resolution for Quick Complete and Rest Day), F-06 (targets and weights), F-07 (versioning), F-09, F-11.

--------------------------------------------------------------------------------

#### 3. Feature Design (Feature-Level SDS)
##### 3.1 Behavior and Workflow
1. The Participant opens **My Plan** and chooses **Add exercise**.
2. **From library:** the picker shows the F-02 catalog (read-only), filtered by category or tracking mode. Selecting a template pre-fills the form from the template (name, mode, unit, Valid Range). **Custom:** the Participant enters name, target body part, tracking mode (and cardio category for distance exercises).
3. The form shows only the target fields for the chosen `trackingMode` (§3.2 R6), plus Priority Weight, start date (default today), repeat days (default every day) and optional end date.
4. On save the server validates everything (authorization first), then in **one transaction** creates the `UserExercise` snapshot and the `PlanItem`. On any failure nothing is stored.
5. The plan list refreshes; the new item is visible to F-04 and F-06 immediately for any date it occurs on.

```mermaid
sequenceDiagram
  participant P as Participant UI
  participant A as API
  participant D as PostgreSQL
  P->>A: GET /api/templates (F-02)
  P->>A: POST /api/plan-items {source: TEMPLATE, templateId, target..., priorityWeight}
  A->>A: authenticate, role=PARTICIPANT, validate body
  A->>D: read ExerciseTemplate
  A->>D: BEGIN; insert UserExercise (snapshot); insert PlanItem; COMMIT
  A-->>P: 201 {planItem, userExercise}
  Note over D: Later template edit/delete does not touch UserExercise
```

##### 3.2 Business Rules
| ID | Rule | Status |
| ------ | ------ | ------ |
| R1 | Only role `PARTICIPANT` may create or read plan data; Manager → 403 on every F-03 route. Authorization is checked before validation | Baseline (BR-04) |
| R2 | Selecting a template copies `name`, `targetBodyPart`, `trackingMode`, `unit`, `cardioCategory`, `metValue`, `rangeMin`, `rangeMax` into a new `UserExercise` and stores `sourceTemplateId` **without a foreign key** (B8). Later template changes never alter the snapshot | Baseline (Decision 12, B8) |
| R3 | Selecting the same template twice creates two independent `UserExercise` rows (no uniqueness) | **Pending** (§12) |
| R4 | Custom exercise: `name` trimmed 1–80, `targetBodyPart` trimmed 1–50, `trackingMode` one of 6 values; `cardioCategory` required for `CARDIO_DISTANCE` and forbidden otherwise (B3). The Participant cannot supply `metValue`, `unit`, `rangeMin` or `rangeMax` (unknown fields are rejected) | Baseline B3 + **Pending** (name lengths) |
| R5 | Custom defaults: `unit` derived from `trackingMode` (same mapping as F-02 R6); `metValue` from SRS Appendix A.1 (`WEIGHT` 3.5; `BODYWEIGHT_*` 3.8; `YOGA` 2.5; `CARDIO_TIME` 7.0; distance: `RUNNING` 9.8, `WALKING` 4.3, `CYCLING` 8.0, `SWIMMING` 5.8); `rangeMin` = minimum value (1 rep or second, 0.01 km); `rangeMax` = central limit (4,000 reps, 10,800 s, 100 km) | Baseline BR-08 / Q13 |
| R6 | Target fields by `trackingMode` (Q21): `WEIGHT` → `targetSets` (1–20), `targetRepsPerSet` (1–200), `loadKg` (> 0, ≤ 500, up to 2 decimals, **not scored**); `BODYWEIGHT_REPS` → `targetSets`, `targetRepsPerSet`; `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME` → `targetDurationSec` (1–10,800, integer); `CARDIO_DISTANCE` → `targetDistanceKm` (> 0, ≤ 100, up to 2 decimals). A target field that does not belong to the mode is rejected (400 naming the field); a missing required one is rejected | Baseline Q21 |
| R7 | Target Total Reps = `targetSets × targetRepsPerSet`. The target value (total reps / seconds / km) must lie within the snapshot's Valid Range `[rangeMin, rangeMax]`; the stricter of the range and the central limit applies (Q26) | Baseline Q26 |
| R8 | `priorityWeight`: required integer 1–5 | Baseline FR-03 |
| R9 | `effectiveFrom`: `YYYY-MM-DD`; optional, default = today (Asia/Bangkok, Clock); must be today or later, otherwise 400 `VALIDATION_ERROR` (not `LOG_DATE_MISMATCH`) | Baseline (Appendix A.2) |
| R10 | `endDate`: optional; if present must not precede `effectiveFrom` | Baseline Q21 |
| R11 | `repeatDays`: the API accepts a non-empty array of unique ISO weekdays 1 = Monday … 7 = Sunday (default `[1,2,3,4,5,6,7]`); it is **stored** as the SDS §3.2 Monday–Sunday bitmask (`127` = every day, bit 0 = Mon … bit 6 = Sun) and converted at the API boundary | Baseline SDS §3.2 + pending (API format, P3-9) |
| R12 | **Plan resolution** for user U and date D (SDS §3.3): for each `planKey` of U take the version with the greatest `effectiveFrom` ≤ D (ties: highest `version`); it *occurs* on D if (`endDate` is null or D ≤ `endDate`) and the weekday of D is in `repeatDays`. `isRestDay` = no item occurs on D (Q24). Sprint 1 always inserts `version = 1` with a fresh `planKey`; F-07 adds higher versions without changing this rule | Baseline SDS §3.3 / Q24 / B8 |
| R13 | `UserExercise` and `PlanItem` belong to exactly one Participant (`userId`); the owner never changes | Design decision |
| R14 | Creation is atomic: both rows or neither | Design decision |
| R15 | Every `PlanItem` insert creates a new `planKey` (UUID) with `version = 1`; `PlanItem` rows are never updated in place (SDS §3.2). The response exposes `planKey` and `version` | Baseline SDS §3.2 |

##### 3.3 Failure and Boundary Cases
| Case | Expected behavior |
| ------ | ------ |
| Manager calls any F-03 route | 403 `FORBIDDEN`, even with an invalid body |
| No token / expired / revoked | 401 `UNAUTHENTICATED` |
| `templateId` does not exist (well-formed UUID) | 404 `NOT_FOUND` naming `templateId` in `fields`; nothing stored |
| `templateId` not a UUID | 400 `VALIDATION_ERROR` |
| `source: TEMPLATE` with an `exercise` object, or `source: CUSTOM` with `templateId` | 400 naming the offending field |
| `targetSets` 20 / 21; `targetRepsPerSet` 200 / 201; `targetSets` 0 | Accepted / 400; accepted / 400; 400 |
| `targetDurationSec` 10,800 / 10,801 / 0 / 59.5 | Accepted / 400 / 400 / 400 |
| `targetDistanceKm` 100 / 100.01 / 0 / 5.123 | Accepted / 400 / 400 / 400 |
| `loadKg` 500 / 500.01 / 0 | Accepted / 400 / 400 (`loadKg` required for `WEIGHT`) |
| Total reps outside template Valid Range (e.g. range max 100, target 10 × 11 = 110) | 400 naming `targetRepsPerSet` with the range |
| `priorityWeight` 0 / 6 / 2.5 / missing | 400 each |
| `effectiveFrom` = today / yesterday / tomorrow | Accepted / 400 / accepted |
| `endDate` = `effectiveFrom` / one day earlier | Accepted / 400 |
| `repeatDays` `[]` / `[0]` / `[8]` / `[1,1]` | 400 each |
| `CARDIO_DISTANCE` custom without `cardioCategory`; `WEIGHT` custom with `cardioCategory` | 400 naming `cardioCategory` |
| Template deleted after selection | `UserExercise` and `PlanItem` unchanged; plan still resolves (AC-27) |
| `GET /api/plan?date=` with a malformed date | 400 `VALIDATION_ERROR` |
| `GET /api/plan-items/:id` of another Participant's item | 403 `FORBIDDEN` (404 only if the id does not exist) |
| Failure while inserting the `PlanItem` | The `UserExercise` row is rolled back |

##### 3.4 Permissions
| Operation | Unauthenticated | Manager | Participant |
| ------ | ------ | ------ | ------ |
| `POST /api/plan-items` | 401 | 403 | Allow |
| `GET /api/plan-items`, `GET /api/user-exercises`, `GET /api/plan?date=` | 401 | 403 | Allow (own data only; `userId` query parameter other than own → 403) |
| `GET /api/plan-items/:id` | 401 | 403 | Allow if owner, otherwise 403 |

--------------------------------------------------------------------------------

#### 4. API Specification
Conventions follow SDS §5.1 (JSON, error envelope of SRS Appendix A.5, dates as `YYYY-MM-DD`, decimals as JSON numbers).

##### 4.1 Endpoints
| Endpoint | Roles | Success | Errors |
| ------ | ------ | ------ | ------ |
| `POST /api/plan-items` | Participant | 201 `{ planItem, userExercise }` | 400, 401, 403, 404 |
| `GET /api/plan-items` | Participant | 200 list of plan items, each with its exercise snapshot, ordered by `effectiveFrom` then `createdAt` | 400, 401, 403 |
| `GET /api/plan-items/:id` | Participant (owner) | 200 plan item with snapshot | 400, 401, 403, 404 |
| `GET /api/user-exercises` | Participant | 200 list of own exercises (snapshots), sorted by name | 401, 403 |
| `GET /api/plan?date=YYYY-MM-DD` | Participant | 200 `{ date, isRestDay, items: [...] }`; `date` defaults to today | 400, 401, 403 |

No `PUT` or `DELETE` exists in Sprint 1 (F-07). Lists are not paginated.

##### 4.2 Create Request (template)
```json
{
  "source": "TEMPLATE",
  "templateId": "uuid",
  "priorityWeight": 3,
  "targetSets": 4,
  "targetRepsPerSet": 10,
  "loadKg": 40,
  "effectiveFrom": "2026-11-05",
  "endDate": "2026-11-30",
  "repeatDays": [1, 3, 5]
}
```
##### 4.3 Create Request (custom)
```json
{
  "source": "CUSTOM",
  "exercise": { "name": "Hill Walk", "targetBodyPart": "Legs", "trackingMode": "CARDIO_DISTANCE", "cardioCategory": "WALKING" },
  "priorityWeight": 2,
  "targetDistanceKm": 3.5
}
```
`effectiveFrom`, `endDate`, `repeatDays` are optional (R9–R11). Unknown fields are rejected.
* `repeatDays` is sent and returned as an ISO weekday array and stored as the SDS §3.2 bitmask (R11).*

##### 4.4 Create Response (`201`)
```json
{
  "userExercise": {
    "id": "uuid", "sourceTemplateId": "uuid-or-null", "isCustom": false,
    "name": "Barbell Squat", "targetBodyPart": "Legs", "trackingMode": "WEIGHT", "unit": "reps",
    "cardioCategory": null, "metValue": 3.5, "rangeMin": 1, "rangeMax": 4000
  },
  "planItem": {
    "id": "uuid", "userExerciseId": "uuid", "planKey": "uuid", "version": 1,
    "priorityWeight": 3,
    "targetSets": 4, "targetRepsPerSet": 10, "loadKg": 40,
    "targetDurationSec": null, "targetDistanceKm": null,
    "effectiveFrom": "2026-11-05", "endDate": "2026-11-30", "repeatDays": [1, 3, 5],
    "createdAt": "2026-11-05T03:00:00.000Z"
  }
}
```
The response never includes `userId`.

##### 4.5 Plan for a Date (`GET /api/plan?date=2026-11-06`)
```json
{
  "date": "2026-11-06",
  "isRestDay": false,
  "items": [ { "planItem": { "...": "as 4.4" }, "userExercise": { "...": "as 4.4" } } ]
}
```
On a Rest Day: `{ "date": "...", "isRestDay": true, "items": [] }`.

##### 4.6 Route Policies (registered in the F-01 registry)
All routes: `featureId: 'F-03'`, `auth: 'required'`, `roles: ['PARTICIPANT']`. Ownership: `POST /api/plan-items` and `GET` lists/`/api/plan` → `self-scoped`; `GET /api/plan-items/:id` → `resource-owner` (owner lookup = `PlanItem.userId`).

##### 4.7 Internal interface provided to other features
`resolvePlan(userId, date): { isRestDay, items: ResolvedItem[] }` (R12) is a pure-data service function used by F-04 (Quick Complete availability) and F-06 (scoring, monthly average). It reads only the caller's rows and takes the date as a parameter (never calls the Clock itself).

--------------------------------------------------------------------------------

#### 5. Data Specification
##### 5.1 Schema (Prisma)
```prisma
model UserExercise {
  id               String         @id @default(uuid())
  userId           String
  user             User           @relation(fields: [userId], references: [id])
  sourceTemplateId String?                         // no foreign key (B8, Decision 12)
  isCustom         Boolean        @default(false)
  name             String
  targetBodyPart   String
  trackingMode     TrackingMode
  unit             String                          // 'reps' | 'seconds' | 'km'
  cardioCategory   CardioCategory?
  metValue         Decimal        @db.Decimal(4, 1)
  rangeMin         Decimal        @db.Decimal(8, 2)
  rangeMax         Decimal        @db.Decimal(8, 2)
  createdAt        DateTime       @default(now())
  planItems        PlanItem[]
  @@index([userId])
}

model PlanItem {
  id                String        @id @default(uuid())
  planKey           String        @default(uuid())
  version           Int           @default(1)
  userId            String
  user              User          @relation(fields: [userId], references: [id])
  userExerciseId    String
  userExercise      UserExercise  @relation(fields: [userExerciseId], references: [id], onDelete: Restrict)
  priorityWeight    Int
  targetSets        Int?
  targetRepsPerSet  Int?
  loadKg            Decimal?      @db.Decimal(5, 2)
  targetDurationSec Int?
  targetDistanceKm  Decimal?      @db.Decimal(6, 2)
  effectiveFrom     DateTime      @db.Date
  endDate           DateTime?     @db.Date
  repeatDays        Int           @default(127)   // SDS §3.2 Monday–Sunday bitmask: bit 0 = Mon … bit 6 = Sun; 127 = every day
  createdAt         DateTime      @default(now())
  @@unique([planKey, version])
  @@index([userId, effectiveFrom])
  @@index([userExerciseId, effectiveFrom])
}
```
`TrackingMode` and `CardioCategory` come from the F-02 migration; `User` from F-01.

Constraints added by raw SQL in the migration (table-local only):
- `CHECK (priorityWeight BETWEEN 1 AND 5)`;
- `CHECK (repeatDays BETWEEN 1 AND 127)` (a non-empty Monday–Sunday bitmask);
- `CHECK (endDate IS NULL OR endDate >= effectiveFrom)`;
- `CHECK (targetSets IS NULL OR targetSets BETWEEN 1 AND 20)`, `targetRepsPerSet` 1–200, `targetDurationSec` 1–10,800, `targetDistanceKm > 0 AND <= 100`, `loadKg > 0 AND <= 500`;
- `CHECK (rangeMin > 0 AND rangeMin <= rangeMax)` on `UserExercise`.

Sprint 1 always inserts a fresh `planKey` with `version = 1`; the pair is unique (SDS §3.2). The API converts the ISO weekday array of R11 to and from this bitmask.

The mode-to-target-field consistency (R6), the Valid Range check (R7) and "today or later" (R9) need data from another table or the Clock, so they are enforced in the service layer (BR-02 validation module shared with F-02 and F-04). Dates are stored as `DATE`; "today" and the weekday come from the injectable Clock in Asia/Bangkok.

##### 5.2 Migration and Seed
- Migration `<timestamp>_plan_snapshot` (after the F-02 migration) creates both tables.
- Seed adds **no plan data** to the demo accounts (the Participant journey starts from an empty plan).
- Test helper `createHistoricalPlanItem(userId, exerciseSpec, effectiveFrom, ...)` inserts rows with a past `effectiveFrom` directly through Prisma, bypassing R9 (SRS Assumption 4). It is used by F-04, F-06 and later sprints and is excluded from production code paths.

--------------------------------------------------------------------------------

#### 6. UI Specification
| Element | Behavior |
| ------ | ------ |
| **My Plan** (Participant only) | List of plan items: exercise name, mode, target in readable form (e.g. "4 × 10 reps @ 40 kg", "30 min", "3.5 km"), Priority Weight, repeat days, start date and end date; empty state "No exercises in your plan yet. Add your first one" |
| **Add exercise** dialog | Two tabs: *From library* and *Custom* |
| From library | Read-only picker of F-02 templates with filters (category, tracking mode); choosing a template shows its name, body part, unit and Valid Range |
| Custom tab | Fields: name, target body part, tracking mode; cardio category selector **only** for distance exercises; note "Default calories value is set by the system" |
| Target section | Shows only the fields of the chosen mode: sets and reps per set (+ load in kg for weight training); or duration (minutes and seconds inputs converted to seconds); or distance (km). Shows the allowed range (template Valid Range or central limit) as helper text |
| Common fields | Priority Weight selector 1–5; start date (default today, earlier dates disabled); repeat-day toggles Mon–Sun (all selected by default); optional end date |
| States | Loading; saving (button disabled, no double submit); success notice and refreshed list; empty state |
| Errors | `400` messages next to the field naming the field and limit; `403` access-denied screen; `401` back to Login (SDS §4.2). Same messages are used for the validation display check (AC-23) |
| Manager | No plan screens; opening the URL redirects to the access-denied screen |

UI behavior is verified through the journey (AC-25: Participant selects the template the Manager created, sets the goal) and the validation display check (AC-23).

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
AC-03a–c restore the RTM 1.0.0 IDs and wording (the contract only makes each one observable through a named endpoint or a named field); AC-16a–b and AC-27 are RTM criteria owned by F-03. AC-03d is **proposed** (not yet in the RTM).

| AC | Observable outcome |
| ------ | ------ |
| **AC-03a** | Selecting a template creates a `UserExercise` snapshot (all template fields copied, `sourceTemplateId` set, **no foreign key**) and a `PlanItem` (target, `priorityWeight`, `effectiveFrom`, `repeatDays`, `endDate`) → 201; one row in each table, owned by the Participant, `planKey` / `version` present, and no `userId` in the response |
| **AC-03b** | Invalid goal data is rejected with 400 `VALIDATION_ERROR` naming the field, and nothing is stored: target ≤ 0 or above a boundary, `priorityWeight` outside 1–5 or non-integer, `effectiveFrom` in the past, `endDate` before `effectiveFrom`, invalid `repeatDays`, target fields not matching the `trackingMode`, target outside the template Valid Range |
| **AC-03c** | A `PlanItem` occurs only on days matching `repeatDays` (default: every day) and never after `endDate`; `GET /api/plan?date=` returns exactly the items that occur on that date (R12) and `isRestDay = true` with an empty `items` when none occurs |
| **AC-03d** *(proposed)* | Creating a Custom Exercise works for each of the 6 `trackingMode` values (4 domains) → 201 for each; `CARDIO_DISTANCE` requires `cardioCategory`; both rows are stored with `isCustom = true` and `sourceTemplateId = null` |
| **AC-16a** | A Custom Exercise receives the default `metValue` of its `trackingMode` / `cardioCategory` (Appendix A.1) and a `unit` derived from the mode; the Participant cannot set `metValue` |
| **AC-16b** | A Custom Exercise receives default Valid Range `rangeMin` = minimum value and `rangeMax` = central limit; boundary values of custom targets (e.g. 20 sets, 10,800 s, 100 km) are accepted and the first value above each is rejected |
| **AC-27** | After the Manager updates or deletes a template, the Participant's `UserExercise` and `PlanItem` created from it are unchanged and `GET /api/plan` still returns them |

**Shared AC with other features.** AC-11 (boundary table): F-03 contributes target-boundary cases. AC-12a/b/c and AC-22c (Endpoint Access Matrix): F-03 routes are covered in stage 2 (see F-01 §7); `GET /api/plan-items/:id` is the owner-scoped route of this feature. AC-24a (persistence): plan rows are included in the restart check owned by F-04. AC-25 (journey) uses F-03 for "Select Template → Set Goal".

--------------------------------------------------------------------------------

#### 8. Software Test Specification (STS)
Files: `tests/integration/goal_config.test.ts` (AC-03), `tests/integration/snapshot_isolation.test.ts` (AC-27, proposed file name), `tests/unit/boundary_validation.test.ts` (AC-16 and F-03 cases of AC-11). Fixtures: seeded Manager, Alice and Bob (F-01 §5.2), seeded library (F-02 §5.2), real PostgreSQL test database, injectable Clock fixed at **Thu 5 Nov 2026 10:00 Asia/Bangkok** unless stated. "DB unchanged" means row counts and contents of `UserExercise` and `PlanItem` equal their values before the request.

| Test ID | AC | Level | Precondition / Input | Action | Expected result |
| ------ | ------ | ------ | ------ | ------ | ------ |
| **TEST-03a-1** | AC-03a | API/DB Integration | Alice logged in; seeded template "Barbell Squat" (`WEIGHT`) | `POST /api/plan-items` as in §4.2 (4 × 10, 40 kg, weight 3, from today, `[1,3,5]`) | 201; `userExercise` has name, body part, mode, unit `reps`, `metValue` 3.5, range min/max equal to the template, `sourceTemplateId` = template id, `isCustom` false; `planItem` fields as sent; one new row in each table owned by Alice; no `userId` in response |
| TEST-03a-2 | AC-03a | API/DB Integration | Same | Create one plan item from a template of each mode: `BODYWEIGHT_REPS`, `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME`, `CARDIO_DISTANCE` (with its mode's target field) | 201 each; stored target fields match the mode; fields of other modes are null |
| TEST-03a-3 | AC-03a | API/DB Integration | Same | Create without `effectiveFrom`, `repeatDays`, `endDate` | 201; `effectiveFrom` = 2026-11-05, `repeatDays` = `[1..7]`, `endDate` null (defaults) |
| TEST-03a-4 | AC-03a | API/DB Integration | Same | Select the same template twice | 201 twice; two distinct `UserExercise` ids (R3) |
| TEST-03a-5 | AC-03a | API/DB Integration | Failure injected after the `UserExercise` insert (e.g. forced error on `PlanItem` insert) | Create from a template | 500 `INTERNAL_ERROR` without stack trace; DB unchanged (rollback, R14) |
| **TEST-03b-1** | AC-03b | API/DB Integration | Alice; valid `WEIGHT` body as base | Each variation: `targetSets` 0, 21; `targetRepsPerSet` 0, 201; `loadKg` missing, 0, 500.01; `targetDurationSec` supplied for a `WEIGHT` exercise | 400 `VALIDATION_ERROR` naming the offending field each; DB unchanged |
| TEST-03b-2 | AC-03b | API/DB Integration | Alice; valid bodies for a seconds mode and a km mode | `targetDurationSec` 0, 10,801, 59.5; `targetDistanceKm` 0, 100.01, 5.123 | 400 each, naming the field; DB unchanged |
| TEST-03b-3 | AC-03b | API/DB Integration | Template with `rangeMax` 100 (created by Manager) | Select it with 10 × 11 = 110 total reps; then 10 × 10 = 100 | 400 naming `targetRepsPerSet` with the range; then 201 (boundary) |
| TEST-03b-4 | AC-03b | API/DB Integration | Alice; clock 5 Nov | `priorityWeight` 0, 6, 2.5, missing | 400 each |
| TEST-03b-5 | AC-03b | API/DB Integration | Same | `effectiveFrom` 2026-11-04 (yesterday), 2026-11-05 (today), 2026-11-06 | 400, 201, 201 |
| TEST-03b-6 | AC-03b | API/DB Integration | Same | `endDate` 2026-11-04 with `effectiveFrom` 2026-11-05; `endDate` = `effectiveFrom` | 400; 201 |
| TEST-03b-7 | AC-03b | API/DB Integration | Same | `repeatDays` `[]`, `[0]`, `[8]`, `[1,1]`, `"Mon"` | 400 each, naming `repeatDays` |
| TEST-03b-8 | AC-03b | API/DB Integration | Same | Non-UUID `templateId`; non-JSON body; unknown extra field | 400 each; DB unchanged |
| TEST-03b-9 | AC-03b | API/DB Integration | Alice logged in; a well-formed UUID `templateId` that does not exist | `POST /api/plan-items` with that `templateId` | 404 `NOT_FOUND` naming `templateId` in `fields`; DB unchanged |
| **TEST-03c-1** | AC-03c | API/DB Integration | Alice has one item: from 2026-11-05, ends 2026-11-30, `repeatDays` `[1,3,5]` | `GET /api/plan?date=` for Mon 2026-11-09, Tue 2026-11-10, Wed 2026-11-11 | Mon: `isRestDay` false with the item; Tue: `isRestDay` true, `items` empty; Wed: item present |
| TEST-03c-2 | AC-03c | API/DB Integration | Same | Dates 2026-11-04 (before `effectiveFrom`), 2026-11-30 (end date, a Monday), 2026-12-07 (after end date, a Monday) | Rest Day; item present; Rest Day |
| TEST-03c-3 | AC-03c | API/DB Integration | Two items with different repeat days; one with `endDate` earlier | `GET /api/plan?date=` on a day matching only one | Only the matching item is returned |
| TEST-03c-4 | AC-03c | API/DB Integration | Historical helper creates a version with an earlier `effectiveFrom` and a later one for the same exercise | `GET /api/plan?date=` before and after the later `effectiveFrom` | Earlier version before; later version from its `effectiveFrom` (R12) |
| TEST-03c-5 | AC-03c | API/DB Integration | Alice and Bob each have plans | `GET /api/plan` as Alice | Only Alice's items; `?date=2026-13-45` → 400; no `date` → today's plan |
| **TEST-03d-1** | AC-03d | API/DB Integration | Alice logged in | Create one custom exercise for each of the 6 modes with valid targets (e.g. "Goblet Squat" `WEIGHT`, "Pike Push-up" `BODYWEIGHT_REPS`, "Wall Sit" `BODYWEIGHT_TIME`, "Stretch Flow" `YOGA`, "Rowing" `CARDIO_TIME`, "Hill Walk" `CARDIO_DISTANCE`+`WALKING`) | 201 each; `isCustom` true; `sourceTemplateId` null; units `reps, reps, seconds, seconds, seconds, km`; 6 + 6 new rows |
| TEST-03d-2 | AC-03d | API/DB Integration | Same | `CARDIO_DISTANCE` custom with each of `RUNNING`, `WALKING`, `CYCLING`, `SWIMMING` | 201 each; `cardioCategory` stored as sent |
| TEST-03d-3 | AC-03d | API/DB Integration | Same | `CARDIO_DISTANCE` custom without `cardioCategory`; `WEIGHT` custom with `cardioCategory` | 400 naming `cardioCategory`; DB unchanged |
| TEST-03d-4 | AC-03d | API/DB Integration | Same | Custom with `source: CUSTOM` and `templateId`; template source with an `exercise` object; unknown trackingMode | 400 naming the offending field each; DB unchanged |
| **TEST-16a-1** | AC-16a | Unit | Validation/defaults module `buildCustomExercise` | For each mode and each cardio category | `metValue` equals Appendix A.1 (`3.5`, `3.8`, `3.8`, `2.5`, `7.0`, `9.8`/`4.3`/`8.0`/`5.8`); `unit` as derived |
| TEST-16a-2 | AC-16a | API/DB Integration | Alice | Custom create with `metValue: 20` in the body | 400 naming `metValue` (unknown field); DB unchanged |
| TEST-16a-3 | AC-16a | API/DB Integration | Alice | Custom `WEIGHT` and `CARDIO_DISTANCE`+`CYCLING` created | Stored `metValue` 3.5 and 8.0 |
| **TEST-16b-1** | AC-16b | Boundary | `buildCustomExercise` | Default range per mode | reps: 1–4,000; seconds: 1–10,800; km: 0.01–100 |
| TEST-16b-2 | AC-16b | Boundary | Custom exercises per mode | Targets at limit and just above: 20 × 200 reps / 21 sets; 10,800 s / 10,801 s; 100 km / 100.01 km | Accepted / 400 |
| **TEST-27-1** | AC-27 | API/DB Integration | Alice selected "Push-up" (snapshot S1, plan item P1); Manager logged in | Manager `PUT /api/templates/:id` changing name, `metValue`, `rangeMax`; then `GET /api/user-exercises` and `GET /api/plan-items/:id` as Alice | `UserExercise` and `PlanItem` equal their pre-update values field by field |
| TEST-27-2 | AC-27 | API/DB Integration | Same | Manager `DELETE /api/templates/:id`; Alice `GET /api/plan?date=` on a day the item occurs | 204; snapshot and plan item unchanged; plan still returns the item; `sourceTemplateId` still stored |
| TEST-27-3 | AC-27 | API/DB Integration | Same | Alice selects the (now deleted) template id again | 404 `NOT_FOUND` |
| **TEST-11 (F-03 cases)** | AC-11 | Unit | Validation module `validateTarget` | Boundary pairs from TEST-03b-1/03b-2/16b-2 asserted without HTTP | Accept / reject exactly as in those tests; error names field and limit |
| **TEST-22c (F-03 routes)** | AC-22c | Security | Registry contains the 5 F-03 routes | No token; then a Manager token on each | 401; then 403 (stage 2) |
| **TEST-12a (F-03 routes)** | AC-12a | Security | Manager token | Every F-03 route | 403 each; no data in body (stage 2) |
| **TEST-12b/12c (F-03 routes)** | AC-12b, AC-12c | Security | Alice and Bob each own a plan item | Alice `GET /api/plan-items/<Bob's id>`; Alice `GET /api/plan-items?userId=<Bob>`, `/api/user-exercises?userId=<Bob>`, `/api/plan?userId=<Bob>`; Alice `POST` with `userId: <Bob>` in the body | 403 each (body field: 400 unknown field); Bob's data unchanged; Bob's own request → 200; non-existent id → 404 (stage 2) |

**Coverage check.** Every AC in §7 has at least one test; negative, boundary and role/ownership cases are included (20/21 sets, 200/201 reps, 10,800/10,801 s, 100/100.01 km, 500/500.01 kg, today/yesterday, endDate equal/earlier). The Manager-creates-template → Participant-selects step of AC-25 is verified by the journey (F-01 §7 note, F-02 §7).

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
| Step | Commit type | Content | Evidence kept |
| ------ | ------ | ------ | ------ |
| 1 | `docs` | This contract v0.2.0 (spec-only) | Commit ID |
| 2 | `test` (red) | TEST-16a-1, TEST-16b-1/2, TEST-11 (F-03 cases): default and boundary unit tests | Failing run (module absent) |
| 3 | `feat` (green) | Migration, `buildCustomExercise`, `validateTarget` | Passing run |
| 4 | `test` (red) | TEST-03a, TEST-03b (validation), TEST-03d (custom exercises) integration tests | Failing run showing e.g. past `effectiveFrom` or out-of-range target accepted |
| 5 | `feat` (green) | `POST /api/plan-items` with snapshot copy, transaction, route policies | Passing run |
| 6 | `test` (red) → `feat` (green) | TEST-03c (plan resolution) and list/read endpoints | Failing then passing runs |
| 7 | `test` (red) → `feat` (green) | TEST-27-1 to 27-3 snapshot isolation (with F-02 template endpoints) | Failing run showing a snapshot that follows a template edit, then passing run |
| 8 | `test` / `feat` | TEST-22c / 12a / 12b / 12c (F-03 routes), My Plan UI | Passing run |
| 9 | PR | Reviewed by Onsinee into `staging/sprint-1` | Review comment with a specific check |

--------------------------------------------------------------------------------

#### 10. Definition of Done for F-03
| # | Criterion | Evidence required |
| ------ | ------ | ------ |
| 1 | Contract reviewed and approved by Onsinee before implementation | Review comment; commit order |
| 2 | All endpoints, validation rules, plan resolution and policies implemented as specified | Code on `staging/sprint-1`; matches §4 |
| 3 | Migration runs on a clean database; `resolvePlan` available to F-04 and F-06 | Command output from a fresh clone; function exported |
| 4 | All tests in §8 implemented and enabled (none skipped); each AC mapped | Test names match STS IDs |
| 5 | Tests executed on the merge commit with counts | Passed / failed / skipped counts |
| 6 | TDD red/green evidence for AC-03b, AC-16b and AC-27 | Failing and passing runs with commit IDs |
| 7 | F-03 routes included in the Endpoint Access Matrix run at Sprint 1 integration | Integration output |
| 8 | Teammate-reviewed PR with a substantive comment; integrated on staging | PR link, reviewer, comment |
| 9 | My Plan screen: template picker, custom form, mode-specific fields and field errors work | Journey run (AC-25); screenshots with version |
| 10 | README, migration, seed notes and `.env.example` current; no secret committed | Clean-clone run |
| 11 | RTM §3.1 updated (actual test names, result, commit); pending items (§12) resolved or logged | Updated register |
| 12 | Incomplete work and limitations disclosed | §13 updated |

--------------------------------------------------------------------------------

#### 11. Dependencies on Other Contracts
| Item | Provided to / needed from | Note |
| ------ | ------ | ------ |
| Route policy registry, `requireRole`, error envelope, Clock | Needed from F-01 | F-03 cannot be merged before F-01 |
| Template read endpoints and fields; `TrackingMode` / `CardioCategory` enums; template `PUT` / `DELETE` | Needed from F-02 | Needed for AC-03a, AC-03b (range), AC-27 |
| `UserExercise`, `PlanItem`, `resolvePlan`, target fields and `priorityWeight` | Provided to F-04, F-06 | F-04 uses `resolvePlan` for Quick Complete and `rangeMax`; F-06 uses targets and weights |
| Plan versions (`planKey` / `version` / `effectiveFrom`) | Provided to F-07 (Sprint 2) | F-07 inserts a new row for the same `planKey` with `version + 1`; the resolution rule R12 (SDS §3.3) is unchanged |
| `UserExercise.metValue`, `cardioCategory` | Provided to F-11 (Sprint 2) | |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
Used in this contract as **proposed** rules. Baseline documents (SRS, RTM, sprint plan, SDS) are deliberately **not edited yet**; all pending items of the F-02, F-03, F-04 and F-06 contracts are applied together after the drafts are reviewed, before the Sprint 1 checkpoint (see F-02 §12).

| # | Pending item | Baseline document(s) affected |
| ------ | ------ | ------ |
| P3-1 | AC-03d (custom exercise for each of the 6 `trackingMode` values) added — RTM: +1 atomic AC; Sprint 1 count; Tier B | RTM, sprint plan |
| P3-2 | Concrete plan endpoints: `POST/GET /api/plan-items`, `GET /api/plan-items/:id`, `GET /api/user-exercises`, `GET /api/plan?date=`. SDS §5.2 currently lists `GET/POST /api/exercises` and `GET/POST /api/plan-items`, so the catalogue must be rewritten to these paths (`/api/exercises` is dropped) | SDS §5 (API), SRS (Q21/Q22 note) |
| P3-3 | Plan resolution rule R12 (greatest `effectiveFrom` ≤ date; occurrence by `endDate` and `repeatDays`) | SRS (new Q), SDS §3.2 |
| P3-4 | Selecting the same template twice is allowed (R3) | SRS (new Q) |
| P3-5 | Custom exercise name 1–80 and body part 1–50 characters; Participant cannot supply `metValue`, `unit` or Valid Range | SRS (Q13 clarification) |
| P3-6 | `loadKg` required for `WEIGHT` targets, up to 2 decimals; `targetDistanceKm` up to 2 decimals; `targetDurationSec` integer | SRS (Q21 clarification) |
| P3-7 | `priorityWeight` is required (no default) | SRS (Q21 / FR-03) |
| P3-8 | AC-27 test file `tests/integration/snapshot_isolation.test.ts` (new) | RTM / sprint plan |
| P3-9 | `repeatDays` API representation as an ISO weekday array (1 = Monday … 7 = Sunday), converted to the SDS §3.2 Monday–Sunday bitmask at the API boundary; `isRestDay` in the plan/progress responses | SDS §5 data conventions |
| P3-10 | Missing referenced `templateId` in a request body answered with 404 `NOT_FOUND` (SRS A.5 / SDS §5.1) rather than 400; a malformed value stays 400 | SRS Appendix A.5, SDS §5.1 |

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | A Participant cannot edit, end or delete a plan item in Sprint 1; a mistaken goal stays until F-07 | Accepted Sprint 1 scope (CHANGE-style split: F-07 is Sprint 2); mitigated by choosing `endDate` at creation and by test accounts being resettable |
| 2 | Selecting the same template twice adds two items that both count in the daily denominator | Allowed by design (R3); revisit if UAT shows confusion |
| 3 | Valid Range of a template is copied at selection time; later template range changes do not affect existing snapshots | By design (Decision 12) |
| 4 | Metric values of custom exercises use the planning defaults of Appendix A.1, still to be verified against the Compendium | Check before Sprint 2 (F-11); update AC-16a, AC-20 and AC-28 together |
| 5 | `loadKg` is stored but never scored (Decision 11) and is not recorded on ledger entries | By design |
| 6 | Historical plan rows exist only through the test/seed helper because `effectiveFrom` must be today or later | By design (Assumption 4) |
