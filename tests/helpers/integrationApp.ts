import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { createApp } from '../../server/app.js';
import { env } from '../../server/config/env.js';
import { createAuthService } from '../../server/domain/authService.js';
import type { Clock } from '../../server/domain/clock.js';
import { FixedClock } from '../../server/domain/clock.js';
import { createPrismaAuthRepository } from '../../server/repositories/authRepository.js';
import { createPrismaLibraryRepository } from '../../server/repositories/libraryRepository.js';
import { createPrismaPlanRepository } from '../../server/repositories/planRepository.js';

export const TEST_SECRET = 'integration-test-secret-0123456789abcdef';
export const databaseUrl = process.env.DATABASE_URL_TEST;

/** Settable clock so a test can move time (token expiry boundaries). */
export class MutableClock implements Clock {
  constructor(private current: Date) {}
  set(date: Date): void {
    this.current = date;
  }
  now(): Date {
    return new Date(this.current.getTime());
  }
  today(): string {
    return new FixedClock(this.current).today();
  }
}

export function newPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

/**
 * A full application instance on the real test database. "Restart" in the STS
 * means calling this again with a new PrismaClient on the same database.
 * Probe owner lookup: a probe resource id is a User id and its owner is that user.
 */
export function buildIntegrationApp(prisma: PrismaClient, clock: Clock): Express {
  const repo = createPrismaAuthRepository(prisma);
  return createApp({
    nodeEnv: 'test',
    auth: {
      secret: TEST_SECRET,
      clock,
      isRevoked: (jti) => repo.isRevoked(jti),
      userExists: (id) => repo.userExists(id),
    },
    authService: createAuthService({ repo, clock, secret: TEST_SECRET, expiresInSeconds: 3600, bcryptCost: env.bcryptCost }),
    library: createPrismaLibraryRepository(prisma),
    plans: createPrismaPlanRepository(prisma),
    clock,
    probeOwnerLookup: async (id) => (await repo.findUserById(id))?.id ?? null,
  });
}
