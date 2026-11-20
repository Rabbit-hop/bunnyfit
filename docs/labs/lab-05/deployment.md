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
| Registry, runtime, database, secrets (SDS §9.4) | Artifact Registry, Cloud Run, Cloud SQL for PostgreSQL, Secret Manager | Created by the course portal (see §5); first manual deployment done 20 Nov 2026 (§5.1) |
| Deploy pipeline | `.github/workflows/deploy.yml` on push to `main` | **Planned, not written** |

Differences from the Student Guide reference stack: GCP access changed after the handout (course update, 20 Nov 2026). The team does not create its own GCP Free Trial project, billing account or budget (Guide Episode 1); the course portal provides a shared project and a team prefix, and creates the Cloud SQL instance, Artifact Registry repository, Cloud Run service, migration job and Secret Manager secrets. The team still builds, migrates and deploys the application itself. Record any further difference here when a choice differs.

## 2. Environment variables

All settings are read from the environment through `server/config/env.ts`. `.env.example` lists every name with a placeholder. No real value is committed; real values live in the untracked `.env` locally and in the cloud secret store when deployed.

| Variable | Purpose | Secret? | Where the value comes from |
| --- | --- | --- | --- |
| `NODE_ENV` | Mode (`development`, `test`, `production`); the image sets `production` | No | Image default / environment |
| `PORT` | HTTP port (default 8080) | No | Image default / environment |
| `LOG_LEVEL` | Logging verbosity | No | Environment |
| `DATABASE_URL` | PostgreSQL connection string for the app and for `prisma migrate deploy` | **Yes** | Local `.env`; in the cloud, Secret Manager secret `s27d6b925-database-url` (created by the course portal and attached to the Cloud Run service and the migration job) |
| `DATABASE_URL_TEST` | Separate database used by integration and E2E tests; must differ from `DATABASE_URL` | **Yes** | Local `.env`; CI sets a throwaway value for its service container |
| `JWT_SECRET` | Token signing key, at least 32 bytes; the API refuses to start otherwise | **Yes** | Local `.env` (`openssl rand -base64 48`); in the cloud, Secret Manager slot `s27d6b925-app-secret-1` (the team account cannot create new secrets); the CI E2E job generates one per run |
| `JWT_EXPIRES_IN_SECONDS` | Token lifetime (default 3600) | No | Environment |
| `BCRYPT_COST` | Password hash cost, 4–31 (default 10) | No | Environment |
| `APP_TIMEZONE` | Business-date timezone (default `Asia/Bangkok`) | No | Environment |
| `SEED_MANAGER_PASSWORD`, `SEED_PARTICIPANT_PASSWORD` | Passwords for the seeded demo accounts | **Yes** | Local `.env`; in the cloud, mapped at seed time from the portal secrets `s27d6b925-admin-password` (manager) and `s27d6b925-demo-password` (participants); handed to testers privately; never printed or committed |

Compose-only variables (used by `docker-compose.yml`, not read by the application): `POSTGRES_PORT` (host port of the dev database, default 5432) and `APP_PORT` (host port of the app container, default 8080).

The CI workflow contains throwaway values (`ci-throwaway-db`, `ci-Manager-Pass-1`, `ci-Participant-Pass-1`) for its own disposable Postgres service container. They protect nothing and are not used outside CI.

### Cloud-readiness audit (issue #46, 17 Nov 2026)

Checked on `staging/sprint-1` at `6425e68`:

- **Settings:** the only `process.env` reads in `server/` are in `server/config/env.ts`; every name in the table above is read there. `JWT_SECRET` is validated at startup (missing or under 32 bytes → the API refuses to start).
- **Repository:** the only tracked env file is `.env.example` (placeholders). A `git grep -nEi "postgres(ql)?://[^:@/ ]+:[^@ ]+@|AKIA[0-9A-Z]{16}|BEGIN (RSA |EC )?PRIVATE KEY" -- . ':!docs/local'` (connection strings with a password, AWS-style keys, private-key headers) matched only placeholders and the CI throwaway values described above: `.env.example`, `docker-compose.yml` (`user:password@db`), `.github/workflows/ci.yml` (`ci-throwaway-db`) and the `user:***@` examples in `docs/system-sds.md`. No real credential was found by this pattern. It is a pattern search, not a full secret scan.
- **State outside the container:** sessions are JWTs with the `RevokedToken` denylist in PostgreSQL; the server code has no upload handling and writes no files. Nothing the app needs is kept only in the container.
- **Seed accounts:** `prisma/seed.ts` takes both passwords from `SEED_MANAGER_PASSWORD` / `SEED_PARTICIPANT_PASSWORD` and refuses to run when either is empty, so the values can come from Secret Manager without a code change.
- **Seed from Secret Manager (cloud, 20 Nov 2026):** the seed ran once as a Cloud Run job execution (`pnpm run db:seed`) with `SEED_MANAGER_PASSWORD` and `SEED_PARTICIPANT_PASSWORD` mapped from the two portal secrets above, and the execution completed. No password is in the repository, the image or the command line. Sign-in with a seeded account was reported as working by the team member who ran the deployment (evidence on issue #47); it was not re-checked here. Details of the deployment are recorded in issue #47.
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

Branch protection is a GitHub setting, not a file. Read through `gh api` on 20 Nov 2026, two repository rulesets are `active`, with no bypass actors (`bypass_actors` empty, `current_user_can_bypass` = `never` for the checking account):

| Ruleset | Target | Required status checks (GitHub Actions) | Other rules |
| --- | --- | --- | --- |
| `protect-main` | default branch | `test`, `docker-build`, `e2e` | 1 approving review; blocks deletion and non-fast-forward; "require branches to be up to date" is off |
| `protect-staging` | `staging/**` | `test`, `docker-build` | 1 approving review; blocks deletion and non-fast-forward; "up to date" is off |

The required names match the job names in `ci.yml` (`test`, `docker-build`, `e2e`). The course Student Guide names a single check `test-and-docker`; this repository splits it into `test` and `docker-build`. "Up to date" is off on purpose until the release PR to `main` (staging does not yet contain every commit of `main`).

**Failing-check demonstration (C-02, issue #48).** Pull request [#60](https://github.com/Rabbit-hop/bunnyfit/pull/60) (`test/48-prove-gate` into `staging/sprint-1`, one commit adding a test that fails on purpose): `test` failed (run 44774204694), `docker-build` passed, `e2e` was skipped (base is staging), and GitHub reported the merge state as `BLOCKED`. The PR was closed without merging on 20 Nov 2026 (16:38 UTC) and its branch deleted. The screenshot is attached to the [issue #48 comment](https://github.com/Rabbit-hop/bunnyfit/issues/48#issuecomment-7045093845) and is not part of this repository. Limits: the demonstration is on `staging/sprint-1`, not `main` (`ci.yml` is not on `main` yet, so a PR into `main` would run no checks), so the `e2e` gate was not exercised; the PR also lacked an approving review, so the block shown is the combination of rules unless the screenshot's required-check message says otherwise.

### 4.1 GitHub to GCP sign-in (issue #48)

Difference from the Student Guide (Episode 6): the team did not create the deployer service account or the Workload Identity Federation (WIF) pool itself. On 21 Nov 2026 the team account was denied `iam.serviceAccounts.list`, `iam.workloadIdentityPools.list` and `getIamPolicy` on the shared course project, and the Project Kit README says changing IAM or creating a service account is done by the TA or the portal. Instead:

- The course portal lists the deployer service account `s27d6b925-deployer@cpe-se-course-2026.iam.gserviceaccount.com` (portal text before connecting: "not linked to GitHub Actions").
- A team member used the portal tab "Lab 5 · Repository review" to connect `Rabbit-hop/bunnyfit` ("Connect GitHub Actions (WIF)"; the portal reported success). The portal then showed the GitHub variables below and a `deploy.yml` to download. Per the portal, it does not write to the repository.
- GitHub Environment `demo`, created by the team and read back through `gh api` on 21 Nov 2026: deployment branches limited to the single rule `main`; four variables `GCP_PROJECT_ID` (`cpe-se-course-2026`), `GCP_REGION` (`asia-southeast1`), `WIF_PROVIDER` (`projects/670075229477/locations/global/workloadIdentityPools/s27d6b925-pool/providers/s27d6b925-provider`), `WIF_SERVICE_ACCOUNT` (the deployer above); no environment secrets; no required reviewers. The values equal those pasted from the portal's Team resources tab. None is a secret.

Not verified: the roles the deployer service account actually holds and the attribute condition of the provider (the team account cannot read IAM), so this document does not claim least privilege; a sign-in from GitHub Actions has not been run (the `deploy.yml` workflow is not in the repository yet, it belongs to issue #49 and only works from `main`); the portal's own connection step was reported by the team member, not re-run.

Actions are pinned to full commit SHAs.

## 5. GCP resources

The values below come from the course portal: project, region and prefix from "Activate & status", the rest from the "Team resources" tab (portal status "Resources ready, 6/6 steps", 20 Nov 2026). The tab states it is recorded system output, not a live Google Cloud check. On 20 Nov 2026 the team member ran read-only `gcloud run services describe` and `gcloud run jobs describe` in Cloud Shell; they showed the Cloud Run service and the migration job, the Cloud SQL connection and the `DATABASE_URL` / `ADMIN_PASSWORD` secrets attached to both, and the images were then pushed to the registry repository (§5.1). The raw output is not attached anywhere; a summary is in the [issue #47 comment](https://github.com/Rabbit-hop/bunnyfit/issues/47#issuecomment-7021400384). The Cloud SQL instance itself was not inspected directly. Only secret reference names are listed; no secret value is recorded.

| Item | Value |
| --- | --- |
| GCP project ID | `cpe-se-course-2026` (shared course project; not a secret) |
| Region | `asia-southeast1` |
| Team prefix | `s27d6b925` (every team resource name starts with it) |
| Artifact Registry repository | `s27d6b925`; image URI `asia-southeast1-docker.pkg.dev/cpe-se-course-2026/s27d6b925/s27d6b925` (append a tag) |
| Cloud Run service | `s27d6b925` |
| Migration job | `s27d6b925-migrate` |
| Cloud SQL instance / database | instance `s27d6b925-pg` (tier `db-f1-micro`), database `s27d6b925`, user `s27d6b925`, connection name `cpe-se-course-2026:asia-southeast1:s27d6b925-pg` |
| Runtime service account | `s27d6b925-runner@cpe-se-course-2026.iam.gserviceaccount.com` |
| Secret Manager secrets (names only) | `s27d6b925-database-url` (DATABASE_URL), `s27d6b925-admin-password`, `s27d6b925-demo-password` (demo seeding). The portal lists no `JWT_SECRET` secret and the deploying account cannot create secrets, so `JWT_SECRET` is stored in the portal slot `s27d6b925-app-secret-1` (added with the Project Kit, `kit.sh secrets add 1`; the kit is the zip `cpe334-project-kit-s27d6b925.zip` downloaded from the course portal and is not in this repository). |
| Public URL | `https://s27d6b925-4d7hbszvwq-as.a.run.app` (as printed by `gcloud run services describe`) |

Cost controls to apply (Lab 5 §5): alerts-only budget before any resource, Cloud Run minimum instances 0 and maximum 3 or fewer, smallest Cloud SQL tier, tear down or pause when idle.

### 5.1 First manual deployment (20 Nov 2026, issue #47)

Run in Cloud Shell by one team member (the course project allows one account). Source: `staging/sprint-1` at `6425e684d937bcb2613288b4f6580f2b95d17b4d` (merge of PR #42). The pipeline in §6 is not used yet.

1. Built and pushed two images to `$BASE` (`asia-southeast1-docker.pkg.dev/cpe-se-course-2026/s27d6b925/s27d6b925`): `:<SHA>` (target `runtime`) and `:migrate-<SHA>` (target `migrate`).
2. Migration job: the portal job held a placeholder image and a `python` placeholder command, so it was updated with `--image …:migrate-<SHA> --command pnpm --args run,db:migrate`; execution `s27d6b925-migrate-swtqn` completed.
3. `JWT_SECRET`: `gcloud secrets create` was denied for the team account; the value was added to slot `s27d6b925-app-secret-1` with `kit.sh secrets add 1 --from-stdin` (value never displayed).
4. Seed (once): the same job was updated to `--command pnpm --args run,db:seed` with `SEED_MANAGER_PASSWORD` mapped to `s27d6b925-admin-password` and `SEED_PARTICIPANT_PASSWORD` mapped to `s27d6b925-demo-password`; execution `s27d6b925-migrate-8kmf5` completed. The job was then set back to `pnpm run db:migrate`.
5. Service: `gcloud run services update s27d6b925 --image …:<SHA> --update-env-vars NODE_ENV=production,APP_TIMEZONE=Asia/Bangkok,LOG_LEVEL=info,BCRYPT_COST=10,JWT_EXPIRES_IN_SECONDS=3600 --update-secrets JWT_SECRET=s27d6b925-app-secret-1:latest --min-instances 0`; revision `s27d6b925-00002-xsz` serves 100% of traffic. `DATABASE_URL` and the Cloud SQL connection were already attached by the portal; maximum instances stay at the portal value of 1.
6. Checks: `curl <URL>/api/health` returned `{"status":"ok"}`. Sign-in with a seeded account in the browser was reported as working by the team member who ran the deployment; the login and Today-page screenshots are attached to the [issue #47 comment](https://github.com/Rabbit-hop/bunnyfit/issues/47#issuecomment-7021400384) and are not part of this repository. Only sign-in was shown; no main action or rejected action was recorded.

Not done / known gaps: the deploy workflow (`deploy.yml`) and smoke script are not written; the `e2e` suite was not run against the cloud URL; the seed ran as a one-off command and re-running it resets the seeded passwords to the secret values.

## 6. Release procedure

**Planned; the pipeline is not written yet.** Intended flow (SDS §9.3, §9.5, Lab 5 R-07 and R-08):

1. Issue → feature branch from `staging/sprint-N` → pull request into staging, reviewed by the teammate (not the author); CI must pass.
2. Release pull request `staging/sprint-N` → `main`, reviewed; CI including `e2e` must pass.
3. On merge to `main`, the deploy workflow builds the image tagged with the full commit SHA, pushes it, runs `prisma migrate deploy` as its own job, deploys to Cloud Run, then runs a smoke check (`/api/health`, login, one persisted read).
4. Tag the accepted release (for example `sprint1-v1.0.0`); a submitted tag is never moved.
5. Roll back by redeploying an earlier image tag, then roll forward.

**Finding the commit that is running:** `GET /api/health` returns only `{"status":"ok"}` and does not report a commit. The intended answer is the image tag (the full commit SHA) of the active Cloud Run revision. Exact command (read-only):

```
gcloud run services describe s27d6b925 --region asia-southeast1 --format='value(spec.template.spec.containers[0].image)'
```

The tag after the last colon is the full commit SHA of the running image. For the 20 Nov 2026 deployment it is `6425e684d937bcb2613288b4f6580f2b95d17b4d`. Confirmed with the command above on 20 Nov 2026: the active image is `asia-southeast1-docker.pkg.dev/cpe-se-course-2026/s27d6b925/s27d6b925:6425e684d937bcb2613288b4f6580f2b95d17b4d`.
