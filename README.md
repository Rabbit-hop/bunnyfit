# bunnyfit

Habit & Activity Tracking system — CPE 334 course project (Sprint 1).

## Requirements

- Node.js ≥ 20 and [pnpm](https://pnpm.io) (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL (required from the database setup onward — tracked by issue #2)

## Setup

```bash
pnpm install
cp .env.example .env   # fill in real values
```

`.env` is git-ignored and must never be committed; `.env.example` lists every
variable name with a placeholder (SDS §8). Environment variables are read only
through `server/config/env.ts`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm run dev` | Start the API with hot reload (`tsx watch`) on `PORT` (default 8080) |
| `pnpm run typecheck` | TypeScript type-check (no emit), covers `server/` and `tests/` |
| `pnpm test` | Run all Vitest suites once |
| `pnpm run test:watch` | Run Vitest in watch mode |
| `pnpm run build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run the compiled server (`node dist/index.js`) |

## Verify a local run

```bash
pnpm run build && pnpm start
curl http://localhost:8080/api/health   # → {"status":"ok"}
```

## Repository layout (SDS §2.5)

```text
server/            # API: routes/, middleware/, config/, domain/
web/               # SPA (pending — issue #2)
prisma/            # schema, migrations, seed (pending — issue #2)
tests/             # unit/, integration/, e2e/, system/, performance/
docs/              # srs.md, features.md, traceability.md, system-sds.md, sprints/
Dockerfile  docker-compose.yml  .env.example  .github/workflows/
```

Foundation conventions worth knowing before touching the code:

- **Error envelope** — every 4xx/5xx answer is `{ code, message, fields }`
  with codes from SRS Appendix A.5 (`server/domain/errors.ts`).
- **Injectable Clock** — business "today" (Asia/Bangkok) is read only through
  `Clock` (`server/domain/clock.ts`); tests substitute `FixedClock`.
- **Route policy registry** — every route declares
  `{ method, path, featureId, auth, roles, ownership }`
  (`server/routes/registry.ts`); a route without a policy fails the
  Access Matrix tests (SDS §6.3).

## Pending (tracked by GitHub issues)

- Prisma migrate/seed instructions — issue #2
- `docker compose up` / Dockerfile — not started (deployment, Lab 5)
- Web UI (`web/`) — issue #2
- CI gates — Lab 5
