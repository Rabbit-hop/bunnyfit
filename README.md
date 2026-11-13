# bunnyfit

Habit & Activity Tracking system — CPE 334 course project (Sprint 1). The
application is a TypeScript modular monolith: an Express API serves a React
single-page app, with PostgreSQL accessed through Prisma.

## Requirements

- Node.js ≥ 22.12 (required by Vitest 5 / Vite 8) and [pnpm](https://pnpm.io) (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL (the SDS mandates no specific version) — or use the dev database
  from `docker-compose.yml` (postgres:17)

## Setup

1. Install dependencies and the Playwright browser:

   ```bash
   pnpm install
   pnpm exec playwright install chromium   # only needed for the E2E suite
   ```

2. Copy `.env.example` to `.env` and fill in real values:

   ```bash
   cp .env.example .env
   ```

   `.env` is git-ignored and must never be committed; `.env.example` lists every
   variable name with a placeholder (SDS §8). Application code and the seed read
   environment variables only through `server/config/env.ts`; the Prisma CLI
   reads `DATABASE_URL` directly.

3. Start PostgreSQL, then generate the client, apply migrations to the
   development database and seed:

   ```bash
   docker compose up -d   # postgres:17 with a named volume; creates the
                          # bunnyfit and bunnyfit_test databases on first start
   ```

   ```bash
   # Already have a pgdata volume from before? The init script only runs on an empty volume:
   docker compose exec db createdb -U user bunnyfit_test
   # or start clean (deletes dev data): docker compose down -v && docker compose up -d
   ```

   The port is `5432` by default; set `POSTGRES_PORT` in `.env` to override it
   (e.g. when another PostgreSQL already listens on 5432). Instead of Docker
   you may use any local PostgreSQL — just create the databases named in
   `DATABASE_URL` and `DATABASE_URL_TEST` first. Then:

   ```bash
   pnpm run prisma:generate
   pnpm run db:migrate   # applies to DATABASE_URL
   pnpm run db:seed
   ```

   The integration suite migrates `DATABASE_URL_TEST` automatically through
   `tests/globalSetup.ts`. To migrate it manually, export `DATABASE_URL_TEST`
   first and run `DATABASE_URL="$DATABASE_URL_TEST" pnpm run db:migrate` from a
   POSIX shell (the inline `VAR=...` form does not work in PowerShell).

   Re-running the seed resets the seeded users (password hash, role, display
   name) and seeded templates to the seed values, so changing
   `SEED_MANAGER_PASSWORD` / `SEED_PARTICIPANT_PASSWORD` and re-seeding takes
   effect. It also reverts any edit made to those seeded rows.

## Development

```bash
pnpm run dev       # Express API with hot reload on PORT (default 8080)
pnpm run dev:web   # Vite SPA on http://127.0.0.1:5173, proxies /api to the API
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm run dev` | Start the API with hot reload (`tsx watch`) on `PORT` (default 8080) |
| `pnpm run dev:web` | Start the Vite SPA dev server on port 5173 |
| `pnpm run typecheck` | Type-check server, web, tests and tooling configs (no emit) |
| `pnpm test` | Run all Vitest suites once |
| `pnpm run test:watch` | Run Vitest in watch mode |
| `pnpm run test:e2e` | Run the Playwright E2E suite (starts the API and Vite automatically) |
| `pnpm run build` | Type-check, then build the API to `dist/` and the SPA to `dist/web/` |
| `pnpm start` | Run the compiled API (`node dist/index.js`) |
| `pnpm run preview` | Preview the built SPA |
| `pnpm run prisma:generate` | Generate the Prisma client |
| `pnpm run db:migrate` | Apply committed migrations to `DATABASE_URL` |
| `pnpm run db:migrate:dev` | Create/apply a migration in development |
| `pnpm run db:seed` | Seed the baseline data |

## Verify a local run

```bash
pnpm run build && pnpm start
curl http://localhost:8080/api/health   # → {"status":"ok"}
curl http://localhost:8080/             # → the built SPA (index.html)
```

The Express app serves `dist/web` and falls back to `index.html` for non-`/api`
GET requests, so the SPA and the API share one origin (SDS §2.1). Before
`pnpm run build:web`, those requests return the JSON `NOT_FOUND` envelope.

## Verification

```bash
pnpm run typecheck
pnpm run build
pnpm test
pnpm run test:e2e
```

`pnpm test` runs Vitest. The persistence suite (AC-24a / TEST-24a) needs
`DATABASE_URL_TEST`; it fails instead of skipping when `CI=true`, and prints a
warning and skips locally only when no test database URL is configured.
`pnpm run test:e2e` starts both the API and the Vite server automatically and
runs the Playwright tests. The spawned API always uses `DATABASE_URL_TEST` (the run
fails at startup if it is unset), so that database must be migrated and seeded first and
port 8080 must be free (stop `pnpm dev`).

The API needs PostgreSQL (F-01 auth reads users and the token denylist from it)
and the integration suites run against a real database. Before `pnpm test`,
`.env` must define:

- `DATABASE_URL_TEST` — a database different from `DATABASE_URL`; `tests/globalSetup.ts`
  migrates and seeds it. Without it the database-backed integration suites skip locally
  (with a warning) and fail when `CI=true`.
- `SEED_MANAGER_PASSWORD` and `SEED_PARTICIPANT_PASSWORD` — the seed and the login tests
  use them; if either is missing the integration `beforeAll` throws.

`JWT_SECRET` (at least 32 bytes) is **not** needed for `pnpm test`, which uses its own
fixed test secret. It is needed only to start the API (`pnpm run dev` / `pnpm start`),
which refuses to boot without it. Generate one with `openssl rand -base64 48`; the
placeholder in `.env.example` is deliberately too short to run with.

## Repository layout (SDS §2.5)

```text
server/            # API: routes/, middleware/, config/, domain/
web/               # React SPA
prisma/            # schema, migrations, seed
tests/             # unit/, integration/, e2e/ exist; system/, performance/ planned
docs/              # srs.md, features.md, traceability.md, system-sds.md, sprints/
docker-compose.yml   # dev database only (postgres:17); app image is Lab 5
Dockerfile  .github/workflows/             # planned (Lab 5), not created yet
.env.example
```

Foundation conventions worth knowing before touching the code:

- **Error envelope** — every 4xx/5xx answer is `{ code, message, fields }`
  with codes from SRS Appendix A.5 (`server/domain/errors.ts`).
- **Injectable Clock** — business "today" (Asia/Bangkok) is read only through
  `Clock` (`server/domain/clock.ts`); tests substitute `FixedClock`.
- **Route policy registry** — every route declares
  `{ method, path, featureId, auth, roles, ownership }`
  (`server/routes/registry.ts`); the Access Matrix tests (SDS §6.3,
  `tests/integration/security_access.test.ts`) fail on a route without a policy (the only exemption is the SPA shell fallback; F-01 contract §4.5).
  F-01 routes and its test-only probe routes are covered now; the real routes of
  F-02/03/04/06 are added in stage 2.
  Async route handlers must be wrapped in `asyncHandler`
  (`server/middleware/asyncHandler.ts`) because Express 4 does not forward rejections.
- **Prisma schema** follows `docs/system-sds.md` v1.1.0, including
  `PlanItem.planKey/version`, the Monday–Sunday `repeatDays` bitmask,
  `LedgerEntry.kind` and a `UserExercise.sourceTemplateId` column with no FK.
  The migration also adds hand-written constraints that `schema.prisma` cannot
  express: CHECK constraints (including one coherent target group per
  `PlanItem`), a case-insensitive unique index on `Category.name`, and composite
  `(userExerciseId, userId)` foreign keys so an entry cannot point at another
  user's exercise. Keep them in sync when changing the schema.

## Pending (tracked by GitHub issues)

- App image / full `docker compose up` (app + DB) / CI gates — Lab 5
  (`docker-compose.yml` currently starts the dev database only)
