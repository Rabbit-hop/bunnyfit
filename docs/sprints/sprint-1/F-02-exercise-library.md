### Feature Engineering Contract: F-02 Activity Category & Base Exercise Management
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Feature ID:**  F-02
**Sprint:**  1
**Contract Version:**  0.1.0
**SRS Baseline Version:**  1.0.0 (Feature Inventory 1.0.0, RTM 1.0.0, System-Level SDS 1.0.0, F-01 contract 0.1.0)
**Date:**  4 November 2026
**Status:**  Draft: specification-only, awaiting reviewer approval before implementation
**Primary Author:**  Nakagamon  |  **Reviewer:**  Onsinee
**Repository Path:**  `docs/sprints/sprint-1/F-02-exercise-library.md`

--------------------------------------------------------------------------------

#### Contract Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 4 Nov 2026 | Initial contract: behavior, API/data/UI specification, AC (AC-02a–c; proposed AC-02d), STS, Definition of Done, list of pending baseline changes (§12) | Nakagamon | Draft |

*Rule: committed as a specification-only commit before any F-02 implementation; later changes are new versions with a reason.*

--------------------------------------------------------------------------------

#### 1. Feature Summary and Scope
F-02 is the **Manager side of the Sprint 1 journey**: the Program Manager maintains the shared exercise library (categories and base exercise templates) that Participants later select from. Participants can only read it.

| In scope | Out of scope (and where it belongs) |
| ------ | ------ |
| Category create / read / update / delete | Selecting a template and the `UserExercise` snapshot (F-03) |
| Base exercise template create / read / update / delete with `trackingMode` (6 values), unit, Valid Range, `metValue`, `cardioCategory`, target body part | Custom exercises by Participants (F-03) |
| Read-only catalog for Participants (`GET /api/categories`, `GET /api/templates`) | Using `metValue` for calories (F-11) |
| Backend 403 for any Participant write attempt | Scoring (F-06) |
| Exercise Library screen for the Manager; seed of 4 categories and 8 templates | Per-Manager ownership of templates, audit trail, bulk import (known limitations, §13) |

--------------------------------------------------------------------------------

#### 2. Linked Requirements and Dependencies
| Requirement | How F-02 serves it |
| ------ | ------ |
| **FR-02** | Manager CRUD of categories and templates; Participant read-only; 403 on Participant mutation |
| **BR-02** | Valid Range of a template may be stricter than, but never exceed, the central boundaries (Q26) |
| BR-04 / NFR-02 (shared) | F-02 routes are registered in the route policy registry and appear in the Endpoint Access Matrix |
| Decision 12 / Q10 (shared with F-03) | Template edits and deletes must not affect existing `UserExercise` snapshots (verified by AC-27, owned by F-03) |

**Depends on:** F-01 (authentication, role middleware, route policy registry) and the Foundation (schema, migrations, seed, Clock). **Downstream:** F-03 (snapshot source), F-11 (`metValue`, `cardioCategory`), F-04.

--------------------------------------------------------------------------------

#### 3. Feature Design (Feature-Level SDS)
##### 3.1 Behavior and Workflow
1. The Manager opens the Exercise Library, sees categories and templates grouped by category.
2. The Manager creates a category, then creates templates inside it; the form adapts to the chosen `trackingMode` (unit label, `cardioCategory` only for distance exercises).
3. The Manager edits or deletes templates and categories; a category with templates cannot be deleted.
4. Participants read the same catalog (through the Plan screen of F-03); they have no editing controls and the API refuses writes.
5. Every change is immediately visible to all users; there is no draft or publish step.

##### 3.2 Business Rules
| ID | Rule | Status |
| ------ | ------ | ------ |
| R1 | Only role `MANAGER` may create, update or delete categories and templates; `PARTICIPANT` is read-only (403 on writes). Authorization is checked before validation | Baseline (FR-02) |
| R2 | Category name: trimmed, 1–50 characters, unique case-insensitively | **Pending** (§12) |
| R3 | A category with at least one template cannot be deleted → 409 `CATEGORY_NOT_EMPTY` | **Pending** |
| R4 | Template name: trimmed, 1–80 characters, unique within its category (case-insensitive) | **Pending** |
| R5 | `trackingMode` is one of `WEIGHT`, `BODYWEIGHT_REPS`, `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME`, `CARDIO_DISTANCE` and **cannot be changed after creation** | Baseline B1 (values) + **Pending** (immutability) |
| R6 | `unit` is derived from `trackingMode`: `WEIGHT`, `BODYWEIGHT_REPS` → `reps`; `BODYWEIGHT_TIME`, `YOGA`, `CARDIO_TIME` → `seconds`; `CARDIO_DISTANCE` → `km`. A supplied `unit` must match | **Pending** |
| R7 | `cardioCategory` (`RUNNING`, `WALKING`, `CYCLING`, `SWIMMING`) is **required** when `trackingMode = CARDIO_DISTANCE` and **forbidden** otherwise | Baseline B3 |
| R8 | `metValue`: number greater than 0, at most 25, at most 1 decimal place | Baseline (`metValue` > 0) + **Pending** (bound) |
| R9 | `targetBodyPart`: trimmed free text, 1–50 characters | **Pending** |
| R10 | Valid Range (`rangeMin`, `rangeMax`, in the template's unit): `rangeMin ≤ rangeMax`; `rangeMin` ≥ 1 (reps, seconds) or ≥ 0.01 (km); `rangeMax` ≤ the central limit: 4,000 reps (20 sets × 200), 10,800 seconds, 100 km. Defaults when omitted: `rangeMin` = minimum value, `rangeMax` = central limit. Meaning: `rangeMin`/`rangeMax` bound the **target** of a plan, and `rangeMax` also caps an entry and the daily cumulative value (applied by F-03/F-04) | Baseline BR-02 / Q26 + **Pending** (meaning, minimum) |
| R11 | Deleting or updating a template never changes existing `UserExercise` rows; delete is a hard delete (Decision 12) | Baseline |
| R12 | The catalog is shared: no per-record owner; any Manager may modify any template | Design decision |

##### 3.3 Failure and Boundary Cases
| Case | Expected behavior |
| ------ | ------ |
| Participant sends POST / PUT / DELETE | 403 `FORBIDDEN`, no data change, even if the body is invalid |
| Unauthenticated request | 401 `UNAUTHENTICATED` |
| Name of 80 characters / 81 characters (template) | Accepted / 400 |
| `metValue` 25 / 25.1 / 3.55 / 0 | Accepted / 400 / 400 / 400 |
| `rangeMax` 4,000 reps / 4,001; 10,800 s / 10,801; 100 km / 100.01 | Accepted / 400 |
| `rangeMin` greater than `rangeMax`; `rangeMin` = `rangeMax` | 400 / accepted |
| `CARDIO_DISTANCE` without `cardioCategory`; `WEIGHT` with `cardioCategory` | 400 `VALIDATION_ERROR` naming `cardioCategory` |
| Name equal to an existing one differing only by case | 409 `DUPLICATE_NAME` |
| Same template name in a different category | Accepted |
| Delete a category that still has templates | 409 `CATEGORY_NOT_EMPTY`; nothing deleted |
| `categoryId` in a request body does not exist | 400 `VALIDATION_ERROR` naming `categoryId` |
| `:id` in the path is not a UUID | 400 `VALIDATION_ERROR` |
| `:id` is a valid UUID that does not exist | 404 `NOT_FOUND` |
| PUT tries to change `trackingMode` | 400 `VALIDATION_ERROR` naming `trackingMode` |

##### 3.4 Permissions
| Operation | Unauthenticated | Manager | Participant |
| ------ | ------ | ------ | ------ |
| `GET /api/categories`, `GET /api/templates`, `GET /api/templates/:id` | 401 | Allow | Allow |
| `POST / PUT / DELETE /api/categories` and `/api/templates` | 401 | Allow | 403 |

All F-02 routes have policy `ownership: 'none'` (shared catalog); they contain no owner-scoped route.

--------------------------------------------------------------------------------

#### 4. API Specification
Conventions follow SDS §5.1 (JSON, error envelope of SRS Appendix A.5, decimals serialized as JSON numbers).

##### 4.1 Endpoints
| Endpoint | Roles | Success | Errors |
| ------ | ------ | ------ | ------ |
| `GET /api/categories` | Manager, Participant | 200 list `[{ id, name, templateCount }]` sorted by name | 401 |
| `POST /api/categories` `{ name }` | Manager | 201 `{ id, name }` | 400, 401, 403, 409 `DUPLICATE_NAME` |
| `PUT /api/categories/:id` `{ name }` | Manager | 200 `{ id, name }` | 400, 401, 403, 404, 409 `DUPLICATE_NAME` |
| `DELETE /api/categories/:id` | Manager | 204 | 400, 401, 403, 404, 409 `CATEGORY_NOT_EMPTY` |
| `GET /api/templates?categoryId=&trackingMode=` | Manager, Participant | 200 list of templates sorted by category name, then template name; filters optional | 400 (invalid filter), 401 |
| `GET /api/templates/:id` | Manager, Participant | 200 template | 400, 401, 404 |
| `POST /api/templates` | Manager | 201 template | 400, 401, 403, 409 `DUPLICATE_NAME` |
| `PUT /api/templates/:id` | Manager | 200 template | 400, 401, 403, 404, 409 `DUPLICATE_NAME` |
| `DELETE /api/templates/:id` | Manager | 204 | 400, 401, 403, 404 |

Lists are not paginated (small catalog).

##### 4.2 Template Request and Response
Request (`POST`; `PUT` takes the same fields except `trackingMode`, which must be unchanged or omitted):
```json
{
  "categoryId": "uuid",
  "name": "Treadmill Run",
  "targetBodyPart": "Full body",
  "trackingMode": "CARDIO_DISTANCE",
  "unit": "km",
  "cardioCategory": "RUNNING",
  "metValue": 9.8,
  "rangeMin": 0.5,
  "rangeMax": 42
}
```
`unit`, `rangeMin`, `rangeMax` are optional (R6, R10). Unknown fields are rejected. Response (`201` / `200`):
```json
{
  "id": "uuid",
  "category": { "id": "uuid", "name": "Cardio" },
  "name": "Treadmill Run",
  "targetBodyPart": "Full body",
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
The response never includes `createdById`.

##### 4.3 Error Example
```json
{
  "code": "DUPLICATE_NAME",
  "message": "A category named 'Yoga' already exists",
  "fields": [{ "field": "name", "limit": "must be unique (case-insensitive)" }]
}
```
Validation errors use `VALIDATION_ERROR` with one `fields` entry per violated field.

##### 4.4 Route Policies (registered in the F-01 registry)
Each route above is registered with `featureId: 'F-02'`, `auth: 'required'`, `ownership: 'none'`; `roles: ['MANAGER', 'PARTICIPANT']` for the `GET` routes and `roles: ['MANAGER']` for `POST`, `PUT`, `DELETE`.

--------------------------------------------------------------------------------

#### 5. Data Specification
##### 5.1 Schema (Prisma)
```prisma
enum TrackingMode { WEIGHT BODYWEIGHT_REPS BODYWEIGHT_TIME YOGA CARDIO_TIME CARDIO_DISTANCE }
enum CardioCategory { RUNNING WALKING CYCLING SWIMMING }

model Category {
  id        String             @id @default(uuid())
  name      String
  createdAt DateTime           @default(now())
  templates ExerciseTemplate[]
}

model ExerciseTemplate {
  id             String          @id @default(uuid())
  categoryId     String
  category       Category        @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  name           String
  targetBodyPart String
  unit           String                       // 'reps' | 'seconds' | 'km', derived from trackingMode
  trackingMode   TrackingMode
  cardioCategory CardioCategory?
  metValue       Decimal         @db.Decimal(4, 1)
  rangeMin       Decimal         @db.Decimal(8, 2)
  rangeMax       Decimal         @db.Decimal(8, 2)
  createdById    String
  createdBy      User            @relation(fields: [createdById], references: [id])
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}
```
Constraints added by raw SQL in the migration:
- unique index on `lower(Category.name)`; unique index on `(categoryId, lower(name))` for templates;
- `CHECK (metValue > 0 AND metValue <= 25)`;
- `CHECK (rangeMin > 0 AND rangeMin <= rangeMax)`;
- `CHECK ((trackingMode = 'CARDIO_DISTANCE') = (cardioCategory IS NOT NULL))`;
- foreign key `categoryId` is `ON DELETE RESTRICT` (a second line of defense for R3).

The central limits of R10 and unit/mode consistency are enforced in the service layer (BR-02 validation module), with CHECK constraints only as a safety net.

##### 5.2 Migration and Seed
Migration `<timestamp>_exercise_library` (after the F-01 migration). Seed (idempotent, synthetic; created by the seeded Manager). METs are the planning defaults of SRS Appendix A.1:

| Category | Template | Mode | Body part | METs | Cardio category |
| ------ | ------ | ------ | ------ | ------ | ------ |
| Weight Training | Barbell Squat | `WEIGHT` | Legs | 3.5 | - |
| Weight Training | Bench Press | `WEIGHT` | Chest | 3.5 | - |
| Bodyweight | Push-up | `BODYWEIGHT_REPS` | Chest | 3.8 | - |
| Bodyweight | Plank | `BODYWEIGHT_TIME` | Core | 3.8 | - |
| Yoga | Sun Salutation | `YOGA` | Full body | 2.5 | - |
| Cardio | Jump Rope | `CARDIO_TIME` | Full body | 7.0 | - |
| Cardio | Outdoor Run | `CARDIO_DISTANCE` | Legs | 9.8 | `RUNNING` |
| Cardio | Road Cycling | `CARDIO_DISTANCE` | Legs | 8.0 | `CYCLING` |

Together they cover the 4 domains and all 6 tracking modes (SRS Appendix A.6).

--------------------------------------------------------------------------------

#### 6. UI Specification
| Element | Behavior |
| ------ | ------ |
| **Exercise Library** (Manager only) | Two areas: category list and template table grouped by category, with filters by category and tracking mode |
| Category actions | Add (name), rename (inline), delete with a confirmation dialog; delete of a non-empty category shows "This category still has templates. Delete or move them first" |
| Template form | Fields: category, name, target body part, tracking mode, `metValue`, Valid Range min and max. The unit label follows the tracking mode and is read-only; the cardio category selector appears **only** for `CARDIO_DISTANCE`; tracking mode is disabled when editing |
| Defaults | Range fields are pre-filled with the default minimum and central limit; `metValue` has no default |
| States | Loading indicator; empty state ("No exercises yet. Add the first one"); saving state disabling the button; success notice; list refreshed after every change |
| Errors | `400` messages next to the field naming the field and limit; `409 DUPLICATE_NAME` next to the name field; `403` shows the access-denied screen; `401` returns to Login (SDS §4.2) |
| Participant | No library screen and no editing controls; the catalog appears as a read-only template picker inside the Plan screen (F-03). Opening the Manager screen by URL redirects to the access-denied screen |

UI behavior is verified through the journey (AC-25: Manager creates a template, Participant selects it) and the validation display check (AC-23).

--------------------------------------------------------------------------------

#### 7. Acceptance Criteria
AC-02a–c are identical to RTM 1.0.0. AC-02d is **proposed** (not yet in RTM).

| AC | Observable outcome |
| ------ | ------ |
| **AC-02a** | Manager creates categories and base exercises for all 6 `trackingMode` values → 201 and persisted (`CARDIO_DISTANCE` requires `cardioCategory`) |
| **AC-02b** | Manager updates and deletes categories and base exercises → 200 / 204 |
| **AC-02c** | Participant `GET /api/templates` → 200; Participant POST / PUT / DELETE on templates or categories → 403 and the database is unchanged |
| **AC-02d** *(proposed)* | Conflicting or invalid library data is rejected and nothing is stored: duplicate category name or duplicate template name within a category → 409 `DUPLICATE_NAME`; deleting a category that still has templates → 409 `CATEGORY_NOT_EMPTY`; invalid template fields (name/body-part length, `unit` not matching `trackingMode`, `metValue` outside (0, 25] or with more than 1 decimal, Valid Range outside the central limits or `rangeMin` > `rangeMax`, `cardioCategory` inconsistent with `trackingMode`, change of `trackingMode`) → 400 `VALIDATION_ERROR` naming the field |

**Shared AC with other features.** AC-11 (boundary table, `boundary_validation.test.ts`): F-02 contributes the template Valid Range cases. AC-12c / AC-22c (Endpoint Access Matrix): the F-02 routes are covered in stage 2; F-02 has no owner-scoped route, so AC-12c is satisfied for F-02 by asserting that every F-02 policy is `ownership: 'none'`. AC-27 (snapshot isolation) is owned by F-03 and uses the F-02 update and delete endpoints. AC-25 (journey) uses F-02 to create the template.

--------------------------------------------------------------------------------

#### 8. Software Test Specification (STS)
File: `tests/integration/manager_template.test.ts` (AC-02). Fixtures: seeded Manager, Alice and Bob (F-01 §5.2), seeded library (§5.2), real PostgreSQL test database, "restart" = new application instance on the same database. "DB unchanged" means row counts and row contents of `Category` and `ExerciseTemplate` equal their values before the request.

| Test ID | AC | Level | Precondition / Input | Action | Expected result |
| ------ | ------ | ------ | ------ | ------ | ------ |
| **TEST-02a-1** | AC-02a | API/DB Integration | Manager logged in | `POST /api/categories` `{ "name": "Mobility" }` | 201 with `id` and `name`; one new `Category` row |
| TEST-02a-2 | AC-02a | API/DB Integration | Category "Mobility" exists | `POST /api/templates` once for each of the 6 tracking modes with valid bodies | 201 each; response `unit` is `reps`, `reps`, `seconds`, `seconds`, `seconds`, `km` respectively; 6 new rows with the submitted values |
| TEST-02a-3 | AC-02a | API/DB Integration | Same | `CARDIO_DISTANCE` template with each of `RUNNING`, `WALKING`, `CYCLING`, `SWIMMING` | 201 each; `cardioCategory` stored as sent |
| TEST-02a-4 | AC-02a | API/DB Integration | Same | `CARDIO_DISTANCE` template without `cardioCategory` | 400 `VALIDATION_ERROR` naming `cardioCategory`; no new row |
| TEST-02a-5 | AC-02a | API/DB Integration | Templates from 02a-2 created | New application instance; `GET /api/templates/:id` for each | 200 with the same data (persisted) |
| **TEST-02b-1** | AC-02b | API/DB Integration | Category "Mobility" exists | `PUT /api/categories/:id` `{ "name": "Mobility & Stretch" }` | 200 with the new name; database row updated |
| TEST-02b-2 | AC-02b | API/DB Integration | Template exists | `PUT /api/templates/:id` changing name, `targetBodyPart`, `metValue`, `rangeMax` and `categoryId` | 200; response and database show the new values; `updatedAt` is later than before |
| TEST-02b-3 | AC-02b | API/DB Integration | Empty category exists | `DELETE /api/categories/:id` | 204; the category no longer appears in `GET /api/categories` |
| TEST-02b-4 | AC-02b | API/DB Integration | Template exists | `DELETE /api/templates/:id`, then `GET /api/templates/:id` | 204, then 404 `NOT_FOUND` |
| TEST-02b-5 | AC-02b | API/DB Integration | A well-formed UUID that does not exist | `PUT` and `DELETE` on category and template | 404 `NOT_FOUND` each; database unchanged |
| **TEST-02c-1** | AC-02c | API/DB Integration | Alice logged in; seeded library | `GET /api/templates`, `GET /api/categories`, `GET /api/templates/:id` | 200 each; the list contains the 8 seeded templates; no `createdById` in any response |
| TEST-02c-2 | AC-02c | API/DB Integration | Alice logged in; DB snapshot taken | `POST`, `PUT`, `DELETE` on `/api/templates` and on `/api/categories` (6 requests, including one with an invalid body) | 403 `FORBIDDEN` for all; database unchanged |
| TEST-02c-3 | AC-02c | API/DB Integration | No token | `GET /api/templates` | 401 `UNAUTHENTICATED` |
| **TEST-02d-1** | AC-02d | API/DB Integration | Seeded category "Weight Training" | `POST` category `"weight training"`; `PUT` another category to that name | 409 `DUPLICATE_NAME` for both; database unchanged |
| TEST-02d-2 | AC-02d | API/DB Integration | Template "Push-up" in "Bodyweight" | `POST` `"push-UP"` in "Bodyweight"; then `"Push-up"` in "Yoga" | 409 `DUPLICATE_NAME`; then 201 (different category) |
| TEST-02d-3 | AC-02d | API/DB Integration | Category with templates | `DELETE /api/categories/:id`; then delete its templates and retry | 409 `CATEGORY_NOT_EMPTY` with everything intact; then 204 |
| TEST-02d-4 | AC-02d | API/DB Integration | Valid `WEIGHT` body as base | Each variation: name empty / whitespace only / 81 characters; body part empty / 51 characters; `unit` `"kg"` for `WEIGHT`; `metValue` 0, 25.1, 3.55; unknown `trackingMode`; unknown extra field; non-existent `categoryId` | 400 `VALIDATION_ERROR` naming the offending field; database unchanged |
| TEST-02d-5 | AC-02d | API/DB Integration | Valid bodies for a reps, a seconds and a km mode | Boundary pairs: `rangeMax` 4,000 / 4,001 reps; 10,800 / 10,801 s; 100 / 100.01 km; `rangeMin` 0; `rangeMin` > `rangeMax`; `rangeMin` = `rangeMax` | 201 for 4,000, 10,800, 100 and for min = max; 400 for the others |
| TEST-02d-6 | AC-02d | API/DB Integration | Valid bodies | Boundary accepted values: name of 80 characters; `metValue` 25 and 0.1 | 201 each |
| TEST-02d-7 | AC-02d | API/DB Integration | Existing `WEIGHT` template | `PUT` with `trackingMode: "YOGA"`; `PUT` giving `cardioCategory` to a `WEIGHT` template | 400 naming `trackingMode` / `cardioCategory`; unchanged |
| **TEST-11 (F-02 cases)** | AC-11 | Unit | Validation module `validateTemplate` | Same boundary pairs as TEST-02d-5 plus unit/mode derivation, asserted without HTTP | Accept / reject exactly as in TEST-02d-5; error names field and limit |
| **TEST-22c (F-02 routes)** | AC-22c | Security | Registry contains the 9 F-02 routes | No token; then a Participant token on each write route | 401; then 403 (stage 2, with the Sprint 1 matrix) |
| **TEST-12c (F-02 routes)** | AC-12c | Security | Registry | Assert every F-02 policy has `ownership: 'none'` | True for all 9 routes |

**Coverage check.** AC-02a, 02b, 02c and (proposed) 02d each have at least one test; negative, boundary and role cases are included (80/81-character names, `metValue` 25/25.1, range limits 4,000/4,001, 10,800/10,801, 100/100.01). The Manager-creates-template step of AC-25 and the AC-27 snapshot test are verified in their own contracts.

--------------------------------------------------------------------------------

#### 9. TDD Plan and Commit Sequence
| Step | Commit type | Content | Evidence kept |
| ------ | ------ | ------ | ------ |
| 1 | `docs` | This contract v0.1.0 (spec-only) | Commit ID |
| 2 | `test` (red) | TEST-02c-1 to 02c-3 with routes absent | Failing run |
| 3 | `feat` (green) | Migration, seed, `GET` routes, route policies, Manager `POST` for categories | Passing run |
| 4 | `test` (red) | TEST-02a-2 to 02a-4 and TEST-02d-4 to 02d-7 (field rules) | Failing run showing missing validation (e.g. invalid `metValue` accepted) |
| 5 | `feat` (green) | Template validation module and endpoints | Passing run |
| 6 | `test` (red) → `feat` (green) | TEST-02d-1 to 02d-3 (conflicts, non-empty category delete) | Failing then passing runs |
| 7 | `test` / `feat` | TEST-02b-1 to 02b-5, TEST-11 cases, TEST-22c / 12c, Exercise Library UI | Passing run |
| 8 | PR | Reviewed by Onsinee into `staging/sprint-1` | Review comment with a specific check |

--------------------------------------------------------------------------------

#### 10. Definition of Done for F-02
| # | Criterion | Evidence required |
| ------ | ------ | ------ |
| 1 | Contract reviewed and approved by Onsinee before implementation | Review comment; commit order |
| 2 | All endpoints, validation rules and policies implemented as specified | Code on `staging/sprint-1`; matches §4 |
| 3 | Migration and seed run on a clean database and create 4 categories and 8 templates | Command output from a fresh clone |
| 4 | All tests in §8 implemented and enabled (none skipped); each AC mapped | Test names match STS IDs |
| 5 | Tests executed on the merge commit with counts | Passed / failed / skipped counts |
| 6 | TDD red/green evidence for AC-02c and AC-02d rules | Failing and passing runs with commit IDs |
| 7 | F-02 routes included in the Endpoint Access Matrix run at Sprint 1 integration | Integration output |
| 8 | Teammate-reviewed PR with a substantive comment; integrated on staging | PR link, reviewer, comment |
| 9 | Exercise Library screen works for the Manager and is unavailable to Participants | Journey run (AC-25); screenshots with version |
| 10 | README, seed and `.env.example` current; no secret committed | Clean-clone run |
| 11 | RTM §3.1 updated (actual test names, result, commit); pending baseline items (§12) resolved or logged | Updated register |
| 12 | Incomplete work and limitations disclosed | §13 updated |

--------------------------------------------------------------------------------

#### 11. Dependencies on Other Contracts
| Item | Provided to / needed from | Note |
| ------ | ------ | ------ |
| Route policy registry, `requireRole`, error envelope | Needed from F-01 | F-02 cannot be merged before F-01 |
| Template read endpoints and fields (`trackingMode`, `unit`, `rangeMin`, `rangeMax`, `metValue`, `cardioCategory`) | Provided to F-03 | F-03 copies them into `UserExercise` |
| Template `PUT` / `DELETE` | Provided to F-03 (AC-27 test) | |
| `metValue`, `cardioCategory` | Provided to F-11 (Sprint 2) | |

--------------------------------------------------------------------------------

#### 12. Pending Baseline Impact
These items are used in this contract as **proposed** rules. The baseline documents (SRS, RTM, sprint plan, SDS, F-01 contract) are deliberately **not edited yet**; all pending items from the F-02, F-03, F-04 and F-06 contracts are applied together in one batch after the contract drafts are reviewed, before the Sprint 1 checkpoint on Fri 6 Nov.

| # | Pending item | Baseline document(s) affected |
| ------ | ------ | ------ |
| P1 | AC-02d added (RTM: +1 atomic AC; Sprint 1 count; Tier B) | RTM, sprint plan |
| P2 | Name uniqueness: category (case-insensitive), template within category | SRS (new Q), SDS §3.2 |
| P3 | Category delete blocked when it has templates | SRS (new Q) |
| P4 | `unit` derived from `trackingMode` | SRS (new Q) |
| P5 | `metValue` ≤ 25 with 1 decimal; target body part 1–50 and names 1–80 characters | SRS (new Q) |
| P6 | Valid Range meaning (bounds target; `rangeMax` caps entries and daily cumulative), minimum values and defaults | SRS (Q26 clarification) |
| P7 | `trackingMode` immutable after creation | SRS (new Q) |
| P8 | New error codes `DUPLICATE_NAME`, `CATEGORY_NOT_EMPTY`, `NOT_FOUND` | SRS Appendix A.5, SDS §12 item 2 |
| P9 | Wording fix in the F-01 contract: "F-02 to F-06" should read "F-02, F-03, F-04 and F-06" (F-05 is Sprint 2) | F-01 contract |

--------------------------------------------------------------------------------

#### 13. Known Limitations and Open Questions
| # | Item | Position |
| ------ | ------ | ------ |
| 1 | Any Manager can edit or delete any template; no per-Manager ownership or audit trail | Acceptable for the course scope (one Manager role) |
| 2 | Hard delete leaves `UserExercise.sourceTemplateId` pointing to a missing template | By design (Decision 12); the snapshot holds all needed data |
| 3 | METs in the seed are planning defaults pending verification against the Compendium of Physical Activities (SRS Appendix A.1) | Check before Sprint 2 (F-11); update seed and AC-16a, AC-20, AC-28 together |
| 4 | Decimal serialization as JSON numbers can lose precision for unusual values | Limited to 2 decimals for ranges and 1 for `metValue`; acceptable |
| 5 | No pagination or search of the catalog | Small data set; revisit only if the catalog grows |
