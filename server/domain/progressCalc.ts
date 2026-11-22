/**
 * Progress calculation (F-06 R2-R9, R11): Item Score and Daily Overall Progress.
 * Pure: no storage, no Clock. Provided to F-08/F-10/F-11 (F-06 §11).
 *
 * Arithmetic is exact: every input is turned into a rational number of BigInts
 * (decimal inputs are scaled by 10^6), summed as fractions, and converted to a JS
 * number only at the end. So 0.7 × 3 is 2.1 (not 2.0999999999999996) and exactly 70% is
 * 70, which F-08's unrounded `>= 70` comparison relies on (R11).
 */
import type { Cumulative } from './entryCalc.js';
import type { ResolvedItem } from './planResolution.js';

export interface CalcItemInput {
  trackingMode: string;
  target: number;
  actual: number;
  priorityWeight: number;
}

export interface ItemResult {
  ratio: number;
  itemScore: number;
}

export interface DailyItem extends ItemResult {
  planItemId: string;
  userExerciseId: string;
  name: string;
  trackingMode: string;
  unit: string;
  priorityWeight: number;
  target: number;
  actual: number;
}

export interface DailyResult {
  isRestDay: boolean;
  items: DailyItem[];
  totalScore: number;
  totalWeight: number;
  /** Unrounded; `null` on a Rest Day (R6), `0` on a targeted day without entries (R7). */
  overallPercent: number | null;
}

/** An exact fraction `num / den`, `den > 0`. */
interface Rational {
  num: bigint;
  den: bigint;
}

const SCALE_DIGITS = 6;
const SCALE = 10n ** BigInt(SCALE_DIGITS);
/** Digits kept when a non-terminating quotient is turned back into a number. */
const OUT_DIGITS = 12;
const OUT_SCALE = 10n ** BigInt(OUT_DIGITS);

/** A decimal input as an exact rational (inputs have at most 2 decimals; 6 are accepted). */
function fromNumber(value: number): Rational {
  return { num: BigInt(Math.round(value * Number(SCALE))), den: SCALE };
}

function add(a: Rational, b: Rational): Rational {
  return { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
}

function mul(a: Rational, b: Rational): Rational {
  return { num: a.num * b.num, den: a.den * b.den };
}

function div(a: Rational, b: Rational): Rational {
  return { num: a.num * b.den, den: a.den * b.num };
}

function min(a: Rational, b: Rational): Rational {
  return a.num * b.den <= b.num * a.den ? a : b;
}

/** Exact when the quotient terminates within 12 decimals; otherwise truncated at 12 decimals. */
function toNumber(value: Rational): number {
  if (value.num % value.den === 0n) return Number(value.num / value.den);
  return Number((value.num * OUT_SCALE) / value.den) / Number(OUT_SCALE);
}

const ONE: Rational = { num: 1n, den: 1n };
const ZERO: Rational = { num: 0n, den: 1n };

function ratioOf(target: number, actual: number): Rational {
  const t = fromNumber(target);
  if (t.num <= 0n) return ZERO;
  return min(ONE, div(fromNumber(actual), t));
}

/** R4: `ratio = min(1, actual ÷ target)`; `itemScore = ratio × priorityWeight`. */
export function calcItem(item: CalcItemInput): ItemResult {
  const ratio = ratioOf(item.target, item.actual);
  return { ratio: toNumber(ratio), itemScore: toNumber(mul(ratio, fromNumber(item.priorityWeight))) };
}

/** R2: the target value of the item's mode. */
export function targetOf(item: ResolvedItem): number {
  const { planItem, userExercise } = item;
  switch (userExercise.trackingMode) {
    case 'WEIGHT':
    case 'BODYWEIGHT_REPS':
      return (planItem.targetSets ?? 0) * (planItem.targetRepsPerSet ?? 0);
    case 'CARDIO_DISTANCE':
      return planItem.targetDistanceKm ?? 0;
    default:
      return planItem.targetDurationSec ?? 0;
  }
}

/** R3: the day's actual value of the item's mode. */
export function actualOf(mode: string, totals: Cumulative | undefined): number {
  if (!totals) return 0;
  switch (mode) {
    case 'WEIGHT':
    case 'BODYWEIGHT_REPS':
      return totals.totalReps;
    case 'CARDIO_DISTANCE':
      return totals.distanceKm;
    default:
      return totals.durationSec;
  }
}

/**
 * R5-R7: `items` are the plan items that occur on the date (from `resolvePlan`), `cumulative`
 * the day's per-exercise totals (from `cumulativeFor`); totals of exercises that are not in
 * `items` are ignored (R3). No items → Rest Day: `overallPercent` null, not 0.
 */
export function calcDaily(items: readonly ResolvedItem[], cumulative: readonly Cumulative[]): DailyResult {
  if (items.length === 0) {
    return { isRestDay: true, items: [], totalScore: 0, totalWeight: 0, overallPercent: null };
  }
  const byExercise = new Map(cumulative.map((c) => [c.userExerciseId, c]));
  let totalScore = ZERO;
  let totalWeight = ZERO;
  const daily: DailyItem[] = items.map((item) => {
    const mode = item.userExercise.trackingMode;
    const target = targetOf(item);
    const actual = actualOf(mode, byExercise.get(item.userExercise.id));
    const weight = fromNumber(item.planItem.priorityWeight);
    const ratio = ratioOf(target, actual);
    const score = mul(ratio, weight);
    totalScore = add(totalScore, score);
    totalWeight = add(totalWeight, weight);
    return {
      planItemId: item.planItem.id,
      userExerciseId: item.userExercise.id,
      name: item.userExercise.name,
      trackingMode: mode,
      unit: item.userExercise.unit,
      priorityWeight: item.planItem.priorityWeight,
      target,
      actual,
      ratio: toNumber(ratio),
      itemScore: toNumber(score),
    };
  });
  const overallPercent = totalWeight.num === 0n ? null : toNumber(mul(div(totalScore, totalWeight), { num: 100n, den: 1n }));
  return {
    isRestDay: false,
    items: daily,
    totalScore: toNumber(totalScore),
    totalWeight: toNumber(totalWeight),
    overallPercent,
  };
}

export interface MonthlyResult {
  targetedDays: number;
  restDaysExcluded: number;
  /** Unrounded arithmetic mean of the targeted days' percentages; `null` when there are none (R10). */
  averagePercent: number | null;
}

/**
 * R10 / BR-07: the monthly average over targeted days only. A day with `overallPercent` null is
 * a Rest Day: it is counted in `restDaysExcluded` and never in the denominator; a targeted day
 * with 0% counts as 0. Same exact arithmetic as `calcDaily` (R11). Pure; the caller decides
 * which days are in range (future days are never passed in).
 */
export function calcMonthly(days: ReadonlyArray<Pick<DailyResult, 'overallPercent'>>): MonthlyResult {
  let sum = ZERO;
  let targetedDays = 0;
  let restDaysExcluded = 0;
  for (const day of days) {
    if (day.overallPercent === null) {
      restDaysExcluded += 1;
    } else {
      targetedDays += 1;
      sum = add(sum, fromNumber(day.overallPercent));
    }
  }
  const averagePercent = targetedDays === 0 ? null : toNumber(div(sum, { num: BigInt(targetedDays), den: 1n }));
  return { targetedDays, restDaysExcluded, averagePercent };
}
