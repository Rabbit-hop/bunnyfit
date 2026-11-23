### Feature Engineering Contract: F-05 Same-Day Entry Modification and Deletion
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-05
**Sprint:**  2 (scope moved from Sprint 1 as CHANGE-01; depends on F-04)
**Contract Version:**  0.1.1
**SRS Baseline Version:**  1.1.0 (Feature Inventory 1.1.0, RTM 1.1.10 register, System-Level SDS 1.1.1, F-04 contract 0.3.1)
**Date:**  23 November 2026
**Status:**  Draft (v0.1.1 revises v0.1.0 after the PR #106 review; review pending; must be approved before implementation)
**Primary Author:**  Nakagamon  |  **Reviewer:**  Onsinee
**Repository Path:**  `docs/sprints/sprint-2/F-05-entry-modification.md`

--------------------------------------------------------------------------------

#### Contract Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.1** | 23 Nov 2026 | Review fixes (PR #106, Onsinee): R8 re-reads the entry inside the lock (404 if it vanished); edit form uses Sets and Total reps (non-divisible entries); F-04 revision row 0.3.2 added in this PR; TEST-05a-4/5 arithmetic, TEST-23-6/7 fixtures, R10 exception (F-04 R12), wording for any non-today `logDate`, card must be expanded; reviewer answers recorded (§12); `updatedAt` deviation as pending baseline item (§13) | Nakagamon | Draft |
| **0.1.0** | 23 Nov 2026 | Initial contract: `PUT` and `DELETE /api/entries/:id`, rules R1-R14, AC-05a-c and AC-18a-b with STS, the third AC-23 case (editing an old entry), access matrix rows, route policies, Definition of Done, open questions (issue #66, Part 3) | Nakagamon | Draft |

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
F-05 lets a Participant **correct a mistake made today**: a ledger entry created on the current Asia/Bangkok date can be edited (its measured values) or deleted. Any entry from an earlier date is rejected with HTTP 409 `ENTRY_NOT_EDITABLE` (BR-09, SRS Q28), which keeps the history that F-06, F-08 and the Streak read stable. Scores, cumulative totals and the Quick Complete difference are **derived on read** (SDS §3.4), so an edit or delete needs no recalculation step beyond the next read.

| In scope | Out of scope (and where it belongs) |
| ------ | ------ |
| `PUT /api/entries/:id` (replace the measured values of an entry created today) | Creating entries, Quick Complete, day listing (F-04, unchanged) |
| `DELETE /api/entries/:id` (remove an entry created today) | Editing or deleting an entry of an earlier date (never allowed, BR-09) |
| 409 `ENTRY_NOT_EDITABLE`, ownership 403 / 404, re-applied validation including the daily cumulative limit | Changing an entry's owner, `logDate`, exercise or `kind` (rejected, AC-18b, R6) |
| Effect on cumulative totals, Quick Complete difference and derived scores (read-side only) | Score, percentage and Streak formulas (F-06, F-08) |
| Today screen: edit and delete icons on today's entries, notice for `ENTRY_NOT_EDITABLE` (S-02) | History screen and past-day views (F-08, read-only) |
| The third AC-23 case (editing an old entry) in `tests/e2e/validation_feedback.spec.ts` | Calories (F-11, derived on read from the same entries) |

--------------------------------------------------------------------------------

#### 2. Linked Requirements and Dependencies
| Item | Reference |
| ------ | ------ |
| Requirements | FR-04 (edit part), BR-09; NFR-03 (AC-23 third case); BR-01, BR-02, BR-04, BR-05, BR-06 as constraints |
| SRS decisions | Q20 (limits per entry and per day), Q28 (409 not 403), Q29 (injectable Clock), Q46 (read past dates, write today only) |
| Acceptance criteria | AC-05a, AC-05b, AC-05c, AC-18a, AC-18b; AC-23 (third case); shared: AC-11 (boundaries), AC-12a-c and AC-22c (Endpoint Access Matrix) |
| Depends on | F-04 (ledger, validation module, cumulative sums, row lock R14), F-01 (registry, `requireRole`, error envelope, Clock), F-03 (`UserExercise`) |
| Consumed by | F-06 (scores recomputed on read), F-08 (History and Streak read the entries; today's edit can change today's result only), F-11 (calories derived on read) |
| Test files (RTM) | `tests/integration/entry_modification.test.ts` (AC-05a-c, AC-18a-b); `tests/e2e/validation_feedback.spec.ts` (AC-23) |

--------------------------------------------------------------------------------

#### 3. Feature Design (Feature-Level SDS)
##### 3.1 Behavior and Workflow
1. The Participant opens **Today** (S-02). Each exercise card has an "Entries" ledger that appears when the card is expanded (`item-entries`, F-04, ui-spec S-02). For every entry whose `logDate` equals the Today date the row shows an **edit** and a **delete** icon.
2. **Edit:** the icon opens the log form (S-03) in **edit mode**, pre-filled with the entry's stored values (for reps modes the fields are **Sets** and **Total reps**, see §6, because a stored entry need not be `sets × reps per set`), titled for editing. Save calls `PUT /api/entries/:id`; on 200 the card, the entry list and the daily progress panel reload from the server.
3. **Delete:** the icon asks for confirmation, then calls `DELETE /api/entries/:id`; on 204 the same reload happens.
4. If the server answers 409 `ENTRY_NOT_EDITABLE` (for example the page stayed open past midnight), the UI shows the notice of §6 and reloads Today; nothing is changed.

```mermaid
sequenceDiagram
  participant P as Participant UI
  participant A as API
  participant D as PostgreSQL
  P->>A: PUT /api/entries/:id {sets, totalReps}
  A->>A: authenticate, role=PARTICIPANT, validate :id format
  A->>D: load entry (404 if absent), owner = caller? (403 if not)
  A->>A: validate body (R4-R6 of F-04, no immutable field)
  A->>D: BEGIN; lock UserExercise row FOR UPDATE (by the pre-read userExerciseId)
  A->>D: RE-READ the entry inside the lock (gone: 404)
  A->>A: entry.logDate == Clock today (Asia/Bangkok)? else 409
  A->>D: SUM of the day's other entries; check cumulative limits
  A->>D: UPDATE LedgerEntry values; COMMIT
  A-->>P: 200 {entry, cumulative}
```

##### 3.2 Business Rules
Numeric limits are **not repeated here**: the validation module of F-04 (rules R4, R5 and R6 of `docs/sprints/sprint-1/F-04-daily-logging.md`, SRS Q20, BR-02) is the single source and is reused, so the limits cannot drift between create and edit.

| ID | Rule | Status |
| ------ | ------ | ------ |
| R1 | Only role `PARTICIPANT` may use F-05 routes; Manager → 403. Authorization is checked before ownership and validation | Baseline (BR-04), SDS §6.2 |
| R2 | **Order of checks** (SDS §6.2): 401 → role 403 → malformed `:id` 400 `VALIDATION_ERROR` → load entry: unknown id 404 `NOT_FOUND`, another Participant's entry 403 `FORBIDDEN` (nothing of the entry is returned) → body validation 400 `VALIDATION_ERROR` (PUT only) → editable check 409 `ENTRY_NOT_EDITABLE` and cumulative check 400 inside the locked transaction. A foreign id is **403, not 404**, exactly as `GET /api/entries/:id` in F-04 (§3.3, §3.4) | Baseline BR-04; consistent with F-04 |
| R3 | **Editable = created today.** An entry is editable or deletable only if its `logDate` equals the current Asia/Bangkok calendar date read from the injectable Clock at request time (F-04 R3 stores `logDate` = creation date, so `logDate` is the creation date). Otherwise (an earlier **or a later** `logDate`) 409 `ENTRY_NOT_EDITABLE`, the row is unchanged. The code is 409, not 403 and not 400, so it stays distinct from authorization failures (SRS Q28) | Baseline BR-09 / Q28 / Q29 |
| R4 | `PUT` replaces the entry's measured values with exactly the fields of the exercise's `trackingMode` (the F-04 R4 field table; fields of another mode are rejected). It is a full replacement of those fields, not a patch: the same body that `POST /api/entries` accepts without `userExerciseId` and `logDate` | Design decision |
| R5 | **Validation is re-applied** with the shared F-04 module: the per-entry limit (F-04 R5) on the new values and the **daily cumulative limit** (F-04 R6) computed as the sum of the same exercise's other entries of the day **excluding this entry's old values** plus the new values. A violation → 400 `VALIDATION_ERROR` naming the field and limit; the entry is unchanged. The new values therefore cannot raise the cumulative above the limit that `POST` would also refuse | Baseline Q20 / AC-18b (AC-11) |
| R6 | **Immutable fields (AC-18b):** `id`, `userId`, `userExerciseId`, `logDate`, `kind` and `createdAt` cannot be changed. A body that contains any of them (also with an unchanged value) is rejected with 400 `VALIDATION_ERROR` naming the field, like an unknown field in F-04 (R2, R3); the entry is unchanged. The owner is always the authenticated Participant. `kind` of an edited Quick Complete entry stays `QUICK_COMPLETE` | Baseline AC-18b; design decision for `userExerciseId` / `kind` (Open question 2) |
| R7 | `DELETE` removes exactly one row. It needs no body and no validation of values. Deleting an unknown or already deleted id → 404 `NOT_FOUND` (not an idempotent 204) | Design decision |
| R8 | `PUT` and `DELETE` run in one transaction that locks the `UserExercise` row (`SELECT … FOR UPDATE`) **before** reading the sums, like F-04 R14, so an edit cannot race with a Quick Complete or another entry and exceed a limit. The ownership lookup of R2 reads the entry **outside** the lock, so inside the lock the entry is **re-read**; if it no longer exists (a concurrent `DELETE` won) the request returns 404 `NOT_FOUND` and nothing is changed (never an unhandled database error / 500). Locking by the pre-read `userExerciseId` is safe because R6 makes `userExerciseId` immutable. The editable check (R3) and the cumulative check use the re-read row | Reuses F-04 R14; review finding 1 |
| R9 | **Derived values are computed on read.** Nothing is stored or updated except the edited `LedgerEntry` columns: the cumulative total (F-04 R7), item score, Daily Overall Progress (F-06), Streak (F-08) and calories (F-11) of today change on the next read. Past days are unaffected because past entries cannot be edited | Baseline SDS §3.4 / BR-06 |
| R10 | **Effect on Quick Complete (F-04 R9-R11):** the difference is recomputed from the entries as they are after the edit or delete. After a delete or a downward edit an exercise that was at or above its target can accept Quick Complete again (the No-op becomes a normal 201), **except** when the remaining target is unreachable under F-04 R12 (no entry satisfies R5 and R6 together), which still returns 400 `VALIDATION_ERROR` naming `sets`; after an upward edit to the target or beyond, the next Quick Complete is the No-op 200 `entry: null`. F-05 does not touch Quick Complete code | Baseline BR-05 / BR-06 |
| R11 | Entries made on a Rest Day or for an exercise that is not planned today (F-04 R13) are editable and deletable under the same rules; they stay unscored | Baseline Decision 4 / Q24 |
| R12 | An entry can be edited or deleted any number of times while it is today's. Every successful call is the only change; no history row of the old values is kept (Known limitation 2) | Design decision |
| R13 | The error body never contains a stack trace, SQL, token, or another user's data; an `ENTRY_NOT_EDITABLE` body may state only that the entry's date is not today | Baseline SDS §5.1 |
| R14 | Business rules are enforced server-side. The UI hides the icons of old entries, but the server rejects a forced request (R3) | Baseline SDS §2.4 |

##### 3.3 Failure and Boundary Cases
Clock "today" is **2026-11-05 10:00 Asia/Bangkok** unless stated. "Today's entry" has `logDate` 2026-11-05; "old entry" has `logDate` 2026-11-04.

| Case | Expected behavior |
| ------ | ------ |
| `PUT` of today's own entry with valid values | 200 `{ entry, cumulative }`; values replaced; `id`, `logDate`, `kind`, `createdAt`, `userExerciseId` unchanged |
| `DELETE` of today's own entry | 204, empty body; the row is gone; cumulative reduced |
| `PUT` / `DELETE` of an old entry (yesterday, or any earlier date) | 409 `ENTRY_NOT_EDITABLE`; row unchanged |
| `PUT` / `DELETE` of an entry dated tomorrow (only reachable by direct seed insert) | 409 `ENTRY_NOT_EDITABLE` (editable means `logDate` equals today) |
| Edit at 2026-11-05 23:59:59 / at 2026-11-06 00:00:00 Asia/Bangkok, entry `logDate` 2026-11-05 | 200 / 409 `ENTRY_NOT_EDITABLE` (AC-18a) |
| Delete at 23:59:59 / at 00:00:00 of the next day | 204 / 409 |
| Another Participant's entry (today's or old) | 403 `FORBIDDEN`; no data in the body; row unchanged. An old foreign entry is 403, not 409 (ownership is checked first) |
| Well-formed id that does not exist; second `DELETE` of the same id | 404 `NOT_FOUND` |
| Malformed `:id` (not a UUID) | 400 `VALIDATION_ERROR` |
| Manager, any F-05 route, even with an invalid body or an unknown id | 403 `FORBIDDEN` |
| No token / expired / revoked | 401 `UNAUTHENTICATED` |
| Body with `userId`, `logDate`, `userExerciseId`, `kind`, `id` or `createdAt` | 400 `VALIDATION_ERROR` naming the field; unchanged (AC-18b) |
| Body with a field of another mode, an unknown field, a missing required field, or an empty body | 400 `VALIDATION_ERROR` naming the field; unchanged |
| New values violate the per-entry or daily cumulative limit of F-04 (R5, R6), for example today's other entries already fill the cumulative and this entry is raised above it | 400 `VALIDATION_ERROR` naming the field and the limit; unchanged |
| New values that are valid only because the entry's own old values are excluded from the sum | 200 (the old value is replaced, not added) |
| Old entry **and** invalid body | 400 (body validation runs before the editable check, R2); the old entry is unchanged either way |
| Delete the entry that made an exercise reach its target, then Quick Complete | 201 with the missing difference (R10) |
| Edit an entry upward so the sum reaches the target, then Quick Complete | 200 `entry: null` (R10) |
| Edit of a Quick Complete entry | 200; `kind` remains `QUICK_COMPLETE` |
| `PUT` / `DELETE` whose entry is deleted by a concurrent request between the ownership lookup and the lock | 404 `NOT_FOUND` (R8); no 500 |
| Two requests (edit and Quick Complete) on one exercise at the same time | Serialized by the row lock (R8); the cumulative never exceeds a limit |

##### 3.4 Permissions
| Operation | Unauthenticated | Manager | Participant |
| ------ | ------ | ------ | ------ |
| `PUT /api/entries/:id` | 401 | 403 | Allow if owner **and** the entry was created today (else 409); another Participant's entry → 403 |
| `DELETE /api/entries/:id` | 401 | 403 | Allow if owner **and** the entry was created today (else 409); another Participant's entry → 403 |

This is the row "Edit / delete entry" of the SDS §6.1 matrix, unchanged.

--------------------------------------------------------------------------------

#### 4. API Specification
Conventions follow SDS §5.1 (JSON, error envelope of SRS Appendix A.5 `{ code, message, fields }`, dates `YYYY-MM-DD`, decimals as JSON numbers).

##### 4.1 Endpoints
| Endpoint | Roles | Success | Errors |
| ------ | ------ | ------ | ------ |
| `PUT /api/entries/:id` | Participant (owner) | 200 `{ entry, cumulative }` | 400 (`VALIDATION_ERROR`), 401, 403, 404, 409 (`ENTRY_NOT_EDITABLE`) |
| `DELETE /api/entries/:id` | Participant (owner) | 204, no body | 400 (malformed id), 401, 403, 404, 409 (`ENTRY_NOT_EDITABLE`) |

##### 4.2 `PUT /api/entries/:id`
Request: the measured fields of the entry's mode only (F-04 R4); no other field.
```json
{ "sets": 2, "totalReps": 25 }
```
```json
{ "durationSec": 900 }
```
```json
{ "distanceKm": 4.5 }
```
Response `200` (same entry shape and `cumulative` block as `POST /api/entries` in F-04 §4.2; `cumulative` is for the entry's exercise and date and already contains the new values):
```json
{
  "entry": {
    "id": "uuid", "userExerciseId": "uuid", "logDate": "2026-11-05",
    "sets": 2, "totalReps": 25, "durationSec": null, "distanceKm": null,
    "kind": "MANUAL", "createdAt": "2026-11-05T03:00:00.000Z"
  },
  "cumulative": { "userExerciseId": "uuid", "sets": 3, "totalReps": 33, "durationSec": 0, "distanceKm": 0 }
}
```
The response never includes `userId`.

##### 4.3 `DELETE /api/entries/:id`
No request body. Response `204` with an empty body. A client reloads `GET /api/entries?date=today` or `GET /api/progress/daily` for the new totals.

##### 4.4 Error examples
```json
{ "code": "ENTRY_NOT_EDITABLE", "message": "Only entries dated today can be edited or deleted.", "fields": [] }
```
```json
{ "code": "VALIDATION_ERROR", "message": "Invalid entry values.", "fields": [{ "field": "totalReps", "limit": "cumulative totalReps for the day must not exceed the limit of F-04 R6" }] }
```
The exact `limit` text comes from the shared validation module (it names the same field and limit as `POST /api/entries`).

##### 4.5 Route Policies (registered in the F-01 registry)
Both routes: `featureId: 'F-05'`, `auth: 'required'`, `roles: ['PARTICIPANT']`, ownership `resource-owner` (owner lookup = `LedgerEntry.userId`, 403 for another owner, 404 for an unknown id). Registry rows in the format of the Sprint 1 API spec:

| Method | Path | Feature | Sprint | Auth | Roles | Ownership |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| PUT | `/api/entries/:id` | F-05 | S2 | required | Participant | resource-owner |
| DELETE | `/api/entries/:id` | F-05 | S2 | required | Participant | resource-owner |

##### 4.6 Endpoint Access Matrix rows (AC-12c / AC-22c)
| Endpoint | No token | Manager | Participant, own entry | Participant, other's entry |
| ------ | ------ | ------ | ------ | ------ |
| `PUT /api/entries/:id` | 401 | 403 | 200 (today's entry) / 409 (earlier date) | 403 |
| `DELETE /api/entries/:id` | 401 | 403 | 204 (today's entry) / 409 (earlier date) | 403 |

The generic registry loops (TEST-22c-1, TEST-22c-2 in `tests/integration/security_access.test.ts`) fail if either route lacks a policy or a matrix entry; F-05 adds dedicated cases in §8 (TEST-05c-4).

--------------------------------------------------------------------------------

#### 5. Data Specification
**No schema, migration or seed change** is required. Checked against `prisma/schema.prisma` (model `LedgerEntry`) and SDS §3.2:

- `LedgerEntry` already holds every field PUT changes (`sets`, `totalReps`, `durationSec`, `distanceKm`) and the fields it must keep (`id`, `userId`, `userExerciseId`, `logDate`, `kind`, `createdAt`). The composite foreign key (`userExerciseId`, `userId`) keeps the owner consistent with the exercise's owner. The F-04 CHECK constraints (value ranges, `totalReps ≤ sets × 200`, exactly one measurement group) also apply to `UPDATE`, so they stay a safety net for edits.
- `onDelete: Restrict` concerns the parent rows; deleting a `LedgerEntry` is unconstrained.
- No new table, no stored aggregate (R9). `WeightLog` is not touched and stays append-only. `PlanItem` rows are not touched (invariant: never updated in place). `UserExercise.sourceTemplateId` has no FK and is not touched.
- `LedgerEntry` has no `updatedAt` column although SDS §3.2 says `updatedAt` exists "where rows can change". The contract does not add one, because no AC reads it (Open question 1).
- Seed (`prisma/seed.ts`): not changed. Tests insert dated entries (and rows needed for ownership cases) directly with Prisma in the test setup, as the SRS Assumption 4 / Q29 allow.

--------------------------------------------------------------------------------

#### 6. UI Specification
Screens and names are those of `docs/sprints/sprint-1/ui-spec.md` (S-02 Today, S-03 Log Entry modal, test ids `item-<userExerciseId>`, `item-entries`, `history-list`). The ui-spec itself is updated by the lead after this contract is approved (it still says "Ledger read-only" for Sprint 1).

| Element | Behavior |
| ------ | ------ |
| Entry row in **Today** | In `item-entries` of every card (also of cards kept behind the **History** button, `history-list`, which holds completed items), (the card must be expanded to show `item-entries`) each entry whose `logDate` equals the Today date shows two icon buttons: edit (`entry-edit`) and delete (`entry-delete`). Entries with an earlier `logDate` never show them (the Today screen lists today only, so this is a guard, not the main path) |
| Edit | Opens the S-03 modal in **edit mode**, titled "Edit activity - {exercise}", pre-filled with the stored values; the exercise and date are not editable. Create mode is unchanged (Sets and Reps per set, sending `totalReps = sets × repsPerSet`). In edit mode the reps modes show **Sets** (`entry-edit-sets`) and **Total reps** (`entry-edit-total-reps`) and the `PUT` body is `{ sets, totalReps }`, so an entry whose `totalReps` is not divisible by `sets` (for example 2 sets / 25 reps, or the Quick Complete entry 4 sets / 799 reps of F-04 R12) is shown and saved exactly as stored. Seconds and km modes use the same single field as create mode. Errors for `totalReps` appear under Total reps Submit disabled while saving; on 200 the modal closes and Today reloads |
| Delete | Confirmation "Delete this entry?" with Cancel and Delete; on 204 Today reloads. A card whose ratio falls below 1 returns from the History list to "Today's activities" because the lists are derived from the reloaded progress response |
| States | Saving; success notice ("Entry updated" / "Entry deleted"); the totals, progress bar, Quick Complete state and overall percent refresh from the server after every change |
| Errors (NFR-03, AC-23) | `ENTRY_NOT_EDITABLE`: notice "Only today's entries can be edited or deleted; this entry is not from today." (names the reason), then Today reloads. `400 VALIDATION_ERROR`: error notice naming the field and limit, next to the field, values kept (as in F-04 §6). `403`: access-denied screen; `401`: back to Login; `404`: notice "This entry no longer exists" and reload |
| Manager | No Today screen; opening the URL redirects to the access-denied screen (unchanged) |

Test ids added: `entry-edit`, `entry-delete`, `entry-edit-form`, `entry-edit-sets`, `entry-edit-total-reps`, `entry-delete-confirm`, `entry-notice` (exact names may be adapted by the implementer if the ui-spec is updated in the same PR; the E2E case below refers to the roles of the elements, not only to the ids).

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
AC text is identical in ID and meaning to the RTM (`docs/traceability.md`); the third column adds the concrete endpoints and fields.

| AC | RTM wording | Observable outcome |
| ------ | ------ | ------ |
| **AC-05a** | Editing the Participant's own entry created today → 200; the cumulative sum and score are recalculated. | `PUT /api/entries/:id` on own entry of today → 200 with the updated entry; `cumulative` equals the sum after the replacement; `GET /api/entries` and `GET /api/progress/daily` show the new totals and score (derived on read) |
| **AC-05b** | Deleting the Participant's own entry created today → 204; the cumulative sum and score are recalculated. | `DELETE /api/entries/:id` → 204 with an empty body; the row is gone; cumulative and score reflect the deletion |
| **AC-05c** | Editing or deleting an entry from a previous day → 409 `ENTRY_NOT_EDITABLE`; data is unchanged. | `PUT` and `DELETE` of an own entry with an earlier `logDate` → 409 `ENTRY_NOT_EDITABLE`; the row and the totals are identical before and after |
| **AC-18a** | An entry edited at 23:59:59 succeeds; the same edit at 00:00:00 of the next day is rejected (injectable clock). | Clock at 2026-11-05 23:59:59 Asia/Bangkok: `PUT` of an entry dated 2026-11-05 → 200; Clock at 2026-11-06 00:00:00: the same `PUT` → 409 `ENTRY_NOT_EDITABLE` |
| **AC-18b** | Edited values must pass AC-11, and the owner or `logDate` of an entry cannot be changed. | Edited values outside the F-04 limits (per entry and daily cumulative) → 400 `VALIDATION_ERROR` naming field and limit; a body with `userId`, `logDate` (or `userExerciseId`, `kind`) → 400; the stored owner and `logDate` are unchanged |
| **AC-23 (third case)** | The UI shows error notices naming the field and limit in at least 3 cases: sets 21, Quick Complete disabled on a Rest Day, editing an old entry. | Editing an old entry shows the `ENTRY_NOT_EDITABLE` notice and changes nothing (§8, TEST-23-5, TEST-23-6). The first two cases are F-04's (TEST-23-1, TEST-23-3) |

**Shared AC.** AC-11 (boundaries) is the rule reused by AC-18b. AC-12a/b/c and AC-22c (Endpoint Access Matrix): the two routes are in the registry (§4.5-4.6). AC-06 and AC-14a are re-read after an edit (TEST-05a-3). AC-23 stays INCOMPLETE in the RTM until TEST-23-5 and TEST-23-6 run (see §10).

--------------------------------------------------------------------------------

#### 8. Software Test Specification (STS)
Files: `tests/integration/entry_modification.test.ts` (AC-05a-c, AC-18a-b); `tests/e2e/validation_feedback.spec.ts` (AC-23). Test IDs use the AC suffix (RTM: TEST-05a-c, TEST-18a-b; sub-numbers as in F-04). Fixtures: seeded Manager, Alice and Bob; Alice's plan created through F-03 (for example *Squat* `WEIGHT` target 4 × 10 = 40 reps, *Plank* `BODYWEIGHT_TIME` 120 s, *Outdoor Run* `CARDIO_DISTANCE` 5 km); real PostgreSQL test database; injectable Clock fixed at **Thu 5 Nov 2026 10:00 Asia/Bangkok** unless stated; **dated seed rows**: old entries (`logDate` 2026-11-04) are inserted directly with Prisma, because `POST` refuses a non-today date. "DB unchanged" means the rows and contents of `LedgerEntry` are equal to their values before the request.

| Test ID | AC | Level | Precondition / Input | Action | Expected result |
|---|---|---|---|---|---|
| `TEST-05a-1` | AC-05a | API/DB Integration | Alice logged 2 sets / 20 reps and 1 set / 8 reps for Squat today (two entries) | `PUT /api/entries/<first id>` `{ sets: 2, totalReps: 25 }` | 200; `entry` has the new values and the same `id`, `logDate`, `kind`, `createdAt`; `cumulative` = 3 sets / 33 reps; one row changed, the other unchanged |
| `TEST-05a-2` | AC-05a | API/DB Integration | One entry per mode today (reps, Plank 60 s, Outdoor Run 2.5 km) | `PUT` with `durationSec` 90 for Plank and `distanceKm` 3.25 for the run | 200 each; cumulative 90 s and 3.25 km (exact decimal) |
| `TEST-05a-3` | AC-05a | API/DB Integration | Squat entries 1 set / 10 reps today; target 40 reps | `GET /api/progress/daily`; `PUT` the entry to 4 sets / 40 reps; `GET /api/progress/daily` again | Score and ratio before reflect 10 of 40; after the PUT ratio 1.0 and item score recomputed; nothing stored apart from the entry (the only changed row is the entry) |
| `TEST-05a-4` | AC-05a | API/DB Integration | Squat target 4 sets × 10 = 40 reps; one entry today: 4 sets / 40 reps (target reached) | `PUT` the entry to 1 set / 10 reps; then Quick Complete | 200; then 201: remaining reps = 40 − 10 = 30; `sets = max(1, 4 − 1) = 3`, raised to `ceil(30 ÷ 200) = 1` only if larger, so 3; entry 3 sets / 30 reps (F-04 R9); cumulative 4 sets / 40 reps |
| `TEST-05a-5` | AC-05a | API/DB Integration | Squat target 4 × 10 = 40 reps; two entries today: 4 sets / 30 reps and 1 set / 10 reps (cumulative 5 sets / 40 reps, target reached) | `PUT` the 10-rep entry to 1 set / 15 reps (cumulative 45 reps, above the target); then Quick Complete | 200; then 200 `entry: null` (remaining = max(0, 40 − 45) = 0, F-04 R10); no row added |
| `TEST-05a-6` | AC-05a | API/DB Integration | Rest Day fixture (Carol-style, F-04 TEST-04b-2) with a free-form entry today | `PUT` valid new values | 200; entry updated; still excluded from scores (asserted via `GET /api/progress/daily`: `isRestDay` true, `items` `[]`, `overallPercent` null; matches F-06 R6 and TEST-06e-2) |
| `TEST-05b-1` | AC-05b | API/DB Integration | Two Squat entries today (3 sets / 28 reps) | `DELETE /api/entries/<id of the second>` | 204; empty body; one row remains; `GET /api/entries` cumulative reduced accordingly |
| `TEST-05b-2` | AC-05b | API/DB Integration | One entry that reached the target today | `DELETE` it; `GET /api/progress/daily`; Quick Complete | 204; item ratio back to 0 and score recomputed; Quick Complete creates the full target entry (201) |
| `TEST-05b-3` | AC-05b | API/DB Integration | Same | `DELETE` the same id again | 404 `NOT_FOUND`; no other row affected |
| `TEST-05b-4` | AC-05b | API/DB Integration | Bob has his own entries today | Alice deletes her entry | Only Alice's row removed; Bob's rows and cumulative unchanged |
| `TEST-05c-1` | AC-05c | API/DB Integration | Alice has an old entry (`logDate` 2026-11-04, seeded) | `PUT /api/entries/<old id>` with valid values | 409 `ENTRY_NOT_EDITABLE`; DB unchanged |
| `TEST-05c-2` | AC-05c | API/DB Integration | Same | `DELETE /api/entries/<old id>` | 409 `ENTRY_NOT_EDITABLE`; row still present; cumulative of 2026-11-04 (`GET /api/entries?date=2026-11-04`) unchanged |
| `TEST-05c-3` | AC-05c | API/DB Integration | Old entries dated 2026-11-04 and 2025-01-01, and an entry dated 2026-11-06 (tomorrow, seeded) | `PUT` and `DELETE` each | 409 each (editable means `logDate` = today); DB unchanged |
| `TEST-05c-4` | AC-05c | Security | Alice and Bob each own an old and a today's entry; Manager token | Alice `PUT`/`DELETE` Bob's today's and old entries; Manager `PUT`/`DELETE` (valid and invalid body, existing and unknown id); no token; Alice with an unknown well-formed id; with a malformed id | Alice → 403 for both of Bob's entries (an old foreign entry is 403, not 409), no data in body, Bob's rows unchanged; Manager → 403 each; no token → 401; unknown id → 404; malformed id → 400 |
| `TEST-05c-5` | AC-05c | API/DB Integration | Old entry and invalid body (`sets` 21) | `PUT` the old entry | 400 `VALIDATION_ERROR` (validation before the editable check, R2); DB unchanged. A valid body on the same row → 409 (TEST-05c-1) |
| `TEST-18a-1` | AC-18a | Boundary | Entry created today (`logDate` 2026-11-05); Clock at 2026-11-05T16:59:59Z (= 23:59:59 Asia/Bangkok) | `PUT` valid new values | 200; values replaced |
| `TEST-18a-2` | AC-18a | Boundary | Same entry restored; Clock at 2026-11-05T17:00:00Z (= 2026-11-06 00:00:00 Asia/Bangkok) | The same `PUT` | 409 `ENTRY_NOT_EDITABLE`; DB unchanged |
| `TEST-18a-3` | AC-18a | Boundary | Two entries dated 2026-11-05; Clock at 23:59:59 then 00:00:00 | `DELETE` the first at 23:59:59; `DELETE` the second at 00:00:00 | 204; then 409; second row still present |
| `TEST-18a-4` | AC-18a | Boundary | Entry created by `POST` at Clock 2026-11-05T16:59:50Z | Advance the Clock to 17:00:00Z; `PUT` and `DELETE` | 409 each; `GET /api/entries?date=2026-11-05` still returns the entry unchanged (reading past dates stays allowed, SRS Q46) |
| `TEST-18b-1` | AC-18b | API/DB Integration | Squat entry today with others summing to 15 sets / 150 reps | `PUT` values that make cumulative sets 20 (accepted) and then 21 (`sets` too high for the cumulative); and `totalReps` above `sets × 200` | 200 for the boundary value; 400 `VALIDATION_ERROR` naming `sets` / `totalReps` and the limit for the others; DB unchanged for the rejected ones (the limits themselves are those of F-04 R5-R6, asserted through the shared module, not re-listed) |
| `TEST-18b-2` | AC-18b | API/DB Integration | Squat with template `rangeMax` 50 reps; entries today totalling 30 | `PUT` one entry so cumulative becomes 50, then 51 | 200; then 400 naming `totalReps` and the limit (stricter limit applies) |
| `TEST-18b-3` | AC-18b | API/DB Integration | An entry of 20 reps, the only one today | `PUT` 20 → 20 reps (same value), and a value valid only because the old value is excluded from the sum | 200 each (old value replaced, not double counted) |
| `TEST-18b-4` | AC-18b | API/DB Integration | Alice's entry today | `PUT` with `userId` = Bob's id; with `logDate` 2026-11-04; with `logDate` 2026-11-05 (unchanged value); with `userExerciseId` of another exercise; with `kind`; with `id` / `createdAt` | 400 `VALIDATION_ERROR` naming the field each; stored `userId`, `logDate`, `userExerciseId`, `kind`, `createdAt` unchanged |
| `TEST-18b-5` | AC-18b | API/DB Integration | Alice's entry today | `PUT` with a field of another mode; with an unknown field; with `sets` 0, negative values, non-numeric strings, a missing required field, an empty body | 400 naming the field each; DB unchanged |
| `TEST-18b-6` | AC-18b | API/DB Integration | A Quick Complete entry today | `PUT` new values | 200; `kind` remains `QUICK_COMPLETE`; values replaced |
| `TEST-23-5` | AC-23 (third case) | UI E2E | Alice logged in on Today (mobile viewport as in F-04), Squat planned, one entry created today shown in `item-entries` with edit and delete icons; the page stays open | Make the server consider the entry old (the rejection is injected on the wire for `PUT /api/entries/:id`, the same technique as TEST-23-2, because the browser cannot make the server's date differ from the page's); open the edit icon, change the value, save | The `ENTRY_NOT_EDITABLE` notice "Only today's entries can be edited or deleted; this entry is not from today." is visible (names the reason); the modal does not report success; Today reloads and the entry still shows the original value. The injected rejection means the server never sees the request, so "no row changed" is not asserted here (see TEST-23-6) |
| `TEST-23-6` | AC-23 (third case) | UI E2E (real API) | Same fixture; additionally an old entry (`logDate` yesterday) inserted by the test setup for Alice | A forced `PUT /api/entries/<old id>` and `DELETE /api/entries/<old id>` through the Playwright request context with Alice's token (no icon exists for old entries, so the UI cannot send them) | Both return 409 with code `ENTRY_NOT_EDITABLE`; the ledger of that exercise has the same rows and values before and after; (guard note, not an AC assertion: Today lists today only, so the old entry is not shown) |
| `TEST-23-7` | AC-23 (third case, UI element) | UI E2E (real API) | Alice on Today with **two** real entries created today for one exercise (A: 2 sets / 20 reps, B: 1 set / 8 reps) | Expand the card (`item-entries`); edit A to 21 sets; cancel; then delete B and confirm | Icons present on both entries; edit with 21 sets shows the field error naming `sets` and the limit 20 and keeps the value (as TEST-23-1), the ledger is unchanged; delete of B with confirm removes only B and the totals update |
| `TEST-23-8` (edit form, non-divisible entry; in `tests/e2e/validation_feedback.spec.ts`) | AC-23 (UI element, supports AC-18b) | UI E2E (real API) | Alice has a Quick Complete-style entry today of 4 sets / 799 reps (inserted by the test setup; Squat target 4 × 200 = 800 reps, F-04 TEST-13a-3) | Expand the card; open edit | `entry-edit-sets` shows 4 and `entry-edit-total-reps` shows 799 (not 199.75 or a rounded value); save without changes; the response is 200 and the stored row stays 4 / 799 |

**Notes on the third AC-23 case.** The RTM lists three cases (sets 21, Quick Complete disabled on a Rest Day, editing an old entry). The first two are TEST-23-1 and TEST-23-3 (F-04, in the same file). TEST-23-4 is reserved by F-04 for the weight case (Profile screen), so the F-05 cases are numbered TEST-23-5 to TEST-23-8. The E2E fixtures must expand the exercise card first, because `item-entries` exists only while a card is expanded. TEST-23-5 and TEST-23-6 together make the third case explicit: the notice is shown (injected rejection, UI) and the real server refuses with nothing changed (forced request). Neither alone is claimed as the whole case.

**Coverage check.** Every AC in §7 has at least one test: AC-05a (six), AC-05b (four), AC-05c (five), AC-18a (four), AC-18b (six), AC-23 third case (three) and the edit-form case TEST-23-8. Negative, boundary, role and ownership cases are included (old / tomorrow / ancient dates, 23:59:59 vs 00:00:00, foreign id, Manager, no token, unknown and malformed id, immutable fields, limit +1, `rangeMax`). Date-dependent cases use the injectable Clock and dated seed rows. Scoring effects use `GET /api/progress/daily` (F-06) read after the change.

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
1. Spec-only commit of this contract, reviewed and approved before any code.
2. Red: `tests/integration/entry_modification.test.ts` for AC-05c and AC-18a first (route absent → 404/405 failures), then AC-05a, AC-05b, AC-18b; the red run must visibly fail before the green commit.
3. Green: domain function (editable check, cumulative with exclusion) and service, then routes and registry policy, then wiring; no change to the validation module's numbers.
4. Red/green for the UI cases: `validation_feedback.spec.ts` TEST-23-5 to TEST-23-8, then the Today icons and notice.
5. The F-04 revision-history row 0.3.2 (R15 superseded for Sprint 2 by this contract; no other F-04 text changed) is part of the same PR as this contract (the PR #106 branch), not of the implementation PR (#73).
6. RTM §3.1 and the contract approval register are updated by the lead / the implementation PR with real results (not in this contract commit).

--------------------------------------------------------------------------------

#### 10. Definition of Done for F-05
| # | Criterion | Evidence required |
| ------ | ------ | ------ |
| 1 | Contract reviewed and approved by Onsinee before implementation | Review comment; commit order |
| 2 | `PUT` and `DELETE /api/entries/:id` and rules R1-R14 implemented as specified; both routes in the registry with the policy of §4.5 | Code on `staging/sprint-2`; matches §4 |
| 3 | All tests of §8 implemented and enabled (none skipped); each AC mapped by ID suffix | Test names match STS IDs |
| 4 | Tests executed on the merge commit with counts | Passed / failed / skipped counts |
| 5 | TDD red/green evidence for AC-05c, AC-18a and AC-18b (the midnight boundary and the immutable fields) | Failing and passing runs with commit IDs |
| 6 | The two routes pass the Endpoint Access Matrix (TEST-05c-4 and the generic TEST-22c loops): no token 401, Manager 403, foreign owner 403 | Integration output |
| 7 | Limits are taken from the shared validation module, not duplicated (no new numeric constant for sets, reps, seconds or km in F-05 code) | Code review comment naming the module |
| 8 | Today screen has edit and delete icons on today's entries and the `ENTRY_NOT_EDITABLE` notice; TEST-23-5 to TEST-23-8 run; AC-23 moves from INCOMPLETE to PASS in RTM §3.1 only if all three cases (23-1, 23-3 and the F-05 cases) pass | Playwright output; screenshots with version |
| 9 | No schema, migration or seed change; `LedgerEntry` rows are the only data written | Diff of `prisma/` is empty |
| 10 | Teammate-reviewed PR with a substantive comment, integrated on staging | PR link, reviewer, comment |
| 11 | RTM §3.1 updated (actual test names, result, commit) | Updated register |
| 12 | README current if commands change; no secret committed; incomplete work and limitations disclosed (§12) | Diff; §12 updated |

**Evidence list.** (a) approval review of this contract; (b) red run and green run of `entry_modification.test.ts` with commit IDs; (c) full-suite counts (typecheck, tests, build) on the merge commit; (d) Playwright run of `validation_feedback.spec.ts`; (e) the access matrix output for the two routes; (f) RTM §3.1 rows for AC-05a-c, AC-18a-b and AC-23; (g) screenshot of Today with the icons and of the notice.

--------------------------------------------------------------------------------

#### 11. Dependencies on Other Contracts
| Item | Provided to / needed from | Note |
| ------ | ------ | ------ |
| Registry, `requireRole`, error envelope, Clock | Needed from F-01 | Same Clock as F-04 (Q29) |
| Validation module, `cumulativeFor`, row lock R14, entry shape | Needed from F-04 | F-05 **supersedes F-04 R15** ("ledger entries are immutable") for Sprint 2; the F-04 file gets only a revision-history row 0.3.2 in this PR (its rules text is not edited); F-04 §13 item 2 is resolved by this contract |
| `GET /api/progress/daily` | Needed from F-06 | Used by the tests to assert recalculated scores |
| Edited / deleted entries | Provided to F-08, F-11 | Read-side only; today's result can change, past results cannot |
| Today screen (S-02, S-03) | Needed from F-04 UI | F-05 adds icons, edit mode and the notice |

--------------------------------------------------------------------------------

#### 12. Known Limitations and Open Questions
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | **Decided.** `LedgerEntry` has no `updatedAt` and none is added (SDS §3.2 says `updatedAt` exists "where rows can change"; this no longer holds literally) | Reviewer (Onsinee), PR #106 review, 23 Nov 2026: accept the omission. Recorded as a deviation (§13, P5-1) to note when #73 closes |
| 2 | **Decided.** `userExerciseId` and `kind` are immutable in `PUT` (R6); to move an entry the user deletes and re-creates it | Reviewer (Onsinee), PR #106 review, 23 Nov 2026: agreed |
| 3 | **Decided.** An old entry with an invalid body returns 400 (validation before the 409 business rule, R2) | Reviewer (Onsinee), PR #106 review, 23 Nov 2026: correct per SDS §6.2 |
| 3a | **Decided.** Test sub-numbering `TEST-05a-1` style (and `TEST-23-5..8`) | Reviewer (Onsinee), PR #106 review, 23 Nov 2026: fine |
| 4 | The old values of an edited entry are not kept (no audit trail) | Accepted scope; BR-09 only asks for correction of today's mistakes |
| 5 | A page left open past midnight shows icons on yesterday's entries until reload; the first action returns 409 and the notice | By design (BR-01, BR-09); same pattern as `LOG_DATE_MISMATCH` |
| 6 | AC-23 third case: the UI notice test injects the rejection on the wire (the browser cannot make the server's date differ), and the real refusal is shown by a forced API request. No single test shows both on one real server | Disclosed; same technique and limit as TEST-23-2 and TEST-23-3 |
| 7 | The concurrent cases (edit vs Quick Complete; `PUT`/`DELETE` vs a concurrent `DELETE` of the same entry, answered 404 by R8) have **no STS test yet**. The rule is now specified, but a deterministic test needs a hook between the ownership lookup and the lock that this contract does not define, and a timing-based test would be probabilistic as in F-04 | Stated gap; the implementer may add a test and must say whether it is deterministic |
| 8 | If an entry is edited to fewer values after the target was reached, today's Streak or percentage can fall; this is the intended derived-on-read behavior | By design (R9) |

--------------------------------------------------------------------------------

#### 13. Pending Baseline Impact
| # | Pending item | Baseline document(s) affected | Status |
| ------ | ------ | ------ | ------ |
| P5-1 | `LedgerEntry` has no `updatedAt`; SDS §3.2 (the sentence that `createdAt` and `updatedAt` exist on tables whose rows can change) no longer holds literally for `LedgerEntry` | SDS §3.2 | **Pending**: accepted by the reviewer (PR #106); note it as a deviation (or amend the SDS wording through a revision row) when #73 closes |
| P5-2 | F-04 R15 superseded for Sprint 2 | F-04 contract | Recorded by the revision row 0.3.2 in this PR |
