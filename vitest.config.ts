import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration suites hit a real PostgreSQL test DB (DATABASE_URL_TEST);
    // they are enabled per-suite once the Prisma setup (issue #2) lands.
    pool: 'forks',
  },
});
