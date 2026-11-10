import { describe, expect, it } from 'vitest';
import { cumulativeFor } from '../../server/domain/entryCalc.js';

// TEST-14a (AC-14a, F-04 STS §8; RTM §3.1 path for AC-14a is this file):
// `cumulativeFor(entries, exerciseId, date)` is the direct sum of one exercise's
// entries on one date (BR-06 / F-04 R7) — no weighting, no penalty, no double
// counting; entries of other exercises, other dates or other users are excluded.
// TEST-14b-1 (AC-14b) is NOT in this file yet: its subject `calcItem` is F-06's
// module (F-06 contract §9 step 3, issue #6) and is not built by F-04.

const DAY = '2026-11-05';

interface Entry {
  userExerciseId: string;
  logDate: string;
  sets: number | null;
  totalReps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
  kind: 'MANUAL' | 'QUICK_COMPLETE';
}

function entry(overrides: Partial<Entry>): Entry {
  return {
    userExerciseId: 'ex-alice-squat',
    logDate: DAY,
    sets: null,
    totalReps: null,
    durationSec: null,
    distanceKm: null,
    kind: 'MANUAL',
    ...overrides,
  };
}

const ZERO = { sets: 0, totalReps: 0, durationSec: 0, distanceKm: 0 };

describe('TEST-14a (AC-14a): cumulativeFor', () => {
  it('TEST-14a-1: two Squat entries sum to 3 sets / 28 reps; Plank, another date and another user are excluded', () => {
    const entries = [
      entry({ sets: 2, totalReps: 20 }),
      entry({ sets: 1, totalReps: 8 }),
      entry({ userExerciseId: 'ex-alice-plank', durationSec: 60 }),
      entry({ logDate: '2026-11-04', sets: 5, totalReps: 50 }),
      // Another user's entry: UserExercise rows are per user, so it carries a
      // different userExerciseId and must not reach Alice's total.
      entry({ userExerciseId: 'ex-bob-squat', sets: 9, totalReps: 90 }),
    ];
    expect(cumulativeFor(entries, 'ex-alice-squat', DAY)).toEqual({
      userExerciseId: 'ex-alice-squat',
      sets: 3,
      totalReps: 28,
      durationSec: 0,
      distanceKm: 0,
    });
  });

  it('TEST-14a-2: seconds and km entries including decimals → direct sums (exact decimal); no weighting or rounding', () => {
    const seconds = [
      entry({ userExerciseId: 'ex-alice-plank', durationSec: 60 }),
      entry({ userExerciseId: 'ex-alice-plank', durationSec: 30 }),
    ];
    expect(cumulativeFor(seconds, 'ex-alice-plank', DAY).durationSec).toBe(90);

    const km = [
      entry({ userExerciseId: 'ex-alice-run', distanceKm: 1.25 }),
      entry({ userExerciseId: 'ex-alice-run', distanceKm: 2.5 }),
    ];
    expect(cumulativeFor(km, 'ex-alice-run', DAY).distanceKm).toBe(3.75);

    // Extra: a float-naive sum (1.1 + 2.2 = 3.3000000000000003) must stay exact.
    const drift = [
      entry({ userExerciseId: 'ex-alice-run', distanceKm: 1.1 }),
      entry({ userExerciseId: 'ex-alice-run', distanceKm: 2.2 }),
    ];
    expect(cumulativeFor(drift, 'ex-alice-run', DAY).distanceKm).toBe(3.3);
  });

  it('TEST-14a-3: the same list evaluated twice gives the same result; a Quick Complete entry is counted once', () => {
    const entries = [
      entry({ sets: 2, totalReps: 20 }),
      entry({ kind: 'QUICK_COMPLETE', sets: 1, totalReps: 8 }),
    ];
    const first = cumulativeFor(entries, 'ex-alice-squat', DAY);
    expect(first).toEqual({ userExerciseId: 'ex-alice-squat', sets: 3, totalReps: 28, durationSec: 0, distanceKm: 0 });
    expect(cumulativeFor(entries, 'ex-alice-squat', DAY)).toEqual(first);
    // No entries for the day → all-zero totals for that exercise.
    expect(cumulativeFor([], 'ex-alice-squat', DAY)).toEqual({ userExerciseId: 'ex-alice-squat', ...ZERO });
  });
});
