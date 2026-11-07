import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthRepository, UserRecord } from '../domain/authService.js';

const select = { id: true, email: true, passwordHash: true, role: true, displayName: true } as const;

/** PostgreSQL rejects a malformed UUID with P2023; for lookups that is simply "no such user". */
function isInvalidId(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2023';
}

/** Prisma-backed `AuthRepository` (F-01 §4): users plus the RevokedToken denylist. */
export function createPrismaAuthRepository(prisma: PrismaClient): AuthRepository {
  return {
    async findUserByEmail(email): Promise<UserRecord | null> {
      return prisma.user.findUnique({ where: { email }, select });
    },

    async findUserById(id): Promise<UserRecord | null> {
      try {
        return await prisma.user.findUnique({ where: { id }, select });
      } catch (err) {
        if (isInvalidId(err)) return null;
        throw err;
      }
    },

    async isRevoked(jti) {
      return (await prisma.revokedToken.count({ where: { jti } })) > 0;
    },

    async revoke(entry, now) {
      // One transaction: the denylist insert and the expired-row cleanup commit together (§4.4).
      await prisma.$transaction([
        prisma.revokedToken.upsert({
          where: { jti: entry.jti },
          create: { jti: entry.jti, userId: entry.userId, expiresAt: entry.expiresAt },
          update: {},
        }),
        prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      ]);
    },
  };
}
