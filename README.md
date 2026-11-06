# bunnyfit

Habit & Activity Tracking system — CPE 334 course project (Sprint 1). The
application is a TypeScript modular monolith: an Express API serves a React
single-page app, with PostgreSQL accessed through Prisma.

## Requirements

- Node.js ≥ 22.12 (required by Vitest 5 / Vite 8) and [pnpm](https://pnpm.io) (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL (the SDS mandates no specific version)

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

3. Create the databases named in `DATABASE_URL` and `DATABASE_URL_TEST`, then
   generate the client, apply migrations and seed:

   ```bash
   pnpm run prisma:generate
   pnpm run db:migrate                                      # applies to DATABASE_URL
   DATABASE_URL="$DATABASE_URL_TEST" pnpm run db:migrate    # applies to the test DB
   pnpm run db:seed
   ```

   `pnpm run db:migrate` only targets `DATABASE_URL`, so the test database must
   be migrated separately as shown above before running the integration suite.

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
| `pnpm run test:e2e` | Run the Playwright E2E suite (starts Vite automatically) |
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
```

## Verification

```bash
pnpm run typecheck
pnpm run build
pnpm test
pnpm run test:e2e
```

`pnpm test` runs Vitest. The persistence suite (AC-24a / TEST-24a) needs
`DATABASE_URL_TEST`; it fails instead of skipping when `CI=true`, and is skipped
locally only when no test database URL is configured. `pnpm run test:e2e` starts
the Vite server automatically and runs the Playwright smoke test.

## Repository layout (SDS §2.5)

```text
server/            # API: routes/, middleware/, config/, domain/
web/               # React SPA
prisma/            # schema, migrations, seed
tests/             # unit/, integration/, e2e/ exist; system/, performance/ planned
docs/              # srs.md, features.md, traceability.md, system-sds.md, sprints/
Dockerfile  docker-compose.yml  .github/workflows/   # planned (Lab 5), not created yet
.env.example
```

Foundation conventions worth knowing before touching the code:

- **Error envelope** — every 4xx/5xx answer is `{ code, message, fields }`
  with codes from SRS Appendix A.5 (`server/domain/errors.ts`).
- **Injectable Clock** — business "today" (Asia/Bangkok) is read only through
  `Clock` (`server/domain/clock.ts`); tests substitute `FixedClock`.
- **Route policy registry** — every route declares
  `{ method, path, featureId, auth, roles, ownership }`
  (`server/routes/registry.ts`); the Access Matrix tests (SDS §6.3) will
  fail on a route without a policy once F-01 lands (not enforced yet).
  Async route handlers must be wrapped in `asyncHandler`
  (`server/middleware/asyncHandler.ts`) because Express 4 does not forward rejections.
- **Prisma schema** follows `docs/system-sds.md` v1.1.0, including
  `PlanItem.planKey/version`, the Monday–Sunday `repeatDays` bitmask,
  `LedgerEntry.kind` and a `UserExercise.sourceTemplateId` column with no FK.
  The migration also adds hand-written CHECK constraints and a
  case-insensitive unique index on `Category.name` that `schema.prisma` cannot
  express; keep them in sync when changing the schema.

## Pending (tracked by GitHub issues)

- `docker compose up` / Dockerfile — not started (deployment, Lab 5)
- CI gates — Lab 5
