import type { Prisma, PrismaClient } from '@prisma/client';
import { maskToIsoDays, isoDaysToMask, type TargetFields } from '../domain/planValidation.js';
import type { TemplateRecord } from './libraryRepository.js';

/** `UserExercise` as returned by the API (F-03 §4.4): never `userId`. */
export interface UserExerciseRecord {
  id: string;
  sourceTemplateId: string | null;
  isCustom: boolean;
  name: string;
  targetBodyPart: string;
  trackingMode: string;
  unit: string;
  cardioCategory: string | null;
  metValue: number;
  rangeMin: number;
  rangeMax: number;
}

/** `PlanItem` as returned by the API (F-03 §4.4): dates `YYYY-MM-DD`, repeat days as ISO weekdays. */
export interface PlanItemRecord extends TargetFields {
  id: string;
  userExerciseId: string;
  planKey: string;
  version: number;
  priorityWeight: number;
  effectiveFrom: string;
  endDate: string | null;
  repeatDays: number[];
  createdAt: string;
}

export interface CreatePlanFromTemplate {
  userId: string;
  template: TemplateRecord;
  priorityWeight: number;
  target: TargetFields;
  effectiveFrom: string;
  endDate: string | null;
  repeatDays: number[];
}

export interface PlanItemWithExercise {
  planItem: PlanItemRecord;
  userExercise: UserExerciseRecord;
}

/** Plan storage (F-03): the participant's exercise snapshots and plan items. */
export interface PlanRepository {
  /** Creates the snapshot and the plan item in one transaction (R14). */
  createFromTemplate(input: CreatePlanFromTemplate): Promise<{ userExercise: UserExerciseRecord; planItem: PlanItemRecord }>;
  /** All plan items of the user (every version) with their snapshots, ordered by effectiveFrom then createdAt. */
  listPlanItems(userId: string): Promise<PlanItemWithExercise[]>;
  /** The user's own exercise snapshots, sorted by name. */
  listUserExercises(userId: string): Promise<UserExerciseRecord[]>;
  findPlanItem(id: string): Promise<PlanItemWithExercise | null>;
  /** Owner of a plan item, or null if it does not exist (route ownership check). */
  findPlanItemOwner(id: string): Promise<string | null>;
}

const toDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const toDay = (date: Date): string => date.toISOString().slice(0, 10);

export function toUserExerciseRecord(row: Prisma.UserExerciseGetPayload<object>): UserExerciseRecord {
  return {
    id: row.id,
    sourceTemplateId: row.sourceTemplateId,
    isCustom: row.isCustom,
    name: row.name,
    targetBodyPart: row.targetBodyPart,
    trackingMode: row.trackingMode,
    unit: row.unit,
    cardioCategory: row.cardioCategory,
    metValue: row.metValue.toNumber(),
    rangeMin: row.rangeMin.toNumber(),
    rangeMax: row.rangeMax.toNumber(),
  };
}

export function toPlanItemRecord(row: Prisma.PlanItemGetPayload<object>): PlanItemRecord {
  return {
    id: row.id,
    userExerciseId: row.userExerciseId,
    planKey: row.planKey,
    version: row.version,
    priorityWeight: row.priorityWeight,
    targetSets: row.targetSets,
    targetRepsPerSet: row.targetRepsPerSet,
    loadKg: row.loadKg?.toNumber() ?? null,
    targetDurationSec: row.targetDurationSec,
    targetDistanceKm: row.targetDistanceKm?.toNumber() ?? null,
    effectiveFrom: toDay(row.effectiveFrom),
    endDate: row.endDate ? toDay(row.endDate) : null,
    repeatDays: maskToIsoDays(row.repeatDays),
    createdAt: row.createdAt.toISOString(),
  };
}

export function createPrismaPlanRepository(prisma: PrismaClient): PlanRepository {
  return {
    async listPlanItems(userId) {
      const rows = await prisma.planItem.findMany({
        where: { userId },
        include: { userExercise: true },
        orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
      });
      return rows.map(({ userExercise, ...item }) => ({ planItem: toPlanItemRecord(item), userExercise: toUserExerciseRecord(userExercise) }));
    },

    async listUserExercises(userId) {
      const rows = await prisma.userExercise.findMany({ where: { userId }, orderBy: { name: 'asc' } });
      return rows.map(toUserExerciseRecord);
    },

    async findPlanItem(id) {
      const row = await prisma.planItem.findUnique({ where: { id }, include: { userExercise: true } });
      if (!row) return null;
      const { userExercise, ...item } = row;
      return { planItem: toPlanItemRecord(item), userExercise: toUserExerciseRecord(userExercise) };
    },

    async findPlanItemOwner(id) {
      const row = await prisma.planItem.findUnique({ where: { id }, select: { userId: true } });
      return row?.userId ?? null;
    },

    async createFromTemplate(input) {
      const t = input.template;
      return prisma.$transaction(async (tx) => {
        // Snapshot (Decision 12): copy the template fields; sourceTemplateId is a plain column, no foreign key (B8).
        const exercise = await tx.userExercise.create({
          data: {
            userId: input.userId,
            sourceTemplateId: t.id,
            isCustom: false,
            name: t.name,
            targetBodyPart: t.targetBodyPart,
            unit: t.unit,
            trackingMode: t.trackingMode,
            cardioCategory: t.cardioCategory as never,
            metValue: t.metValue,
            rangeMin: t.rangeMin,
            rangeMax: t.rangeMax,
          },
        });
        // A new planKey (database default) with version 1; PlanItem rows are never updated in place (R15).
        const item = await tx.planItem.create({
          data: {
            userId: input.userId,
            userExerciseId: exercise.id,
            priorityWeight: input.priorityWeight,
            ...input.target,
            effectiveFrom: toDate(input.effectiveFrom),
            endDate: input.endDate ? toDate(input.endDate) : null,
            repeatDays: isoDaysToMask(input.repeatDays),
          },
        });
        return { userExercise: toUserExerciseRecord(exercise), planItem: toPlanItemRecord(item) };
      });
    },
  };
}
