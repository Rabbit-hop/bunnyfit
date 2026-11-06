### System-Level Software Design Specification (System-Level SDS)
**Project Title:**  Habit and Activity Tracking System (Exercise Domain)
**Course:**  CPE 334 Software Engineering
**Document Version:**  1.1.0
**SRS Baseline Version:**  1.1.0
**Date:**  6 November 2026
**Status:**  Approved Baseline

--------------------------------------------------------------------------------

#### Document Revision History
| Version | Date | Description of Changes | Author(s) | Status |
| ------ | ------ | ------ | ------ | ------ |
| **0.1.0** | 4 Nov 2026 | Initial draft derived from SRS 1.0.0, Feature Inventory 1.0.0 and RTM 1.0.0: architecture and stack, data model, UI structure, API conventions, role/permission matrix, authentication design, configuration, delivery and deployment plan, testability design | Nakagamon (67070501064) & Onsinee (67070501078) | Draft |
| **1.0.0** | 4 Nov 2026 | Finalized baseline v1.0.0. Synchronized error codes (`NOT_FOUND`, `CATEGORY_HAS_TEMPLATES`, `INTERNAL_ERROR`, `QUICK_COMPLETE_NOT_AVAILABLE`), explicit backend HTTP 400 validation for Quick Complete on Rest Days, retained `ReminderSetting` fields (`label`, `enabled`), and added explicit AC references for template snapshot isolation (AC-27) and historical `WeightLog` lookup (AC-28a–c). | Nakagamon (67070501064) & Onsinee (67070501078) | **Approved Baseline** |
| **1.1.0** | 6 Nov 2026 | Endpoint catalog corrected against the Sprint 1 contracts (v0.2.0), Section 5.2: removed the non-existent `GET/POST /api/exercises` and `GET /api/exercises/:id`, added `GET /api/plan-items/:id` (F-03), `GET /api/user-exercises`, `GET /api/plan?date=` (F-03) and `GET /api/entries/:id` (F-04). Added the API representation of `repeatDays` (ISO weekday array exchanged at the boundary, stored as the Section 3.2 Monday–Sunday bitmask), which resolves contract pending item F-03 P3-9. Schema and Section 3.3 unchanged (already matched by contracts 0.2.0). Review-fix pass before merge: Section 1 cites SRS / Feature Inventory / RTM 1.1.0 and the SRS Baseline Version header is 1.1.0; Section 5.2 `GET/PUT /api/profile` is Sprint 2 (CHANGE-04, AC-17a–d deferred) and `GET /api/progress/monthly` is Sprint 2 (CHANGE-06, AC-15 deferred); the service-layer row (Section 4) states the entry/Quick Complete row lock (SRS Q45) and the decision log cites SRS Q1–Q49. Review-fix pass (PR #13): NFR-01 row now lists AC-21a as Sprint 2 (CHANGE-03). | Nakagamon (67070501064) & Onsinee (67070501078) | **Approved Baseline** |

--------------------------------------------------------------------------------

#### 1. Purpose & Relationship to Other Documents
This document defines the **system-wide design** of the Habit and Activity Tracking System: stack, components, data model, UI and API conventions, roles and ownership, authentication, configuration and the planned deployment. Feature-level behavior (workflow, validation, exact request/response shapes, AC and STS) is specified later in the **feature contracts** (`docs/sprints/sprint-N/F-xx.md`); this document gives the rules those contracts must follow.

| Document | Role |
| ------ | ------ |
| SRS 1.1.0 | What the system must do (FR/BR/NFR, decisions Q1–Q49, Appendix A) |
| Feature Inventory 1.1.0 | Features F-01 – F-11 and SYS-01, dependencies, sprint allocation |
| RTM 1.1.0 | Requirement → feature → sprint → AC → test traceability |
| **System-Level SDS (this document)** | How the system is structured and which rules apply to every feature |
| Sprint plan | When each feature is built (`docs/sprints/plan.md`) |

--------------------------------------------------------------------------------

#### 2. Architecture & Stack
##### 2.1 Stack Decisions
The product is a **modular monolith** packaged as one Docker image: a TypeScript API that also serves the built web UI, backed by PostgreSQL. Three logical layers do not require three servers or containers.

| Concern | Decision | Rationale | Status |
| ------ | ------ | ------ | ------ |
| Language | TypeScript (UI, API, tests) | One language across the product; tests in the SRS/RTM are `.ts` | Decided |
| Runtime / API framework | Node.js with Express | Supertest-based API integration tests are specified in the RTM | Decided |
| Web UI | Single-page application (React), built to static files and served by the API container | One origin, no CORS, one deployable | Decided |
| Database | PostgreSQL | Durable relational storage, CHECK constraints, transactions (SRS Assumption 3) | Decided |
| Data access | Prisma ORM with versioned migrations and a seed script | SRS NFR-04, Assumption 3 | Decided |
| Authentication | Local passwords hashed with `bcrypt`; JWT (HS256, 1 hour) with `jti`; `RevokedToken` denylist | SRS FR-01, Q9, B4 | Decided |
| Testing | Vitest (unit, integration, system), Supertest (HTTP), Playwright (UI E2E) | RTM test-level plan | Decided |
| Packaging / delivery | Docker (multi-stage), GitHub Actions, GCP | Course requirement, Lab 5 | Planned (see Section 9) |

##### 2.2 Component Diagram
```mermaid
flowchart LR
  U["Browser: Web UI (SPA)"] -->|"HTTPS, JSON, Bearer JWT"| H
  subgraph APP["App container (modular monolith)"]
    H["HTTP layer: routes, auth, role and ownership checks, input validation"] --> S["Service layer: use cases and business rules"]
    S --> D["Domain functions (pure): scoring, streak, calories, plan resolution"]
    S --> R["Data access: Prisma repositories"]
    C["Injectable Clock (Asia/Bangkok)"] -.-> S
  end
  R -->|SQL| DB[("PostgreSQL: durable storage")]
```

##### 2.3 Component Responsibilities
| Component | Responsibility | Must NOT do |
| ------ | ------ | ------ |
| **Web UI** | Screens, navigation, forms, display of server results and error messages, role-based menu visibility, early input hints | Be the only place a rule is enforced; hold business logic that decides outcomes |
| **HTTP layer** | Routing, token verification, role check, ownership check, request validation, mapping errors to the error envelope | Contain business rules or SQL |
| **Service layer** | One use case per operation (e.g. quick-complete, change plan item); enforces BR-01, BR-02, BR-05, BR-09 etc.; runs transactions; entry and Quick Complete writes for one exercise and day take a row lock on `UserExercise` (`SELECT … FOR UPDATE`, SRS Q45) | Read request/response objects or the system clock directly |
| **Domain functions** | Pure, deterministic calculations: item score, daily overall %, monthly average, streak, estimated minutes, calories, plan resolution | Touch the database, clock or network |
| **Data access** | Prisma queries, always filtered by owner where data is private | Decide permissions |
| **PostgreSQL** | Persistence, referential integrity, CHECK constraints as a last line of defense | Hold business logic in triggers |

##### 2.4 Where Each Rule Is Enforced
Server-side enforcement is authoritative. UI checks are a convenience; DB constraints are a safety net.

| Rule | Authoritative enforcement | Also present in |
| ------ | ------ | ------ |
| BR-04 / NFR-02 authorization and privacy | HTTP layer (route policy) + service ownership check | Repository queries scoped by `userId` |
| BR-01 no backdating | Service layer, using the injectable Clock | UI sends no date by default |
| BR-02 boundaries | Service layer (shared validation module) | DB CHECK constraints; UI hints |
| BR-05 / BR-06 ledger, Quick Complete, Rest Day, No-op | Service layer → 400 `QUICK_COMPLETE_NOT_AVAILABLE` on Rest Days (AC-04b); 200 `entry: null` on completed | UI hides/disables Quick Complete on Rest Days |
| BR-09 same-day edit/delete | Service layer → 409 `ENTRY_NOT_EDITABLE` | UI disables old entries |
| BR-10 / BR-11 streak, plan versioning | Domain functions over versioned `PlanItem` rows | - |
| BR-12 calories | Domain function + `WeightLog` lookup (AC-20, AC-28a–c) | - |

##### 2.5 Indicative Repository Layout
```text
server/            # API: routes/, middleware/, services/, domain/, repositories/, config/
web/               # SPA source and build output
prisma/            # schema.prisma, migrations/, seed.ts
tests/             # unit/, integration/, e2e/, system/, performance/  (paths as in the RTM)
docs/              # srs.md, features.md, traceability.md, system-sds.md, sprints/
Dockerfile  docker-compose.yml  .env.example  .github/workflows/
```

##### 2.6 Time Handling
All "today" decisions use the **Asia/Bangkok** calendar date. The server obtains time only through an injectable `Clock` (default: system time converted to Asia/Bangkok). Dates are stored as date-only values (`YYYY-MM-DD`); timestamps as UTC. Tests replace the Clock to cover midnight boundaries (SRS Q29): AC-10c, AC-18a, AC-19d.

--------------------------------------------------------------------------------

#### 3. Data Model
##### 3.1 Entity-Relationship Diagram
```mermaid
erDiagram
  User ||--o{ UserExercise : owns
  User ||--o{ PlanItem : owns
  User ||--o{ LedgerEntry : owns
  User ||--o{ WeightLog : owns
  User ||--o{ ReminderSetting : owns
  User ||--o{ RevokedToken : revokes
  User ||--o{ ExerciseTemplate : "created by (Manager)"
  Category ||--o{ ExerciseTemplate : groups
  ExerciseTemplate |o..o{ UserExercise : "copied from (no FK)"
  UserExercise ||--o{ PlanItem : "planned as"
  UserExercise ||--o{ LedgerEntry : "logged as"
  User {
    uuid id PK
    string email UK
    string passwordHash
    string role
    string displayName
  }
  RevokedToken {
    string jti PK
    uuid userId FK
    datetime expiresAt
  }
  Category {
    uuid id PK
    string name UK
  }
  ExerciseTemplate {
    uuid id PK
    uuid categoryId FK
    string name
    string trackingMode
    decimal metValue
    string cardioCategory
  }
  UserExercise {
    uuid id PK
    uuid userId FK
    uuid sourceTemplateId "plain column, no FK"
    string trackingMode
    decimal metValue
  }
  PlanItem {
    uuid id PK
    uuid planKey
    int version
    uuid userId FK
    uuid userExerciseId FK
    date effectiveFrom
  }
  LedgerEntry {
    uuid id PK
    uuid userId FK
    uuid userExerciseId FK
    date logDate
    string kind
  }
  WeightLog {
    uuid id PK
    uuid userId FK
    decimal weightKg
    date effectiveDate
  }
  ReminderSetting {
    uuid id PK
    uuid userId FK
    string timeOfDay
    string repeatDays
    string label
    boolean enabled
  }
```

##### 3.2 Entity Definitions
Every private row has a `userId` owner link. `createdAt` (and `updatedAt` where rows can change) exist on all tables.

| Entity | Key fields | Constraints and notes | Sprint |
| ------ | ------ | ------ | ------ |
| **User** | `id`, `email`, `passwordHash`, `role` (`MANAGER` / `PARTICIPANT`), `displayName` | `email` unique (stored lowercase); `passwordHash` is a bcrypt hash only; one role per account; seeded, no self-registration | 1 |
| **RevokedToken** | `jti` (PK), `userId`, `expiresAt`, `revokedAt` | Row inserted at logout; rows with `expiresAt` in the past may be purged; index on `expiresAt` | 1 |
| **Category** | `id`, `name` | `name` unique; grouping label only, seeded with the 4 domains (Q25) | 1 |
| **ExerciseTemplate** (Base Exercise) | `id`, `categoryId`, `name`, `targetBodyPart`, `unit`, `rangeMin`, `rangeMax`, `trackingMode` (6 values), `metValue`, `cardioCategory`, `createdById` | `metValue` > 0; `cardioCategory` required iff `trackingMode = CARDIO_DISTANCE`; `rangeMin`/`rangeMax` within BR-02 limits (Q26); created only by a Manager | 1 |
| **UserExercise** | `id`, `userId`, `sourceTemplateId`, `name`, `targetBodyPart`, `unit`, `trackingMode`, `metValue`, `cardioCategory`, `rangeMin`, `rangeMax`, `isCustom` | Snapshot copied at selection time; `sourceTemplateId` is a plain column **without a foreign key**, so template edits/deletes never alter it (Decision 12, AC-27); custom exercises get default METs from SRS Appendix A.1 | 1 |
| **PlanItem** | `id`, `planKey`, `version`, `userId`, `userExerciseId`, `targetSets`, `targetRepsPerSet`, `loadKg`, `targetDurationSec`, `targetDistanceKm`, `priorityWeight`, `repeatDays`, `effectiveFrom`, `endDate` | Target columns used depend on `trackingMode` (Q21); `priorityWeight` 1–5 integer; `repeatDays` is a Monday–Sunday bitmask (default: all days); unique (`planKey`, `version`); rows are **never updated in place** — a goal change inserts a new version (F-07) | 1 (S2 adds versions) |
| **LedgerEntry** | `id`, `userId`, `userExerciseId`, `logDate`, `sets`, `totalReps`, `durationSec`, `distanceKm`, `kind` (`MANUAL` / `QUICK_COMPLETE`) | Values non-negative and within BR-02 (`totalReps ≤ sets × 200`); `logDate` equals the creation date (Asia/Bangkok); editable/deletable only while `logDate` is today (BR-09); duration stored in seconds | 1 (S2 edit/delete) |
| **WeightLog** | `id`, `userId`, `weightKg`, `effectiveDate` | **Append-only**: no update/delete operation exists; `weightKg` CHECK between 1 and 800 (one decimal place, SRS Q44); queried via latest `effectiveDate <= logDate` (AC-28a–c) | table and seed: 1; profile endpoints: 2 |
| **ReminderSetting** | `id`, `userId`, `timeOfDay` (HH:mm), `repeatDays`, `label`, `enabled` | Stored and displayed only; no delivery component exists (Exclusion 6) | 3 |

Indexes: `LedgerEntry(userId, logDate)`, `PlanItem(userId, effectiveFrom)`, `WeightLog(userId, effectiveDate)`, `UserExercise(userId)`, `RevokedToken(expiresAt)`.

##### 3.3 Plan Resolution (Plan Versioning, BR-11)
For a user and a date *d*, each `planKey` contributes **at most one** occurrence:
1. Take the version with the greatest `effectiveFrom ≤ d` (ties: highest `version`).
2. Discard it if `endDate` exists and *d* > `endDate`, or if the weekday of *d* is not in `repeatDays`.

The resulting set is the day's **targeted items**. If it is empty, *d* is a **Rest Day** (Q24). A goal change inserts a new version with `effectiveFrom` = today, so every earlier date still resolves to the earlier version and past scores and streaks are unchanged (AC-07b).

##### 3.4 Derived Values (Not Stored)
Item Score, Daily Overall %, monthly average, Streak, estimated minutes, calories and the monthly summary are **computed on read** by pure domain functions from plan resolution, ledger entries and `WeightLog`. Nothing is cached in the database, so there is no stale aggregate to correct after an edit (F-05) or a plan change (F-07). If NFR-01 is at risk, the first remedy is indexing and range-limited queries, not stored aggregates.

##### 3.5 Database Setup, Migrations and Seed Data
- **Migrations:** Prisma migrations are committed; `prisma migrate dev` locally, `prisma migrate deploy` in CI and in the deployment pipeline. The schema is never changed by hand.
- **Seed (`prisma/seed.ts`):** meets SRS Appendix A.6 — 1 Manager, ≥ 2 Participants (one without any `WeightLog`), 4 categories, templates covering all 6 `trackingMode` values. Seed passwords come from environment variables or the private course handoff and are stored only as bcrypt hashes. The seed can also insert dated historical rows for date-dependent tests.
- **Test database:** a separate `DATABASE_URL_TEST`; each integration suite starts from migrations plus a known seed and cleans up after itself.
- **Durability:** data lives only in PostgreSQL (never in the container filesystem), so restart and redeployment do not lose data (NFR-04, AC-24).

--------------------------------------------------------------------------------

#### 4. UI Structure & Conventions
##### 4.1 Screens and Navigation
| Role | Screen | Purpose | Features |
| ------ | ------ | ------ | ------ |
| Both | **Login** | Email/password; redirects by role | F-01 |
| Both | **Header / session menu** | Current user (`/me`), logout | F-01 |
| Manager | **Exercise Library** | Categories and base exercise templates: list, create, edit, delete | F-02 |
| Participant | **Today (Dashboard)** | Planned items for today, progress per item, Daily Overall %, manual log form, Quick Complete (disabled on Rest Days), entry list, estimated kcal | F-04, F-06, F-05, F-11 |
| Participant | **Plan** | Choose a template or create a custom exercise, set targets, priority, repeat days, start/end; change a goal (new version) | F-03, F-07 |
| Participant | **History & Streak** | Past days, daily %, current Streak | F-08 |
| Participant | **Schedule & Reminders** | Week/month schedule, reminder settings (display only) | F-09 |
| Participant | **Monthly Summary** | Monthly report | F-10 |
| Participant | **Profile** | View/update body weight (Sprint 2, CHANGE-04) | F-04 |

Route guards hide screens a role cannot use, but this is **not** authorization; the API rejects the request regardless (Section 6).

##### 4.2 Shared UI Behavior
| Situation | Behavior |
| ------ | ------ |
| Loading | Visible loading indicator; actions disabled while a request is pending to prevent double submission |
| Empty | Explanatory empty state with the next action (e.g. "No plan yet — choose an exercise") |
| Validation error (400) | Message next to the field naming the field and its limit (e.g. "Sets must be 20 or fewer"), using the `fields` array of the error envelope (NFR-03, AC-23) |
| Business-rule rejection | Clear notice with the rule's reason (e.g. `LOG_DATE_MISMATCH`, `QUICK_COMPLETE_NOT_AVAILABLE`, `ENTRY_NOT_EDITABLE`); Quick Complete is disabled on Rest Days with an explanation |
| 401 | Session cleared, redirect to Login with a "please sign in again" notice |
| 403 | "You do not have access" screen; no private data shown |
| Network / 5xx | Generic retry message; no stack traces or internal details |
| Dates and units | Dates shown in Asia/Bangkok; weight in kg, distance in km, duration entered as minutes/seconds and stored as seconds |

--------------------------------------------------------------------------------

#### 5. API Approach
##### 5.1 Conventions
- **Style:** JSON over HTTPS, resources under `/api`, plural nouns (`/api/entries`), verbs only for named actions (`/api/entries/quick-complete`).
- **Authentication:** `Authorization: Bearer <JWT>` on every endpoint except `POST /api/auth/login` and `GET /api/health`.
- **Identity comes from the token only.** Participant-owned data is never addressed by a user ID in the path. Self-scoped endpoints (profile, progress, history, summary, schedule) reject a `userId` query parameter that differs from the authenticated user with 403.
- **Formats:** dates `YYYY-MM-DD`; times `HH:mm`; durations in seconds; distance in km; weight in kg.
- **Plan weekdays:** `repeatDays` is exchanged as a non-empty array of unique ISO weekdays (1 = Monday … 7 = Sunday) and stored as the Section 3.2 Monday–Sunday bitmask (`127` = every day); `GET /api/plan?date=` returns the resolved `isRestDay` and `items`.
- **Validation:** every request body/query is validated against a schema before reaching a service; unknown fields are rejected.
- **Status codes:** 200/201/204 success; 400 validation or business-rule input errors (`QUICK_COMPLETE_NOT_AVAILABLE`, `LOG_DATE_MISMATCH`, `VALIDATION_ERROR`); 401 unauthenticated; 403 forbidden; 404 resource does not exist (`NOT_FOUND`); 409 state conflict (`ENTRY_NOT_EDITABLE`, `CATEGORY_HAS_TEMPLATES`); 500 unexpected (`INTERNAL_ERROR`).
- **Error envelope (SRS Appendix A.5):** `{ "code": string, "message": string, "fields": [{ "field": string, "limit": string }] }`. Messages never include stack traces, SQL, tokens or other users' data. Unknown/internal errors are logged server-side only.
- **Idempotence of Quick Complete:** repeating it after the target is reached returns 200 with `entry: null` (BR-05).

##### 5.2 Indicative Endpoint Catalog
Exact request/response shapes are defined in each feature contract; this catalog fixes names, ownership and who may call them.

| Endpoint | Feature | Sprint |
| ------ | ------ | ------ |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | F-01 | 1 |
| `GET /api/categories`, `GET /api/templates`, `GET /api/templates/:id` | F-02 | 1 |
| `POST/PUT/DELETE /api/categories`, `POST/PUT/DELETE /api/templates` | F-02 | 1 |
| `GET/POST /api/plan-items`, `GET /api/plan-items/:id` | F-03 | 1 |
| `GET /api/user-exercises`, `GET /api/plan?date=` | F-03 | 1 |
| `PUT /api/plan-items/:id` (creates a new version) | F-07 | 2 |
| `GET/POST /api/entries`, `GET /api/entries/:id`, `POST /api/entries/quick-complete` | F-04 | 1 |
| `PUT/DELETE /api/entries/:id` | F-05 | 2 |
| `GET /api/progress/daily?date=`, `GET /api/progress/monthly?month=` | F-06 (kcal fields: F-11) | daily: 1; monthly (AC-15, CHANGE-06) and kcal fields: 2 |
| `GET/PUT /api/profile` | F-04 | 2 (CHANGE-04) |
| `GET /api/history`, `GET /api/streak` | F-08 | 2 |
| `GET /api/schedule?view=`, `GET/POST /api/reminders`, `PUT/DELETE /api/reminders/:id` | F-09 | 3 |
| `GET /api/summary?month=` | F-10 | 3 |
| `GET /api/health` | SYS-01 (deployment check) | 1 |

--------------------------------------------------------------------------------

#### 6. Roles, Permissions & Ownership
##### 6.1 Role/Permission Matrix
Legend: **Allow** = permitted; **401** = rejected as unauthenticated; **403** = rejected as forbidden; "other's record" = a record owned by a different Participant. A Manager never receives Participant activity data (BR-04, Exclusion 3).

| Operation | Unauthenticated | Manager | Participant (own record) | Participant (other's record) |
| ------ | ------ | ------ | ------ | ------ |
| Login | Allow | Allow | Allow | - |
| `GET /me`, logout | 401 | Allow | Allow | - |
| Read categories / templates | 401 | Allow | Allow (read-only) | - (shared catalog) |
| Create / update / delete categories and templates | 401 | Allow | 403 | - |
| Create/read own exercises and plan items | 401 | 403 | Allow | 403 |
| Change a plan item (new version) | 401 | 403 | Allow | 403 |
| Create manual entry / Quick Complete | 401 | 403 | Allow | 403 |
| Edit / delete entry | 401 | 403 | Allow (today only, else 409) | 403 |
| Daily/monthly progress, history, streak | 401 | 403 | Allow | 403 |
| Read / update profile and body weight | 401 | 403 | Allow | 403 |
| Schedule and reminder settings | 401 | 403 | Allow | 403 |
| Monthly summary | 401 | 403 | Allow | 403 |
| `GET /api/health` | Allow | Allow | Allow | - |

##### 6.2 Enforcement Pipeline (every protected request)
1. **Authenticate:** verify JWT signature (algorithm pinned to HS256; `alg: none` rejected), expiry, and that `jti` is not in `RevokedToken` → otherwise 401 `UNAUTHENTICATED`.
2. **Authorize role:** compare the route's allowed roles with the token role → otherwise 403 `FORBIDDEN`.
3. **Check ownership:** for `:id` resources, load the owner and compare with the authenticated user → otherwise 403; no private fields are returned. Queries for collections are always filtered by the authenticated `userId`.
4. **Validate input** → 400 `VALIDATION_ERROR`.
5. **Execute the use case** (service layer, rules, transaction) → business-rule errors as in SRS Appendix A.5.

##### 6.3 Declarative Route Policy
Every route is registered together with a **policy object** (`method`, `path`, allowed roles, ownership type, feature ID). The same registry drives (a) the middleware above and (b) the **Endpoint Access Matrix tests** AC-12c / AC-22c, which fail if a registered route has no policy or is missing from the matrix. A new endpoint therefore cannot be added without declaring who may call it, which covers endpoints added after Sprint 1.

--------------------------------------------------------------------------------

#### 7. Authentication & Session Design
| Aspect | Design |
| ------ | ------ |
| Credentials | Seeded accounts only; passwords hashed with `bcrypt` (cost 10 initially; tuned against the login latency target of NFR-01); no plaintext in DB, logs or Git |
| Login | `POST /api/auth/login` verifies email and password; failure returns the same 401 `INVALID_CREDENTIALS` message for unknown email and wrong password |
| Token | JWT (HS256) signed with `JWT_SECRET`; claims `sub` (user ID), `role`, `jti`, `iat`, `exp` = 1 hour; no refresh token |
| Client storage | Token held by the SPA in `sessionStorage` and sent in the `Authorization` header; cleared on logout and on any 401. Chosen over cookies to avoid CSRF handling; the XSS exposure is reduced by never injecting unescaped HTML |
| Current user | `GET /api/auth/me` returns `{ id, email, role, displayName }` |
| Logout | `POST /api/auth/logout` inserts `jti` and `expiresAt` into `RevokedToken`; later requests with that token are rejected with 401, including after a restart because the denylist is in PostgreSQL |
| Expiry | Expired tokens are rejected with 401; expired denylist rows can be purged |
| Out of scope | Self-registration, password recovery, email verification, multiple roles per account (Exclusion 4) |

--------------------------------------------------------------------------------

#### 8. Configuration & Secrets
Configuration is read from environment variables; nothing is hard-coded. A committed **`.env.example`** lists names with placeholder values only.

| Variable | Purpose | Example (placeholder) | Secret |
| ------ | ------ | ------ | ------ |
| `NODE_ENV` | Mode | `production` | No |
| `PORT` | HTTP port | `8080` | No |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:***@host:5432/app` | **Yes** |
| `DATABASE_URL_TEST` | Test database | `postgresql://user:***@localhost:5432/app_test` | **Yes** |
| `JWT_SECRET` | JWT signing key (≥ 32 random bytes) | `change-me` | **Yes** |
| `JWT_EXPIRES_IN_SECONDS` | Token lifetime | `3600` | No |
| `BCRYPT_COST` | Hash cost | `10` | No |
| `APP_TIMEZONE` | Business-date timezone | `Asia/Bangkok` | No |
| `SEED_MANAGER_PASSWORD`, `SEED_PARTICIPANT_PASSWORD` | Seed account passwords (or private handoff) | `change-me` | **Yes** |
| `LOG_LEVEL` | Logging verbosity | `info` | No |

Secret handling: real values live only in the local untracked `.env` and in the deployment secret store (Section 9); `.env` is git-ignored; secrets never appear in client code, logs, error bodies or the submitted PDF.

--------------------------------------------------------------------------------

#### 9. Delivery & Deployment Plan
Subject to the access and instructions provided in **Lab 5**; designed now so no rework is needed.

##### 9.1 Local Development
`docker compose up` starts PostgreSQL (with a named volume) and the app; `prisma migrate deploy` and the seed run on first start. The same image is used locally and in the cloud. Build, test and run commands are documented in the README.

##### 9.2 Docker Image
Multi-stage build: install and build UI and API, then a slim runtime image running as a non-root user, exposing `PORT`, with a `GET /api/health` health check. No secrets are baked into the image.

##### 9.3 CI/CD (GitHub Actions)
| Trigger | Checks |
| ------ | ------ |
| Pull request into a sprint staging branch | Install, type-check, build, unit tests, API/DB integration tests against a PostgreSQL service container (migrations + seed) |
| Release pull request into `main` | All of the above + Playwright UI E2E + system tests; required checks block the merge (branch protection) |
| Merge to `main` | Build and push image; run `prisma migrate deploy`; deploy; post-deployment smoke check (`/api/health`, login, one persisted read) |
| On demand / release PR | Latency benchmark (NFR-01) on a seeded database |

A deliberately failing check on a temporary branch demonstrates that the normal merge/release path is blocked (Lab 5).

##### 9.4 Planned GCP Components
| Component | Use |
| ------ | ------ |
| Artifact Registry | Stores the Docker images |
| Cloud Run | Runs the container (one service; UI and API together) |
| Cloud SQL for PostgreSQL | Durable database; survives restarts and redeployments |
| Secret Manager | `DATABASE_URL`, `JWT_SECRET`, seed passwords, injected as environment variables |
| GitHub Actions | Builds and deploys from `main` (manual approval step allowed) |

Migrations run as a pipeline step before traffic moves to the new revision. After each deployment the smoke check confirms that previously saved data is still retrievable (AC-24b).

##### 9.5 Branches and Releases
`main` (released) ← `staging/sprint-N` (integration) ← `feature/F-xx-…` / `fix/…`. Authors do not approve their own PRs. Each accepted release on `main` is tagged (e.g. `sprint1-v1.0.0`); later commits never silently replace a submitted tag.

--------------------------------------------------------------------------------

#### 10. Testability Design
| Need | Design response |
| ------ | ------ |
| Date-dependent rules despite no backdating | Injectable `Clock`; seed/test factories can insert dated rows (Assumption 4, Q29) |
| Pure rule tests | Scoring, streak, calories and plan resolution are pure functions with no I/O (unit tests, AC-06, AC-14, AC-15, AC-20) |
| Persistence and permission tests | Integration tests use a real PostgreSQL test database through the HTTP layer (Supertest), not mocks |
| Access to every route | Declarative route policy + parametrized Endpoint Access Matrix (Section 6.3) |
| Repeatable runs | Known seed, per-suite cleanup, no dependence on test order |
| Latency | Seeded dataset of documented size; 500 requests per endpoint at concurrency 50 (NFR-01) |

--------------------------------------------------------------------------------

#### 11. Design Response to Non-Functional Requirements
| NFR | Design response | Verified by |
| ------ | ------ | ------ |
| NFR-01 Performance | Indexed range queries; computed-on-read with limited scope; bcrypt cost tuned; one process, no network hop except the DB | AC-21a (S2), AC-21b (S3) |
| NFR-02 Security | Enforcement pipeline Section 6.2; pinned JWT algorithm; denylist; uniform error envelope; declarative route policy | AC-22a–c, AC-12a–c |
| NFR-03 Usability feedback | Error envelope with `fields`; shared UI behaviors Section 4.2 | AC-23 |
| NFR-04 Durability | Data only in PostgreSQL; migrations; Cloud SQL; denylist persisted | AC-24a–b |

--------------------------------------------------------------------------------

#### 12. Open Items and Decisions to Confirm
| # | Item | Proposed resolution | Owner |
| ------ | ------ | ------ | ------ |
| 1 | UI library and API framework (Section 2.1) | Express framework and React single-page app selected | Both |
| 2 | Error codes missing from SRS Appendix A.5 (`NOT_FOUND`, `CATEGORY_HAS_TEMPLATES`, `INTERNAL_ERROR`, `QUICK_COMPLETE_NOT_AVAILABLE`) | **Resolved:** Added and baseline-approved in SRS 1.0.0 Appendix A.5 | Nakagamon (67070501064) |
| 3 | Cross-user access returns 403 (SRS BR-04) even when the ID exists, which reveals that the ID exists | Accepted trade-off; documented here | Both |
| 4 | Token stored in `sessionStorage` rather than an HttpOnly cookie | Accepted for simplicity; revisit if time allows in Sprint 3 | Onsinee (67070501078) |
| 5 | GCP component choice (Section 9.4) | Confirm against Lab 5 instructions | Nakagamon (67070501064) |
| 6 | `userId` query parameter on self-scoped endpoints is rejected with 403 if different (Section 5.1) | Keep; needed to make cross-user tests on endpoints without IDs (AC-12b, AC-26c) | Both |