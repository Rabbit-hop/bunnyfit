import { describe, expect, it } from 'vitest';
import { cumulativeFor, type Cumulative } from '../../server/domain/entryCalc.js';
import { calcDaily, calcItem } from '../../server/domain/progressCalc.js';
import type { ResolvedItem } from '../../server/domain/planResolution.js';

// TEST-14a (AC-14a, F-04 STS §8; RTM §3.1 path for AC-14a is this file):
// `cumulativeFor(entries, exerciseId, date)` is the direct sum of one exercise's
// entries on one date (BR-06 / F-04 R7) — no weighting, no penalty, no double
// counting; entries of other exercises, other dates or other users are excluded.
// TEST-14b-1 (AC-14b) lives below with the F-06 tests: its subject `calcItem` is F-06's module.

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

// ---------------------------------------------------------------------------
// F-06 (AC-06a-f, AC-14b): `calcItem` / `calcDaily`, F-06 STS §8. Pure, decimal-exact (R11).
// calcMonthly / TEST-15 are Sprint 2 (CHANGE-06) and not written here.
// ---------------------------------------------------------------------------

type Mode = 'WEIGHT' | 'BODYWEIGHT_REPS' | 'BODYWEIGHT_TIME' | 'YOGA' | 'CARDIO_TIME' | 'CARDIO_DISTANCE';

function resolved(
  id: string,
  mode: Mode,
  weight: number,
  target: { sets?: number; reps?: number; sec?: number; km?: number },
): ResolvedItem {
  return {
    planItem: {
      id: `pi-${id}`,
      userExerciseId: `ex-${id}`,
      planKey: `pk-${id}`,
      version: 1,
      priorityWeight: weight,
      effectiveFrom: '2026-11-01',
      endDate: null,
      repeatDays: [1, 2, 3, 4, 5, 6, 7],
      createdAt: '2026-11-01T00:00:00.000Z',
      targetSets: target.sets ?? null,
      targetRepsPerSet: target.reps ?? null,
      loadKg: mode === 'WEIGHT' ? 40 : null,
      targetDurationSec: target.sec ?? null,
      targetDistanceKm: target.km ?? null,
    },
    userExercise: {
      id: `ex-${id}`,
      sourceTemplateId: null,
      isCustom: false,
      name: id,
      targetBodyPart: 'FULL_BODY',
      trackingMode: mode,
      unit: mode === 'WEIGHT' || mode === 'BODYWEIGHT_REPS' ? 'reps' : mode === 'CARDIO_DISTANCE' ? 'km' : 'seconds',
      cardioCategory: null,
      metValue: 5,
      rangeMin: 1,
      rangeMax: 100000,
    },
  };
}

function totals(id: string, v: Partial<Omit<Cumulative, 'userExerciseId'>>): Cumulative {
  return { userExerciseId: `ex-${id}`, sets: 0, totalReps: 0, durationSec: 0, distanceKm: 0, ...v };
}

describe('TEST-06a (AC-06a): calcItem', () => {
  it('TEST-06a-1: WEIGHT target 40 reps, weight 3 → actual 0/20/40/80 gives ratio 0/0.5/1/1, score 0/1.5/3/3', () => {
    const run = (actual: number) => calcItem({ trackingMode: 'WEIGHT', target: 40, actual, priorityWeight: 3 });
    expect(run(0)).toEqual({ ratio: 0, itemScore: 0 });
    expect(run(20)).toEqual({ ratio: 0.5, itemScore: 1.5 });
    expect(run(40)).toEqual({ ratio: 1, itemScore: 3 });
    expect(run(80)).toEqual({ ratio: 1, itemScore: 3 });
  });

  it('TEST-06a-2: BODYWEIGHT_REPS target 50, weight 2 → actual 25/60 gives ratio 0.5/1, score 1/2', () => {
    const run = (actual: number) => calcItem({ trackingMode: 'BODYWEIGHT_REPS', target: 50, actual, priorityWeight: 2 });
    expect(run(25)).toEqual({ ratio: 0.5, itemScore: 1 });
    expect(run(60)).toEqual({ ratio: 1, itemScore: 2 });
  });

  it('TEST-06a-3: BODYWEIGHT_TIME 120 s / YOGA 600 s / CARDIO_TIME 1800 s, weight 4 → actual 60/600/2400 gives ratio 0.5/1/1, score 2/4/4', () => {
    expect(calcItem({ trackingMode: 'BODYWEIGHT_TIME', target: 120, actual: 60, priorityWeight: 4 })).toEqual({ ratio: 0.5, itemScore: 2 });
    expect(calcItem({ trackingMode: 'YOGA', target: 600, actual: 600, priorityWeight: 4 })).toEqual({ ratio: 1, itemScore: 4 });
    expect(calcItem({ trackingMode: 'CARDIO_TIME', target: 1800, actual: 2400, priorityWeight: 4 })).toEqual({ ratio: 1, itemScore: 4 });
  });

  it('TEST-06a-4: CARDIO_DISTANCE target 5 km, weight 5 → actual 1.25/5/7 gives ratio 0.25/1/1, score 1.25/5/5', () => {
    const run = (actual: number) => calcItem({ trackingMode: 'CARDIO_DISTANCE', target: 5, actual, priorityWeight: 5 });
    expect(run(1.25)).toEqual({ ratio: 0.25, itemScore: 1.25 });
    expect(run(5)).toEqual({ ratio: 1, itemScore: 5 });
    expect(run(7)).toEqual({ ratio: 1, itemScore: 5 });
  });

  it('TEST-06a-5: target 4 sets × 10 reps = 40, actual 28, weight 3 → ratio 0.7, score 2.1 (decimal exact; float 0.7 × 3 = 2.0999999999999996)', () => {
    const [item] = calcDaily([resolved('squat', 'WEIGHT', 3, { sets: 4, reps: 10 })], [totals('squat', { sets: 3, totalReps: 28 })]).items;
    expect(item?.target).toBe(40);
    expect(item?.actual).toBe(28);
    expect(item?.ratio).toBe(0.7);
    expect(item?.itemScore).toBe(2.1);
    expect(calcItem({ trackingMode: 'WEIGHT', target: 40, actual: 28, priorityWeight: 3 })).toEqual({ ratio: 0.7, itemScore: 2.1 });
  });

  it('TEST-06a-6: weights 1 and 5 at the same ratio → score scales linearly (1 : 5)', () => {
    const one = calcItem({ trackingMode: 'WEIGHT', target: 40, actual: 28, priorityWeight: 1 });
    const five = calcItem({ trackingMode: 'WEIGHT', target: 40, actual: 28, priorityWeight: 5 });
    expect(one.ratio).toBe(five.ratio);
    expect(one.itemScore).toBe(0.7);
    expect(five.itemScore).toBe(3.5);
  });
});

describe('TEST-06b / 06c / 14b: cap and time-distance ratios', () => {
  it('TEST-06b-1: WEIGHT target 30 reps, weight 4 → actual 15 gives ratio 0.5 / score 2; actual 45 is capped at ratio 1 / score 4', () => {
    expect(calcItem({ trackingMode: 'WEIGHT', target: 30, actual: 15, priorityWeight: 4 })).toEqual({ ratio: 0.5, itemScore: 2 });
    expect(calcItem({ trackingMode: 'WEIGHT', target: 30, actual: 45, priorityWeight: 4 })).toEqual({ ratio: 1, itemScore: 4 });
  });

  it('TEST-06c-1: CARDIO_TIME target 1200 s actual 600 s → 0.5; CARDIO_DISTANCE target 5 km actual 2 km → 0.4', () => {
    expect(calcItem({ trackingMode: 'CARDIO_TIME', target: 1200, actual: 600, priorityWeight: 1 }).ratio).toBe(0.5);
    expect(calcItem({ trackingMode: 'CARDIO_DISTANCE', target: 5, actual: 2, priorityWeight: 1 }).ratio).toBe(0.4);
  });

  it('TEST-14b-1: actual 45 against target 40 (weight 3) → ratio 1, itemScore 3 — no penalty for exceeding', () => {
    expect(calcItem({ trackingMode: 'WEIGHT', target: 40, actual: 45, priorityWeight: 3 })).toEqual({ ratio: 1, itemScore: 3 });
  });
});

describe('TEST-06d (AC-06d): calcDaily', () => {
  it('TEST-06d-1: item A weight 3 ratio 1, item B weight 2 ratio 0 → totalScore 3, totalWeight 5, overallPercent 60', () => {
    const a = resolved('a', 'BODYWEIGHT_TIME', 3, { sec: 100 });
    const b = resolved('b', 'BODYWEIGHT_TIME', 2, { sec: 100 });
    const result = calcDaily([a, b], [totals('a', { durationSec: 100 })]);
    expect(result).toMatchObject({ isRestDay: false, totalScore: 3, totalWeight: 5, overallPercent: 60 });
    expect(result.items.map((i) => i.ratio)).toEqual([1, 0]);
  });

  it('TEST-06d-2: weights 3, 2, 5 with ratios 0.7, 1, 0.5 → 6.6 / 10 → 66', () => {
    const items = [
      resolved('a', 'WEIGHT', 3, { sets: 4, reps: 10 }),
      resolved('b', 'BODYWEIGHT_TIME', 2, { sec: 120 }),
      resolved('c', 'CARDIO_DISTANCE', 5, { km: 4 }),
    ];
    const result = calcDaily(items, [totals('a', { totalReps: 28 }), totals('b', { durationSec: 120 }), totals('c', { distanceKm: 2 })]);
    expect(result.totalScore).toBe(6.6);
    expect(result.totalWeight).toBe(10);
    expect(result.overallPercent).toBe(66);
  });

  it('TEST-06d-3: exactly 70% stays 70 (no float drift) and 69.95 stays below 70', () => {
    // 0.7 × 3 + 0.7 × 7 = 2.1 + 4.9; in binary floating point the sum is 6.999999999999999.
    const exact = calcDaily(
      [resolved('a', 'WEIGHT', 3, { sets: 4, reps: 10 }), resolved('b', 'CARDIO_DISTANCE', 7, { km: 10 })],
      [totals('a', { totalReps: 28 }), totals('b', { distanceKm: 7 })],
    );
    expect(exact.totalScore).toBe(7);
    expect(exact.overallPercent).toBe(70);
    expect(exact.overallPercent !== null && exact.overallPercent >= 70).toBe(true);

    // 6.99 km of 10 km at weight 5 (3.495) + 7 km of 10 km at weight 5 (3.5) = 6.995 of 10 → 69.95.
    const below = calcDaily(
      [resolved('a', 'CARDIO_DISTANCE', 5, { km: 10 }), resolved('b', 'CARDIO_DISTANCE', 5, { km: 10 })],
      [totals('a', { distanceKm: 6.99 }), totals('b', { distanceKm: 7 })],
    );
    expect(below.overallPercent).toBe(69.95);
    expect(below.overallPercent !== null && below.overallPercent < 70).toBe(true);
  });
});

describe('TEST-06e (AC-06e): targeted day without log vs Rest Day', () => {
  it('TEST-06e-1: one item weight 4, no entries → overallPercent 0 (not null)', () => {
    const result = calcDaily([resolved('a', 'WEIGHT', 4, { sets: 3, reps: 10 })], []);
    expect(result).toMatchObject({ isRestDay: false, totalScore: 0, totalWeight: 4, overallPercent: 0 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ target: 30, actual: 0, ratio: 0, itemScore: 0 });
  });

  it('TEST-06e-2: no planned item (Rest Day) with free-form entries → isRestDay true, overallPercent null, items empty', () => {
    const result = calcDaily([], [totals('freeform', { totalReps: 500, sets: 5 })]);
    expect(result).toEqual({ isRestDay: true, items: [], totalScore: 0, totalWeight: 0, overallPercent: null });
  });

  it('R3: entries of an exercise that is not planned are ignored for scoring', () => {
    const result = calcDaily(
      [resolved('a', 'BODYWEIGHT_TIME', 2, { sec: 100 })],
      [totals('a', { durationSec: 50 }), totals('other', { durationSec: 9999 })],
    );
    expect(result.items).toHaveLength(1);
    expect(result.overallPercent).toBe(50);
  });

  it('item fields follow F-06 §4.1: planItemId, userExerciseId, name, trackingMode, unit, priorityWeight, target, actual', () => {
    const result = calcDaily([resolved('plank', 'BODYWEIGHT_TIME', 2, { sec: 120 })], [totals('plank', { durationSec: 120 })]);
    expect(result.items[0]).toEqual({
      planItemId: 'pi-plank',
      userExerciseId: 'ex-plank',
      name: 'plank',
      trackingMode: 'BODYWEIGHT_TIME',
      unit: 'seconds',
      priorityWeight: 2,
      target: 120,
      actual: 120,
      ratio: 1,
      itemScore: 2,
    });
  });
});
