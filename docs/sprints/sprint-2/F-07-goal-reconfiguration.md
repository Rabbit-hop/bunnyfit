### Feature Engineering Contract: F-07 Same-Day Goal Reconfiguration & Plan Versioning
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-07
**Sprint:**  2 (goal creation is F-03, Sprint 1; history and streak are F-08, Sprint 2)
**Contract Version:**  0.1.4
**SRS Baseline Version:**  1.1.0 (Feature Inventory 1.1.0, RTM 1.1.10, System-Level SDS 1.1.1, Sprint Plan 1.2.0, F-03 contract 0.3.1, F-04 contract 0.3.2, F-05 contract 0.1.1, F-06 contract 0.3.1)
**Date:**  23 November 2026
**Status:**  Draft (review-pending). Open questions are in §13; none of them is decided here
**Primary Author:**  Nakagamon  |  **Reviewer:**  Onsinee
**Repository Path:**  `docs/sprints/sprint-2/F-07-goal-reconfiguration.md`

--------------------------------------------------------------------------------

#### Contract Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 23 Nov 2026 | Initial contract (issue #66, Part 1): behavior, API/data/UI specification, AC (AC-07a–c, wording copied from RTM 1.1.10), STS, Definition of Done, pending baseline items (§12), open questions (§13). Confirms from the code that **no schema change and no migration** is needed and that the existing plan resolution already orders two versions with the same `effectiveFrom` by `version` | Nakagamon | Draft |
| **0.1.1** | 23 Nov 2026 | Changes after Onsinee's review of PR #107 (`03e2bb5`): (1) STS fixtures made runnable: time and distance items are created through `POST /api/plan-items`, `MutableClock` instead of `FixedClock`, log in again after moving the Clock, "n reps" = one entry of 1 set; (2) R10 / OQ-1 reason corrected (a not-started item would start early, then the edit is lost); (3) Edit dialog is pre-filled from the **latest** version and available whichever day is selected (§6); (4) confirmation texts say today's progress and streak count are recalculated; End text says today's score still includes the item; (5) check order chain added (R3, TEST-07a-18) and merged-value validation placed inside the transaction (§3.1); (6) AC-07b reading confirmed by the reviewer, OQ-2 closed, P7-6 added; (7) DoD 5/6 split between the F-07 and F-08 merges, TEST-07b-2/07b-3 live in `goal_reconfig.test.ts` and AC-07b is PARTIAL until then; (8) F-05 and F-04 0.3.2 added to header and §11; (9) limitations added: no DELETE for a mistyped future goal, history of an ended exercise splits across two `planKey`s; (10) nits: `loadKg` 3-decimal case, `fields[]` shape for a non-object body, same `userExerciseId` in TEST-07c-2. Not taken: dropping `effectiveFrom` from the body (R4/R5 unchanged; the reviewer's "your call") | Nakagamon | Draft |
| **0.1.2** | 24 Nov 2026 | Changes after the re-review of PR #107 (`5cd58c9`; F-07 was approved): TEST-07a-14 asserts the `fields` shape for a non-object body; TEST-07a-18 listed in TDD step 4; `createHistoricalEntry` sentence aligned with F-08 §5; reviewer pronouns removed from the text | Nakagamon | Draft |
| **0.1.3** | 25 Nov 2026 | Implementation notes (issue #70), no behavior change: (1) `insertNextVersion` takes a `build(latest, exercise)` callback that returns the new fields or throws the validation error (the transaction rolls back); the pure `buildNextVersion` of §4.6 does the body-shape check, the R10 check and the merged validation in that order, so R3's order holds; (2) the "wrong type" part of R3's shape stage covers `priorityWeight`, the target fields, `repeatDays`, `endDate` and `effectiveFrom`; range and boundary checks stay in the merged stage; (3) TEST-07a-10 uses custom exercises and TEST-07a-11 sets `rangeMax` on the snapshot (see RTM 1.1.12); (4) TEST-07a-17 was written with the red tests; (5) TEST-07c-2 already passes before the route exists (the tie rule is existing behavior); (6) AC-07b is recorded PARTIAL until F-08 adds TEST-07b-2/07b-3 | Nakagamon | Draft |
| **0.1.4** | 27 Nov 2026 | Status update only (issue #87): §12 P7-6 is marked applied, because RTM 1.1.27 rewords AC-07b in both BR-11 rows to "the Streak counted from closed days is unchanged; today's contribution follows SRS Q19". No rule, API, AC, STS or DoD change; AC-07b stays PASS at `127c248` (RTM §3.1). | Onsinee (67070501078) | Draft (review-pending) |

*Rule: committed as a specification-only commit before any F-07 implementation; later changes are new versions with a reason, never silent rewrites.*

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
F-07 lets a Participant **change or end a goal that already exists** without rewriting history. A change never edits a `PlanItem` row: it inserts a **new version** of the same plan item (same `planKey`, `version + 1`, `effectiveFrom` = today). Because plan resolution (SDS §3.3) picks, for every date, the version with the greatest `effectiveFrom` ≤ that date, today and every later date use the new goal at once, while every earlier date still resolves to the version it had, so past Daily Overall % and the Streak of closed days do not change (BR-11).

| In scope | Out of scope (and where it belongs) |
| ------ | ------ |
| `PUT /api/plan-items/:id`: change `priorityWeight`, the target fields of the exercise's `trackingMode`, `repeatDays` and `endDate` of an existing plan item by inserting a new version (§4) | Creating a plan item, template selection, custom exercises (F-03) |
| **End** an item: the same route with `endDate` (§3.2 R9, §4.3) | Changing the exercise itself (`UserExercise` name, mode, unit, METs, Valid Range) — a plan item cannot be re-pointed to another exercise (R4) |
| Invariant: `PlanItem` rows are never updated in place; version history is retained (R1, R2) | Deleting a plan item or a version — no `DELETE` exists in any sprint (SDS §5.2) |
| Edit and End actions with a confirmation on My Plan (§6) | Scheduling a change for a future date (`effectiveFrom` later than today) — the baseline fixes `effectiveFrom` = today for a change (R5) |
| Past scores and the Streak of closed days stay unchanged (AC-07b) | The streak and history endpoints themselves (F-08); entry edit/delete (F-05); calories (F-11) |

--------------------------------------------------------------------------------

#### 2. Linked Requirements and Dependencies
| Requirement | How F-07 serves it |
| ------ | ------ |
| **BR-11** (SRS §4.2) | "Goal changes apply Plan Versioning schema with `effectiveFrom`, recalculating current-day and future scores immediately without retroactively altering historical scores" |
| **FR-03** (SRS §4.1 note) | Mid-month goal reconfiguration is delivered by F-07; Target > 0, Priority Weight 1–5, weekly repeat days and optional end date keep the F-03 rules |
| **BR-02** (shared with F-03, F-04) | Target boundaries (sets 1–20, reps/set 1–200, duration 1–10,800 s, distance > 0 and ≤ 100 km, load > 0 and ≤ 500 kg) and the snapshot's Valid Range apply to the new version exactly as in F-03 R6/R7 |
| **BR-04 / NFR-02** (shared) | A plan item is owned by one Participant; the route is registered in the F-01 policy registry (Manager → 403, another Participant's item → 403) |
| **BR-10** (read by F-08) | Streak uses the plan version of each date; F-07 guarantees that a change today inserts only a row that applies from today (AC-07b) |
| SDS §3.2 / §3.3, SRS Q21, Q24, Q39 | Versioning columns, resolution rule, `endDate` and Rest Day definitions |

**Depends on:** F-03 (plan rows, `resolvePlan`, target validation), F-04 (entries are keyed by `userExerciseId`, so they are unaffected by a new version), F-06 (daily scores read through `resolvePlan`). **Downstream:** F-08 (history and Streak per date; see §11), F-09 (schedule view of versions), F-11 (calorie target uses the same plan rows).

--------------------------------------------------------------------------------

#### 3. Feature Design (Feature-Level SDS)
##### 3.1 Behavior and Workflow
1. On **My Plan** the Participant opens **Edit** on a plan item (or **End**).
2. The Edit dialog shows the fields of the item's mode pre-filled from the **latest version** of the item (the client has all versions from `GET /api/plan-items`; R7), whichever day is selected on My Plan (priority weight, target fields, repeat days, end date). The Participant changes one or more of them and presses **Save changes**.
3. A confirmation states that the change applies from today and does not change past days (§6). On confirmation the client sends `PUT /api/plan-items/:id` with the changed fields.
4. The server authenticates, authorizes the role, checks ownership and the shape of the body (unknown fields, types), and then — in **one transaction** that first locks the exercise row — reads the latest version of the item, applies R10, validates the **merged** values (R6; this needs the latest version, so it runs inside the transaction), builds the next version and inserts that row. The old row is not touched. The full check order is in R3.
5. The response is the new version. My Plan refreshes; Today and Progress show the new target from the next request on (derived values, SDS §3.4).

```mermaid
sequenceDiagram
  participant P as Participant UI
  participant A as API
  participant D as PostgreSQL
  P->>A: PUT /api/plan-items/:id {targetSets: 5}
  A->>A: authenticate, role=PARTICIPANT, owner of :id, body shape (Clock = today)
  A->>D: BEGIN; lock UserExercise row
  A->>D: read latest version of planKey (max version)
  A->>A: R10 state check, validate merged values (R6)
  A->>D: INSERT PlanItem (same planKey, version+1, effectiveFrom = today, merged fields)
  A->>D: COMMIT
  A-->>P: 200 {planItem (new version), userExercise}
  Note over D: Older version rows are never updated
```

##### 3.2 Business Rules
| ID | Rule | Status |
| ------ | ------ | ------ |
| R1 | **`PlanItem` rows are never updated in place.** Every successful change inserts exactly one new row and updates none. This includes `endDate`: ending an item is also an insert | Baseline (SDS §3.2, BR-11) |
| R2 | The new row has the **same `planKey`** as the item, `version` = (highest existing `version` of that `planKey`) + 1, the same `userId` and `userExerciseId`, a new `id` and `createdAt`, and `effectiveFrom` = today (R5). Versions of one `planKey` therefore form the history; none is ever removed (AC-07c) | Baseline (SDS §3.2, F-03 R15) |
| R3 | **Role and ownership.** Only role `PARTICIPANT`; the item must belong to the caller. **Check order** (same chain as F-05 R2): 401 (no/invalid token) → 403 (role) → 400 malformed `id` → 404 (does not exist) / 403 (another Participant's item) → 400 body shape without needing the row (non-object body, empty body, unknown or non-editable field, wrong type) → inside the transaction after the locked read: 400 R10 (`id`: ended or not started) → 400 merged-value validation (R6). So an invalid body on an ended item answers on the body first (TEST-07a-18). Manager → 403 and another Participant's item → 403 even with an invalid body. A well-formed id that does not exist → 404 `NOT_FOUND`; a malformed id → 400 `VALIDATION_ERROR` naming `id` (same behavior as `GET /api/plan-items/:id`, F-03 §3.3) | Baseline (BR-04), consistent with F-03 |
| R4 | **Editable fields** (all optional, at least one required): `priorityWeight`, the target fields of the item's `trackingMode`, `repeatDays`, `endDate`, and `effectiveFrom` only if equal to today (R5). Not editable: `userExerciseId`, `planKey`, `version`, `source`, `exercise`, `userId`, `id`, `createdAt` and any field not listed — an unknown or non-editable field → 400 naming it. A field that is omitted **keeps the value of the latest version** (the verb is `PUT` as fixed by SDS §5.2, but the semantics are "merge into the latest version") | Design decision |
| R5 | `effectiveFrom` of the new version = **today** (Asia/Bangkok, from the injectable Clock, SDS §2.6). If the body contains `effectiveFrom` it must equal today, otherwise 400 `VALIDATION_ERROR` naming `effectiveFrom` (yesterday and tomorrow both rejected). The client does not need to send it | Baseline (BR-11, SRS A.2) |
| R6 | **Validation of the merged result** reuses the F-03 rules: `priorityWeight` integer 1–5 (R8); target fields exactly those of the mode, **Target > 0**, BR-02 boundaries and the snapshot's Valid Range `[rangeMin, rangeMax]` on the merged values (F-03 R6, R7), so changing only `targetSets` is validated together with the carried-over `targetRepsPerSet` and `loadKg`; a target field of another mode → 400 naming it; `repeatDays` a non-empty array of unique ISO weekdays 1–7 (F-03 R11); `endDate` `YYYY-MM-DD` or `null`, and if not null it must not precede `effectiveFrom` = today (F-03 R10) | Baseline Q21 + F-03 |
| R7 | **The version in force is the latest one.** The next version is built from the row with the highest `version` of the item's `planKey`, whichever version `:id` names (`:id` identifies the plan item, not a particular version; a stale id from a list loaded before another edit still works). Because every F-07 insert has `effectiveFrom` = today and R10 forbids editing an item whose latest version starts in the future, `version` order and `effectiveFrom` order never disagree for a `planKey` | Design decision |
| R8 | **Plan resolution is unchanged** and is the only way a version is chosen for a date (SDS §3.3, F-03 R12, `server/domain/planResolution.ts`): per `planKey`, the version with the greatest `effectiveFrom` ≤ the date, **ties broken by the highest `version`**; discarded if the date is after `endDate` or its weekday is not in `repeatDays`. **Same-day double edit:** two versions with the same `effectiveFrom` = today are ordered by `version`, so the later edit wins and the earlier one stays in history (AC-07c). Reading the code confirms this: `resolveItems` compares `effectiveFrom`, then `version`, explicitly, and does not depend on row or `createdAt` order | Baseline (SDS §3.3) |
| R9 | **End.** Ending an item is a change of `endDate` through the same route (R4): `endDate` = the **last day** on which the item occurs. The UI's End action sends `endDate` = today (the item still occurs today and not after). A later `endDate` ends it on that date; `endDate: null` removes the end date (the item runs again). There is no separate end endpoint | Design decision (see §13 OQ-3) |
| R10 | **Items that cannot be edited.** If the latest version has already ended (`endDate` < today) or has not started (`effectiveFrom` > today), the request is 400 `VALIDATION_ERROR` naming `id` and nothing is stored. Reason: take v1 with `effectiveFrom` 2026-11-20 and an edit on 2026-11-12 that inserts v2 with `effectiveFrom` 2026-11-12. For 11-12 to 11-19 v2 is the only version with `effectiveFrom` ≤ the date, so **the item would start eight days early with the new values**, and from 11-20 v1 has the greater `effectiveFrom` and wins again, so the edit is lost (see §13 OQ-1, OQ-4) | Design decision, needs review |
| R11 | **Immediate effect.** Today's and later dates use the new version at once, **including today's already recorded entries**: they are kept (entries are keyed by `userExerciseId`, F-04) and are scored against the new target, so today's ratio and Daily Overall % are recalculated on the next read (AC-07a, SRS BR-11). Quick Complete after the change fills the difference to the **new** target | Baseline (BR-11, F-04 R7) |
| R12 | **Past days are untouched.** No row with an `effectiveFrom` before today is written or changed, so every date before today resolves to the same row as before and its Daily Overall % is identical before and after (AC-07b). The `planItemId` returned for a past date is still the old row's id; for today and later it is the new row's id (clients must not cache `planItemId` across an edit) | Baseline (SDS §3.3) |
| R13 | **Atomic and serialized.** The insert runs in one transaction that locks the item's `UserExercise` row first (the same pattern as F-04 R14), so two concurrent changes of the same item receive different consecutive versions; `@@unique([planKey, version])` is the last line of defense and a violation is an `INTERNAL_ERROR`, never silent data loss. A failure stores nothing | Design decision |
| R14 | Every change inserts a version, even if the merged values equal the latest version (no "no-op" detection); an empty body or a body with no editable field is 400 | Design decision (see §13 OQ-5) |
| R15 | The response and the version history never include `userId` (F-03 §4.4) | Baseline |

##### 3.3 Failure and Boundary Cases
| Case | Expected behavior |
| ------ | ------ |
| No token / expired / revoked | 401 `UNAUTHENTICATED` |
| Manager calls `PUT /api/plan-items/:id` | 403 `FORBIDDEN`, even with an invalid body or a non-existent id of a well-formed UUID |
| Participant sends another Participant's plan item id | 403 `FORBIDDEN`; no row is inserted; the other Participant's rows are unchanged |
| Well-formed UUID that does not exist | 404 `NOT_FOUND` |
| `:id` not a UUID | 400 `VALIDATION_ERROR` naming `id` |
| Empty body `{}`, non-JSON body, JSON array | 400 each; nothing stored; `fields` has one element with `field: "body"` |
| Unknown or non-editable field (`userId`, `userExerciseId`, `planKey`, `version`, `source`, `exercise`, `id`) | 400 naming the field |
| `effectiveFrom` = today / yesterday / tomorrow | Accepted / 400 / 400 |
| Clock 23:30 on 12 Nov and 00:30 on 13 Nov (Asia/Bangkok) | `effectiveFrom` = 2026-11-12 and 2026-11-13 respectively (the Bangkok date, not the UTC date) |
| `targetSets` 20 / 21 / 0 (`WEIGHT`, carried `targetRepsPerSet` 10) | Accepted / 400 / 400 |
| `targetRepsPerSet` 200 / 201 / 0 | Accepted / 400 / 400 |
| Merged total reps outside the snapshot Valid Range | 400 naming `targetRepsPerSet` with the range |
| `loadKg` 500 / 500.01 / 0 | Accepted / 400 / 400 |
| `targetDurationSec` 10,800 / 10,801 / 0 / 59.5 (time modes) | Accepted / 400 / 400 / 400 |
| `targetDistanceKm` 100 / 100.01 / 0 / 5.123 (`CARDIO_DISTANCE`) | Accepted / 400 / 400 / 400 |
| A target field that does not belong to the mode (e.g. `targetDistanceKm` on a `WEIGHT` item) | 400 naming the field |
| `priorityWeight` 1 / 5 / 0 / 6 / 2.5 / `"3"` | Accepted / accepted / 400 / 400 / 400 / 400 |
| `repeatDays` `[]` / `[0]` / `[8]` / `[1,1]` / `"Mon"` | 400 each, naming `repeatDays` |
| `endDate` = today / yesterday / later date / `null` / `"2026-13-45"` | Accepted / 400 / accepted / accepted (clears) / 400 |
| Latest version has `endDate` earlier than today | 400 `VALIDATION_ERROR` naming `id` (R10) |
| Latest version has `effectiveFrom` later than today | 400 `VALIDATION_ERROR` naming `id` (R10) |
| Two changes on the same day | Versions 2 and 3 with the same `effectiveFrom`; the plan for today and later returns version 3; history keeps both (AC-07c) |
| Two simultaneous changes of one item | Both 200, consecutive different versions, no 500 (R13) |
| Change today, then read a past date | Past date resolves to the row it resolved to before (R12) |
| Failure while inserting | No new row; existing rows unchanged |

##### 3.4 Permissions
| Operation | Unauthenticated | Manager | Participant (owner) | Participant (other's item) |
| ------ | ------ | ------ | ------ | ------ |
| `PUT /api/plan-items/:id` (change or end an item; creates a new version) | 401 | 403 | Allow | 403 |

--------------------------------------------------------------------------------

#### 4. API Specification
Conventions follow SDS §5.1 (JSON, error envelope of SRS Appendix A.5, dates as `YYYY-MM-DD`, decimals as JSON numbers). Identity comes from the token only; no `userId` appears in the path or body.

##### 4.1 Endpoint
| Endpoint | Roles | Success | Errors |
| ------ | ------ | ------ | ------ |
| `PUT /api/plan-items/:id` | Participant (owner) | 200 `{ planItem, userExercise }` — the **new** version and its exercise snapshot | 400, 401, 403, 404 |

The status is 200 (not 201) because the client addresses an existing plan item; the body is the newly inserted version. No other F-07 route exists: `GET /api/plan-items`, `GET /api/plan-items/:id` and `GET /api/plan?date=` (F-03) already return every version and the resolved version of a date and need no change.

##### 4.2 Change Request
Body fields are all optional, at least one must be present (R4). Example for a `WEIGHT` item, today = 2026-11-12:
```json
{ "targetSets": 5, "targetRepsPerSet": 10, "priorityWeight": 4, "repeatDays": [1, 3, 5] }
```
Allowed keys: `priorityWeight`, `targetSets`, `targetRepsPerSet`, `loadKg`, `targetDurationSec`, `targetDistanceKm` (only those of the item's mode), `repeatDays`, `endDate`, `effectiveFrom` (must be today). Unknown fields are rejected.

Response `200`:
```json
{
  "userExercise": { "id": "uuid", "sourceTemplateId": "uuid-or-null", "isCustom": false,
    "name": "Barbell Squat", "targetBodyPart": "Legs", "trackingMode": "WEIGHT", "unit": "reps",
    "cardioCategory": null, "metValue": 3.5, "rangeMin": 1, "rangeMax": 4000 },
  "planItem": {
    "id": "uuid-of-the-new-row", "userExerciseId": "uuid", "planKey": "uuid-same-as-before", "version": 2,
    "priorityWeight": 4,
    "targetSets": 5, "targetRepsPerSet": 10, "loadKg": 40,
    "targetDurationSec": null, "targetDistanceKm": null,
    "effectiveFrom": "2026-11-12", "endDate": null, "repeatDays": [1, 3, 5],
    "createdAt": "2026-11-12T03:00:00.000Z"
  }
}
```
The shape is the F-03 §4.4 shape. `loadKg` is carried over from the previous version because it was not sent (R4).

##### 4.3 End Request
```json
{ "endDate": "2026-11-12" }
```
Response `200` with the new version (`version` + 1, `effectiveFrom` = today, `endDate` = 2026-11-12, every other field copied from the previous version). From 2026-11-13 the plan for that item resolves to a Rest Day (if nothing else is planned); today and every earlier date are unchanged. `{ "endDate": null }` removes the end date.

##### 4.4 Error example
```json
{ "code": "VALIDATION_ERROR", "message": "targetSets must be an integer from 1 to 20", "fields": [{ "field": "targetSets", "limit": "integer 1-20" }] }
```
For an item that cannot be edited (R10): `{ "code": "VALIDATION_ERROR", "message": "This plan item has ended", "fields": [{ "field": "id", "limit": "plan item has ended and cannot be changed" }] }`.

##### 4.5 Route Policy (registered in the F-01 registry)
`{ method: 'PUT', path: '/api/plan-items/:id', featureId: 'F-07', auth: 'required', roles: ['PARTICIPANT'], ownership: 'resource-owner' }`. Owner lookup = `PlanItem.userId` (the lookup `findPlanItemOwner` already used by `GET /api/plan-items/:id`). Registering the row is part of the same commit as the route; the generic AC-22c and AC-12c tests then cover it (SDS §6.3).

##### 4.6 Internal interface (new, pure + repository)
```ts
buildNextVersion(latest: PlanItemRecord, exercise: UserExerciseRecord, patch: unknown, today: string):
  { value: NextVersionFields } | { fields: FieldError[] }          // R4–R6, R10; pure, no I/O, no Clock
planRepository.insertNextVersion(userId, userExerciseId, planKey, build): Promise<PlanItemWithExercise>
  // one transaction, locks the UserExercise row, reads max(version), inserts version + 1 (R2, R13)
```
`resolvePlan` / `resolveItems` (F-03 §4.7) are **not changed**.

--------------------------------------------------------------------------------

#### 5. Data Specification
**No schema change and no migration.** Confirmed against `prisma/schema.prisma` (`model PlanItem`): `planKey` (UUID, default random), `version` (Int, default 1), `effectiveFrom` (Date), `endDate` (Date, nullable), `repeatDays` (Int bitmask) and `@@unique([planKey, version])` already exist, as F-03 R15 and §11 anticipated; `@@index([userId, effectiveFrom])` and `@@index([userExerciseId, effectiveFrom])` already serve the reads. The only new data access is one `INSERT` per change.

**Plan resolution confirmed in code, not changed** (`server/domain/planResolution.ts`, `resolveItems`): for each `planKey` the chosen row is the one with the greatest `effectiveFrom` ≤ the date and, when two rows have the same `effectiveFrom`, the greater `version` (an explicit comparison, independent of row order); then `endDate` and `repeatDays` filter it. The repository `listPlanItems` returns all versions of the user ordered by `effectiveFrom`, `createdAt`. This is the tie rule SDS §3.3 states, and it is what makes a second same-day change win.

**Test data.** `createHistoricalPlanItem` (`tests/helpers/historicalPlan.ts`) accepts `planKey`, `version`, `effectiveFrom`, `endDate` and writes only `targetSets`, `targetRepsPerSet` and `loadKg` (target fields of other modes are accepted by its type but not written, and the exercise is always built from a template found by name), so it is used for the `WEIGHT` fixtures only. Items of the time, yoga and distance modes are created through `POST /api/plan-items` with the Clock at 2026-11-12 (their `effectiveFrom` = today is all those tests need). Dated `LedgerEntry` rows are inserted directly through Prisma; `createHistoricalEntry` (named in F-06 §5) does not exist: it is added once by whichever of the F-07 / F-08 PRs lands first and reused by the other (the F-07 tests 07a-2, 07b-1 and 07b-4 already need past entries, so in the plan order the F-07 PR adds it). The Clock is `MutableClock` (`tests/helpers/integrationApp.ts`; `FixedClock` has no setter). Tokens expire after 3,600 s on the same Clock, so a test that moves the Clock by more than that logs in again before its next request.

--------------------------------------------------------------------------------

#### 6. UI Specification
Screen: **S-05 My Plan** (UI spec §4; "Sprint 2 adds Edit and End actions", UI spec §5). "Today" always comes from the server date (`GET /api/plan` `date`), never the browser clock (UI spec §3.5).

| Element | Behavior |
| ------ | ------ |
| **Edit** button on a plan item (test id `plan-item-edit`) | Opens the **Edit plan item** dialog. Shown for every listed item whose **latest** version can be edited (R10: not ended, already started), whichever day is selected on the calendar; hidden for ended or not-yet-started items. The dialog values come from the latest version, so a past day selected on S-05 never changes which values are edited |
| **Edit plan item** dialog | Read-only: exercise name and tracking mode. Editable: priority weight 1–5, the target fields of the mode (same inputs and helper ranges as Add exercise), repeat-day toggles, optional end date (earliest = today). The start date is not editable and is shown as "From today" |
| Confirmation text (`plan-edit-confirm-text`) | "Save changes from today? The new goal applies from today ({server date}) onward. Past days keep the goal they had, so their scores and the streak of past days do not change. Today's progress and today's streak count are recalculated with the new goal." Buttons **Save changes** / **Cancel** |
| **End** button (test id `plan-item-end`) | Confirmation: "End this exercise? It stays in your plan through today ({server date}) and stops after that. Today's score still includes it, so ending it before you have done it can lower today's percentage and your streak. Past days are not changed." Buttons **End exercise** / **Keep**. Sends `{ "endDate": <server date> }` |
| Success | Toast "Goal updated from today." or "Exercise ended after today."; My Plan keeps the selected day and shows, for it, the version resolved for that day (a past day still shows the old goal; today and later show the new one); My Plan and the open Today/Progress data are refetched; no optimistic update (UI spec §3.2) |
| Errors | 400 `fields[]` shown under the field (`field-error-<field>`) naming the field and limit; 400 with `field: id`: for an ended item "This exercise has ended and can no longer be changed.", for a not-yet-started item "This exercise starts on {date}. You can change it from that day." (the client knows `effectiveFrom` from `GET /api/plan-items`); 403 notice "You do not have permission to do this."; 404 "That item no longer exists."; 401 back to Login (UI spec §3.1/§3.3) |
| States | Saving (buttons disabled, no double submit); the dialog keeps the entered values after a rejected submit (UI spec §3.4) |
| Version list | My Plan shows, for the displayed date, the version in force (browser applies F-03 R12 to `GET /api/plan-items`); older versions are not listed as separate items |
| Manager | No plan screens; the URL redirects to the access-denied screen |

No RTM acceptance criterion tests the UI of F-07 (RTM maps AC-07a–c to API/DB integration only); the UI is checked manually against this table at the F-07 review and the DoD evidence lists screenshots. No Playwright result is claimed by this contract.

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
AC-07a–c are identical to RTM 1.1.10 in ID and meaning; the contract only makes each one observable through a named endpoint or field. No AC is added.

| AC | Observable outcome |
| ------ | ------ |
| **AC-07a** | Changing a target today creates a new `PlanItem` version with `effectiveFrom` = today; today's and future scores use the new target immediately. *Observable:* `PUT /api/plan-items/:id` → 200 with the same `planKey`, `version` + 1, `effectiveFrom` = today (Asia/Bangkok) and the changed target; the old row is unchanged; `GET /api/progress/daily` for today and `GET /api/plan` for today and later dates use the new target |
| **AC-07b** | Daily Overall % of every past day is identical before and after the change, and the Streak value is unchanged. *Observable:* `GET /api/progress/daily?date=` for each past date is deep-equal before and after the change (including `planItemId`); the Streak of closed days (F-08 `GET /api/streak`) is unchanged — see §13 OQ-2 for the reading of "Streak value" when today itself has already reached 70% |
| **AC-07c** | Changing the same goal twice on one day → the latest version applies and the version history is retained. *Observable:* two changes on the same day produce versions `n+1` and `n+2` with the same `effectiveFrom`; the plan for today and later returns `n+2`; `GET /api/plan-items` still lists every version, each row unchanged |

**Shared AC with other features.** AC-11 (boundaries): F-07 contributes target-boundary cases. AC-12a/b/c and AC-22c (Endpoint Access Matrix): the new route is covered by the generic registry tests (§4.5). AC-23 (validation display): the Edit dialog uses the same field-error display. AC-24a (persistence): versions are rows like any other plan rows.

--------------------------------------------------------------------------------

#### 8. Software Test Specification (STS)
File: `tests/integration/goal_reconfig.test.ts` (RTM path; AC-07). Fixtures: seeded Manager, Alice and Bob (F-01 §5.2), seeded library (F-02 §5.2), real PostgreSQL test database, injectable `MutableClock` fixed at **Thu 12 Nov 2026 10:00 Asia/Bangkok** unless stated (so Mon 9, Tue 10, Wed 11 Nov are past dates). "n reps on a date" means one `LedgerEntry` of 1 set and `totalReps` n (n ≤ 200; `LedgerEntry_sets_reps_pair_check` needs `sets` and `totalReps` together and `LedgerEntry_reps_per_set_check` limits `totalReps` to `sets × 200`). **Base fixture B:** Alice has one plan item "Barbell Squat" (`WEIGHT`), planKey K, version 1, `effectiveFrom` 2026-11-02, `repeatDays` every day, no `endDate`, 4 sets × 10 reps = **40 reps**, `loadKg` 40, `priorityWeight` 3, created with `createHistoricalPlanItem`. "Rows of K" means all `PlanItem` rows with `planKey` = K read directly through Prisma; "unchanged" means every column of those rows equals its value before the request. "DB unchanged" means the rows of K (and of Bob's items) are equal before and after.

| Test ID | AC | Level | Precondition / Input | Action | Expected result |
| ------ | ------ | ------ | ------ | ------ | ------ |
| **TEST-07a-1** | AC-07a | API/DB Integration | Fixture B | Alice `PUT /api/plan-items/<v1 id>` `{ "targetSets": 5, "targetRepsPerSet": 10 }` | 200; `planItem.planKey` = K, `version` 2, `effectiveFrom` 2026-11-12, `targetSets` 5, `targetRepsPerSet` 10, `loadKg` 40 and `priorityWeight` 3 (carried), `id` ≠ v1 id; no `userId` in the response; rows of K = 2; the v1 row **unchanged** (R1) |
| TEST-07a-2 | AC-07a | API/DB Integration | Fixture B plus Alice's entry today: 25 reps (inserted through Prisma, `logDate` 2026-11-12) | `GET /api/progress/daily` (today) → `PUT` as in 07a-1 → `GET /api/progress/daily` (today) | Before: target 40, `ratio` 0.625, `itemScore` 1.875, `overallPercent` 62.5. After: target 50, `ratio` 0.5, `itemScore` 1.5, `overallPercent` 50; the entry is still listed by `GET /api/entries?date=2026-11-12` (R11) |
| TEST-07a-3 | AC-07a | API/DB Integration | Same as 07a-2 | `PUT` as in 07a-1, then `POST /api/entries/quick-complete` for the exercise | 201; cumulative `totalReps` = 50 (the difference to the **new** target was added) |
| TEST-07a-4 | AC-07a | API/DB Integration | Fixture B | `PUT` as in 07a-1, then `GET /api/plan?date=` for 2026-11-11, 2026-11-12, 2026-11-13 and 2026-12-01 | 11-11: item is version 1 (target 4 × 10); 11-12, 11-13 and 12-01: version 2 (target 5 × 10) (R8, R12) |
| TEST-07a-5 | AC-07a | API/DB Integration | Fixture B | Each on a fresh fixture B: `PUT` `{ "priorityWeight": 5 }`; `PUT` `{ "repeatDays": [1,3,5] }`; `PUT` `{ "loadKg": 60 }` | 200 each; version 2 carries all other fields from v1; with `[1,3,5]`: `GET /api/plan?date=2026-11-12` (Thursday) → `isRestDay` true, `GET /api/plan?date=2026-11-11` (Wednesday) → item present (v1) |
| TEST-07a-6 | AC-07a | API/DB Integration | One item of each mode (`BODYWEIGHT_REPS`, `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME`, `CARDIO_DISTANCE`) created through `POST /api/plan-items` with the Clock at 2026-11-12 (target fields of its mode) | `PUT` a changed target field of its mode on each | 200 each; version 2 with the new value and the other mode's fields null; the previous row unchanged |
| TEST-07a-7 | AC-07a | API/DB Integration | Fixture B; Clock at `2026-11-12T16:30:00Z` (23:30 Bangkok) | `PUT` `{ "targetSets": 5 }`; then Clock at `2026-11-12T17:30:00Z` (00:30 on 13 Nov Bangkok) on a fresh fixture, same request | `effectiveFrom` = 2026-11-12, then 2026-11-13 (Bangkok date, not UTC date) |
| TEST-07a-8 | AC-07a | API/DB Integration | Fixture B | `PUT` `{ "endDate": "2026-11-12" }`; then `GET /api/plan?date=` for 2026-11-12 and 2026-11-13; then `PUT` `{ "endDate": "2026-11-20" }`, then `{ "endDate": null }` | Version 2 has `endDate` 2026-11-12 and `effectiveFrom` 2026-11-12; 11-12 item present, 11-13 Rest Day, 11-11 still v1; then versions 3 and 4: 11-18 present, and finally with `null` every later date present; each previous row unchanged (End, R9) |
| TEST-07a-9 | AC-07a | API/DB Integration | Fixture B | Validation boundaries: `targetSets` 20 and 21, 0; `targetRepsPerSet` 200, 201, 0 (with `targetSets` 20 → total 4,000 within range); `loadKg` 500, 500.01, 60.123, 0 | 200 for 20, 200, 500 (each on a fresh fixture); 400 `VALIDATION_ERROR` naming the field for the others; rows of K unchanged on each 400 (AC-11 cases) |
| TEST-07a-10 | AC-07a | API/DB Integration | Time-mode item (`targetDurationSec` 600) and distance item (`targetDistanceKm` 5), both created through `POST /api/plan-items` | `targetDurationSec` 10,800 / 10,801 / 0 / 59.5; `targetDistanceKm` 100 / 100.01 / 0 / 5.123 | 200 / 400 / 400 / 400 and 200 / 400 / 400 / 400, each naming the field; DB unchanged on 400 |
| TEST-07a-11 | AC-07a | API/DB Integration | Template with `rangeMax` 100 (Manager-created), item selected with 10 × 5 reps | `PUT` `{ "targetRepsPerSet": 21 }` (10 × 21 = 210); then `{ "targetRepsPerSet": 10 }` (100) | 400 naming `targetRepsPerSet` with the range; then 200 (boundary) |
| TEST-07a-12 | AC-07a | API/DB Integration | Fixture B | `priorityWeight` 1, 5 (accepted) and 0, 6, 2.5, `"3"` (400); `repeatDays` `[]`, `[0]`, `[8]`, `[1,1]`, `"Mon"` (400); `targetDistanceKm: 3` on this `WEIGHT` item (400) | As listed, each 400 naming the field; DB unchanged on each 400 |
| TEST-07a-13 | AC-07a | API/DB Integration | Fixture B; Clock 2026-11-12 | `effectiveFrom` 2026-11-12 (accepted), 2026-11-11, 2026-11-13 (400 each); `endDate` 2026-11-11 (400), 2026-11-12 (200), `"2026-13-45"` (400) | As listed; DB unchanged on each 400 |
| TEST-07a-14 | AC-07a | API/DB Integration | Fixture B | Body `{}`; non-JSON body; a JSON array; unknown fields `userId`, `userExerciseId`, `planKey`, `version`, `source`, `exercise`, `id` | 400 each; for an unknown field `fields` names it; for the empty, non-JSON and array bodies `fields` has one element with `field: "body"`; DB unchanged |
| TEST-07a-15 | AC-07a | API/DB Integration | Item whose latest version has `endDate` 2026-11-10 (ended); another item with v1 `effectiveFrom` 2026-11-20 (not started) | `PUT` `{ "priorityWeight": 4 }` on each | 400 `VALIDATION_ERROR` naming `id` each (R10); rows unchanged |
| TEST-07a-16 | AC-07a | API/DB Integration | Fixture B; versions 1 and 2 exist (v2 effective 2026-11-12) | `PUT` using the **v1** id | 200; the new row is version 3 and was built from version 2 (carries v2's values), same planKey (R7) |
| TEST-07a-17 | AC-07a | Security | Fixture B; Bob has his own item; Manager token | No token; Manager `PUT` (valid body, invalid body, non-existent id); Alice `PUT` on Bob's item id (valid and invalid body); Alice `PUT` on a non-existent UUID; on a non-UUID | 401; 403 each; 403 each with Bob's rows unchanged; 404 `NOT_FOUND`; 400 naming `id`; Bob's own request → 200 |
| TEST-07a-18 | AC-07a | API/DB Integration | An ended item (latest `endDate` 2026-11-10) | `PUT` with an invalid body (`{ "targetSets": 99 }` and `{ "foo": 1 }`) | `{ "foo": 1 }`: 400 naming `foo` (body shape comes first); `{ "targetSets": 99 }`: 400 naming `id` (R10 before merged-value validation); rows unchanged (R3 check order) |
| **TEST-07b-1** | AC-07b | API/DB Integration | Fixture B; Alice's entries (Prisma): 2026-11-09 40 reps, 2026-11-10 20 reps, 2026-11-11 none; Clock 2026-11-12 | Record `GET /api/progress/daily?date=` for every date 2026-11-02 … 2026-11-11 (the closed dates); `PUT` `{ "targetSets": 8 }` (target 80); read the same dates again | The two readings are **deep-equal** for every closed date (e.g. 11-09 `overallPercent` 100, 11-10 50, 11-11 0), including `target` 40 and the old `planItemId`; today (11-12) now shows target 80 |
| TEST-07b-2 | AC-07b | API/DB Integration | Fixture B with 100% entries on 2026-11-09, 11-10, 11-11 and 25 reps today (62.5%, below 70%); *needs F-08 `GET /api/streak`; added by the F-08 PR (issue #74)* | `GET /api/streak` → `PUT` `{ "targetSets": 5 }` → `GET /api/streak` | Before and after: `streak` 3 and `todayPending` true (the closed-days Streak is unchanged) |
| TEST-07b-3 | AC-07b | API/DB Integration | As 07b-2 but today's entry is 36 reps (90%): `streak` 4, `todayPending` false; *needs F-08* | `PUT` `{ "targetSets": 10 }` (target 100, today 36%) → `GET /api/streak` | `streak` 3 and `todayPending` true: the three **closed** days still count; only today's pending contribution moved (BR-10 "stops counting if a same-day edit lowers it below 70%"). Expected result depends on §13 OQ-2 |
| TEST-07b-4 | AC-07b | API/DB Integration | Planned history (helper): K v1 effective 2026-11-02 (40 reps), K v2 effective 2026-11-09 (50 reps, same planKey); entries on 11-05 (40 reps) and 11-10 (50 reps) | `GET /api/progress/daily` for 11-05 and 11-10; `PUT` today; the same reads again | 11-05 uses target 40 (100%), 11-10 uses target 50 (100%) before and after, identical; the new row (v3) applies only to 11-12 and later |
| TEST-07b-5 | AC-07b | API/DB Integration | Fixture B; the `GET /api/plan?date=` of every date 11-02 … 11-11 recorded | `PUT` any valid change, `PUT` `{ "endDate": "2026-11-12" }` | Every recorded date returns the same `isRestDay`, items and `planItemId` as before (R12) |
| **TEST-07c-1** | AC-07c | API/DB Integration | Fixture B | `PUT` `{ "targetSets": 5 }`; then `PUT` `{ "targetSets": 6 }` (same day) | Versions 2 and 3, both `effectiveFrom` 2026-11-12, same planKey; `GET /api/plan?date=2026-11-12` and `2026-11-13` return version 3 (target 60); `GET /api/plan-items` lists v1, v2 and v3; v1 and v2 rows unchanged after the second request |
| TEST-07c-2 | AC-07c | API/DB Integration | Rows inserted with `createHistoricalPlanItem` in the **reverse** order: version 3 first, then version 2, both `effectiveFrom` 2026-11-12, same planKey and the same `userExerciseId` (pass it to the second call, otherwise a second `UserExercise` is created) (targets 60 and 50) | `GET /api/plan?date=2026-11-12` | The returned item is version 3: ties are broken by `version`, not by insertion order or `createdAt` (R8) |
| TEST-07c-3 | AC-07c | API/DB Integration | Fixture B | Three changes on the same day | Versions 2, 3, 4 (no gap, no duplicate); the latest applies; 4 rows of K, all retained |
| TEST-07c-4 | AC-07c | API/DB Integration | Fixture B | Two `PUT`s sent concurrently (`Promise.all`) with different `targetSets` | Both 200; versions 2 and 3 (distinct); no 500; 3 rows of K; the plan returns version 3 (R13) |
| TEST-07c-5 | AC-07c | API/DB Integration | Fixture B with versions 2 and 3 from 2026-11-12; then the Clock moves to 2026-11-13 10:00 and Alice logs in again (the first token is 24 hours old) | `PUT` again; then `GET /api/plan` for 11-12 and 11-13 | Version 4 with `effectiveFrom` 2026-11-13; 11-12 still resolves to version 3, 11-13 to version 4 |
| **TEST-11 (F-07 cases)** | AC-11 | Unit | `buildNextVersion` (§4.6) and `validateTarget` | The boundary pairs of TEST-07a-9/10/11/12/13 asserted without HTTP | Accept / reject exactly as in those tests; error names field and limit |
| **TEST-22c / TEST-12a / TEST-12b (F-07 route)** | AC-22c, AC-12a, AC-12b, AC-12c | Security | Registry contains `PUT /api/plan-items/:id` | Generic registry tests: no token; Manager token; foreign id | 401; 403; 403 (the generic loops run on the new route once it is registered) |

**Coverage check.** Every AC in §7 has at least one test. Negative, boundary and role/ownership cases are included (20/21 sets, 200/201 reps, 500/500.01 kg, 10,800/10,801 s, 100/100.01 km, weight 1/5/0/6, today/yesterday/tomorrow, end date before/at today, 23:30/00:30 Bangkok). TEST-07b-2 and TEST-07b-3 need F-08's streak endpoint; they are added to this file (`tests/integration/goal_reconfig.test.ts`, the RTM path of TEST-07b) by the F-08 PR, and AC-07b is recorded as **PARTIAL** (not PASS) in RTM §3.1, with the cell saying that the Streak half is missing, until they pass. The validation and permission rows are filed under AC-07a because the RTM has no separate rejection criterion for F-07.

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
| Step | Commit type | Content | Evidence kept |
| ------ | ------ | ------ | ------ |
| 1 | `docs` | This contract v0.1.0 (spec-only), committed before any code | Commit ID |
| 2 | `test` (red) | `buildNextVersion` / boundary unit tests (TEST-11 F-07 cases) | Failing run (module absent) |
| 3 | `feat` (green) | `buildNextVersion` (merge, validation, R10) | Passing run |
| 4 | `test` (red) | TEST-07a-1 … 07a-16 and 07a-18, TEST-07b-1/4/5, TEST-07c-1 … 07c-5 against the missing route | Failing run (404 or route absent) |
| 5 | `feat` (green) | `insertNextVersion`, `PUT /api/plan-items/:id`, registry row | Passing run |
| 6 | `test` / `feat` | TEST-07a-17 and the generic AC-22c / AC-12 runs; My Plan Edit and End UI | Passing run; screenshots |
| 7 | later (F-08 PR) | TEST-07b-2 and TEST-07b-3 | Passing run after F-08 |
| 8 | PR | Reviewed by Onsinee into `staging/sprint-2` | Review comment with a specific check |

--------------------------------------------------------------------------------

#### 10. Definition of Done for F-07
| # | Criterion | Evidence required |
| ------ | ------ | ------ |
| 1 | Contract reviewed and approved by Onsinee before implementation | Review comment; commit order |
| 2 | `PUT /api/plan-items/:id`, the validation rules, the new-version insert and the policy row implemented as specified | Code on `staging/sprint-2`; matches §4 |
| 3 | **No migration and no schema change**; `PlanItem` rows are never updated in place (a test reads the old row back unchanged) | `git diff` shows no change under `prisma/`; TEST-07a-1 output |
| 4 | `resolvePlan` / `resolveItems` unchanged; same-day tie decided by `version` | Diff shows `server/domain/planResolution.ts` untouched; TEST-07c-2 output |
| 5 | At the F-07 merge: all tests in §8 except TEST-07b-2/07b-3 implemented and enabled (none skipped); at the F-08 merge: TEST-07b-2/07b-3 too | Test names match STS IDs |
| 6 | Tests executed on the merge commit of each of the two PRs with counts; AC-07b is PARTIAL in RTM §3.1 between them | Passed / failed / skipped counts |
| 7 | TDD red/green evidence for AC-07a (new version), AC-07b (past days identical) and AC-07c (same-day order) | Failing and passing runs with commit IDs |
| 8 | The route is in the Endpoint Access Matrix run (AC-12c, AC-22c) | Integration output |
| 9 | My Plan Edit and End with the two confirmations works; field errors shown | Screenshots with the app version |
| 10 | Teammate-reviewed PR with a substantive comment; integrated on staging | PR link, reviewer, comment |
| 11 | RTM §3.1 updated (actual test names, result, commit) for AC-07a–c; §12 pending items resolved or logged; contract-approval-register row added | Updated register |
| 12 | Open questions of §13 answered or carried forward; limitations disclosed | §13 updated |

--------------------------------------------------------------------------------

#### 11. Dependencies on Other Contracts
| Item | Provided to / needed from | Note |
| ------ | ------ | ------ |
| `PlanItem` columns, `planKey` / `version`, `resolvePlan` / `resolveItems`, `validateTarget`, `GET /api/plan-items*`, `findPlanItemOwner` | Needed from F-03 | F-03 R15 and §11 already reserve "new row for the same `planKey` with `version + 1`" for F-07; the resolution rule R12 is unchanged |
| Entries keyed by `userExerciseId`; Quick Complete reads the plan for today | Needed from F-04 | A new version does not orphan entries (R11); Quick Complete uses the version in force |
| `GET /api/progress/daily` (scores from the version of each date, F-06 R12) | Needed from F-06 | Used to observe AC-07a and AC-07b |
| Plan version rows and `resolvePlan` per date | Provided to F-08 | History and Streak resolve the plan for each date through the same function, so a change today cannot rewrite past days (AC-07b); TEST-07b-2/07b-3 live with F-08 |
| Entry edit and delete (F-05, 0.1.1) | Needed from F-05 | Today's entries can now be edited or deleted, so today's percentage can move without a goal change; it does not change how versions are chosen. F-04 contract row 0.3.2 is the matching baseline note |
| Versions in the schedule view | Provided to F-09 (Sprint 3) | |
| Route policy registry, `requireRole`, error envelope, Clock | Needed from F-01 | |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
These items are **proposals for the lead to apply**; this contract does not edit the RTM, SDS, SRS or plan.

| # | Pending item | Baseline document(s) affected | Status |
| ------ | ------ | ------ | ------ |
| P7-1 | RTM §3.1 rows AC-07a–c: record actual test names, results and commits when implemented; TEST-07b-2/07b-3 are added by the F-08 PR | RTM | Pending (implementation) |
| P7-2 | SDS §5.2 already lists `PUT /api/plan-items/:id` (F-07) and §6.1 already has "Change a plan item (new version)"; no catalogue change needed | SDS | None needed |
| P7-3 | A one-line SRS clarification (Q-style) that "End" is `endDate` on a new version and that `endDate` is the last occurring day (R9), if the reviewers confirm OQ-3 | SRS | Pending review |
| P7-4 | Rows for F-07 in `contract-approval-register.md` | Register | Pending |
| P7-5 | UI spec §5 "Edit Plan Item" bullet: the confirmation texts and the not-started message of §6 | UI spec | Pending review |
| P7-6 | RTM revision row that rewords AC-07b: "... and the Streak counted from closed days is unchanged; today's contribution follows Q19". SRS Q19 already says today stops counting if a same-day edit lowers it below 70% and SDS §3.3's last sentence stays true, so this is a wording clarification of AC-07b, not a new decision (reviewer's reading, PR #107 review) | RTM | Applied in RTM 1.1.27 (issue #87, see 0.1.4) |

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
Open questions are **not decided** by this contract; the rules marked "needs review" in §3.2 implement the provisional answer given here.

| # | Item | Provisional position |
| ------ | ------ | ------ |
| OQ-1 | **Editing an item that has not started yet.** SDS §3.3 chooses the version with the greatest `effectiveFrom` ≤ the date. If the latest version starts after today (a goal created for a future date, F-03 R9 allows it), a new version with `effectiveFrom` = today would apply from today, so the item would **start early** with the new values, and from its original start date the older row wins again and the edit is lost (R10) | R10 rejects the edit (400, field `id`) until the item starts; the reviewer agreed to keep the 400 for Sprint 2. Consequences: there is no DELETE in any sprint (SDS §5.2), so a Participant who mistypes a goal that starts next week cannot correct it until the start date; the UI says when it starts (§6). Alternative (not wanted this sprint): allow it with `effectiveFrom` = the latest version's `effectiveFrom` (the tie rule then makes the new version win); this contradicts the literal "`effectiveFrom` = today" of AC-07a and needs a baseline decision |
| OQ-2 | **AC-07b says "the Streak value is unchanged"**, but BR-10 / Q19 count **today** as soon as it reaches 70% and stop counting it if a same-day edit lowers it. A change today can therefore lower today's percentage and the displayed Streak by 1 | This contract reads AC-07b as "the Streak contributed by **closed** days is unchanged" (TEST-07b-2: unchanged; TEST-07b-3: only today's contribution moves). The author (Nakagamon) agreed to this reading on 23 Nov 2026 and the reviewer (Onsinee) confirmed it in the reviewer's review of PR #107: SRS Q19 already says today stops counting if a same-day edit lowers it, so this is the baseline. **Closed**; the AC-07b wording is clarified by P7-6 (a revision row, not an overwrite) |
| OQ-3 | **End cannot remove today.** `endDate` must not precede `effectiveFrom` = today (Q21), so the item still occurs today and counts in today's denominator | R9: `endDate` = last day of occurrence; the UI text says it stays through today. Allowing `endDate` = yesterday would change Q21 |
| OQ-4 | **`:id` of an old version, and ended items.** R7 accepts any version's id and builds from the latest; R10 rejects an ended item, so `endDate: null` cannot be used to resume an ended item | A Participant who ended an item by mistake adds it again through F-03 (accepted by the reviewer). This starts a new `planKey`, so the history of that exercise is split across two plan keys |
| OQ-5 | **Identical values still create a version** (R14); a Participant who saves twice grows the history | Accepted; no functional effect on resolution |
| 6 | The same-day double edit needs **no** open question: the existing resolution orders equal `effectiveFrom` by `version` (§5) | Verified by reading `server/domain/planResolution.ts`; TEST-07c-2 will assert it |
| 7 | Today's already logged entries are scored against the new target (R11): lowering a target today can raise today's percentage and raising it can lower it | By design (BR-11 "recalculating current-day … scores immediately") |
| 8 | Concurrency (TEST-07c-4) relies on locking the `UserExercise` row; one `UserExercise` backs one plan item in the current model (F-03 creates them together) | If a future feature shares an exercise between plan items the lock scope must be revisited |
| 9 | The UI of F-07 has no RTM test (§6) | Manual review evidence only; no automated UI result is claimed |
