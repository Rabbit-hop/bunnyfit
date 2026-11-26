/**
 * Calorie estimate (F-11 §4.4, BR-12): estimated minutes per trackingMode, the METs formula,
 * the `WeightLog` lookup and the daily total. Pure: no storage, no Clock (R11). Provided to
 * F-10 (per-day kcal, F-11 §11).
 *
 * Arithmetic is exact (R5: no binary floating point), with BigInt rationals like
 * `progressCalc.ts`: 3.8 × 70 × 1.5/60 is exactly 6.65, so half-up rounding gives 6.7.
 */
import type { DailyItem, DailyResult } from './progressCalc.js';

/** An exact fraction `num / den`, `den > 0`. */
export interface Exact {
  num: bigint;
  den: bigint;
}

const SCALE = 10n ** 6n;
const OUT_SCALE = 10n ** 12n;

/** A decimal input (METs, kg, km, seconds: at most 2 decimals; 6 are accepted) as an exact rational. */
function exact(value: number): Exact {
  return { num: BigInt(Math.round(value * Number(SCALE))), den: SCALE };
}

function add(a: Exact, b: Exact): Exact {
  return { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
}

function mul(a: Exact, b: Exact): Exact {
  return { num: a.num * b.num, den: a.den * b.den };
}

const ZERO: Exact = { num: 0n, den: 1n };

/** Exact when the quotient terminates within 12 decimals; otherwise truncated at 12 decimals. */
export function exactToNumber(value: Exact): number {
  if (value.num % value.den === 0n) return Number(value.num / value.den);
  return Number((value.num * OUT_SCALE) / value.den) / Number(OUT_SCALE);
}

/** R5: 1 decimal place, half up (values are never negative). */
export function roundKcal(value: Exact): number {
  const tenths = (value.num * 20n + value.den) / (2n * value.den);
  return Number(tenths) / 10;
}

/** Standard paces in min/km (SRS A.1), by `cardioCategory`. */
const PACE_MIN_PER_KM: Record<string, number> = { RUNNING: 6, WALKING: 10, CYCLING: 3, SWIMMING: 20 };
const MINUTES_PER_SET: Exact = { num: 3n, den: 2n };

/** The day's cumulative values of one exercise (F-04 R7) and what R4 needs of its snapshot. */
export interface ActivityInput {
  trackingMode: string;
  cardioCategory: string | null;
  sets: number;
  durationSec: number;
  distanceKm: number;
}

/** R4: `WEIGHT` / `BODYWEIGHT_REPS` sets × 1.5; `CARDIO_DISTANCE` km × pace; other modes seconds ÷ 60. */
export function estimateMinutes(input: ActivityInput): Exact {
  switch (input.trackingMode) {
    case 'WEIGHT':
    case 'BODYWEIGHT_REPS':
      return mul(exact(input.sets), MINUTES_PER_SET);
    case 'CARDIO_DISTANCE': {
      const pace = PACE_MIN_PER_KM[input.cardioCategory ?? ''];
      if (pace === undefined) throw new Error(`CARDIO_DISTANCE exercise without a known cardioCategory: ${input.cardioCategory}`);
      return mul(exact(input.distanceKm), exact(pace));
    }
    default:
      return mul(exact(input.durationSec), { num: 1n, den: 60n });
  }
}

/** R1, unrounded: `metValue × bodyWeightKg × (estimatedMinutes ÷ 60)`. */
export function calcCalories(metValue: number, weightKg: number, estimatedMinutes: Exact): Exact {
  return mul(mul(exact(metValue), exact(weightKg)), mul(estimatedMinutes, { num: 1n, den: 60n }));
}

/** A `WeightLog` row as the lookup reads it; `effectiveDate` is `YYYY-MM-DD`. */
export interface WeightRow {
  weightKg: number;
  effectiveDate: string;
  createdAt: Date;
}

/** R2: latest `effectiveDate` <= date (equal counts), ties by latest `createdAt`; none → null. */
export function pickBodyWeight(rows: readonly WeightRow[], date: string): number | null {
  let best: WeightRow | null = null;
  for (const row of rows) {
    if (row.effectiveDate > date) continue;
    if (
      !best ||
      row.effectiveDate > best.effectiveDate ||
      (row.effectiveDate === best.effectiveDate && row.createdAt.getTime() > best.createdAt.getTime())
    ) {
      best = row;
    }
  }
  return best ? best.weightKg : null;
}

export type CalorieError = 'BODY_WEIGHT_REQUIRED';

export interface CalorieFields {
  estimatedMinutes: number;
  calories: number | null;
  calorieError: CalorieError | null;
}

/** One planned exercise's inputs, matched to `daily.items` by `userExerciseId`. */
export interface CalorieInput extends ActivityInput {
  userExerciseId: string;
  metValue: number;
}

/** An exercise logged on the date that is not in `daily.items` (R12); `actual` is the day's value in `unit` (F-06 `actualOf`). */
export interface OtherActivityInput extends CalorieInput {
  name: string;
  unit: string;
  actual: number;
}

export interface OtherActivity extends CalorieFields {
  userExerciseId: string;
  name: string;
  trackingMode: string;
  unit: string;
  actual: number;
}

export interface DailyWithCalories extends DailyResult {
  items: Array<DailyItem & CalorieFields>;
  otherActivity: OtherActivity[];
  totalCalories: number | null;
  calorieError: CalorieError | null;
}

/**
 * R6-R10, R12: adds the calorie fields to an F-06 daily result without changing any F-06
 * field. One weight applies to the whole date (R10): with `weightKg` null every value is null
 * with `BODY_WEIGHT_REQUIRED`. `totalCalories` is the unrounded sum, rounded once (R6).
 */
export function withCalories(
  daily: DailyResult,
  planned: readonly CalorieInput[],
  other: readonly OtherActivityInput[],
  weightKg: number | null,
): DailyWithCalories {
  const calorieError: CalorieError | null = weightKg === null ? 'BODY_WEIGHT_REQUIRED' : null;
  let total = ZERO;
  const fields = (input: CalorieInput): CalorieFields => {
    const minutes = estimateMinutes(input);
    if (weightKg === null) return { estimatedMinutes: exactToNumber(minutes), calories: null, calorieError };
    const value = calcCalories(input.metValue, weightKg, minutes);
    total = add(total, value);
    return { estimatedMinutes: exactToNumber(minutes), calories: roundKcal(value), calorieError: null };
  };

  const byExercise = new Map(planned.map((p) => [p.userExerciseId, p]));
  const items = daily.items.map((item) => {
    const input = byExercise.get(item.userExerciseId);
    // The caller passes every planned exercise, with zero values when nothing was logged (R7).
    if (!input) throw new Error(`no calorie input for planned exercise ${item.userExerciseId}`);
    return { ...item, ...fields(input) };
  });

  const otherActivity = [...other]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.userExerciseId < b.userExerciseId ? -1 : 1))
    .map((o) => ({
      userExerciseId: o.userExerciseId,
      name: o.name,
      trackingMode: o.trackingMode,
      unit: o.unit,
      actual: o.actual,
      ...fields(o),
    }));

  return {
    ...daily,
    items,
    otherActivity,
    totalCalories: weightKg === null ? null : roundKcal(total),
    calorieError,
  };
}
