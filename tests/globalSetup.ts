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
    return
  }

  if (process.env.DATABASE_URL === databaseUrl) {
    throw new Error(
      'DATABASE_URL_TEST must point at a different database from DATABASE_URL (the integration suite writes and deletes rows).',
    )
  }

  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
}
