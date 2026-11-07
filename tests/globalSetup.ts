import { execSync } from 'node:child_process'
import 'dotenv/config'

/**
 * Apply committed migrations to the test database before the integration
 * suites run, so they do not depend on a manually pre-migrated database.
 * `pnpm run db:migrate` only targets DATABASE_URL, so override it with
 * DATABASE_URL_TEST here.
 */
export default function setup() {
  const databaseUrl = process.env.DATABASE_URL_TEST

  if (!databaseUrl) {
    if (process.env.CI === 'true') {
      throw new Error(
        'DATABASE_URL_TEST is required in CI: the persistence suite (AC-24a / TEST-24a) must run against a real PostgreSQL database.',
      )
    }

    console.warn(
      '\n[globalSetup] DATABASE_URL_TEST is not set — the persistence suite (AC-24a / TEST-24a) will be SKIPPED.\n' +
        '[globalSetup] Add DATABASE_URL_TEST to .env (see .env.example) to run the real-PostgreSQL integration tests.\n',
    )
    return
  }

  // Compare the actual connection target (host, port, database) rather than the
  // raw string: `postgresql://u@localhost:5432/db` and
  // `postgresql://u@localhost:5432/db?schema=public` are the same database.
  if (process.env.DATABASE_URL && sameDatabase(process.env.DATABASE_URL, databaseUrl)) {
    throw new Error(
      'DATABASE_URL_TEST must point at a different database from DATABASE_URL (the integration suite writes and deletes rows).',
    )
  }

  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
}

function sameDatabase(left: string, right: string): boolean {
  const a = new URL(left)
  const b = new URL(right)
  const port = (url: URL) => url.port || '5432'
  return (
    a.hostname.toLowerCase() === b.hostname.toLowerCase() &&
    port(a) === port(b) &&
    a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '')
  )
}
