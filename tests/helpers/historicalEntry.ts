import type { PrismaClient } from '@prisma/client';

/**
 * Test helper (F-07 §5, F-06 §5): inserts a LedgerEntry straight through Prisma so a test can
 * have entries on past dates (the API rejects those, F-04 R3). Never imported by production code.
 * `sets` and `totalReps` go together (`LedgerEntry_sets_reps_pair_check`).
 */
export interface HistoricalEntrySpec {
  userId: string;
  userExerciseId: string;
  logDate: string;
  sets?: number;
  totalReps: number;
  kind?: 'MANUAL' | 'QUICK_COMPLETE';
}

export function createHistoricalEntry(prisma: PrismaClient, spec: HistoricalEntrySpec) {
  return prisma.ledgerEntry.create({
    data: {
      userId: spec.userId,
      userExerciseId: spec.userExerciseId,
      logDate: new Date(`${spec.logDate}T00:00:00.000Z`),
      sets: spec.sets ?? 1,
      totalReps: spec.totalReps,
      kind: spec.kind ?? 'MANUAL',
    },
  });
}
