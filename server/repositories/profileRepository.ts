import type { PrismaClient } from '@prisma/client';

/**
 * Profile as the API returns it (F-04 §4.5): never `userId` or `passwordHash`.
 * `weightEffectiveDate` is a `YYYY-MM-DD` string; both weight fields are null when
 * the Participant has no `WeightLog` row (R16).
 */
export interface ProfileRecord {
  email: string;
  displayName: string;
  currentWeightKg: number | null;
  weightEffectiveDate: string | null;
}

export interface ProfileRepository {
  /** The caller's own profile; null only if the user row is gone. */
  getProfile(userId: string): Promise<ProfileRecord | null>;
  /** Appends one `WeightLog` row (append-only, R16); rows are never updated or deleted. */
  appendWeight(userId: string, weightKg: number, effectiveDate: string): Promise<void>;
}

const toDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

export function createPrismaProfileRepository(prisma: PrismaClient): ProfileRepository {
  return {
    async getProfile(userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
      if (!user) return null;
      // Current weight = latest row by effectiveDate, then createdAt (R16).
      const latest = await prisma.weightLog.findFirst({
        where: { userId },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        select: { weightKg: true, effectiveDate: true },
      });
      return {
        email: user.email,
        displayName: user.displayName,
        currentWeightKg: latest ? Number(latest.weightKg) : null,
        weightEffectiveDate: latest ? latest.effectiveDate.toISOString().slice(0, 10) : null,
      };
    },

    async appendWeight(userId, weightKg, effectiveDate) {
      await prisma.weightLog.create({ data: { userId, weightKg, effectiveDate: toDate(effectiveDate) } });
    },
  };
}
