/**
 * Quick Complete differential (F-04 R9, R10): the entry that brings an exercise's
 * day total up to its target. Pure: no storage, no Clock, no validation — the caller
 * runs the result through `validateEntry`, so R5/R6 (and R12's rejection when no entry
 * fits both) are enforced by the one validator that manual entries use.
 */
import type { Cumulative } from './entryCalc.js';

/** The target columns of the resolved `PlanItem` that Quick Complete reads. */
export interface QuickCompleteTarget {
  targetSets: number | null;
  targetRepsPerSet: number | null;
  targetDurationSec: number | null;
  targetDistanceKm: number | null;
}

/** The value fields of the entry to create (only the mode's own fields are present). */
export type QuickCompleteValues = Record<string, number>;

export type QuickCompleteDifference = { remaining: false } | { remaining: true; values: QuickCompleteValues };

const MAX_REPS_PER_SET = 200;

/**
 * R9: reps modes → `totalReps = max(0, targetSets × targetRepsPerSet − Σ totalReps)` and
 * `sets = max(1, targetSets − Σ sets)` raised to `ceil(remainingReps ÷ 200)` when that is
 * larger (so the entry itself satisfies R5); seconds modes → `max(0, target − Σ durationSec)`;
 * km mode → `max(0, target − Σ distanceKm)` in exact hundredths. R10: a remaining value of 0
 * → `{ remaining: false }` (the No-op).
 */
export function quickCompleteDifference(
  mode: string,
  target: QuickCompleteTarget,
  totals: Cumulative,
): QuickCompleteDifference {
  if (mode === 'WEIGHT' || mode === 'BODYWEIGHT_REPS') {
    const targetSets = target.targetSets ?? 0;
    const remainingReps = Math.max(0, targetSets * (target.targetRepsPerSet ?? 0) - totals.totalReps);
    if (remainingReps === 0) return { remaining: false };
    const sets = Math.max(Math.max(1, targetSets - totals.sets), Math.ceil(remainingReps / MAX_REPS_PER_SET));
    return { remaining: true, values: { sets, totalReps: remainingReps } };
  }

  if (mode === 'CARDIO_DISTANCE') {
    const remainingHundredths = Math.max(
      0,
      Math.round((target.targetDistanceKm ?? 0) * 100) - Math.round(totals.distanceKm * 100),
    );
    if (remainingHundredths === 0) return { remaining: false };
    return { remaining: true, values: { distanceKm: remainingHundredths / 100 } };
  }

  const remainingSeconds = Math.max(0, (target.targetDurationSec ?? 0) - totals.durationSec);
  if (remainingSeconds === 0) return { remaining: false };
  return { remaining: true, values: { durationSec: remainingSeconds } };
}
