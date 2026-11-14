import type { PrismaClient, TrackingMode } from '@prisma/client';
import { isoDaysToMask } from '../../server/domain/planValidation.js';

/**
 * Test helper (F-03 §5.2, SRS Assumption 4): inserts a PlanItem straight through Prisma so a
 * test can have rows with a past `effectiveFrom` (the API rejects those, R9) or a chosen
 * `planKey` / `version`. Never imported by production code.
 */
export interface HistoricalPlanItemSpec {
  userId: string;
  /** Reuse an existing UserExercise; otherwise one is created from `templateName`. */
  userExerciseId?: string;
  templateName?: string;
  effectiveFrom: string;
  endDate?: string | null;
  repeatDays?: number[];
  priorityWeight?: number;
  planKey?: string;
  version?: number;
  target?: { targetSets?: number; targetRepsPerSet?: number; loadKg?: number; targetDurationSec?: number; targetDistanceKm?: number };
}

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export async function createHistoricalPlanItem(prisma: PrismaClient, spec: HistoricalPlanItemSpec) {
  let userExerciseId = spec.userExerciseId;
  if (!userExerciseId) {
    const template = await prisma.exerciseTemplate.findFirstOrThrow({ where: { name: spec.templateName ?? 'Barbell Squat' } });
    const exercise = await prisma.userExercise.create({
      data: {
        userId: spec.userId,
        sourceTemplateId: template.id,
        name: template.name,
        targetBodyPart: template.targetBodyPart,
        unit: template.unit,
        trackingMode: template.trackingMode as TrackingMode,
        cardioCategory: template.cardioCategory,
        metValue: template.metValue,
        rangeMin: template.rangeMin,
        rangeMax: template.rangeMax,
      },
    });
    userExerciseId = exercise.id;
  }
  return prisma.planItem.create({
    data: {
      userId: spec.userId,
      userExerciseId,
      ...(spec.planKey ? { planKey: spec.planKey } : {}),
      version: spec.version ?? 1,
      priorityWeight: spec.priorityWeight ?? 3,
      targetSets: spec.target?.targetSets ?? 4,
      targetRepsPerSet: spec.target?.targetRepsPerSet ?? 10,
      loadKg: spec.target?.loadKg ?? 40,
      effectiveFrom: day(spec.effectiveFrom),
      endDate: spec.endDate ? day(spec.endDate) : null,
      repeatDays: isoDaysToMask(spec.repeatDays ?? [1, 2, 3, 4, 5, 6, 7]),
    },
  });
}
