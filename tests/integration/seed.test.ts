import { execSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { databaseUrl, newPrisma } from '../helpers/integrationApp.js';

// PR #19 review (audit item 3): re-running the seed must bring existing seeded
// rows back to the seed values (e.g. after SEED_*_PASSWORD changes), not skip them.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (seed re-run test).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('seed re-run updates existing rows', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = newPrisma();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('restores a changed password hash, display name and template fields', async () => {
    await prisma.user.update({
      where: { email: 'bob@exercise.test' },
      data: { passwordHash: await bcrypt.hash('some-other-password', 4), displayName: 'Changed' },
    });
    await prisma.exerciseTemplate.updateMany({
      where: { name: 'Barbell Squat' },
      data: { metValue: 9.9 },
    });

    execSync('pnpm exec tsx prisma/seed.ts', {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });

    const bob = await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } });
    expect(await bcrypt.compare(env.seedParticipantPassword, bob.passwordHash)).toBe(true);
    expect(bob.displayName).toBe('Bob');
    const squat = await prisma.exerciseTemplate.findFirstOrThrow({ where: { name: 'Barbell Squat' } });
    expect(Number(squat.metValue)).toBe(3.5);
  });
});
