### Feature Engineering Contract: F-04 Daily Activity Logging, Profile Integration & Rest Day UX
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-04
**Sprint:**  1 (same-day edit/delete is F-05, Sprint 2; calorie calculation is F-11, Sprint 2)
**Contract Version:**  0.3.0
**SRS Baseline Version:**  1.1.0 (Feature Inventory 1.1.0, RTM 1.1.0, System-Level SDS 1.1.0, F-01 contract 0.3.0, F-02 and F-03 contracts 0.3.0)
**Date:**  6 November 2026
**Status:**  Draft: specification-only, awaiting reviewer approval before implementation
**Primary Author:**  Nakagamon  |  **Reviewer:**  Onsinee
**Repository Path:**  `docs/sprints/sprint-1/F-04-daily-logging.md`

--------------------------------------------------------------------------------

#### Contract Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 4 Nov 2026 | Initial contract: behavior, API/data/UI specification, AC (AC-04a–c, AC-10a–b, AC-13a–b, AC-14, AC-17a–b, AC-23, AC-24; proposed AC-04d), STS, Definition of Done, list of pending baseline changes (§12) | Nakagamon | Draft |
| **0.2.0** | 6 Nov 2026 | Baseline reconciliation with SRS / RTM / SDS / plan 1.0.0: baseline citation corrected from the nonexistent "RTM 1.2.0" to RTM 1.0.0 (F-01 0.1.2, F-02 0.2.0, F-03 0.2.0); AC restored to the RTM 1.0.0 numbering (AC-04b = Quick Complete unavailable, AC-04c = Rest Day entry not scored, AC-10a/AC-10b un-swapped, AC-10c and AC-13c restored, AC-14 split into AC-14a/AC-14b, AC-17c/AC-17d restored, AC-23 restored to the RTM's three cases, AC-24a/AC-24b split) and AC-04d remains the single proposal; test IDs realigned to the AC suffix (old TEST-04b→13a, old TEST-04c→04b, old TEST-04d→04c/04d, old TEST-10a↔10b swapped, TEST-14→14a/14b, TEST-17b-3→17c, TEST-17a-3→17d, TEST-24→24a); `LedgerEntry.source` renamed to `kind` to match SDS §3.2; Quick Complete now satisfies the per-entry `totalReps ≤ sets × 200` rule of SRS Q20 and SDS §3.2 by raising `sets` (R9/R12) with an explicit rejection when no entry fits both limits; a well-formed `userExerciseId` that does not exist returns 404 `NOT_FOUND`; the undefined 405 status removed | Nakagamon | Draft |
| **0.3.0** | 6 Nov 2026 | Review-fix pass against baseline 1.1.0: citations updated to RTM / SDS / plan / SRS / Feature Inventory 1.1.0 (F-01 contract 0.3.0, F-02 and F-03 contracts 0.3.0); AC-04d is now an RTM 1.1.0 criterion (no longer *proposed*); AC-04c, AC-04d, AC-10c and AC-17a–d are marked **deferred to Sprint 2** (CHANGE-07, CHANGE-08, CHANGE-04) in §1, §6, §7, §8, §9, §10 and §12 — STS rows kept; the Profile screen and TEST-23-4 move with the profile endpoints; §12 pending items given a status column | Nakagamon | Draft |

*Rule: committed as a specification-only commit before any F-04 implementation; later changes are new versions with a reason, never silent rewrites.*

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
F-04 is the **daily recording step** of the Sprint 1 journey and the home of the feature's main business rules. The Participant records activity as **ledger entries** (several incremental entries per exercise per day), either with **Quick Complete** (the server fills the difference to the target) or **Manual Override** (the Participant enters actual values). Logging is allowed on Rest Days (free-form, not scored). Backdating is forbidden. F-04 also owns the **Profile / body weight** endpoints (append-only `WeightLog`).

| In scope | Out of scope (and where it belongs) |
| ------ | ------ |
| `POST /api/entries` (manual entry), `POST /api/entries/quick-complete`, `GET /api/entries?date=`, `GET /api/entries/:id` | Editing / deleting entries (F-05, Sprint 2; BR-09, `ENTRY_NOT_EDITABLE`) |
| Cumulative daily totals per exercise (BR-06) | Score, Daily Overall %, monthly average (F-06) |
| No-backdating rule with optional `logDate` (BR-01, `LOG_DATE_MISMATCH`) | History view and Streak (F-08) |
| Boundary enforcement for each entry and the daily cumulative total (BR-02, Q20) | Calories / Estimated Minutes (F-11); `calories` field is **not** in Sprint 1 responses |
| Quick Complete differential entry and No-op (BR-05, B2) and rejection on Rest Day / non-planned exercise (B5) | Plan creation and plan resolution (F-03) |
| Rest Day free-form logging (Q24) | Reminders (F-09) |
| `GET /api/profile`, `PUT /api/profile` and `WeightLog` append-only history (FR-08) — **deferred to Sprint 2** with F-11 (CHANGE-04, AC-17a–d) | Using body weight for calories (F-11) |
| Today screen (logging controls), validation error notices (NFR-03); the Profile screen is **deferred to Sprint 2** with the profile endpoints (CHANGE-04) | |

--------------------------------------------------------------------------------

#### 2. Linked Requirements and Dependencies
| Requirement | How F-04 serves it |
| ------ | ------ |
| **FR-04** | Daily logging in the ledger, Quick Complete / Manual Override, Rest Day logging, Quick Complete rejection on Rest Day |
| **FR-08** *(deferred to Sprint 2, CHANGE-04)* | Profile read and append-only body weight update (1–800 kg) |
| **BR-01** | Reject `logDate` that differs from the current Asia/Bangkok date (400 `LOG_DATE_MISMATCH`) |
| **BR-02** (shared) | Entry and cumulative limits: Max Sets 20, `totalReps ≤ sets × 200`, 10,800 s, 100 km, body weight 1–800 kg; stricter template `rangeMax` applies (Q26) |
| **BR-05** | Quick Complete: `max(0, Target − ΣLogged)`; No-op `200`, `entry: null` |
| **BR-06** | Cumulative completed value counted directly, no double counting |
| **BR-08** (shared with F-03) | Entries respect the custom exercise Valid Range |
| **NFR-03** | Clear error notices on rejection (AC-23) |
| **NFR-04** | Entries, plans and weight survive a restart (AC-24a; AC-24b is SYS-01 in Sprint 3) |
| **BR-04 / NFR-02** (shared) | Entries and profile are private: Manager → 403, cross-user → 403 |
| NFR-01 (partial) | Ledger endpoints are in the latency check (AC-21a, owned by F-06; deferred → Sprint 2, CHANGE-03) |

**Depends on:** F-01, F-03 (`UserExercise`, `PlanItem`, `resolvePlan`). F-02 indirectly. **Downstream:** F-05 (edit/delete), F-06 (reads entries), F-08, F-11 (`WeightLog`, entry fields).

--------------------------------------------------------------------------------

#### 3. Feature Design (Feature-Level SDS)
##### 3.1 Behavior and Workflow
1. The Participant opens **Today**. The screen calls `GET /api/plan?date=today` (F-03) and `GET /api/entries?date=today`.
2. For each planned exercise it shows the target, the cumulative total so far, a **Quick Complete** button and a **Manual entry** form.
3. **Quick Complete:** server computes the difference to the target and stores one entry, or returns a No-op if already reached.
4. **Manual entry:** the Participant types actual values; the server validates the entry and the new daily cumulative total, then stores a new ledger entry.
5. On a **Rest Day** (no planned item) Today shows "Rest day: log anything you did"; Quick Complete is disabled and a free-form picker lists the Participant's own exercises. Entries are stored but not scored (F-06).
6. *(Deferred to Sprint 2, CHANGE-04.)* The Participant can open **Profile** to see and update body weight; each update appends a `WeightLog` row.

```mermaid
sequenceDiagram
  participant P as Participant UI
  participant A as API
  participant D as PostgreSQL
  P->>A: POST /api/entries/quick-complete {userExerciseId}
  A->>A: authenticate, role=PARTICIPANT, validate body, logDate check
  A->>D: BEGIN; lock UserExercise row FOR UPDATE
  A->>A: resolvePlan(user, today) contains exercise?
  A->>D: SUM entries for (exercise, today)
  alt remaining > 0
    A->>D: insert LedgerEntry(kind=QUICK_COMPLETE)
    A-->>P: 201 {entry, cumulative}
  else already reached
    A-->>P: 200 {entry: null, cumulative}
  end
  A->>D: COMMIT
```

##### 3.2 Business Rules
| ID | Rule | Status |
| ------ | ------ | ------ |
| R1 | Only role `PARTICIPANT` may use F-04 routes; Manager → 403. Authorization is checked before validation | Baseline (BR-04) |
| R2 | An entry always belongs to the authenticated Participant and to one of the Participant's own `UserExercise`. A `userExerciseId` that exists but belongs to someone else → 403 `FORBIDDEN`; a well-formed `userExerciseId` that does not exist → 404 `NOT_FOUND` (SRS A.5). A `userId` in the body is rejected as an unknown field | Baseline (BR-04) |
| R3 | `logDate` is optional (`YYYY-MM-DD`). If present and different from the current Asia/Bangkok date (Clock) → 400 `LOG_DATE_MISMATCH`. Past and future dates are both rejected. Malformed date → 400 `VALIDATION_ERROR`. The stored `logDate` is always today | Baseline BR-01 / B7 |
| R4 | Fields per mode: `WEIGHT`, `BODYWEIGHT_REPS` → `sets` (integer 1–20) and `totalReps` (integer ≥ 1); `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME` → `durationSec` (integer 1–10,800); `CARDIO_DISTANCE` → `distanceKm` (> 0, ≤ 100, up to 2 decimals). Fields of another mode are rejected | Baseline Q3 / Q5 / B2 |
| R5 | **Entry limit — applies to every ledger entry, manual or Quick Complete:** for reps modes `totalReps ≤ sets × 200` for that entry (SRS Q20 applies to *each ledger entry*; SDS §3.2 states the same for `LedgerEntry`) | Baseline Q20 / SDS §3.2 |
| R6 | Daily cumulative limit per exercise (Q20), using the cumulative sums **including** the new entry: reps modes → cumulative `sets ≤ 20`, cumulative `totalReps ≤ cumulative sets × 200` and `≤ rangeMax`; seconds modes → cumulative `durationSec ≤ min(10,800, rangeMax)`; km mode → cumulative `distanceKm ≤ min(100, rangeMax)`. A violation → 400 `VALIDATION_ERROR` naming the field and limit; nothing stored | Baseline Q20 / Q26 |
| R7 | Cumulative value = direct sum of the day's entries of that exercise: Σ`totalReps` (and Σ`sets`), Σ`durationSec`, Σ`distanceKm`. No weighting, no penalty, no double counting (BR-06) | Baseline BR-06 |
| R8 | **Quick Complete** is available only if the exercise **occurs today** according to `resolvePlan` (F-03 R12). Otherwise → 400 `QUICK_COMPLETE_NOT_AVAILABLE` (Rest Day or non-planned exercise), nothing stored | Baseline B5 |
| R9 | Quick Complete value: reps modes → `remainingReps = max(0, targetTotalReps − Σ totalReps)`; entry `totalReps = remainingReps` and entry `sets = max(1, targetSets − Σ sets)` **raised to `ceil(remainingReps ÷ 200)` whenever that is larger**, so the new entry itself satisfies R5 (SRS Q20 wins over the bare B2 formula); seconds modes → `durationSec = max(0, targetDurationSec − Σ durationSec)`; km mode → `distanceKm = max(0, targetDistanceKm − Σ distanceKm)` | Baseline BR-05 / B2 + Q20 |
| R10 | If the remaining value is 0 (already reached or exceeded) Quick Complete is a **No-op**: `200 OK`, `entry: null`, nothing stored | Baseline BR-05 / B2 |
| R11 | After a successful Quick Complete the cumulative value equals the target exactly (ΣActual = Target), provided it was below the target before | Baseline BR-05 |
| R12 | Quick Complete entries obey **both** R5 (per entry) and R6 (cumulative). Example: target 4 × 200 = 800 reps with 1 set / 1 rep logged → the differential entry is `sets = 4, totalReps = 799` (raised from B2's 3 so that 799 ≤ 4 × 200), cumulative 5 sets / 800 reps. If no entry can satisfy R5 and R6 together (see §13 item 1), Quick Complete is rejected with 400 `VALIDATION_ERROR` naming `sets` and nothing is stored | Baseline Q20 / SDS §3.2 (B2's `sets` formula is a minimum, not a maximum) |
| R13 | Manual entries and Quick Complete are free on a Rest Day or for a non-planned exercise **except** Quick Complete (R8). Such entries are stored but never scored (Q24) | Baseline Decision 4 / Q24 |
| R14 | Entries and Quick Complete for one exercise and day are serialized: the transaction locks the `UserExercise` row (`SELECT … FOR UPDATE`) before reading the sums, so concurrent requests cannot exceed the target or the limits | Design decision |
| R15 | Ledger entries are immutable in Sprint 1 (no PUT/DELETE). `createdAt` and `logDate` are stored so F-05 can enforce BR-09 | Baseline (scope split) |
| R16 *(deferred → Sprint 2, CHANGE-04)* | Profile: `weightKg` required number, 1–800 inclusive, at most 1 decimal place; each `PUT` **appends** a `WeightLog` row (`effectiveDate` = today); rows are never updated or deleted. Current weight = latest row by `effectiveDate`, then `createdAt`. A Participant with no row has `currentWeightKg: null` | Baseline FR-08 / Q1 / B6 |
| R17 | Body weight and entry values never change scores through weight (Decision 11); F-04 stores weight only for F-11 | Baseline Decision 11 |

##### 3.3 Failure and Boundary Cases
| Case | Expected behavior |
| ------ | ------ |
| Manager calls any F-04 route | 403 `FORBIDDEN`, even with an invalid body |
| No token / expired / revoked | 401 `UNAUTHENTICATED` |
| `logDate` = yesterday / tomorrow / today | 400 `LOG_DATE_MISMATCH` / 400 `LOG_DATE_MISMATCH` / accepted |
| `logDate` = `"2026-13-40"` or `"today"` | 400 `VALIDATION_ERROR` |
| `sets` 20 / 21 / 0; `totalReps` 0; negative values | Accepted / 400 / 400; 400; 400 |
| Reps entry `sets` 2, `totalReps` 400 / 401 | Accepted / 400 (R5) |
| Cumulative sets: 19 logged then `sets` 1 / `sets` 2 | Accepted (20) / 400 |
| `durationSec` 10,800 / 10,801; cumulative 10,000 then 800 / 801 | Accepted / 400; accepted / 400 |
| `distanceKm` 100 / 100.01 / 0 / 2.555; cumulative 99 then 1 / 1.01 | Accepted / 400 / 400 / 400; accepted / 400 |
| Template `rangeMax` 50 reps: cumulative 50 / 51 | Accepted / 400 (stricter limit applies) |
| Quick Complete on a Rest Day | 400 `QUICK_COMPLETE_NOT_AVAILABLE`; nothing stored |
| Quick Complete for an exercise not planned today, but planned on other days | 400 `QUICK_COMPLETE_NOT_AVAILABLE` |
| Quick Complete when target already reached | 200, `entry: null`, nothing stored |
| Quick Complete with `logDate` yesterday | 400 `LOG_DATE_MISMATCH` (checked before availability) |
| Two simultaneous Quick Completes for the same exercise | Exactly one entry is created; the other returns the No-op |
| Entry for another Participant's exercise | 403; nothing stored |
| `GET /api/entries/:id` of another Participant's entry | 403 (404 only if the id does not exist) |
| `GET /api/entries?date=` malformed | 400 `VALIDATION_ERROR` |
| `PUT /api/profile` *(deferred → Sprint 2, CHANGE-04)* `weightKg` 1 / 800 / 0.9 / 800.1 / 70.55 / `"abc"` | Accepted / accepted / 400 / 400 / 400 / 400 |
| `PUT /api/profile` *(deferred → Sprint 2, CHANGE-04)* twice on the same day | Two rows appended; current weight is the second |
| Manager `GET /api/profile` *(deferred → Sprint 2, CHANGE-04)* | 403 |
| `userExerciseId` well-formed but not found | 404 `NOT_FOUND`; nothing stored |
| Quick Complete whose differential entry cannot satisfy R5 and R6 together | 400 `VALIDATION_ERROR` naming `sets`; nothing stored (§13 item 1) |
| Quick Complete entry `sets` raised by R9 | Accepted; cumulative `sets` may exceed `targetSets` (still ≤ 20) |

##### 3.4 Permissions
| Operation | Unauthenticated | Manager | Participant |
| ------ | ------ | ------ | ------ |
| `POST /api/entries`, `POST /api/entries/quick-complete` | 401 | 403 | Allow (own exercises) |
| `GET /api/entries?date=` | 401 | 403 | Allow (own data; `userId` query parameter other than own → 403) |
| `GET /api/entries/:id` | 401 | 403 | Allow if owner, otherwise 403 |
| `GET /api/profile`, `PUT /api/profile` *(deferred → Sprint 2, CHANGE-04)* | 401 | 403 | Allow (own profile) |

--------------------------------------------------------------------------------

#### 4. API Specification
Conventions follow SDS §5.1 (JSON, error envelope of SRS Appendix A.5, dates `YYYY-MM-DD`, decimals as JSON numbers).

##### 4.1 Endpoints
| Endpoint | Roles | Success | Errors |
| ------ | ------ | ------ | ------ |
| `POST /api/entries` | Participant | 201 `{ entry, cumulative }` | 400 (`VALIDATION_ERROR`, `LOG_DATE_MISMATCH`), 401, 403, 404 |
| `POST /api/entries/quick-complete` | Participant | 201 `{ entry, cumulative }`, or 200 `{ entry: null, cumulative }` | 400 (`QUICK_COMPLETE_NOT_AVAILABLE`, `LOG_DATE_MISMATCH`, `VALIDATION_ERROR`), 401, 403, 404 |
| `GET /api/entries?date=YYYY-MM-DD` | Participant | 200 `{ date, entries: [...], cumulative: [...] }`; `date` defaults to today; entries ordered by `createdAt` | 400, 401, 403 |
| `GET /api/entries/:id` | Participant (owner) | 200 entry | 400, 401, 403, 404 |
| `GET /api/profile` *(deferred → Sprint 2, CHANGE-04)* | Participant | 200 `{ email, displayName, currentWeightKg, weightEffectiveDate }` | 401, 403 |
| `PUT /api/profile` `{ weightKg }` *(deferred → Sprint 2, CHANGE-04)* | Participant | 200 same shape as `GET` | 400, 401, 403 |

##### 4.2 Manual Entry
Request (fields by mode, §3.2 R4):
```json
{ "userExerciseId": "uuid", "sets": 3, "totalReps": 30, "logDate": "2026-11-05" }
```
```json
{ "userExerciseId": "uuid", "durationSec": 1200 }
```
```json
{ "userExerciseId": "uuid", "distanceKm": 5.25 }
```
`logDate` optional. Unknown fields are rejected. Response `201`:
```json
{
  "entry": {
    "id": "uuid", "userExerciseId": "uuid", "logDate": "2026-11-05",
    "sets": 3, "totalReps": 30, "durationSec": null, "distanceKm": null,
    "kind": "MANUAL", "createdAt": "2026-11-05T03:00:00.000Z"
  },
  "cumulative": { "userExerciseId": "uuid", "sets": 3, "totalReps": 30, "durationSec": 0, "distanceKm": 0 }
}
```
The response never includes `userId`.

##### 4.3 Quick Complete
Request: `{ "userExerciseId": "uuid", "logDate": "2026-11-05" }` (`logDate` optional). Success `201` returns the created entry with `kind: "QUICK_COMPLETE"` and the new `cumulative`. No-op `200`:
```json
{ "entry": null, "cumulative": { "userExerciseId": "uuid", "sets": 4, "totalReps": 40, "durationSec": 0, "distanceKm": 0 } }
```
Rest Day / non-planned error:
```json
{ "code": "QUICK_COMPLETE_NOT_AVAILABLE", "message": "Quick Complete is not available on a rest day or for an exercise that is not planned today", "fields": [] }
```

##### 4.4 Day Listing (`GET /api/entries?date=2026-11-05`)
```json
{
  "date": "2026-11-05",
  "entries": [ { "id": "uuid", "...": "as 4.2" } ],
  "cumulative": [ { "userExerciseId": "uuid", "sets": 3, "totalReps": 30, "durationSec": 0, "distanceKm": 0 } ]
}
```
`cumulative` has one item per exercise that has at least one entry on that date. Reading past dates is allowed (read-only); F-08 adds the history screens.

##### 4.5 Profile *(deferred → Sprint 2, CHANGE-04)*
`GET /api/profile` → `200 { "email": "bob@exercise.test", "displayName": "Bob", "currentWeightKg": null, "weightEffectiveDate": null }`. `PUT /api/profile` `{ "weightKg": 68.5 }` → `200` with `currentWeightKg: 68.5` and `weightEffectiveDate` = today. Error example:
```json
{ "code": "VALIDATION_ERROR", "message": "weightKg must be between 1 and 800", "fields": [{ "field": "weightKg", "limit": "1 to 800 kg, at most 1 decimal place" }] }
```

##### 4.6 Route Policies (registered in the F-01 registry)
All routes: `featureId: 'F-04'`, `auth: 'required'`, `roles: ['PARTICIPANT']`. Ownership: `POST /api/entries`, `POST /api/entries/quick-complete`, `GET /api/entries`, `GET/PUT /api/profile` (deferred → Sprint 2, CHANGE-04) → `self-scoped`; `GET /api/entries/:id` → `resource-owner` (owner lookup = `LedgerEntry.userId`).

--------------------------------------------------------------------------------

#### 5. Data Specification
##### 5.1 Schema (Prisma)
```prisma
enum EntryKind { MANUAL QUICK_COMPLETE }

model LedgerEntry {
  id             String       @id @default(uuid())
  userId         String
  user           User         @relation(fields: [userId], references: [id])
  userExerciseId String
  userExercise   UserExercise @relation(fields: [userExerciseId], references: [id], onDelete: Restrict)
  logDate        DateTime     @db.Date
  sets           Int?
  totalReps      Int?
  durationSec    Int?
  distanceKm     Decimal?     @db.Decimal(6, 2)
  kind           EntryKind
  createdAt      DateTime     @default(now())
  @@index([userId, logDate])
  @@index([userExerciseId, logDate])
}

model WeightLog {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  weightKg      Decimal  @db.Decimal(4, 1)
  effectiveDate DateTime @db.Date
  createdAt     DateTime @default(now())
  @@index([userId, effectiveDate])
}
```
Constraints added by raw SQL in the migration:
- `CHECK (sets IS NULL OR sets BETWEEN 1 AND 20)`, `CHECK (totalReps IS NULL OR totalReps >= 1)`, `CHECK (durationSec IS NULL OR durationSec BETWEEN 1 AND 10800)`, `CHECK (distanceKm IS NULL OR (distanceKm > 0 AND distanceKm <= 100))`;
- `CHECK (totalReps IS NULL OR totalReps <= sets * 200)` (SRS Q20 applies to every ledger entry, including Quick Complete);
- `CHECK ((sets IS NOT NULL) = (totalReps IS NOT NULL))` and `CHECK (((sets IS NOT NULL)::int + (durationSec IS NOT NULL)::int + (distanceKm IS NOT NULL)::int) = 1)` (exactly one measurement group);
- `CHECK (weightKg BETWEEN 1 AND 800)` on `WeightLog`.

The per-row check `totalReps ≤ sets × 200` **is** present (SRS Q20 applies to every ledger entry; SDS §3.2 states the same for `LedgerEntry`). Quick Complete satisfies it by construction: R9 raises `sets` above the differential value when needed, and R12 rejects the request when no entry fits both the per-entry and the cumulative limits. Mode consistency (R4), the cumulative limits (R6), `logDate` (R3) and plan availability (R8) are enforced in the service layer (BR-02 validation module shared with F-02 and F-03). `WeightLog` is append-only by design: no update or delete route and no service method exist, and a test asserts this (AC-17b).

##### 5.2 Migration and Seed
- Migration `<timestamp>_ledger_weightlog` (after the F-03 migration).
- Seed adds **one `WeightLog` row for Alice** (70.0 kg, dated at seed time) and **none for Bob** (SRS Appendix A.6: one Participant without any `WeightLog`, used by F-11 `BODY_WEIGHT_REQUIRED`).
- Test helper `createHistoricalEntry(userId, userExerciseId, logDate, values, createdAt?)` inserts dated rows directly, bypassing R3 (SRS Assumption 4); used by F-05, F-06, F-08.

--------------------------------------------------------------------------------

#### 6. UI Specification
| Element | Behavior |
| ------ | ------ |
| **Today** (Participant) | Header with today's date; one card per planned exercise: name, target, cumulative so far, **Quick Complete** button, **Add entry** form; below, the ledger of today's entries (time, value, kind) |
| Add entry form | Fields follow the mode: sets and total reps; or minutes and seconds; or km. Helper text shows the remaining limit for the day. Submit disabled while saving |
| Quick Complete | Enabled only on cards for exercises planned today. When the target is reached the button shows "Completed" and a click shows the notice "Already completed, nothing added" (No-op) |
| **Rest Day state** | Banner "Rest day: log anything you did"; Quick Complete buttons are disabled; a picker lists the Participant's own exercises for free-form entries; entries are labelled "not scored" |
| Empty state | If the Participant has no exercises: "Add an exercise to your plan first" with a link to My Plan |
| Ledger | Read-only in Sprint 1 (no edit/delete controls; F-05 adds them) |
| **Profile** *(deferred → Sprint 2, CHANGE-04)* | Shows email, display name and current weight with date; form "Update weight (kg)"; empty state "No weight recorded yet" |
| States | Loading; saving; success notice; list and cumulative totals refresh after every entry (feeds the real-time progress of F-06) |
| Errors (NFR-03, AC-23) | Every rejection is shown in an error notice that names the field and the limit: `400 VALIDATION_ERROR` next to the field; `LOG_DATE_MISMATCH` as "This entry is not for today. Please reload the page"; `QUICK_COMPLETE_NOT_AVAILABLE` as "Quick Complete is not available for this exercise today"; `403` access-denied screen; `401` back to Login (SDS §4.2) |
| Manager | No Today or Profile screens; opening the URL redirects to the access-denied screen |

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
AC-04a–d, AC-10a–c, AC-11, AC-13a–c, AC-14a–b, AC-17a–d, AC-23 and AC-24a–b are identical in ID and meaning to RTM 1.1.0 (refined with the concrete endpoints, fields and limits). **Deferred to Sprint 2 at the Fri 6 Nov checkpoint:** AC-04c and AC-10c (CHANGE-07), AC-04d (CHANGE-08) and AC-17a–d (CHANGE-04). They are specified and tested below but are outside the 38 Sprint 1 atomic AC and not required by the Sprint 1 DoD.

| AC | Observable outcome |
| ------ | ------ |
| **AC-04a** | Two manual entries on the same day for one exercise each return 201, are stored as **separate rows** and accumulate (RTM example: 2 sets / 20 reps + 1 set / 10 reps → 3 sets / 30 reps in 2 rows); the `cumulative` block equals the sum of the entries (reps, seconds or km) |
| **AC-04b** | Quick Complete on a Rest Day or for an exercise not in the plan → 400 `QUICK_COMPLETE_NOT_AVAILABLE`; no new row is stored |
| **AC-04c** *(deferred → Sprint 2, CHANGE-07)* | A manual entry on a Rest Day → 201, but it does not count toward scores, the monthly average or the Streak (the exclusion itself is asserted by F-06 TEST-06e-2 and TEST-15-3) |
| **AC-04d** *(deferred → Sprint 2, CHANGE-08)* | A manual entry for an exercise with no `PlanItem` on that date (Rest Day **or** a targeted day) → 201 with the same limits as any other entry, appears in `GET /api/entries`, and never affects scores, the monthly average or the Streak (Q24 / Decision 4) |
| **AC-10a** | `logDate` equal to today (Asia/Bangkok) or omitted → accepted; the stored `logDate` is always today |
| **AC-10b** | `logDate` yesterday, tomorrow or any other non-today date → 400 `LOG_DATE_MISMATCH`; a malformed `logDate` → 400 `VALIDATION_ERROR`; nothing is stored in either case |
| **AC-10c** *(deferred → Sprint 2, CHANGE-07)* | At 2026-11-04T18:30Z (= 5 Nov 01:30 Bangkok), `logDate` `2026-11-05` is accepted and `2026-11-04` is rejected (injectable Clock) |
| **AC-11 (F-04 cases)** | Entry and daily-cumulative boundaries are enforced per mode (sets ≤ 20, `totalReps ≤ sets × 200`, 10,800 s, 100 km, template `rangeMax`, values > 0) with HTTP 400 naming the field and limit, and body weight 1–800 kg |
| **AC-13a** | Quick Complete creates one entry equal to `max(0, Target − ΣLogged)` for each of the 6 modes so that ΣActual = Target (RTM example: target 3 × 10 = 30 reps, already logged 1 set / 10 reps → entry `sets = 2, totalReps = 20`); the entry itself satisfies `totalReps ≤ sets × 200` (R5), raising `sets` above the differential value when Q20 requires it (R9) |
| **AC-13b** | If ΣLogged ≥ Target, Quick Complete returns 200 with `entry: null` and stores nothing; concurrent Quick Completes never create more than the missing difference |
| **AC-13c** | Time-based target 1,800 s with 600 s logged → Quick Complete creates a 1,200 s entry (the same rule applies to `distanceKm`) |
| **AC-14a** | The cumulative completed value of an exercise on a day is the direct sum of its entries (reps, seconds, km) with no double counting, no penalty, and entries of other exercises, other users or other days excluded |
| **AC-14b** | Exceeding the target incurs no penalty: the ratio stays capped at 1.0 and the score stays 100% (asserted in `progress_calc`) |
| **AC-17a** *(deferred → Sprint 2, CHANGE-04)* | `GET /api/profile` returns the Participant's own data and current weight, or `currentWeightKg: null` when none exists |
| **AC-17b** *(deferred → Sprint 2, CHANGE-04)* | `PUT /api/profile` with a valid weight (1–800 kg) appends a `WeightLog` row and returns the new current weight; earlier rows remain unchanged (no update or delete); invalid weights → 400 |
| **AC-17c** *(deferred → Sprint 2, CHANGE-04)* | Body weight 0.99 or 800.01 (also 70.55, `"abc"`, missing) → 400 `VALIDATION_ERROR`; no row is appended |
| **AC-17d** *(deferred → Sprint 2, CHANGE-04)* | A Manager calling `GET /api/profile` or `PUT /api/profile` → 403 with no data in the body |
| **AC-23** | The UI shows error notices naming the field and limit in at least 3 cases: sets 21, Quick Complete disabled on a Rest Day, and editing an old entry (RTM wording). The first two run in Sprint 1 (TEST-23-1, TEST-23-3); the third belongs to F-05 (Sprint 2) and is verified there. Sprint 1 additionally shows the `LOG_DATE_MISMATCH` notice (TEST-23-2) and the weight notice (TEST-23-4) |
| **AC-24a** | After a server restart (new application instance on the same database) the user's plan items, ledger entries and weight history are all still returned with the same values |
| **AC-24b** *(Sprint 3, SYS-01)* | After redeployment on GCP the same data is still retrievable — specified here for traceability, implemented and verified with SYS-01 in Sprint 3 |

**Shared AC with other features.** AC-12a/b/c and AC-22c (Endpoint Access Matrix): F-04 routes are covered in stage 2 (see F-01 §7); `GET /api/entries/:id` is the owner-scoped route. AC-25 (journey) uses F-04 for "Log Activity". AC-21a (latency, Sprint 2, CHANGE-03) is owned by F-06 and includes the ledger endpoints. AC-06 (Sprint 1) and AC-15 (Sprint 2) (F-06) consume the cumulative values of AC-14a.

--------------------------------------------------------------------------------

#### 8. Software Test Specification (STS)
Files: `tests/integration/daily_logging.test.ts` (AC-04, AC-10), `tests/integration/quick_complete.test.ts` (AC-13), `tests/integration/profile.test.ts` (AC-17, Sprint 2), `tests/unit/progress_calc.test.ts` (AC-14a, AC-14b, path per RTM), `tests/unit/boundary_validation.test.ts` (AC-11), `tests/e2e/validation_feedback.spec.ts` (AC-23), `tests/integration/persistence.test.ts` (AC-24a). Fixtures: seeded Manager, Alice (with weight) and Bob (without) (§5.2), Alice's plan created through F-03 (for example *Squat* `WEIGHT` 4 × 10 = 40 reps `[1..7]`, *Plank* `BODYWEIGHT_TIME` 120 s, *Outdoor Run* `CARDIO_DISTANCE` 5 km, *Sun Salutation* `YOGA` 600 s, *Walk* only on Mon/Wed/Fri), real PostgreSQL test database, injectable Clock fixed at **Thu 5 Nov 2026 10:00 Asia/Bangkok** unless stated. "DB unchanged" means rows and contents of `LedgerEntry` and `WeightLog` equal their values before the request.

| Test ID | AC | Level | Precondition / Input | Action | Expected result |
|---|---|---|---|---|---|
| `TEST-04a-1` | AC-04a | API/DB Integration | Alice logged in; Squat planned | `POST /api/entries` `{ userExerciseId, sets: 2, totalReps: 20 }` then `{ sets: 1, totalReps: 8 }` | 201 each; `kind` MANUAL; `logDate` 2026-11-05; second response `cumulative` = 3 sets / 28 reps; two rows owned by Alice |
| `TEST-04a-2` | AC-04a | API/DB Integration | Same | Manual entries for Plank (`durationSec` 60 and 30) and Outdoor Run (`distanceKm` 2.5 and 1.25) | 201 each; cumulative 90 s and 3.75 km |
| `TEST-04a-3` | AC-04a | API/DB Integration | After 04a-1/04a-2 | `GET /api/entries?date=2026-11-05` | 200; all entries in creation order; `cumulative` per exercise matches the sums; no `userId` in body |
| `TEST-04a-4` | AC-04a | API/DB Integration | Same | Entry with fields of another mode (`durationSec` for Squat); entry with unknown field `userId`; missing required field | 400 naming the field each; DB unchanged |
| `TEST-04b-1` | AC-04b | API/DB Integration | Clock on Tue 2026-11-10; *Walk* planned only Mon/Wed/Fri; Alice's other items every day (so the day is not a Rest Day) | Quick Complete for *Walk* | 400 `QUICK_COMPLETE_NOT_AVAILABLE`; DB unchanged |
| `TEST-04b-2` | AC-04b | API/DB Integration | Carol-style fixture: a Participant whose plan has only Mon/Wed/Fri items; Clock on Tue (Rest Day) | Quick Complete for any of her exercises | 400 `QUICK_COMPLETE_NOT_AVAILABLE`; DB unchanged |
| `TEST-04b-3` | AC-04b | API/DB Integration | Alice owns a custom exercise with no plan item | Quick Complete | 400 `QUICK_COMPLETE_NOT_AVAILABLE`; DB unchanged |
| `TEST-04c-1` | AC-04c *(deferred → Sprint 2)* | API/DB Integration | Rest-Day fixture of 04b-2 | `POST /api/entries` for one of her exercises (valid values) | 201; stored; appears in `GET /api/entries`; excluded from scores / monthly average / Streak (asserted by F-06 TEST-06e-2 and TEST-15-3) |
| `TEST-04d-1` | AC-04d *(deferred → Sprint 2)* | API/DB Integration | Alice; exercise without plan item on a targeted day | Manual entry within limits; then one above the limit | 201; then 400 (same limits) |
| `TEST-10a-1` | AC-10a | API/DB Integration | Clock 2026-11-05 | Entry with `logDate` 2026-11-05; entry without `logDate` | 201 each; stored `logDate` 2026-11-05 |
| `TEST-10a-2` | AC-10a | API/DB Integration | Same | Quick Complete without `logDate` | 201; stored `logDate` 2026-11-05 |
| `TEST-10b-1` | AC-10b | Boundary | Clock 2026-11-05 | Manual entry with `logDate` 2026-11-04, 2026-11-06, 2025-01-01 | 400 `LOG_DATE_MISMATCH` each; DB unchanged |
| `TEST-10b-2` | AC-10b | Boundary | Same | Quick Complete with `logDate` 2026-11-04 | 400 `LOG_DATE_MISMATCH` (before availability check); DB unchanged |
| `TEST-10b-3` | AC-10b | Boundary | Clock 2026-11-05 23:59:59 then 2026-11-06 00:00:00 (Asia/Bangkok) | Entry with `logDate` 2026-11-05 at each time | Accepted; then 400 `LOG_DATE_MISMATCH` (midnight boundary) |
| `TEST-10b-4` | AC-10b | Boundary | Clock 2026-11-05 | `logDate` `"2026-13-40"`, `"today"`, `20261105` | 400 `VALIDATION_ERROR` each |
| `TEST-10c-1` | AC-10c *(deferred → Sprint 2)* | Boundary | Clock at 2026-11-04T18:30Z (= 2026-11-05 01:30 Asia/Bangkok) | Entry with `logDate` `2026-11-05`; entry with `logDate` `2026-11-04` | 201; then 400 `LOG_DATE_MISMATCH` |
| `TEST-11 (F-04 cases)` | AC-11 | Unit | Validation module `validateEntry`, `validateWeight` | Pairs: sets 20/21/0; reps 2 sets × 200 / 401; cumulative sets 19 + 1 / 19 + 2; seconds 10,800/10,801 and cumulative; km 100/100.01/0/2.555 and cumulative 99 + 1 / 99 + 1.01; `rangeMax` 50 reps: 50/51; weight 1/800/0.9/800.1/70.55 | Accept / reject exactly as in §3.3; error names field and limit |
| `TEST-11-API` | AC-11 | API/DB Integration | Alice; Squat with template `rangeMax` 50 | Entries up to cumulative 50 reps then one more rep | 201 up to 50; then 400 naming `totalReps` with the limit; DB unchanged for the rejected request |
| `TEST-11-neg` | AC-11 | API/DB Integration | Alice | Negative `sets`, `durationSec`, `distanceKm`; `totalReps` 0; non-numeric strings | 400 naming the field each; DB unchanged |
| `TEST-13a-1` | AC-13a | API/DB Integration | One exercise per mode planned (6 modes); nothing logged | Quick Complete for each | 201 each; cumulative equals the target for each mode (reps: Σ = target total reps; seconds; km) |
| `TEST-13a-2` | AC-13a | API/DB Integration | Each mode with part of the target already logged (e.g. 30 s of 120 s; 1.25 km of 5 km) | Quick Complete | Entry value = target − logged (90 s; 3.75 km); cumulative = target |
| `TEST-13a-3` | AC-13a | API/DB Integration | Squat target 4 × 200 = 800 reps; 1 set / 1 rep logged | Quick Complete | 201; entry `sets = 4` (raised from the differential 3 so that 799 ≤ 4 × 200, R9), `totalReps = 799`; cumulative 5 sets / 800 reps |
| `TEST-13a-4` | AC-13a | API/DB Integration | Squat 4 × 10 target; nothing logged | `POST /api/entries/quick-complete` | 201; entry `kind` QUICK_COMPLETE, `sets` 4, `totalReps` 40; cumulative 4 / 40 |
| `TEST-13a-5` | AC-13a | API/DB Integration | Squat; 1 set / 15 reps logged manually | Quick Complete | 201; entry `sets` 3, `totalReps` 25; cumulative 4 sets / 40 reps (B2) |
| `TEST-13a-6` | AC-13a | API/DB Integration | Squat; 4 sets / 38 reps logged | Quick Complete | 201; entry `sets` 1 (`max(1, 0)`, `ceil(2/200)` = 1), `totalReps` 2; cumulative reps = 40 |
| `TEST-13a-7` | AC-13a | API/DB Integration | Squat target 20 × 200 = 4000 reps; 1 set / 1 rep logged | Quick Complete | 400 `VALIDATION_ERROR` naming `sets` (no entry fits R5 and R6 together, §13 item 1); DB unchanged |
| `TEST-13b-1` | AC-13b | API/DB Integration | Plank target reached (120 s logged) | Quick Complete | 200; `entry: null`; no new row; cumulative 120 |
| `TEST-13b-2` | AC-13b | API/DB Integration | Plank over target (150 s logged manually) | Quick Complete | 200; `entry: null`; unchanged |
| `TEST-13b-3` | AC-13b | API/DB Integration | Squat 0 logged | Two simultaneous Quick Complete requests | Exactly one 201 and one 200 `entry: null`; one row; cumulative = target |
| `TEST-13b-4` | AC-13b | API/DB Integration | Same | Quick Complete twice in sequence | 201 then 200 `entry: null` |
| `TEST-13c-1` | AC-13c | API/DB Integration | Time-based target 1,800 s; 600 s already logged | Quick Complete | 201; entry `durationSec` 1200; cumulative 1,800 |
| `TEST-14a-1` | AC-14a | Unit | Function `cumulativeFor(entries, exerciseId, date)` | Entries: two for Squat (2/20, 1/8), one for Plank, one for Squat on another day, one for another user | Squat = 3 sets / 28 reps; others excluded |
| `TEST-14a-2` | AC-14a | Unit | Same | Seconds and km entries including decimals (1.25 + 2.5) | Direct sums 3.75 (exact decimal); no weighting or rounding |
| `TEST-14a-3` | AC-14a | Unit | Same | Same entries evaluated twice, and an entry list that contains a Quick Complete entry | Same result (no double counting); Quick Complete entry counted once |
| `TEST-14a-4` | AC-14a | API/DB Integration | Squat entries of Alice and Bob on the same day | `GET /api/entries` as Alice | `cumulative` contains only Alice's values |
| `TEST-14b-1` | AC-14b | Unit | `calcItem` | Actual 45 against target 40 (Priority Weight 3) | ratio 1.0, itemScore 3 — no penalty for exceeding |
| `TEST-17a-1` | AC-17a *(deferred → Sprint 2)* | API/DB Integration | Alice (70.0 kg) logged in | `GET /api/profile` | 200; `currentWeightKg` 70; `weightEffectiveDate`; email and display name |
| `TEST-17a-2` | AC-17a *(deferred → Sprint 2)* | API/DB Integration | Bob logged in (no WeightLog) | `GET /api/profile` | 200; `currentWeightKg` null |
| `TEST-17b-1` | AC-17b *(deferred → Sprint 2)* | API/DB Integration | Alice | `PUT /api/profile` `{ "weightKg": 68.5 }` | 200; current 68.5; `WeightLog` has the previous row plus a new row dated today |
| `TEST-17b-2` | AC-17b *(deferred → Sprint 2)* | API/DB Integration | Same | Two PUTs the same day (68.5 then 69.0) | Three rows total; current weight 69.0; earlier rows unchanged |
| `TEST-17b-4` | AC-17b *(deferred → Sprint 2)* | API/DB Integration | Same | `PATCH`, `DELETE` and `PUT /api/profile/weights/:id` against the API | 404 `NOT_FOUND` (no such route); rows unchanged |
| `TEST-17c-1` | AC-17c *(deferred → Sprint 2)* | Boundary | Same | `weightKg` 1, 800, 0.9, 800.1, 0, −5, 70.55, `"abc"`, missing | 200, 200, then 400 each; no row for the rejected ones |
| `TEST-17d-1` | AC-17d *(deferred → Sprint 2)* | Security | Manager token | `GET /api/profile`, `PUT /api/profile` | 403 each; no data |
| `TEST-23-1` | AC-23 | UI E2E | Alice on Today, Squat planned | Enter 21 sets and submit | Error notice shows "sets" and "20" limit; no row added |
| `TEST-23-2` | AC-23 | UI E2E | Same; stale page whose date is yesterday (Clock advanced past midnight) | Submit an entry | Notice "not for today" shown; no row added |
| `TEST-23-3` | AC-23 | UI E2E | Rest Day fixture | Open Today | Quick Complete buttons disabled; banner shown; forced request returns the `QUICK_COMPLETE_NOT_AVAILABLE` notice |
| `TEST-23-4` *(deferred → Sprint 2 with the Profile screen)* | AC-23 | UI E2E | Alice on Profile | Enter 900 kg | Error notice naming `weightKg` and 1–800 |
| `TEST-24a-1` | AC-24a | Integration | Alice has plan items, entries on today; Bob has his own data | New application instance on the same database; log in again; `GET /api/plan-items`, `GET /api/entries`; Alice's seed `WeightLog` row (70.0 kg) is still present and Bob has none (profile endpoint: Sprint 2) | Same ids and values as before; Bob's data untouched |
| `TEST-24a-2` | AC-24a | Integration | Same | Quick Complete before restart, Quick Complete after restart | Second is a No-op (state persisted) |
| `TEST-22c (F-04 routes)` | AC-22c | Security | Registry contains the 4 Sprint 1 F-04 routes (6 with the profile routes, Sprint 2, CHANGE-04) | No token; then a Manager token on each | 401; then 403 (stage 2) |
| `TEST-12a (F-04 routes)` | AC-12a | Security | Manager token | Every F-04 route | 403 each; no data in body (stage 2) |
| `TEST-12b/12c (F-04 routes)` | AC-12b, AC-12c | Security | Alice and Bob each own entries | Alice `GET /api/entries/<Bob's id>`; Alice `GET /api/entries?userId=<Bob>` (`GET /api/profile?userId=<Bob>`: Sprint 2, CHANGE-04); Alice `POST /api/entries` with Bob's `userExerciseId`; Alice body with `userId` | 403 (body `userId`: 400 unknown field); Bob's data unchanged; Bob's own request → 200; non-existent entry id → 404; non-existent well-formed `userExerciseId` → 404 (stage 2) |

**Coverage check.** Every AC in §7 has at least one test (AC-04a–d, AC-10a–c, AC-11, AC-13a–c, AC-14a–b, AC-17a–d, AC-23 and AC-24a; AC-04c–d, AC-10c and AC-17a–d are deferred to Sprint 2; AC-24b is specified for traceability and verified with SYS-01 in Sprint 3); negative, boundary and role/ownership cases are included (logDate yesterday/tomorrow/midnight, sets 20/21, 400/401 reps, 10,800/10,801 s, 100/100.01 km, weight 1/800/0.9/800.1, concurrency). Date-dependent cases use the injectable Clock. Scoring effects of these entries are verified in F-06.

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
| Step | Commit type | Content | Evidence kept |
| ------ | ------ | ------ | ------ |
| 1 | `docs` | This contract v0.3.0 (spec-only) | Commit ID |
| 2 | `test` (red) | TEST-14a/TEST-14b, TEST-11 (F-04 cases): `cumulativeFor`, `validateEntry`, `validateWeight` | Failing run (modules absent) |
| 3 | `feat` (green) | Migration, seed (Alice weight), validation module, `cumulativeFor` | Passing run |
| 4 | `test` (red) | TEST-04a, TEST-10a, TEST-10b (TEST-10c: Sprint 2) | Failing run showing e.g. a backdated entry accepted |
| 5 | `feat` (green) | `POST /api/entries`, `GET /api/entries`, `logDate` check, route policies | Passing run |
| 6 | `test` (red) | TEST-04b (availability) and TEST-13a/13b (TEST-04c/04d, Rest Day and non-planned manual entries: Sprint 2) (including the concurrency and the R12 rejection case) | Failing run showing e.g. Quick Complete on a Rest Day accepted, or two concurrent calls overshooting the target |
| 7 | `feat` (green) | Quick Complete with row lock and No-op | Passing run |
| 8 | `test` (red) → `feat` (green) | *(Sprint 2, CHANGE-04)* TEST-17a–17d profile endpoints | Failing then passing runs |
| 9 | `test` / `feat` | TEST-24a, TEST-22c/12a/12b/12c (F-04 routes), Today UI (Profile UI: Sprint 2), TEST-23-1 to TEST-23-3 | Passing run |
| 10 | PR | Reviewed by Onsinee into `staging/sprint-1` | Review comment with a specific check |

--------------------------------------------------------------------------------

#### 10. Definition of Done for F-04
| # | Criterion | Evidence required |
| ------ | ------ | ------ |
| 1 | Contract reviewed and approved by Onsinee before implementation | Review comment; commit order |
| 2 | All endpoints, rules R1–R15 and R17 and policies (R16 and the profile endpoints: Sprint 2, CHANGE-04) implemented as specified | Code on `staging/sprint-1`; matches §4 |
| 3 | Migration and seed run on a clean database (Alice with weight, Bob without) | Command output from a fresh clone |
| 4 | All Sprint 1 tests in §8 implemented and enabled (none skipped); each Sprint 1 AC mapped (TEST-04c/04d, TEST-10c, TEST-17*, TEST-23-4 are Sprint 2 and are not required for Sprint 1) | Test names match STS IDs |
| 5 | Tests executed on the merge commit with counts | Passed / failed / skipped counts |
| 6 | TDD red/green evidence for AC-10b, AC-04b and AC-13b (including the concurrency case) | Failing and passing runs with commit IDs |
| 7 | F-04 routes included in the Endpoint Access Matrix run at Sprint 1 integration | Integration output |
| 8 | Teammate-reviewed PR with a substantive comment; integrated on staging | PR link, reviewer, comment |
| 9 | Today screen works: logging, Quick Complete, Rest Day state, error notices (the Profile screen is Sprint 2) | Journey run (AC-25); TEST-23-1 to TEST-23-3 run; screenshots with version |
| 10 | README, seed notes and `.env.example` current; no secret committed | Clean-clone run |
| 11 | RTM §3.1 updated (actual test names, result, commit); §12 pending items resolved or logged (status column) | Updated register |
| 12 | Incomplete work and limitations disclosed | §13 updated |

--------------------------------------------------------------------------------

#### 11. Dependencies on Other Contracts
| Item | Provided to / needed from | Note |
| ------ | ------ | ------ |
| Registry, `requireRole`, error envelope, Clock | Needed from F-01 | F-04 cannot be merged before F-01 |
| `UserExercise`, `PlanItem`, `resolvePlan` | Needed from F-03 | Needed for Quick Complete (R8, R9) and ownership |
| `LedgerEntry`, `cumulativeFor`, day listing | Provided to F-06 | F-06 reads entries and sums them with `cumulativeFor` |
| `LedgerEntry.createdAt` / `logDate` | Provided to F-05 | F-05 adds PUT/DELETE and `ENTRY_NOT_EDITABLE` |
| `WeightLog`, entry fields (`sets`, `durationSec`, `distanceKm`) | Provided to F-11 (Sprint 2) | Historical weight lookup and Estimated Minutes |
| Entries and plan history | Provided to F-08 | History and Streak |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
Status after the 6 Nov 2026 baseline pass (RTM / SDS / plan / SRS / Feature Inventory 1.1.0; see F-02 §12 for the reading of the status values). **Applied** items are in the baseline (SRS 1.1.0 Q30–Q49, RTM, SDS, plan 1.1.0); **Resolved** and **Withdrawn** items needed no baseline change. Every pending item of this contract is now applied, resolved or withdrawn.

| # | Pending item | Baseline document(s) affected | Status at baseline 1.1.0 |
| ------ | ------ | ------ | ------ |
| P4-1 | AC-04d added (RTM: +1 atomic AC; Sprint 1 count; Tier B) | RTM, sprint plan | **Applied** — RTM 1.1.0 (AC-04d; Sprint 2 by CHANGE-08), plan 1.1.0 |
| P4-2 | Concrete endpoints: `POST /api/entries`, `POST /api/entries/quick-complete`, `GET /api/entries?date=`, `GET /api/entries/:id`. SDS §5.2 currently lists only `GET/POST /api/entries` and `POST /api/entries/quick-complete`, so the catalogue must be extended with `GET /api/entries/:id` | SDS §5 (API) | **Applied** — SDS 1.1.0 §5.2 (`GET /api/entries/:id` added) |
| P4-3 | Both past and future `logDate` values are rejected with `LOG_DATE_MISMATCH` (SRS A.5 code already exists) | SRS (Q17 clarification) | **Applied** — SRS 1.1.0 Q40 |
| P4-4 | Quick Complete availability = exercise occurs today per `resolvePlan`; the `QUICK_COMPLETE_NOT_AVAILABLE` check runs after the `logDate` check | SRS (Q15 clarification) | **Applied** — SRS 1.1.0 Q41 |
| P4-5 | Quick Complete raises `sets` above B2's `max(1, targetSets − Σ sets)` when SRS Q20 requires it (R9), and is rejected with 400 `VALIDATION_ERROR` when no entry fits R5 and R6 together (R12, §13 item 1) | SRS (Q20 / Design Decision B2 (Q12) clarification) | **Applied** — SRS 1.1.0 Q42 (F-04 TEST-13a-7 covers the defect) |
| P4-6 | Cumulative sets limit of 20 per exercise per day; per-entry `sets` 1–20 | SRS (Q20 clarification) | **Applied** — SRS 1.1.0 Q43 |
| P4-7 | `weightKg` at most 1 decimal; same-day PUTs append separate rows; current weight = latest `effectiveDate`, then `createdAt` | SRS (Q1 / Q16 clarification) | **Applied** — SRS 1.1.0 Q44 |
| P4-8 | Row lock (`FOR UPDATE` on `UserExercise`) to serialize entries and Quick Complete | SDS (concurrency note) | **Applied** — SRS 1.1.0 Q45 and SDS 1.1.0 Section 4 (service layer) |
| P4-9 | Seed: Alice has one `WeightLog` row, Bob none | SRS Appendix A.6 / F-01 §5.2 | **Applied** — SRS Appendix A.6 already requires one Participant without any `WeightLog` |
| P4-10 | `GET /api/entries` may read past dates (read-only) | SRS (Q17 / Q28 / FR-06 note) | **Applied** — SRS 1.1.0 Q46 |
| P4-11 | Missing referenced `userExerciseId` in a request body answered with 404 `NOT_FOUND` (SRS A.5 / SDS §5.1) rather than 400 | SRS Appendix A.5, SDS §5.1 | **Resolved, no baseline change needed** — `NOT_FOUND` is already in SRS Appendix A.5 / SDS §5.1 |
| P4-12 | TEST-14a-4 is an API/DB integration test of AC-14a; RTM §2 plans TEST-14a–b as Unit tests in `tests/unit/progress_calc.test.ts` | RTM §2 | **Resolved, no baseline change needed** — TEST-14a-4 is a supplementary API/DB integration test of AC-14a; the RTM-planned unit tests TEST-14a / TEST-14b in `tests/unit/progress_calc.test.ts` are unchanged |

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | **Resolved (v0.2.0).** When all target sets are already logged but reps remain, B2's `sets = max(1, …)` alone could produce an entry violating `totalReps ≤ sets × 200`; conversely raising `sets` can push the cumulative total past the 20-set limit. Resolution: R9 raises `sets` to `ceil(remainingReps ÷ 200)` and R12 rejects with 400 `VALIDATION_ERROR` when no entry satisfies both R5 and R6 (asserted by TEST-13a-7) | Decided 6 Nov 2026 — baseline Q20 / SDS §3.2 take precedence over the bare B2 formula |
| 2 | Entries cannot be edited or deleted in Sprint 1; a mistaken entry stays until F-05 | Accepted scope (CHANGE-01); mitigated by Manual Override entries and a controllable test database |
| 3 | Entry timestamps use server time; if the user keeps a page open past midnight the next submit is rejected with `LOG_DATE_MISMATCH` | By design (BR-01); UI tells the user to reload |
| 4 | Body weight has no effect on Sprint 1 results; it only prepares F-11 | By design (Decision 11) |
| 5 | Equipment load (`loadKg`) is planned but not recorded per entry | By design (B2 stores sets and `totalReps` only) |
| 6 | Quick Complete of a reps exercise can raise `sets` in the entry (B2 formula plus the R9 raise) which later raises Estimated Minutes for METs | Known limitation, see SRS Q42 (and Q21); revisit in F-11 |
| 7 | Decimal serialization as JSON numbers; ranges limited to 2 decimals and weight to 1 | Acceptable |
| 8 | A target at the maximum boundary can become unreachable: e.g. target 20 × 200 = 4000 reps with 1 set / 1 rep already logged leaves no combination of entries that satisfies both `totalReps ≤ sets × 200` per entry and the cumulative 20-set limit | By design of the baseline boundaries (BR-02 / Q20); disclosed here and in TEST-13a-7 — do not silently loosen the limits |
