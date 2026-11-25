### Feature Engineering Contract: F-09 Schedule Representation & Persisted Reminder Settings
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-09
**Sprint:**  3 (the Sprint 3 workflow implemented and tested for Deliverable 2 Part C; plan §6.3)
**Contract Version:**  0.1.0
**SRS Baseline Version:**  1.1.0 (Feature Inventory 1.1.0, SRS 1.1.0, System-Level SDS 1.1.1, RTM 1.1.13, Sprint Plan 1.3.0, F-03 contract on `staging/sprint-2`, F-07 contract 0.1.2)
**Date:**  26 November 2026
**Status:**  Draft (review-pending). Concise contract for Deliverable 2 Part C: enough detail to control the implementation, not a frozen final design. No implementation is claimed. Open questions are in §13
**Primary Author:**  Onsinee  |  **Reviewer:**  Nakagamon
**Repository Path:**  `docs/sprints/sprint-3/F-09-schedule-reminders.md`
**Issue:**  #81 (Part 1: this contract; Part 2: implementation)

--------------------------------------------------------------------------------

#### Contract Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 26 Nov 2026 | Initial contract (issue #81 Part 1): `GET /api/schedule`, `ReminderSetting` list/create/update/delete, rules, failure cases, Access Matrix rows, API shapes, UI, AC-09a–c refinement, STS, TDD plan, DoD, open questions | Onsinee | Draft |

*Rule: later changes are new versions with a reason, never silent rewrites.*

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
F-09 gives a Participant two things:
1. A **schedule view** (one week or one calendar month) that shows, for each day, which plan items occur and which days are Rest Days. It is **computed on read** from the Participant's `PlanItem` versions with the existing plan resolution (SDS §3.3, F-03 R12); nothing is stored.
2. **Reminder settings** (`ReminderSetting`: time of day, repeat days, label, enabled) that the Participant can list, create, update and delete. They are persisted in PostgreSQL, visible only to their owner and **displayed in the app only: nothing is sent** (no email, push, SMS or any other outbound call; SRS Exclusion 6, SDS §3.2).

The `ReminderSetting` table, its `timeOfDay` and `repeatDays` CHECK constraints and the `userId` index already exist in migration `0001_init`; F-09 needs **no schema change**.

| In scope | Out of scope |
| ------ | ------ |
| `GET /api/schedule?view=week\|month&date=YYYY-MM-DD` (§4.1) | Changing plan items from the schedule (F-03 creates, F-07 changes) |
| `GET /api/reminders`, `POST /api/reminders`, `PUT /api/reminders/:id`, `DELETE /api/reminders/:id` (§4.2–§4.5) | Any delivery: email, push, SMS, browser notifications, a scheduler or background job |
| Schedule screen with the reminder list and add / edit / delete (§6) | Progress, scores or Streak on the schedule (F-06, F-08) |
| Access Matrix rows and registry policies for the five routes (§3.3) | Manager views of reminders or schedules (BR-04, Exclusion 3) |
| | Reminders shown on the days of the schedule (open question 6) |

--------------------------------------------------------------------------------

#### 2. Linked Requirements and Dependencies
| Requirement / AC | How F-09 serves it |
| ------ | ------ |
| FR-07 (SRS §3) | Schedule derived from `PlanItem`; persisted reminder settings, display only |
| BR-04 | Owner-only access; Manager → 403 on every F-09 route |
| BR-11 / SDS §3.3 | Each day of the schedule resolves the plan version valid on that day, so past days show the version that was valid then |
| AC-09a–c (RTM) | Refined in §7, tested in §8 (`tests/integration/reminder.test.ts`) |
| AC-12a/12b/12c, AC-22c | F-09 routes join the Endpoint Access Matrix (§3.3); the feature PR adds them to the existing aggregate cases |

| Depends on | What F-09 uses | State on 26 Nov 2026 |
| ------ | ------ | ------ |
| F-03 | `resolveItems` / `resolvePlan` (`server/domain/planResolution.ts`), `PlanRepository.listPlanItems`, `repeatDays` array ↔ bitmask convention (F-03 R11) | Merged |
| F-07 | Plan items with more than one version | PR #115 open. F-09 does not call F-07 code: the version tests insert historical versions directly (as `tests/helpers/historicalPlan.ts` does), so F-09 can be built and tested before #115 merges |
| F-01 | Route policy registry, `authorize` middleware (role, self-scoped, resource-owner), error envelope | Merged |
| Clock (SDS §2.6) | Default `date` of the schedule (Asia/Bangkok today) | Merged |

--------------------------------------------------------------------------------

#### 3. Feature Design (Feature-Level SDS)
##### 3.1 Business Rules
| ID | Rule | Source |
| ------ | ------ | ------ |
| R1 | `view` is `week` or `month`; default `week`. `date` is a valid `YYYY-MM-DD` calendar date; default is the Clock's Asia/Bangkok today | SDS §2.6, SDS §5 catalog |
| R2 | `week` = the ISO week (Monday to Sunday) that contains `date`; `month` = the 1st to the last day of the calendar month that contains `date`. The response lists every day of the range in ascending order (7 days, or 28–31) | This contract |
| R3 | For each day *d* of the range, `items` = the plan items that occur on *d* by plan resolution (SDS §3.3, F-03 R12: latest version with `effectiveFrom ≤ d`, ties by highest `version`; dropped if *d* > `endDate` or the weekday is not in `repeatDays`). `isRestDay` = `items` is empty (Q24). Past and future days use the same rule, so a day before a goal change shows the earlier version (BR-11) | SDS §3.3, Q24, BR-11 |
| R4 | The schedule reads only the caller's plan items; it is computed on read and stores nothing | SDS §2.4, BR-04 |
| R5 | A reminder has `timeOfDay`, `repeatDays`, `label`, `enabled` (SDS §3.2). `timeOfDay` is a string `HH:mm`, 24-hour, exactly 5 characters, `00:00`–`23:59` (same pattern as the DB CHECK) | SDS §3.2, migration `0001_init` |
| R6 | `repeatDays` is sent and returned as a non-empty array of unique ISO weekdays 1 = Monday … 7 = Sunday (default `[1,2,3,4,5,6,7]`) and stored as the Monday–Sunday bitmask (127 = every day), exactly as F-03 R11 does for plan items | F-03 R11, SDS §3.2 |
| R7 | `label` is a string, trimmed before validation and storage, 1–40 characters after trimming (proposed length, open question 4) | This contract |
| R8 | `enabled` is a JSON boolean; default `true` on create. It only changes how the reminder is shown (On / Off); it never triggers anything | Exclusion 6 |
| R9 | Create requires `timeOfDay` and `label`; `repeatDays` and `enabled` are optional. Update (`PUT`) accepts any **non-empty** subset of the four fields and leaves the others unchanged (open question 1); `{}` → 400 | This contract |
| R10 | Unknown body fields (including `id`, `userId`, `createdAt`) → 400 `VALIDATION_ERROR` naming the field; nothing is stored | Error convention (SDS §5.1) |
| R11 | Reminders are owner-only: the list is filtered by the token's user; `PUT`/`DELETE` of another Participant's reminder → 403 and the row is unchanged; a well-formed unknown id → 404 `NOT_FOUND`; a malformed id → 400 (as F-05 for `/api/entries/:id`) | BR-04, SDS §6.2 |
| R12 | List order: `timeOfDay` ascending, then `createdAt` ascending (so the list reads like a day) | This contract |
| R13 | **No delivery.** No F-09 code path makes an outbound call (no `fetch`, `http(s).request`, mail, push or SMS library) and no timer or job runs for reminders. The UI states this next to the list (§6) | SRS Exclusion 6, SDS §3.2, AC-09c |
| R14 | Responses never contain `userId` | F-03 AC-03a (no `userId` in responses) |

##### 3.2 Failure and Boundary Cases
| Case | Result |
| ------ | ------ |
| No token / bad token on any F-09 route | 401 `UNAUTHENTICATED` |
| Manager on any F-09 route (even with an invalid body, query or unknown id) | 403 `FORBIDDEN`; nothing stored |
| `?userId=<another user>` on `GET /api/schedule` or `GET /api/reminders` | 403 (self-scoped rule); own `userId` is not rejected (existing convention, TEST-12b-4) |
| `view=day`, `view=` | 400 `VALIDATION_ERROR`, field `view` |
| `date=2026-02-30`, `date=26-11-2026`, `date=2026-11-5` | 400 `VALIDATION_ERROR`, field `date` |
| Participant with no plan items | 200; every day `isRestDay: true`, `items: []` |
| Week that crosses a month or a year (e.g. `date=2026-12-31` → Mon 28 Dec 2026 … Sun 3 Jan 2027) | 200; 7 days across the boundary |
| `month` view of February 2027 / of a 31-day month | 28 days / 31 days |
| `timeOfDay` `"7:30"`, `"24:00"`, `"12:60"`, `"1230"`, `"07:30:00"`, `730` (number), missing on create | 400, field `timeOfDay`; nothing stored |
| `repeatDays` `[]`, `[0]`, `[8]`, `[1,1]`, `"Mon"`, `127` | 400, field `repeatDays` (same as F-03 TEST-03b-7) |
| `label` `""`, `"   "`, 41 characters, a number, missing on create | 400, field `label` |
| `enabled` `"true"`, `1`, `null` | 400, field `enabled` |
| `PUT` with `{}` | 400 `VALIDATION_ERROR` |
| `PUT`/`DELETE` on another Participant's reminder | 403; the row is unchanged / still exists |
| `PUT`/`DELETE` on a well-formed unknown id, or a second `DELETE` of the same id | 404 `NOT_FOUND` |
| `PUT`/`DELETE` with a malformed id (`/api/reminders/abc`) | 400 `VALIDATION_ERROR` |

##### 3.3 Permissions (Access Matrix rows, for AC-12c / AC-22c)
Registry policies (`server/routes/registry.ts`), feature `F-09`, auth `required`, roles `['PARTICIPANT']`:

| Route | Ownership | Unauthenticated | Manager | Participant (own) | Participant (other's) |
| ------ | ------ | ------ | ------ | ------ | ------ |
| `GET /api/schedule` | self-scoped | 401 | 403 | 200 | 403 (`?userId=<other>`) |
| `GET /api/reminders` | self-scoped | 401 | 403 | 200 | 403 (`?userId=<other>`) |
| `POST /api/reminders` | self-scoped | 401 | 403 | 201 | 403 (`?userId=<other>`) |
| `PUT /api/reminders/:id` | resource-owner | 401 | 403 | 200 | 403 |
| `DELETE /api/reminders/:id` | resource-owner | 401 | 403 | 204 | 403 |

The resource-owner routes register an owner lookup on `ReminderSetting` (unknown id → 404), as `/api/entries/:id` does. SYS-01 owns the final "every route is in the matrix" run; the F-09 PR itself adds the five routes to the existing aggregate cases in `tests/integration/security_access.test.ts` (TEST-12a-2, TEST-12b-4, TEST-12c, TEST-22c), because the registry test fails otherwise.

--------------------------------------------------------------------------------

#### 4. API Specification
All responses use the error envelope `{ code, message, fields }` on failure. No response contains `userId`.

##### 4.1 `GET /api/schedule?view=week|month&date=YYYY-MM-DD`
200:
```json
{
  "view": "week",
  "from": "2026-11-23",
  "to": "2026-11-29",
  "today": "2026-11-26",
  "days": [
    {
      "date": "2026-11-23",
      "isRestDay": false,
      "items": [
        { "planItemId": "uuid", "planKey": "uuid", "version": 1,
          "userExerciseId": "uuid", "name": "Squat", "trackingMode": "WEIGHT" }
      ]
    },
    { "date": "2026-11-24", "isRestDay": true, "items": [] }
  ]
}
```
`today` is the Clock's Asia/Bangkok date (the UI marks it). `items` keeps the plan-item order of `GET /api/plan?date=`. Errors: 400, 401, 403.

##### 4.2 `GET /api/reminders`
200: an array (as `GET /api/plan-items`), ordered by R12:
```json
[
  { "id": "uuid", "timeOfDay": "07:30", "repeatDays": [1, 3, 5], "label": "Morning run",
    "enabled": true, "createdAt": "2026-11-26T01:00:00.000Z", "updatedAt": "2026-11-26T01:00:00.000Z" }
]
```
Errors: 401, 403.

##### 4.3 `POST /api/reminders`
Body: `{ "timeOfDay": "07:30", "label": "Morning run", "repeatDays": [1, 3, 5], "enabled": true }` (`repeatDays`, `enabled` optional). 201 with the reminder object of §4.2. Errors: 400, 401, 403.

##### 4.4 `PUT /api/reminders/:id`
Body: any non-empty subset of `timeOfDay`, `label`, `repeatDays`, `enabled`, e.g. `{ "enabled": false }`. 200 with the updated reminder; `updatedAt` changes. Errors: 400, 401, 403, 404.

##### 4.5 `DELETE /api/reminders/:id`
204, no body; the row is deleted (a reminder is a setting, not history, so a hard delete is correct; `WeightLog`-style append-only does not apply). Errors: 400 (malformed id), 401, 403, 404.

##### 4.6 Internal interface
| Unit | Kind | Responsibility |
| ------ | ------ | ------ |
| `buildSchedule(items, view, date, today)` in `server/domain/schedule.ts` | Pure function | Range by R2; for each day calls `resolveItems` (F-03); returns the §4.1 body. Unit-testable without a DB |
| `validateReminderCreate` / `validateReminderUpdate` in `server/domain/reminderValidation.ts` | Pure function (zod, as other validators) | R5–R10; returns field errors |
| `ReminderRepository` in `server/repositories/reminderRepository.ts` | Prisma | `list(userId)`, `create`, `update`, `delete`, `ownerOf(id)`; bitmask ↔ array conversion at this boundary or in the route (one place only) |
| `server/routes/schedule.ts`, `server/routes/reminders.ts` | Express routes | Registered with the §3.3 policies in the same commit as the route |

--------------------------------------------------------------------------------

#### 5. Data Specification
No migration. Existing table (`prisma/schema.prisma`, migration `0001_init`):

| Column | Type | Constraint |
| ------ | ------ | ------ |
| `id` | UUID PK | default uuid |
| `userId` | UUID FK → `User` | `ON DELETE RESTRICT`; index `ReminderSetting_userId_idx` |
| `timeOfDay` | VARCHAR(5) | CHECK `^([01][0-9]\|2[0-3]):[0-5][0-9]$` |
| `repeatDays` | INTEGER | default 127; CHECK `BETWEEN 1 AND 127` |
| `label` | TEXT | not null (length 1–40 enforced by the API, R7; no DB check added) |
| `enabled` | BOOLEAN | default true |
| `createdAt`, `updatedAt` | TIMESTAMP(3) | UTC |

The DB checks are a second line of defence; the API validates first so the client gets a 400 envelope, not a 500.

**Test fixtures (STS §8).** Integration tests use the seed users Alice and Bob and insert their own rows, cleaned per suite. Schedule fixture (Alice, no other plan items; dates fixed, not Clock-relative):
- Item **A** (one version): `effectiveFrom` 2026-11-02, `repeatDays` `[1,3,5]` (Mon, Wed, Fri), no `endDate`.
- Item **B** (one version): `effectiveFrom` 2026-11-02, every day, `endDate` 2026-11-25 (Wed).
- Item **C** (two versions, same `planKey`): v1 `effectiveFrom` 2026-11-02 every day; v2 `effectiveFrom` 2026-11-26 (Thu) `repeatDays` `[6]` (Sat). Inserted directly, as a historical version.

Expected week of `date=2026-11-26` (Mon 23 – Sun 29 Nov 2026):

| Day | Items | Rest Day |
| ------ | ------ | ------ |
| Mon 23 | A, B, C v1 | no |
| Tue 24 | B, C v1 | no |
| Wed 25 | A, B, C v1 | no |
| Thu 26 | – (B ended 25th; C v2 is Sat only) | **yes** |
| Fri 27 | A | no |
| Sat 28 | C v2 | no |
| Sun 29 | – | **yes** |

--------------------------------------------------------------------------------

#### 6. UI Specification
- **Where:** a Schedule screen at `/schedule` for Participants, opened from the My Plan screen (a "Schedule & reminders" link). Exact placement in the navigation is open question 3 (the Profile menu work of ui-spec 0.11.0/0.12.0 is on a separate branch).
- **Schedule part:** a Week / Month toggle, previous / next arrows (move `date` by 7 days or one month) and a day list (week) or calendar grid (month). Each day shows its exercise names or "Rest day"; today is highlighted.
- **Reminder part:** the list (time, label, repeat days as `Mon, Wed, Fri` / `Every day`, On/Off), an **Add reminder** form (time input `HH:mm`, label, weekday checkboxes, enabled switch), **Edit** (same form, pre-filled) and **Delete** (with a confirmation).
- **Display-only notice**, always visible above the list: *"Reminders are saved and shown in the app only. Nothing is sent: no email, push or SMS."*
- There is no "send", "notify" or "test reminder" control anywhere.
- Server field errors are shown under the matching input (`timeOfDay` → time, `repeatDays` → weekdays, `label` → label), as the other forms do.

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
The RTM wording of AC-09a–c is kept; the observable checks below make it testable.

| AC | RTM criterion | Observable in this contract |
| ------ | ------ | ------ |
| **AC-09a** | `GET /api/schedule?view=week` or `view=month` returns a schedule derived from `PlanItem`s with targeted days and Rest Days correct. | §5 fixture week gives exactly the table in §5 (items per day, `isRestDay`, the version shown for C); a `month` view has one entry per calendar day; no plan → every day a Rest Day; only the caller's items; invalid `view`/`date` → 400 |
| **AC-09b** | `ReminderSetting` (time HH:mm, repeatDays, label, enabled) create / update / delete is persisted in the database and readable only by its owner; malformed time → 400. | Create → 201 and the row is in the DB with the bitmask; update → 200 and the DB row changed; delete → 204 and the row is gone; another Participant's `GET` list never shows it and `PUT`/`DELETE` → 403 with the row unchanged; malformed `timeOfDay` → 400 naming `timeOfDay`, nothing stored |
| **AC-09c** | No email / push / SMS is sent (the test asserts no outbound calls); the UI presents reminders as display-only settings. | During create, update, delete, list and schedule requests, spies on `globalThis.fetch`, `http.request` and `https.request` record **zero** calls; the reminder list component renders the display-only notice and no send/notify control |

--------------------------------------------------------------------------------

#### 8. Software Test Specification (STS)
File: `tests/integration/reminder.test.ts` (RTM path) unless stated. Real PostgreSQL test DB, seed users, per-suite cleanup. Clock replaced where `today` matters.

| Test ID | AC | Level | Setup | Action | Expected |
| ------ | ------ | ------ | ------ | ------ | ------ |
| TEST-09a-1 | AC-09a | API/DB Integration | §5 fixture | `GET /api/schedule?view=week&date=2026-11-26` as Alice | 200; `from` 2026-11-23, `to` 2026-11-29, 7 days; items and `isRestDay` exactly as the §5 table; C shows `version` 1 on Mon–Wed and 2 on Sat |
| TEST-09a-2 | AC-09a | API/DB Integration | §5 fixture | `view=month&date=2026-11-10`; `view=month&date=2027-02-14` | 30 days (1–30 Nov) with the same per-day result as TEST-09a-1 for 23–29 Nov; 28 days for Feb 2027 |
| TEST-09a-3 | AC-09a | API/DB Integration | Alice without plan items | `view=week&date=2026-11-26` | 200; 7 days, all `isRestDay: true`, `items: []` |
| TEST-09a-4 | AC-09a | API/DB Integration | §5 fixture; Bob has his own item every day | Alice's week | No Bob item appears on any day |
| TEST-09a-5 | AC-09a | API/DB Integration | Clock fixed at 2026-11-26 (Bangkok) | `GET /api/schedule` (no query) | `view` `week`, `today` 2026-11-26, `from` 2026-11-23 |
| TEST-09a-6 | AC-09a | API/DB Integration | Seed | `view=day`; `date=2026-02-30`; `date=2026-11-5` | 400 `VALIDATION_ERROR` naming `view` / `date` |
| TEST-09a-7 | AC-09a | API/DB Integration | Seed | `date=2026-12-31` week | 7 days, 2026-12-28 … 2027-01-03 |
| TEST-09b-1 | AC-09b | API/DB Integration | Alice | `POST` `{timeOfDay:"07:30", label:" Morning run ", repeatDays:[1,3,5]}`; `POST` `{timeOfDay:"18:00", label:"Yoga"}` | 201 each; DB rows: bitmask 21 and 127, label trimmed, `enabled` true; responses without `userId` |
| TEST-09b-2 | AC-09b | API/DB Integration | Alice has 3 reminders (18:00, 07:30, 07:30 created later); Bob has 1 | `GET /api/reminders` as Alice | 200; exactly Alice's 3, ordered 07:30, 07:30 (older first), 18:00 |
| TEST-09b-3 | AC-09b | API/DB Integration | Alice's reminder | `PUT {enabled:false}`; `PUT {timeOfDay:"06:45", repeatDays:[6,7]}` | 200 each; DB row changed only in the sent fields; `updatedAt` later |
| TEST-09b-4 | AC-09b | API/DB Integration | Alice's reminder | `DELETE`; `DELETE` again; `PUT` | 204 with empty body and the row gone; then 404; 404 |
| TEST-09b-5 | AC-09b | API/DB Integration | Alice | `POST` with each invalid `timeOfDay` of §3.2 | 400 naming `timeOfDay`; reminder count unchanged |
| TEST-09b-6 | AC-09b | API/DB Integration | Alice | Invalid `repeatDays`, `label`, `enabled`, unknown field `userId`, `PUT {}` (§3.2) | 400 naming the field; nothing stored or changed |
| TEST-09b-7 | AC-09b | API/DB Integration | Bob's reminder | Alice `PUT` and `DELETE` it; Alice `GET /api/reminders?userId=<Bob>`; well-formed unknown id; `/api/reminders/abc` | 403, 403 (row unchanged, still present), 403, 404, 400 |
| TEST-09b-8 | AC-09b | API/DB Integration | Manager token, no token | All five routes (Manager with an invalid body) | 403 / 401; nothing stored |
| TEST-09c-1 | AC-09c | API/DB Integration | `vi.spyOn` on `globalThis.fetch`, `http.request`, `https.request` | Create, update, list, delete a reminder, then `GET /api/schedule` | All responses successful; every spy has **0** calls |
| TEST-09c-2 | AC-09c | UI Component | Reminder list component rendered with `react-dom/server` `renderToStaticMarkup` (already a dependency; no new package) with two reminders, one disabled | Render | Markup contains the display-only notice of §6, both labels, `07:30`, `Mon, Wed, Fri`, `Off`; contains no "Send" / "Notify" / "Test reminder" text |

Not in the RTM, added for regression and the Deliverable 2 demo (not counted as AC evidence on their own):
- Unit: `tests/unit/schedule.test.ts` for `buildSchedule` (range rules R2 incl. year boundary) and `tests/unit/reminder_validation.test.ts` for R5–R10.
- E2E: `tests/e2e/reminder_ui.spec.ts` add → edit → toggle off → delete through the Schedule screen, and the week view showing a Rest Day.
- Security aggregates in `tests/integration/security_access.test.ts`: the five routes are added to TEST-12a-2, TEST-12b-4, TEST-12c and TEST-22c (§3.3).

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
Implementation order follows the issue #81 scope note (the reminder list, create and delete first; edit and the schedule only if time remains, with the PDF stating what ran):

1. `docs(spec)`: this contract (spec-only commit, before any code).
2. `test`: red TEST-09b-1, 09b-2, 09b-4, 09b-5, 09b-7, 09b-8 (list / create / delete / owner-only) + registry policies expected by the security aggregates → red run recorded.
3. `feat`: reminder repository, validation, routes, policies → green.
4. `test` red → `feat` green: `PUT` (TEST-09b-3, 09b-6).
5. `test` red → `feat` green: schedule (TEST-09a-1…7, unit tests of `buildSchedule`).
6. `test` red → `feat` green: AC-09c (TEST-09c-1, 09c-2) and the Schedule screen; E2E.
7. `docs(rtm)`: §3.1 register rows AC-09a–c with the tested commit, only for what ran.

Each red run is committed (or its output recorded in the PR) before the green commit, as for the other features.

--------------------------------------------------------------------------------

#### 10. Definition of Done for F-09
1. This contract approved by the reviewer before implementation (issue #81 Part 1).
2. The five routes registered with the §3.3 policies; the security aggregates include them and pass.
3. TEST-09a-1…7, TEST-09b-1…8 and TEST-09c-1…2 exist in `tests/integration/reminder.test.ts` with these IDs, have a recorded red run, and pass on the PR head against PostgreSQL. Anything not implemented is stated as PLANNED, not as passing.
4. `pnpm` typecheck, unit + integration tests and build green; CI green on the PR.
5. The Schedule screen shows the week/month view, the reminder list, add / edit / delete and the display-only notice; checked by E2E or by hand with the steps written in the PR.
6. No outbound call, scheduler or delivery library added (`package.json` unchanged by F-09).
7. RTM §3.1 rows AC-09a–c updated with actual results and commit; PR reviewed by the teammate.

--------------------------------------------------------------------------------

#### 11. Dependencies on Other Contracts
| Contract | Relation |
| ------ | ------ |
| F-03 | Plan resolution and the `repeatDays` convention are reused unchanged |
| F-07 | Versions it inserts are shown on the days they apply; no F-07 code is called |
| SYS-01 | Owns the final matrix run (TEST-12c-3/12c-4 list `PUT/DELETE /api/reminders/:id`, `schedule`, `reminders`), the latency run (consumes one prepared reminder per `PUT`/`DELETE` request) and AC-24b (a reminder is the proposed restart marker, SYS-01 §13 item 5) |
| F-10 | None |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
No baseline document is changed by this contract. When F-09 is implemented, the RTM §3.1 rows AC-09a–c get their results (new RTM version row). The RTM keeps TEST-09c as one UI Component test; this contract splits it into TEST-09c-1 (no outbound calls, server side) and TEST-09c-2 (component render), both in the RTM file path. No AC, test ID mapping or file path changes.

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
| # | Question / limitation | Proposal in 0.1.0 | Status |
| ------ | ------ | ------ | ------ |
| 1 | `PUT` partial or full replacement? | Partial (any non-empty subset), so the On/Off switch sends `{enabled}` only | Open, reviewer to confirm |
| 2 | List response: bare array or `{ reminders: [...] }`? | Bare array, as `GET /api/plan-items` | Open, reviewer to confirm |
| 3 | Where the Schedule screen sits in the navigation | Link from My Plan; revisit after the Profile menu branch merges | Open |
| 4 | `label` length | 1–40 characters after trimming | Open, reviewer to confirm |
| 5 | Maximum number of reminders per user | None; no new error code (the code list is fixed). Limitation stated | Known limitation |
| 6 | Show enabled reminders on the matching days of the schedule | Out of scope for 0.1.0 | Open (Sprint 3 remainder if time) |
| 7 | Reminder field cases for AC-23 (SYS-01 §13 item 6) | Candidate: invalid time shows the server error under the time field; decided in SYS-01 | Open |
| 8 | Schedule date range limit | None beyond a valid calendar date; a month is at most 31 resolutions over the caller's plan items | Known limitation |
