# Lab 5 — Deployment and release (bunnyfit)

| | |
| --- | --- |
| Lab | CPE 334 Lab 5 (CI/CD, Docker, GCP), issue #22 |
| Status of this file | **Draft, updated as Lab 5 steps land.** Each section says what exists in the repository now and what is still planned. Nothing below is claimed as done unless it says so. |
| Contract sources | `docs/system-sds.md` §8 (configuration), §9 (delivery and deployment plan) |

## 1. Stack and differences from the reference

| Layer | Choice | Status |
| --- | --- | --- |
| Application | One TypeScript Node/Express process serving the API and the built React SPA (one origin) | In the repository |
| Database | PostgreSQL via Prisma; migrations committed under `prisma/migrations/` | In the repository |
| Image | Multi-stage `Dockerfile` (targets `build`, `migrate`, `prod-deps`, `runtime`; `runtime` is the default) | In the repository (commit `beebd91`) |
| CI | GitHub Actions `.github/workflows/ci.yml` | In the repository. Pull-request run on PR #42, head `005136a` (run 43706494746): `test` and `docker-build` passed, `e2e` skipped because the PR targets staging. Manual `workflow_dispatch` run on the same head (run 43706506031): `test` (27 files, 393 tests), `docker-build` and `e2e` (Playwright, 40 tests) all passed |
| Registry, runtime, database, secrets (planned, SDS §9.4) | Artifact Registry, Cloud Run, Cloud SQL for PostgreSQL, Secret Manager | **Planned, not created** |
| Deploy pipeline | `.github/workflows/deploy.yml` on push to `main` | **Planned, not written** |

Differences from the Student Guide reference stack: none decided yet. Record any here when a choice differs.

## 2. Environment variables

All settings are read from the environment through `server/config/env.ts`. `.env.example` lists every name with a placeholder. No real value is committed; real values live in the untracked `.env` locally and in the cloud secret store when deployed.

| Variable | Purpose | Secret? | Where the value comes from |
| --- | --- | --- | --- |
| `NODE_ENV` | Mode (`development`, `test`, `production`); the image sets `production` | No | Image default / environment |
| `PORT` | HTTP port (default 8080) | No | Image default / environment |
| `LOG_LEVEL` | Logging verbosity | No | Environment |
| `DATABASE_URL` | PostgreSQL connection string for the app and for `prisma migrate deploy` | **Yes** | Local `.env`; in the cloud, Secret Manager (planned) |
| `DATABASE_URL_TEST` | Separate database used by integration and E2E tests; must differ from `DATABASE_URL` | **Yes** | Local `.env`; CI sets a throwaway value for its service container |
| `JWT_SECRET` | Token signing key, at least 32 bytes; the API refuses to start otherwise | **Yes** | Local `.env` (`openssl rand -base64 48`); in the cloud, Secret Manager (planned); the CI E2E job generates one per run |
| `JWT_EXPIRES_IN_SECONDS` | Token lifetime (default 3600) | No | Environment |
| `BCRYPT_COST` | Password hash cost, 4–31 (default 10) | No | Environment |
| `APP_TIMEZONE` | Business-date timezone (default `Asia/Bangkok`) | No | Environment |
| `SEED_MANAGER_PASSWORD`, `SEED_PARTICIPANT_PASSWORD` | Passwords for the seeded demo accounts | **Yes** | Local `.env`; handed to testers privately; never printed or committed |

Compose-only variables (used by `docker-compose.yml`, not read by the application): `POSTGRES_PORT` (host port of the dev database, default 5432) and `APP_PORT` (host port of the app container, default 8080).

The CI workflow contains throwaway values (`ci-throwaway-db`, `ci-Manager-Pass-1`, `ci-Participant-Pass-1`) for its own disposable Postgres service container. They protect nothing and are not used outside CI.

### Cloud-readiness audit (issue #46, 17 Nov 2026)

Checked on `staging/sprint-1` at `6425e68`:

- **Settings:** the only `process.env` reads in `server/` are in `server/config/env.ts`; every name in the table above is read there. `JWT_SECRET` is validated at startup (missing or under 32 bytes → the API refuses to start).
- **Repository:** the only tracked env file is `.env.example` (placeholders). A `git grep` for connection strings with a password, AWS-style keys and private-key headers found nothing outside the git-ignored `docs/local/`. This is a pattern search, not a full secret scan.
- **State outside the container:** sessions are JWTs with the `RevokedToken` denylist in PostgreSQL; the server code has no upload handling and writes no files. Nothing the app needs is kept only in the container.
- **Seed accounts:** `prisma/seed.ts` takes both passwords from `SEED_MANAGER_PASSWORD` / `SEED_PARTICIPANT_PASSWORD` and refuses to run when either is empty, so the values can come from Secret Manager without a code change.
- **Logs with the database unreachable:** the API was started against an unreachable database whose URL contained a test password; a login request returned `500 INTERNAL_ERROR` with the generic message, and the server log held the Prisma "Can't reach database server at host:port" error plus a stack trace but not the password or the connection string. Only this failure was tried; other error paths were not.

**Readiness decision (#46): no `/api/ready` endpoint.** The contract defines one public deployment check, `GET /api/health` (SDS §5.2, api-spec SYS-01), which does not touch the database. The deploy smoke check in SDS §9 is `/api/health` + login + one persisted read; login and the read go through the database, so the smoke check after each deploy does verify the database connection. The trade-off: `/api/health` stays `200` when the database is down, so it is a liveness check only and must not be read as readiness. Adding `/api/ready` later would be a contract change (SDS, api-spec, route registry, AC-12c/AC-22c matrix, RTM) and is not part of Sprint 1.

## 3. Commands

Prerequisites: Node ≥ 22.12, pnpm (version pinned by `package.json`), Docker with Compose.

| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Type-check | `pnpm run typecheck` |
| Build (API to `dist/`, SPA to `dist/web/`) | `pnpm run build` |
| Unit and API/DB integration tests | `pnpm test` (needs `DATABASE_URL_TEST`; migrates and seeds that database itself) |
| End-to-end tests | `pnpm run test:e2e` (needs a migrated and seeded `DATABASE_URL_TEST` and a free port 8080) |
| Migrate | `pnpm run db:migrate` (applies committed migrations to `DATABASE_URL`) |
| Seed | `pnpm run db:seed` |
| Run the compiled app | `pnpm start` (needs `DATABASE_URL`, `JWT_SECRET`) |

### Docker

```bash
cp .env.example .env              # then fill in JWT_SECRET (>= 32 bytes) and the SEED_* passwords
docker build -t bunnyfit .        # runtime image (default target)
docker compose --profile app up -d --build   # db + one-shot migrate + app on http://127.0.0.1:8080
docker compose --profile app run --rm migrate pnpm run db:seed   # seed on demand
```

`docker compose up -d` without `--profile app` starts only the dev database, as before. The `migrate` service applies the committed migrations and exits; the `app` service starts after it completes successfully. The runtime image runs as the non-root user `node`, exposes `PORT`, has a health check on `GET /api/health`, and contains no `.env` or secret (`.dockerignore` excludes them).

What was checked so far (14 Nov 2026, local machine, image built from commit `beebd91`): the image builds; migrate and seed succeed against a fresh Postgres 17 container; the app container reports `healthy` and runs as `node`; after `docker compose restart app` it is healthy again and the seeded users are still in the database. A clean-clone run from `.env.example` values only (check C-03) has **not** been done yet.

## 4. Continuous integration

`.github/workflows/ci.yml`:

| Trigger | Job | What it runs |
| --- | --- | --- |
| Pull request into `staging/**` or `main` | `test` | install (frozen lockfile), type-check, build, Vitest against a Postgres 17 service container (JUnit result uploaded, counts in the run summary) |
| Pull request into `staging/**` or `main` | `docker-build` | builds the runtime and migrate images (does not start them) |
| Pull request into `main` only | `e2e` | migrate and seed the test database, install Chromium, run Playwright |

Branch protection (a GitHub setting, not a file) is to require `test`, `docker-build` and, for `main`, `e2e`. **Not configured when this was written**; a check can only be selected after it has run once, which `test` and `docker-build` have (PR #42) and `e2e` has, via a manual `workflow_dispatch` run (no pull-request run into `main` has happened yet). The failing-check demonstration (C-02) uses a temporary branch and is **not yet done**.

Actions are pinned to full commit SHAs.

## 5. GCP resources

Not created yet. Fill in this table when each resource exists (names must come from the real project, not guesses).

| Item | Value |
| --- | --- |
| GCP project ID | _TBD_ |
| Region | _TBD_ |
| Artifact Registry repository | _TBD_ |
| Cloud Run service | _TBD_ |
| Cloud SQL instance / database | _TBD_ |
| Secret Manager secrets | _TBD_ (expected: `DATABASE_URL`, `JWT_SECRET`, seed passwords) |
| Public URL | _TBD_ |

Cost controls to apply (Lab 5 §5): alerts-only budget before any resource, Cloud Run minimum instances 0 and maximum 3 or fewer, smallest Cloud SQL tier, tear down or pause when idle.

## 6. Release procedure

**Planned; the pipeline is not written yet.** Intended flow (SDS §9.3, §9.5, Lab 5 R-07 and R-08):

1. Issue → feature branch from `staging/sprint-N` → pull request into staging, reviewed by the teammate (not the author); CI must pass.
2. Release pull request `staging/sprint-N` → `main`, reviewed; CI including `e2e` must pass.
3. On merge to `main`, the deploy workflow builds the image tagged with the full commit SHA, pushes it, runs `prisma migrate deploy` as its own job, deploys to Cloud Run, then runs a smoke check (`/api/health`, login, one persisted read).
4. Tag the accepted release (for example `sprint1-v1.0.0`); a submitted tag is never moved.
5. Roll back by redeploying an earlier image tag, then roll forward.

**Finding the commit that is running:** `GET /api/health` returns only `{"status":"ok"}` and does not report a commit. The intended answer is the image tag (the full commit SHA) of the active Cloud Run revision. This section must be completed with the exact command once the service exists.
