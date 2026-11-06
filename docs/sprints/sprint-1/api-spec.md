### API Specification (Sprint 1)

**Project Title:** Habit and Activity Tracking System (Exercise Domain)
**Course:** CPE 334 Software Engineering
**Document Version:** 0.3.0
**SRS Baseline Version:** 1.1.0 (Feature Inventory 1.1.0, RTM 1.1.0, System-Level SDS 1.1.0)
**Date:** 6 November 2026
**Status:** Draft: specification-only, awaiting reviewer approval before implementation
**Primary Author:** Onsinee | **Reviewer:** Nakagamon
**Repository Path:** `docs/sprints/sprint-1/api-spec.md`
**Scope:** Sprint 1 API for F-01, F-02, F-03 and the Sprint 1 subset of F-04/F-06. Profile (`GET/PUT /api/profile`), monthly progress (`GET /api/progress/monthly`) and the deferred AC are Sprint 2 (CHANGE-04/06); they are documented for completeness only.

> **Source-of-truth rule:** the approved baseline and Sprint 1 contracts take precedence over the v0.2.0 draft.

**Source baselines**

| Document | Version | Role |
| --- | --- | --- |
| SRS | 1.1.0 | Requirements, BR-01 to BR-12, error envelope A.5, seed requirements A.6 |
| System-Level SDS | 1.1.0 | Stack, data model, API conventions, roles and ownership |
| Feature Inventory | 1.1.0 | Feature scope and dependencies |
| RTM | 1.1.0 | AC and target test paths |
| F-01 contract | 0.3.0 | Authentication, route policy registry |
| F-02 contract | 0.3.0 | Categories and exercise templates |
| F-03 contract | 0.3.0 | Plan items, snapshots, plan resolution |
| F-04 contract | 0.3.0 | Ledger entries, Quick Complete, profile |
| F-06 contract | 0.3.0 | Daily and monthly progress |
| User draft | 0.2.0 | Source draft reconciled into this document; not authoritative where it conflicts |

**Document Revision History**

| Version | Date | Description of Changes | Author(s) | Status |
| --- | --- | --- | --- | --- |
| **0.3.0** | 6 Nov 2026 | Initial committed draft. Reconciled from v0.2.0 against baseline 1.1.0 and Sprint 1 contracts 0.3.0. Profile endpoints and monthly progress marked Sprint 2 (CHANGE-04/06); AC-27 test path aligned to `template_snapshot.test.ts`. | Onsinee | Draft |

**Reconciled changes from the v0.2.0 draft**

| Area | v0.2.0 draft | Final Sprint 1 specification |
| --- | --- | --- |
| Exercise selection | `GET/POST /api/exercises`, `GET /api/exercises/:id` | Removed. Snapshots are created inside `POST /api/plan-items`; participants read their snapshots with `GET /api/user-exercises` |
| Plan reads | `GET /api/plan-items?occursOn=` | `GET /api/plan-items` lists all plan rows; `GET /api/plan?date=` resolves a date |
| Login response | `accessToken` | `token`, matching F-01 |
| Profile | `bodyWeightKg`, `effectiveDate`; `PUT { bodyWeightKg }` | `currentWeightKg`, `weightEffectiveDate`; `PUT { weightKg }` |
| Plan item identity | `id = planKey` stable across versions | Separate `id`, `planKey` and `version`; rows are never updated in place |
| Template validity | `metValue` 1–20; unit `sec`; `cardioCategory` optional for `CARDIO_TIME` | `metValue` > 0 and <= 25; unit `seconds`; `cardioCategory` forbidden unless `CARDIO_DISTANCE` |
| Template image | Optional `imageUrl` | Not in the Sprint 1 contracts; no image field or upload endpoint |
| Valid Range | Bounds the primary per-entry value | Bounds the plan target; total reps for reps modes |
| Ledger entry | Stores `loadKg` | No `loadKg` column in `LedgerEntry`; target `loadKg` stays on `PlanItem` |
| Quick Complete | `sets = max(1, targetSets - loggedSets)` | Raise `sets` to `ceil(remainingReps / 200)` when needed; reject if no valid row fits |
| Daily progress | `item`, `overall`, `offPlanEntries`, `quickCompleteAvailable` | `items`, `totalScore`, `totalWeight`, `overallPercent`; off-plan entries come from `GET /api/entries` |
| Monthly progress | `averageOverallPct`, `days[].status` | `averagePercent`, `days[].isRestDay`; the UI derives `TARGETED` / `REST` / `FUTURE`; Sprint 2 (CHANGE-06) |
| Profile sprint | Sprint 1 | Sprint 2 (CHANGE-04); AC-17a–d deferred, S-07 hidden in Sprint 1 |
| Monthly progress sprint | Sprint 1 | Sprint 2 (CHANGE-06); AC-15 deferred |
| Plan overlap | One active plan item per exercise | No overlap rule; F-03 allows the same template to be selected more than once |
| Plan listing | Latest non-ended version only | `GET /api/plan-items` returns all rows ordered by `effectiveFrom`, then `createdAt`; `GET /api/plan?date=` resolves one date |
| End date | Required or end of month | Optional; omitted means no end |
| Entry input | Reps per set | `sets` + `totalReps`; the UI converts reps per set before sending |

**Repository layout note:** SDS 1.1.0 lists `server/`, `web/` and `prisma/` at the repository root. This document is layout-neutral; the layout decision must be recorded in the SDS/AGENTS before code is moved.

--------------------------------------------------------------------------------

#### 1. Conventions

| Topic | Rule |
| --- | --- |
| Base path | All endpoints are under `/api` |
| Transport | HTTPS in deployment; JSON request and response bodies |
| Content type | `application/json`; `POST`/`PUT` bodies must be valid JSON |
| Authentication | `Authorization: Bearer <JWT>` on every endpoint except `POST /api/auth/login` and `GET /api/health` |
| Identity | The authenticated token is authoritative. Participant-owned data is never addressed by `userId` in the path |
| Dates | `YYYY-MM-DD` in Asia/Bangkok business time |
| Months | `YYYY-MM` |
| Times | `HH:mm` where a time of day is accepted (not used in Sprint 1 responses; profile display is Sprint 2) |
| Timestamps | ISO 8601 UTC strings, for example `2026-11-05T03:00:00.000Z` |
| Durations | Stored and exchanged in seconds |
| Distances | Kilometres |
| Weights | Kilograms |
| Decimals | JSON numbers; `metValue` has at most 1 decimal place, distance and weight values follow the contract limits |
| `repeatDays` | Non-empty array of unique ISO weekdays, 1 = Monday through 7 = Sunday; stored as the SDS Monday-Sunday bitmask |
| Validation | Validate body and query before the service layer; reject unknown fields |
| Success statuses | `200` read/update, `201` create, `204` no content |
| Errors | 4xx/5xx use the SRS Appendix A.5 envelope `{ code, message, fields }` |
| Privacy | Error responses never contain private data, stack traces, SQL or tokens |

##### 1.1 Error envelope

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Sets must be 20 or fewer",
  "fields": [{ "field": "sets", "limit": "1 to 20" }]
}
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `INVALID_CREDENTIALS` | 401 | Unknown email or wrong password (identical response for both) |
| `UNAUTHENTICATED` | 401 | Missing, malformed, forged, expired or revoked token |
| `FORBIDDEN` | 403 | Wrong role, cross-user access or Manager access to Participant data |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 400 | Invalid format, boundary or payload |
| `LOG_DATE_MISMATCH` | 400 | `logDate` differs from the current Asia/Bangkok date |
| `QUICK_COMPLETE_NOT_AVAILABLE` | 400 | Quick Complete on a Rest Day or a non-planned exercise |
| `CATEGORY_HAS_TEMPLATES` | 409 | Category cannot be deleted because templates still exist |
| `ENTRY_NOT_EDITABLE` | 409 | Sprint 2 only; not used in Sprint 1 endpoints |
| `BODY_WEIGHT_REQUIRED` | 200 | Sprint 2 calorie response only; not used in Sprint 1 |
| `INTERNAL_ERROR` | 500 | Unexpected server or database failure |

##### 1.2 Authentication pipeline

Every protected request runs: authenticate token, check role, check ownership, validate input, execute use case. A token is valid only when its signature is HS256, `now < exp`, required claims are present, the `jti` is not in `RevokedToken` and the `sub` user still exists.

The route policy registry is the single source for the middleware and the Endpoint Access Matrix. Every route must be registered with `{ method, path, featureId, auth, roles, ownership }`.

| Ownership value | Meaning |
| --- | --- |
| `none` | Any caller with an allowed role; no per-record owner |
| `self-scoped` | Data is always the caller's own; a different `userId` query parameter returns 403 |
| `resource-owner` | A `:id` record whose owner must equal the caller; non-existent id returns 404 |

##### 1.3 Route policy matrix

| Method | Path | Feature | Auth | Roles | Ownership |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | F-01 | public | - | none |
| GET | `/api/auth/me` | F-01 | required | Manager, Participant | none |
| POST | `/api/auth/logout` | F-01 | required | Manager, Participant | none |
| GET | `/api/categories` | F-02 | required | Manager, Participant | none |
| POST | `/api/categories` | F-02 | required | Manager | none |
| PUT | `/api/categories/:id` | F-02 | required | Manager | none |
| DELETE | `/api/categories/:id` | F-02 | required | Manager | none |
| GET | `/api/templates` | F-02 | required | Manager, Participant | none |
| GET | `/api/templates/:id` | F-02 | required | Manager, Participant | none |
| POST | `/api/templates` | F-02 | required | Manager | none |
| PUT | `/api/templates/:id` | F-02 | required | Manager | none |
| DELETE | `/api/templates/:id` | F-02 | required | Manager | none |
| POST | `/api/plan-items` | F-03 | required | Participant | self-scoped |
| GET | `/api/plan-items` | F-03 | required | Participant | self-scoped |
| GET | `/api/plan-items/:id` | F-03 | required | Participant | resource-owner |
| GET | `/api/user-exercises` | F-03 | required | Participant | self-scoped |
| GET | `/api/plan` | F-03 | required | Participant | self-scoped |
| POST | `/api/entries` | F-04 | required | Participant | self-scoped |
| POST | `/api/entries/quick-complete` | F-04 | required | Participant | self-scoped |
| GET | `/api/entries` | F-04 | required | Participant | self-scoped |
| GET | `/api/entries/:id` | F-04 | required | Participant | resource-owner |
| GET | `/api/profile` | F-04 | required | Participant | self-scoped |
| PUT | `/api/profile` | F-04 | required | Participant | self-scoped |
| GET | `/api/progress/daily` | F-06 | required | Participant | self-scoped |
| GET | `/api/progress/monthly` | F-06 | required | Participant | self-scoped |
| GET | `/api/health` | SYS-01 | public | - | none |

**Sprint 2 routes.** `GET/PUT /api/profile` (CHANGE-04) and `GET /api/progress/monthly` (CHANGE-06) are included for contract completeness but are **not** part of the Sprint 1 route gate; their AC are deferred.

--------------------------------------------------------------------------------

#### 2. Shared response objects

##### 2.1 User

```json
{
  "id": "uuid",
  "email": "alice@exercise.test",
  "role": "PARTICIPANT",
  "displayName": "Alice"
}
```

`passwordHash` is never returned.

##### 2.2 Category

```json
{ "id": "uuid", "name": "Weight Training", "templateCount": 2 }
```

`templateCount` appears in the list response. Create and update return `{ id, name }`.

##### 2.3 Exercise template

```json
{
  "id": "uuid",
  "category": { "id": "uuid", "name": "Cardio" },
  "name": "Outdoor Run",
  "targetBodyPart": "Legs",
  "trackingMode": "CARDIO_DISTANCE",
  "unit": "km",
  "cardioCategory": "RUNNING",
  "metValue": 9.8,
  "rangeMin": 0.5,
  "rangeMax": 42,
  "createdAt": "2026-11-05T03:00:00.000Z",
  "updatedAt": "2026-11-05T03:00:00.000Z"
}
```

`createdById` is never returned.

##### 2.4 User exercise snapshot

```json
{
  "id": "uuid",
  "sourceTemplateId": "uuid-or-null",
  "isCustom": false,
  "name": "Barbell Squat",
  "targetBodyPart": "Legs",
  "trackingMode": "WEIGHT",
  "unit": "reps",
  "cardioCategory": null,
  "metValue": 3.5,
  "rangeMin": 1,
  "rangeMax": 4000
}
```

##### 2.5 Plan item

```json
{
  "id": "uuid",
  "userExerciseId": "uuid",
  "planKey": "uuid",
  "version": 1,
  "priorityWeight": 3,
  "targetSets": 4,
  "targetRepsPerSet": 10,
  "loadKg": 40,
  "targetDurationSec": null,
  "targetDistanceKm": null,
  "effectiveFrom": "2026-11-05",
  "endDate": "2026-11-30",
  "repeatDays": [1, 3, 5],
  "createdAt": "2026-11-05T03:00:00.000Z"
}
```

`userId` is never returned.

##### 2.6 Ledger entry

```json
{
  "id": "uuid",
  "userExerciseId": "uuid",
  "logDate": "2026-11-05",
  "sets": 3,
  "totalReps": 30,
  "durationSec": null,
  "distanceKm": null,
  "kind": "MANUAL",
  "createdAt": "2026-11-05T03:00:00.000Z"
}
```

`kind` is `MANUAL` or `QUICK_COMPLETE`. `userId` is never returned.

##### 2.7 Cumulative block

```json
{
  "userExerciseId": "uuid",
  "sets": 3,
  "totalReps": 30,
  "durationSec": 0,
  "distanceKm": 0
}
```

Fields that do not apply to the exercise mode are `0` in the cumulative block.

##### 2.8 Daily progress item

```json
{
  "planItemId": "uuid",
  "userExerciseId": "uuid",
  "name": "Barbell Squat",
  "trackingMode": "WEIGHT",
  "unit": "reps",
  "priorityWeight": 3,
  "target": 40,
  "actual": 28,
  "ratio": 0.7,
  "itemScore": 2.1
}
```

Percentages and ratios are returned unrounded; the UI rounds for display.

--------------------------------------------------------------------------------

#### 3. Authentication endpoints (F-01)

##### 3.1 `POST /api/auth/login` (public)

Request:

```json
{ "email": "alice@exercise.test", "password": "<seed password>" }
```

Validation: `email` required, trimmed, 3-254 characters, valid format, lower-cased; `password` required, 1-72 characters; non-JSON body and unknown fields are rejected.

Success `200`:

```json
{
  "token": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": { "id": "uuid", "email": "alice@exercise.test", "role": "PARTICIPANT", "displayName": "Alice" }
}
```

Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`. Unknown email and wrong password return the same 401 response.

##### 3.2 `GET /api/auth/me` (authenticated)

Success `200`: the User object. Errors: `401 UNAUTHENTICATED`.

##### 3.3 `POST /api/auth/logout` (authenticated)

Success `204 No Content`; inserts `{ jti, userId, expiresAt }` into `RevokedToken`. The presented token is immediately invalid; other tokens of the same user remain valid. Errors: `401 UNAUTHENTICATED`.

--------------------------------------------------------------------------------

#### 4. Catalog endpoints (F-02)

##### 4.1 Categories

| Endpoint | Request | Success |
| --- | --- | --- |
| `GET /api/categories` | - | `200` list of Category objects sorted by name |
| `POST /api/categories` | `{ "name": "Mobility" }` | `201 { id, name }` |
| `PUT /api/categories/:id` | `{ "name": "Mobility & Stretch" }` | `200 { id, name }` |
| `DELETE /api/categories/:id` | - | `204` |

Rules: name trimmed, 1-50 characters, unique case-insensitively. Manager only for writes; Participant writes return 403. Deleting a category with templates returns `409 CATEGORY_HAS_TEMPLATES`. A well-formed missing `:id` returns 404; a malformed `:id` returns 400.

##### 4.2 Templates

`GET /api/templates?categoryId=&trackingMode=` returns a list sorted by category name, then template name. Both filters are optional; invalid values return 400. `GET /api/templates/:id` returns one template.

Create request:

```json
{
  "categoryId": "uuid",
  "name": "Outdoor Run",
  "targetBodyPart": "Legs",
  "trackingMode": "CARDIO_DISTANCE",
  "unit": "km",
  "cardioCategory": "RUNNING",
  "metValue": 9.8,
  "rangeMin": 0.5,
  "rangeMax": 42
}
```

Update uses the same fields, but `trackingMode` cannot change. `unit`, `rangeMin` and `rangeMax` are optional; defaults follow the contract.

Rules:

- `trackingMode` is one of `WEIGHT`, `BODYWEIGHT_REPS`, `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME`, `CARDIO_DISTANCE`.
- `unit` is derived from `trackingMode`: `reps`, `seconds` or `km`; a supplied unit must match.
- `cardioCategory` is required for `CARDIO_DISTANCE` and forbidden otherwise.
- `metValue` is greater than 0 and at most 25, with at most 1 decimal place.
- Template name is 1-80 characters and unique within its category, case-insensitively.
- `targetBodyPart` is 1-50 characters.
- Valid Range must satisfy `rangeMin <= rangeMax`; the maximum values are 4,000 reps, 10,800 seconds and 100 km.
- A missing well-formed `categoryId` returns 404; a malformed `categoryId` returns 400.
- Participant writes return 403 even if the body is invalid.

Success: `201` on create, `200` on update, `204` on delete. Deleting or editing a template never changes existing `UserExercise` snapshots.

--------------------------------------------------------------------------------

#### 5. Plan endpoints (F-03)

##### 5.1 `POST /api/plan-items` (Participant)

Template request:

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

Custom request:

```json
{
  "source": "CUSTOM",
  "exercise": {
    "name": "Hill Walk",
    "targetBodyPart": "Legs",
    "trackingMode": "CARDIO_DISTANCE",
    "cardioCategory": "WALKING"
  },
  "priorityWeight": 2,
  "targetDistanceKm": 3.5
}
```

Custom exercise creation is part of Sprint 1; AC-03d and AC-16a-b are verified in Sprint 2 (CHANGE-05/08).

`effectiveFrom`, `endDate` and `repeatDays` are optional. `effectiveFrom` defaults to today and must be today or later. `repeatDays` defaults to all seven days. Unknown fields are rejected.

Target fields by mode:

| Mode | Required target fields |
| --- | --- |
| `WEIGHT` | `targetSets` 1-20, `targetRepsPerSet` 1-200, `loadKg` > 0 and <= 500 |
| `BODYWEIGHT_REPS` | `targetSets` 1-20, `targetRepsPerSet` 1-200 |
| `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME` | `targetDurationSec` integer 1-10,800 |
| `CARDIO_DISTANCE` | `targetDistanceKm` > 0 and <= 100 |

The target must lie inside the snapshot's Valid Range. `priorityWeight` is an integer 1-5. The operation creates a `UserExercise` snapshot and a `PlanItem` in one transaction; on failure neither row is stored.

Success `201`:

```json
{ "userExercise": { "...": "as 2.4" }, "planItem": { "...": "as 2.5" } }
```

Errors: `400 VALIDATION_ERROR`, `401`, `403`, `404 NOT_FOUND` for a missing well-formed `templateId`.

##### 5.2 Read endpoints

| Endpoint | Success | Notes |
| --- | --- | --- |
| `GET /api/plan-items` | `200` list of plan items with snapshots | Ordered by `effectiveFrom`, then `createdAt` |
| `GET /api/plan-items/:id` | `200` plan item with snapshot | Owner only; other owner returns 403 |
| `GET /api/user-exercises` | `200` list of own snapshots | Sorted by name |
| `GET /api/plan?date=YYYY-MM-DD` | `200 { date, isRestDay, items }` | `date` defaults to today; malformed date returns 400 |

Plan resolution: for each `planKey`, take the version with the greatest `effectiveFrom <= date` (ties: highest `version`); discard it if `endDate` exists and `date > endDate`, or if the weekday is not in `repeatDays`. If no item remains, `isRestDay` is true and `items` is empty.

--------------------------------------------------------------------------------

#### 6. Ledger and profile endpoints (F-04)

##### 6.1 `POST /api/entries` (Participant)

Request fields depend on the exercise mode:

```json
{ "userExerciseId": "uuid", "sets": 3, "totalReps": 30, "logDate": "2026-11-05" }
```

```json
{ "userExerciseId": "uuid", "durationSec": 1200 }
```

```json
{ "userExerciseId": "uuid", "distanceKm": 5.25 }
```

`logDate` is optional. If present it must equal today in Asia/Bangkok, otherwise `400 LOG_DATE_MISMATCH`; a malformed date is `400 VALIDATION_ERROR`. The stored date is always today. Unknown fields are rejected.

Limits apply per entry and to the day's cumulative total per exercise:

- `sets` <= 20; `totalReps` <= `sets * 200`.
- Cumulative sets <= 20; cumulative reps <= cumulative sets * 200 and <= `rangeMax`.
- Cumulative seconds <= min(10,800, `rangeMax`).
- Cumulative kilometres <= min(100, `rangeMax`).
- Values that do not belong to the exercise mode are rejected.

Success `201`: `{ entry, cumulative }` using objects 2.6 and 2.7.

##### 6.2 `POST /api/entries/quick-complete` (Participant)

Request: `{ "userExerciseId": "uuid", "logDate": "2026-11-05" }`; `logDate` optional.

Quick Complete is available only when the exercise occurs today according to plan resolution. Otherwise `400 QUICK_COMPLETE_NOT_AVAILABLE`.

- Reps modes: create the remaining reps; raise `sets` when needed so the new entry satisfies `totalReps <= sets * 200`.
- Seconds modes: create the remaining seconds.
- Distance mode: create the remaining kilometres.
- If the target is already reached or exceeded: `200` with `entry: null` and the current cumulative; no row is stored.
- If no entry can satisfy both the per-entry and cumulative limits: `400 VALIDATION_ERROR` naming `sets`.

Success `201` with `{ entry, cumulative }` when a row is created.

##### 6.3 `GET /api/entries?date=YYYY-MM-DD` (Participant)

Success `200`:

```json
{
  "date": "2026-11-05",
  "entries": [{ "...": "as 2.6" }],
  "cumulative": [{ "...": "as 2.7" }]
}
```

`date` defaults to today. Entries are ordered by creation time. `cumulative` has one item per exercise with at least one entry on that date. Past dates are readable.

##### 6.4 `GET /api/entries/:id` (Participant, owner)

Success `200`: one entry. A non-owner returns 403; a missing well-formed id returns 404.

##### 6.5 Profile *(Sprint 2, CHANGE-04)*

Deferred to Sprint 2 with AC-17a–d; this section is not part of the Sprint 1 API gate.

`GET /api/profile` success `200`:

```json
{
  "email": "alice@exercise.test",
  "displayName": "Alice",
  "currentWeightKg": 70.0,
  "weightEffectiveDate": "2026-11-05"
}
```

`PUT /api/profile` request `{ "weightKg": 68.5 }` returns the same shape. `weightKg` is required, 1-800 inclusive, with at most 1 decimal place. Each update appends a `WeightLog` row dated today; rows are never updated or deleted. A Participant with no row has `currentWeightKg: null` and `weightEffectiveDate: null`. A Manager receives 403.

--------------------------------------------------------------------------------

#### 7. Progress endpoints (F-06)

##### 7.1 `GET /api/progress/daily?date=YYYY-MM-DD`

`date` defaults to today. Future dates and malformed dates return 400.

Success `200`:

```json
{
  "date": "2026-11-05",
  "isRestDay": false,
  "items": [{ "...": "as 2.8" }],
  "totalScore": 4.1,
  "totalWeight": 5,
  "overallPercent": 82
}
```

Rest Day: `{ "date": "...", "isRestDay": true, "items": [], "totalScore": 0, "totalWeight": 0, "overallPercent": null }`.

Rules: `ratio = min(1.0, actual / target)`; `itemScore = ratio * priorityWeight`; `overallPercent = (sum(itemScore) / sum(priorityWeight)) * 100` over items that occur. A targeted day without entries is 0%; a Rest Day is `null`. `loadKg`, body weight and entry `kind` do not affect scores. Use decimal arithmetic and return unrounded values.

##### 7.2 `GET /api/progress/monthly?month=YYYY-MM` *(Sprint 2, CHANGE-06)*

Deferred to Sprint 2 with AC-15; this section is not part of the Sprint 1 API gate.

`month` defaults to the current month. Invalid or future months return 400.

Success `200`:

```json
{
  "month": "2026-11",
  "from": "2026-11-05",
  "to": "2026-11-12",
  "targetedDays": 5,
  "restDaysExcluded": 3,
  "averagePercent": 64.3,
  "days": [
    { "date": "2026-11-05", "isRestDay": false, "overallPercent": 82 },
    { "date": "2026-11-06", "isRestDay": true, "overallPercent": null }
  ]
}
```

`from` is the later of the month start and the first `effectiveFrom` for the user; `to` is today for the current month or the month end for a past month. Future days are excluded. Rest Days are excluded from the average. A targeted day without entries counts as 0%. `averagePercent` is `null` when `targetedDays` is 0.

--------------------------------------------------------------------------------

#### 8. Health

`GET /api/health` returns `200` with a simple readiness payload. It is public and is used by deployment checks.

--------------------------------------------------------------------------------

#### 9. Traceability

| Feature | Endpoints | AC | Target tests |
| --- | --- | --- | --- |
| F-01 | `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` | AC-01a-f, AC-22a-c, AC-12a-c | `tests/integration/auth.test.ts`, `tests/integration/security_access.test.ts` |
| F-02 | `/api/categories`, `/api/templates` | AC-02a-c, AC-02d *(Sprint 2)*, AC-11, AC-12c, AC-22c, AC-27 | `tests/integration/manager_template.test.ts` |
| F-03 | `/api/plan-items`, `/api/user-exercises`, `/api/plan` | AC-03a-c, AC-03d *(Sprint 2)*, AC-16a-b *(Sprint 2)*, AC-27, AC-12a-c, AC-22c | `tests/integration/goal_config.test.ts`, `tests/integration/template_snapshot.test.ts` |
| F-04 | `/api/entries`, `/api/entries/quick-complete`, `/api/profile` *(Sprint 2)* | AC-04a-b, AC-04c-d *(Sprint 2)*, AC-10a-b, AC-10c *(Sprint 2)*, AC-13a-c, AC-14a-b, AC-17a-d *(Sprint 2)*, AC-23, AC-24a | `tests/integration/daily_logging.test.ts`, `tests/integration/quick_complete.test.ts`, `tests/integration/profile.test.ts` *(Sprint 2)* |
| F-06 | `/api/progress/daily`, `/api/progress/monthly` *(Sprint 2)* | AC-06a-f, AC-06g *(Sprint 2)*, AC-15 *(Sprint 2)*, AC-21a *(Sprint 2)* | `tests/unit/progress_calc.test.ts`, `tests/integration/progress_api.test.ts`, `tests/performance/latency.test.ts` |

--------------------------------------------------------------------------------

#### 10. Out of scope for Sprint 1

- Entry edit/delete (`PUT/DELETE /api/entries/:id`) and `ENTRY_NOT_EDITABLE` behaviour: F-05, Sprint 2.
- Profile endpoints and body-weight UI (`GET/PUT /api/profile`, AC-17a-d): F-04, Sprint 2 (CHANGE-04).
- Monthly progress (`GET /api/progress/monthly`, AC-15): F-06, Sprint 2 (CHANGE-06).
- Plan version updates (`PUT /api/plan-items/:id`): F-07, Sprint 2.
- History and streak (`/api/history`, `/api/streak`): F-08, Sprint 2.
- Calories and `BODY_WEIGHT_REQUIRED`: F-11, Sprint 2.
- Schedule and reminders: F-09, Sprint 3.
- Monthly summary: F-10, Sprint 3.

--------------------------------------------------------------------------------

#### 11. Open items

1. Decide the repository layout (`server/` + `web/` + `prisma/` per SDS 1.1.0, or `client/` + `server/prisma` with a versioned SDS/AGENTS update).
2. Resolve the off-plan custom exercise gap: there is no standalone `POST /api/user-exercises`, so a Participant can only log off-plan activity for an existing snapshot in Sprint 1.
3. Add concrete examples for every mode if the reviewer wants a fully self-contained API document.
