/**
 * Entry and weight value validation (F-04 R4, R5, R6, R16). Pure: no storage,
 * no Clock. Field-level rules only — route-level rules (logDate/R3, ownership/
 * R2, plan availability/R8) are composed by the caller.
 *
 * Limit strings name the field and the violated limit (F-04 §3.3), in the
 * style of `planValidation`/`templateValidation`.
 */
import type { FieldError } from './errors.js';

/** The four LedgerEntry value columns an entry can carry. */
export interface ValidEntry {
  sets: number | null;
  totalReps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
}

/** The day's sums for the same exercise BEFORE the new entry (`cumulativeFor` output). */
export interface EntryTotals {
  sets?: number | null;
  totalReps?: number | null;
  durationSec?: number | null;
  distanceKm?: number | null;
}

export type EntryValidation = { value: ValidEntry } | { fields: FieldError[] };
export type WeightValidation = { value: number } | { fields: FieldError[] };

const MAX_SETS = 20;
const MAX_REPS_PER_SET = 200;
const MAX_DURATION_SEC = 10800;
const MAX_DISTANCE_KM = 100;
const MIN_WEIGHT_KG = 1;
const MAX_WEIGHT_KG = 800;

/** R4: value fields required per tracking mode. */
const MODE_FIELDS: Record<string, readonly (keyof ValidEntry)[]> = {
  WEIGHT: ['sets', 'totalReps'],
  BODYWEIGHT_REPS: ['sets', 'totalReps'],
  BODYWEIGHT_TIME: ['durationSec'],
  YOGA: ['durationSec'],
  CARDIO_TIME: ['durationSec'],
  CARDIO_DISTANCE: ['distanceKm'],
};

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function atMostDecimals(value: number, decimals: number): boolean {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor === value;
}

/**
 * Validate an entry's value fields for its tracking mode (R4), the per-entry
 * limit (R5) and the daily cumulative limits including the exercise's
 * `rangeMax` (R6). `totals` are the day's sums for the same exercise before
 * this entry; `rangeMax` is the exercise snapshot's Valid Range max (absent →
 * only the hard caps apply).
 *
 * On success returns the four LedgerEntry value columns with the mode's unused
 * columns null. On failure every error names its field and limit; the caller
 * turns `fields` into 400 `VALIDATION_ERROR` and stores nothing.
 */
export function validateEntry(
  values: Record<string, unknown>,
  mode: string,
  totals: EntryTotals,
  rangeMax?: number | null,
): EntryValidation {
  const required = MODE_FIELDS[mode];
  if (!required) return { fields: [{ field: 'trackingMode', limit: `unknown tracking mode ${mode}` }] };

  const failed: FieldError[] = [];
  const fail = (field: string, limit: string) => {
    if (!failed.some((f) => f.field === field)) failed.push({ field, limit });
  };

  // R4: a value field that does not belong to the mode is rejected.
  for (const key of Object.keys(values)) {
    if (!required.includes(key as keyof ValidEntry)) fail(key, `not used by ${mode}`);
  }

  const setsInt = isInt(values.sets) ? values.sets : null;
  const repsInt = isInt(values.totalReps) ? values.totalReps : null;
  const secInt = isInt(values.durationSec) ? values.durationSec : null;
  const kmNum = isNum(values.distanceKm) ? values.distanceKm : null;

  if (required.includes('sets')) {
    const setsOk = setsInt !== null && setsInt >= 1 && setsInt <= MAX_SETS;
    const repsOk = repsInt !== null && repsInt >= 1;
    if (!setsOk) fail('sets', `integer 1-${MAX_SETS}`);
    if (!repsOk) fail('totalReps', 'integer ≥ 1');

    // R5: this entry must fit totalReps ≤ sets × 200 (SRS Q20 per ledger entry).
    if (setsOk && repsOk && (repsInt as number) > (setsInt as number) * MAX_REPS_PER_SET) {
      fail('totalReps', `totalReps ≤ sets × ${MAX_REPS_PER_SET} per entry`);
    }

    // R6 cumulative sets ≤ 20 (sums include the new entry).
    if (setsInt !== null && (totals.sets ?? 0) + setsInt > MAX_SETS) {
      fail('sets', `cumulative sets ≤ ${MAX_SETS}`);
    }

    // R6 cumulative totalReps ≤ min(cumulative sets × 200, rangeMax).
    if (setsOk && repsInt !== null) {
      const cap = Math.min(((totals.sets ?? 0) + setsInt) * MAX_REPS_PER_SET, rangeMax ?? Infinity);
      if ((totals.totalReps ?? 0) + repsInt > cap) {
        fail('totalReps', `cumulative totalReps ≤ ${cap}`);
      }
    }
  }

  if (required.includes('durationSec')) {
    const secOk = secInt !== null && secInt >= 1 && secInt <= MAX_DURATION_SEC;
    if (!secOk) fail('durationSec', `integer 1-${MAX_DURATION_SEC}`);
    // R6 cumulative durationSec ≤ min(10,800, rangeMax).
    if (secInt !== null) {
      const cap = Math.min(MAX_DURATION_SEC, rangeMax ?? MAX_DURATION_SEC);
      if ((totals.durationSec ?? 0) + secInt > cap) fail('durationSec', `cumulative durationSec ≤ ${cap}`);
    }
  }

  if (required.includes('distanceKm')) {
    const kmOk = kmNum !== null && kmNum > 0 && kmNum <= MAX_DISTANCE_KM && atMostDecimals(kmNum, 2);
    if (!kmOk) {
      fail('distanceKm', `greater than 0 and at most ${MAX_DISTANCE_KM} km, at most 2 decimals`);
    }
    // R6 cumulative distanceKm ≤ min(100, rangeMax); hundredths math keeps the
    // sum exact at R4's 2-decimal precision.
    if (kmNum !== null) {
      const cap = Math.min(MAX_DISTANCE_KM, rangeMax ?? MAX_DISTANCE_KM);
      const cumHundredths = Math.round(((totals.distanceKm ?? 0) + kmNum) * 100);
      if (cumHundredths > Math.round(cap * 100)) fail('distanceKm', `cumulative distanceKm ≤ ${cap}`);
    }
  }

  if (failed.length > 0) return { fields: failed };

  const value: ValidEntry = { sets: null, totalReps: null, durationSec: null, distanceKm: null };
  if (required.includes('sets')) {
    value.sets = setsInt as number;
    value.totalReps = repsInt as number;
  } else if (required.includes('durationSec')) {
    value.durationSec = secInt as number;
  } else {
    value.distanceKm = kmNum as number;
  }
  return { value };
}

/**
 * WeightLog bounds (F-04 R16): a number 1–800 inclusive with at most 1 decimal
 * place. Non-numbers are rejected the same way; the caller turns `fields` into
 * 400 `VALIDATION_ERROR`. Used by the profile routes (Sprint 2, CHANGE-04) and
 * asserted here with the F-04 TEST-11 weight pairs.
 */
export function validateWeight(input: unknown): WeightValidation {
  const ok =
    isNum(input) &&
    input >= MIN_WEIGHT_KG &&
    input <= MAX_WEIGHT_KG &&
    atMostDecimals(input, 1);
  if (!ok) {
    return {
      fields: [{ field: 'weightKg', limit: `number ${MIN_WEIGHT_KG}-${MAX_WEIGHT_KG}, at most 1 decimal place` }],
    };
  }
  return { value: input };
}
