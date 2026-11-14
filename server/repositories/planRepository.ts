import type { Prisma, PrismaClient } from '@prisma/client';
import { maskToIsoDays, isoDaysToMask, type TargetFields } from '../domain/planValidation.js';
import type { CustomExercise } from '../domain/customExercise.js';
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

export interface CreatePlanCustom {
  userId: string;
  exercise: CustomExercise;
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
  /** Same, for a custom exercise: `isCustom` true and no source template (R4, R5). */
  createCustom(input: CreatePlanCustom): Promise<{ userExercise: UserExerciseRecord; planItem: PlanItemRecord }>;
  /** All plan items of the user (every version) with their snapshots, ordered by effectiveFrom then createdAt. */
  listPlanItems(userId: string): Promise<PlanItemWithExercise[]>;
  /** The user's own exercise snapshots, sorted by name. */
  listUserExercises(userId: string): Promise<UserExerciseRecord[]>;
  findPlanItem(id: string): Promise<PlanItemWithExercise | null>;
  /** Owner of a plan item, or null if it does not exist (route ownership check). */
  findPlanItemOwner(id: string): Promise<string | null>;
  /**
   * Owner and validation context of one exercise snapshot, or null if it does not
   * exist. F-04 reads it for the entry ownership check (R2: 403/404) and for the
   * mode / Valid Range of the value limits (R4, R6); `userId` never leaves the server.
   */
  findUserExerciseContext(id: string): Promise<UserExerciseContext | null>;
}

/** What the entry routes need to know about an exercise snapshot (F-04 R2/R4/R6). */
export interface UserExerciseContext {
  userId: string;
  trackingMode: string;
  rangeMax: number;
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

type ExerciseData = Omit<Prisma.UserExerciseUncheckedCreateInput, 'userId' | 'id' | 'createdAt'>;

/** Creates the exercise and its plan item in one transaction (R14); a new planKey with version 1 (R15). */
function insertExerciseAndItem(
  prisma: PrismaClient,
  input: { userId: string; priorityWeight: number; target: TargetFields; effectiveFrom: string; endDate: string | null; repeatDays: number[] },
  exerciseData: ExerciseData,
): Promise<{ userExercise: UserExerciseRecord; planItem: PlanItemRecord }> {
  return prisma.$transaction(async (tx) => {
    const exercise = await tx.userExercise.create({ data: { userId: input.userId, ...exerciseData } });
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

    async findUserExerciseContext(id) {
      const row = await prisma.userExercise.findUnique({
        where: { id },
        select: { userId: true, trackingMode: true, rangeMax: true },
      });
      if (!row) return null;
      return { userId: row.userId, trackingMode: row.trackingMode, rangeMax: row.rangeMax.toNumber() };
    },

    async createFromTemplate(input) {
      const t = input.template;
      // Snapshot (Decision 12): copy the template fields; sourceTemplateId is a plain column, no foreign key (B8).
      return insertExerciseAndItem(prisma, input, {
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
      });
    },

    async createCustom(input) {
      const e = input.exercise;
      return insertExerciseAndItem(prisma, input, {
        sourceTemplateId: null,
        isCustom: true,
        name: e.name,
        targetBodyPart: e.targetBodyPart,
        unit: e.unit,
        trackingMode: e.trackingMode,
        cardioCategory: e.cardioCategory,
        metValue: e.metValue,
        rangeMin: e.rangeMin,
        rangeMax: e.rangeMax,
      });
    },
  };
}
