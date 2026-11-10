import type { TrackingMode } from '@prisma/client';
import { buildCustomExercise, type CustomExercise } from './customExercise.js';
import type { FieldError } from './errors.js';

/**
 * Plan target validation (F-03 R6, R7; BR-02 limits). Pure: no storage, no Clock.
 * Field-level rules that need other data (template lookup, today's date) are
 * composed by the caller.
 */
export interface TargetFields {
  targetSets: number | null;
  targetRepsPerSet: number | null;
  loadKg: number | null;
  targetDurationSec: number | null;
  targetDistanceKm: number | null;
}

export interface TargetInput {
  trackingMode: TrackingMode;
  /** Valid Range of the exercise snapshot, in the exercise unit (reps, seconds or km). */
  range: { min: number; max: number };
  targetSets?: unknown;
  targetRepsPerSet?: unknown;
  loadKg?: unknown;
  targetDurationSec?: unknown;
  targetDistanceKm?: unknown;
}

export type TargetValidation = { value: TargetFields } | { fields: FieldError[] };

type TargetKey = keyof TargetFields;
const ALL_KEYS: readonly TargetKey[] = ['targetSets', 'targetRepsPerSet', 'loadKg', 'targetDurationSec', 'targetDistanceKm'];

/** Target fields that belong to each mode (R6). */
const KEYS_OF: Record<TrackingMode, readonly TargetKey[]> = {
  WEIGHT: ['targetSets', 'targetRepsPerSet', 'loadKg'],
  BODYWEIGHT_REPS: ['targetSets', 'targetRepsPerSet'],
  BODYWEIGHT_TIME: ['targetDurationSec'],
  YOGA: ['targetDurationSec'],
  CARDIO_TIME: ['targetDurationSec'],
  CARDIO_DISTANCE: ['targetDistanceKm'],
};

const MAX_SETS = 20;
const MAX_REPS_PER_SET = 200;
const MAX_LOAD_KG = 500;
const MAX_DURATION_SEC = 10800;
const MAX_DISTANCE_KM = 100;

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor === value;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateTarget(input: TargetInput): TargetValidation {
  const fields: FieldError[] = [];
  const fail = (field: string, limit: string) => fields.push({ field, limit });
  const allowed = KEYS_OF[input.trackingMode];

  // R6: a target field that does not belong to the mode is rejected.
  for (const key of ALL_KEYS) {
    if (!allowed.includes(key) && input[key] !== undefined && input[key] !== null) {
      fail(key, `not used by ${input.trackingMode}`);
    }
  }

  const out: TargetFields = {
    targetSets: null,
    targetRepsPerSet: null,
    loadKg: null,
    targetDurationSec: null,
    targetDistanceKm: null,
  };

  if (allowed.includes('targetSets')) {
    const sets = input.targetSets;
    const reps = input.targetRepsPerSet;
    const setsOk = Number.isInteger(sets) && (sets as number) >= 1 && (sets as number) <= MAX_SETS;
    const repsOk = Number.isInteger(reps) && (reps as number) >= 1 && (reps as number) <= MAX_REPS_PER_SET;
    if (!setsOk) fail('targetSets', `integer 1-${MAX_SETS}`);
    if (!repsOk) fail('targetRepsPerSet', `integer 1-${MAX_REPS_PER_SET}`);
    if (setsOk && repsOk) {
      // R7: total reps must lie within the exercise's Valid Range.
      const total = (sets as number) * (reps as number);
      if (total < input.range.min || total > input.range.max) {
        fail('targetRepsPerSet', `total reps (sets x reps) must be ${input.range.min}-${input.range.max}`);
      } else {
        out.targetSets = sets as number;
        out.targetRepsPerSet = reps as number;
      }
    }
  }

  if (allowed.includes('loadKg')) {
    const load = input.loadKg;
    if (!isNumber(load) || load <= 0 || load > MAX_LOAD_KG || !hasAtMostDecimals(load, 2)) {
      fail('loadKg', `required: greater than 0 and at most ${MAX_LOAD_KG} kg, at most 2 decimals`);
    } else {
      out.loadKg = load;
    }
  }

  if (allowed.includes('targetDurationSec')) {
    const d = input.targetDurationSec;
    if (!Number.isInteger(d) || (d as number) < 1 || (d as number) > MAX_DURATION_SEC) {
      fail('targetDurationSec', `integer seconds 1-${MAX_DURATION_SEC}`);
    } else if ((d as number) < input.range.min || (d as number) > input.range.max) {
      fail('targetDurationSec', `must be ${input.range.min}-${input.range.max} seconds`);
    } else {
      out.targetDurationSec = d as number;
    }
  }

  if (allowed.includes('targetDistanceKm')) {
    const km = input.targetDistanceKm;
    if (!isNumber(km) || km <= 0 || km > MAX_DISTANCE_KM || !hasAtMostDecimals(km, 2)) {
      fail('targetDistanceKm', `greater than 0 and at most ${MAX_DISTANCE_KM} km, at most 2 decimals`);
    } else if (km < input.range.min || km > input.range.max) {
      fail('targetDistanceKm', `must be ${input.range.min}-${input.range.max} km`);
    } else {
      out.targetDistanceKm = km;
    }
  }

  return fields.length > 0 ? { fields } : { value: out };
}

// ---------------------------------------------------------------------------
// Plan item request (F-03 §4.2-4.3, R8-R11)
// ---------------------------------------------------------------------------

/** ISO weekday array (1 = Monday ... 7 = Sunday) → stored Monday-Sunday bitmask (SDS §3.2). */
export function isoDaysToMask(days: readonly number[]): number {
  return days.reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

/** Stored bitmask → ascending ISO weekday array. */
export function maskToIsoDays(mask: number): number[] {
  const days: number[] = [];
  for (let day = 1; day <= 7; day++) if (mask & (1 << (day - 1))) days.push(day);
  return days;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const PLAN_KEYS = new Set([
  'source',
  'templateId',
  'exercise',
  'priorityWeight',
  'targetSets',
  'targetRepsPerSet',
  'loadKg',
  'targetDurationSec',
  'targetDistanceKm',
  'effectiveFrom',
  'endDate',
  'repeatDays',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PlanRequestCommon {
  priorityWeight: number;
  /** Raw target fields, checked later against the template's mode and range by `validateTarget`. */
  target: Pick<TargetInput, 'targetSets' | 'targetRepsPerSet' | 'loadKg' | 'targetDurationSec' | 'targetDistanceKm'>;
  effectiveFrom: string;
  endDate: string | null;
  repeatDays: number[];
}

/** `source: TEMPLATE` selects a library template; `source: CUSTOM` carries a validated custom exercise (R4, R5). */
export type PlanRequest =
  | (PlanRequestCommon & { source: 'TEMPLATE'; templateId: string })
  | (PlanRequestCommon & { source: 'CUSTOM'; exercise: CustomExercise });

/**
 * Checks everything in a create request that needs neither the template nor the
 * database: shape, source, priority (R8), dates against `today` (R9, R10) and
 * repeat days (R11), and the source-specific part: a template id, or a custom exercise (R4).
 */
export function validatePlanRequest(body: unknown, today: string): { value: PlanRequest } | { fields: FieldError[] } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { fields: [{ field: 'body', limit: 'must be a JSON object' }] };
  }
  const input = body as Record<string, unknown>;
  const fields: FieldError[] = [];
  const fail = (field: string, limit: string) => fields.push({ field, limit });

  for (const key of Object.keys(input)) {
    if (!PLAN_KEYS.has(key)) fail(key, 'is not an allowed field');
  }
  const source = input['source'];
  if (source !== 'TEMPLATE' && source !== 'CUSTOM') fail('source', 'must be TEMPLATE or CUSTOM');
  let exercise: CustomExercise | null = null;
  if (source === 'TEMPLATE') {
    if (input['exercise'] !== undefined) fail('exercise', 'not allowed with source TEMPLATE');
    if (typeof input['templateId'] !== 'string' || !UUID.test(input['templateId'])) fail('templateId', 'must be a UUID');
  } else if (source === 'CUSTOM') {
    if (input['templateId'] !== undefined) fail('templateId', 'not allowed with source CUSTOM');
    const built = buildCustomExercise(input['exercise']);
    if ('fields' in built) fields.push(...built.fields);
    else exercise = built.value;
  }

  const weight = input['priorityWeight'];
  if (!Number.isInteger(weight) || (weight as number) < 1 || (weight as number) > 5) fail('priorityWeight', 'required integer 1-5');

  let effectiveFrom = today;
  if (input['effectiveFrom'] !== undefined) {
    if (!isCalendarDate(input['effectiveFrom'])) fail('effectiveFrom', 'must be a date YYYY-MM-DD');
    else if (input['effectiveFrom'] < today) fail('effectiveFrom', `must be today (${today}) or later`);
    else effectiveFrom = input['effectiveFrom'];
  }

  let endDate: string | null = null;
  if (input['endDate'] !== undefined && input['endDate'] !== null) {
    if (!isCalendarDate(input['endDate'])) fail('endDate', 'must be a date YYYY-MM-DD');
    else if (input['endDate'] < effectiveFrom) fail('endDate', 'must not be before effectiveFrom');
    else endDate = input['endDate'];
  }

  let repeatDays = [1, 2, 3, 4, 5, 6, 7];
  if (input['repeatDays'] !== undefined) {
    const days = input['repeatDays'];
    const valid =
      Array.isArray(days) &&
      days.length > 0 &&
      days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) &&
      new Set(days).size === days.length;
    if (!valid) fail('repeatDays', 'non-empty array of unique ISO weekdays 1 (Mon) - 7 (Sun)');
    else repeatDays = [...(days as number[])].sort((a, b) => a - b);
  }

  if (fields.length > 0) return { fields };
  const common: PlanRequestCommon = {
    priorityWeight: weight as number,
    target: {
      targetSets: input['targetSets'],
      targetRepsPerSet: input['targetRepsPerSet'],
      loadKg: input['loadKg'],
      targetDurationSec: input['targetDurationSec'],
      targetDistanceKm: input['targetDistanceKm'],
    },
    effectiveFrom,
    endDate,
    repeatDays,
  };
  if (source === 'CUSTOM') return { value: { ...common, source: 'CUSTOM', exercise: exercise as CustomExercise } };
  return { value: { ...common, source: 'TEMPLATE', templateId: input['templateId'] as string } };
}
