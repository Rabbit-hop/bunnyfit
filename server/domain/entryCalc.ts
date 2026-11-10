/**
 * Cumulative day sums per exercise (F-04 R7 / BR-06): direct sum of the day's
 * entries for one exercise — no weighting, no penalty, no double counting.
 * Pure: no storage, no Clock. Provided to F-06 (F-04 §11).
 */

/** The LedgerEntry columns `cumulativeFor` reads. */
export interface CumulativeEntry {
  userExerciseId: string;
  logDate: string;
  sets: number | null;
  totalReps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
}

export interface Cumulative {
  userExerciseId: string;
  sets: number;
  totalReps: number;
  durationSec: number;
  distanceKm: number;
}

/**
 * Sum one exercise's entries on one date. Entries of other exercises, other
 * dates or other users are excluded (a foreign user's rows carry a different
 * `userExerciseId`). `distanceKm` is summed in integer hundredths so decimal
 * inputs stay exact (R4 precision: at most 2 decimals).
 */
export function cumulativeFor(
  entries: readonly CumulativeEntry[],
  userExerciseId: string,
  date: string,
): Cumulative {
  let sets = 0;
  let totalReps = 0;
  let durationSec = 0;
  let distanceHundredths = 0;
  for (const entry of entries) {
    if (entry.userExerciseId !== userExerciseId || entry.logDate !== date) continue;
    sets += entry.sets ?? 0;
    totalReps += entry.totalReps ?? 0;
    durationSec += entry.durationSec ?? 0;
    distanceHundredths += Math.round((entry.distanceKm ?? 0) * 100);
  }
  return {
    userExerciseId,
    sets,
    totalReps,
    durationSec,
    distanceKm: distanceHundredths / 100,
  };
}
