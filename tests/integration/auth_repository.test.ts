import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaAuthRepository } from '../../server/repositories/authRepository.js';

// F-01 persistence layer: the Prisma AuthRepository against a real PostgreSQL
// test database (SDS §2.1). Supports TEST-01d (denylist survives a restart).
const databaseUrl = process.env.DATABASE_URL_TEST;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PrismaAuthRepository (real PostgreSQL)', () => {
  const suffix = randomUUID();
  const email = `authrepo-${suffix}@exercise.test`;
  let prisma: PrismaClient;
  let userId: string;
  const repo = () => createPrismaAuthRepository(prisma);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const user = await prisma.user.create({
      data: { email, passwordHash: '$2b$04$placeholderplaceholderplaceholderplaceholderplaceholde', role: 'PARTICIPANT', displayName: 'Repo User' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.revokedToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('finds a user by email and by id with the fields the service needs', async () => {
    const byEmail = await repo().findUserByEmail(email);
    expect(byEmail).toMatchObject({ id: userId, email, role: 'PARTICIPANT', displayName: 'Repo User' });
    expect(await repo().findUserById(userId)).toEqual(byEmail);
  });

  it('returns null for an unknown email or id', async () => {
    expect(await repo().findUserByEmail(`nobody-${suffix}@exercise.test`)).toBeNull();
    expect(await repo().findUserById(randomUUID())).toBeNull();
  });

  it('returns null (not an error) for a non-UUID id', async () => {
    expect(await repo().findUserById('not-a-uuid')).toBeNull();
  });

  it('revoke stores the jti and isRevoked sees it from a fresh repository instance', async () => {
    const jti = `jti-${suffix}-a`;
    const now = new Date('2026-11-05T03:00:00Z');
    expect(await repo().isRevoked(jti)).toBe(false);
    await repo().revoke({ jti, userId, expiresAt: new Date('2026-11-05T04:00:00Z') }, now);
    const fresh = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      expect(await createPrismaAuthRepository(fresh).isRevoked(jti)).toBe(true);
    } finally {
      await fresh.$disconnect();
    }
  });

  it('revoke is idempotent for the same jti', async () => {
    const jti = `jti-${suffix}-b`;
    const entry = { jti, userId, expiresAt: new Date('2026-11-05T04:00:00Z') };
    const now = new Date('2026-11-05T03:00:00Z');
    await repo().revoke(entry, now);
    await repo().revoke(entry, now);
    expect(await prisma.revokedToken.count({ where: { jti } })).toBe(1);
  });

  it('revoke deletes rows whose expiresAt is before now and keeps the rest (§4.4)', async () => {
    const stale = `jti-${suffix}-stale`;
    const live = `jti-${suffix}-live`;
    await prisma.revokedToken.create({ data: { jti: stale, userId, expiresAt: new Date('2026-11-05T01:00:00Z') } });
    await repo().revoke({ jti: live, userId, expiresAt: new Date('2026-11-05T09:00:00Z') }, new Date('2026-11-05T05:00:00Z'));
    expect(await repo().isRevoked(stale)).toBe(false);
    expect(await repo().isRevoked(live)).toBe(true);
  });
});
