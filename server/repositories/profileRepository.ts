import type { PrismaClient } from '@prisma/client';
import type { WeightRow } from '../domain/calorieCalc.js';

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
  /** F-11 R2: the caller's `WeightLog` rows with `effectiveDate` on or before `date`; `pickBodyWeight` chooses one. */
  listWeightsUpTo(userId: string, date: string): Promise<WeightRow[]>;
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

    async listWeightsUpTo(userId, date) {
      // Served by the index (userId, effectiveDate); only the latest effectiveDate can win (R2).
      const latest = await prisma.weightLog.findFirst({
        where: { userId, effectiveDate: { lte: toDate(date) } },
        orderBy: { effectiveDate: 'desc' },
        select: { effectiveDate: true },
      });
      if (!latest) return [];
      const rows = await prisma.weightLog.findMany({
        where: { userId, effectiveDate: latest.effectiveDate },
        select: { weightKg: true, effectiveDate: true, createdAt: true },
      });
      return rows.map((row) => ({
        weightKg: Number(row.weightKg),
        effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
        createdAt: row.createdAt,
      }));
    },
  };
}
