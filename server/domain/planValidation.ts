import type { TrackingMode } from '@prisma/client';
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
