import { describe, expect, it } from 'vitest';
import {
  calcCalories,
  estimateMinutes,
  exactToNumber,
  pickBodyWeight,
  roundKcal,
  withCalories,
  type ActivityInput,
  type CalorieInput,
} from '../../server/domain/calorieCalc.js';
import { cumulativeFor } from '../../server/domain/entryCalc.js';
import type { DailyResult } from '../../server/domain/progressCalc.js';

// F-11 STS §8 (docs/sprints/sprint-2/F-11-calories.md 0.1.2), unit tests TEST-20a-1 to
// TEST-20c-4 (AC-20a-c): estimated minutes per trackingMode (R4), the formula
// metValue × bodyWeightKg × (minutes ÷ 60) (R1) and rounding to 1 decimal, half up (R5),
// with exact decimal arithmetic. TEST-20a-7 covers the daily total of `withCalories` (R6).
// Extra (NOT an STS row): `pickBodyWeight` (R2), whose AC-28a cases are API/DB tests in
// tests/integration/calorie_weightlog.test.ts.

const NONE = { sets: 0, durationSec: 0, distanceKm: 0 };

function activity(overrides: Partial<ActivityInput> & Pick<ActivityInput, 'trackingMode'>): ActivityInput {
  return { cardioCategory: null, ...NONE, ...overrides };
}

/** Minutes and rounded kcal of one exercise, as the progress response shows them. */
function kcal(input: ActivityInput, metValue: number, weightKg: number) {
  const minutes = estimateMinutes(input);
  return { minutes: exactToNumber(minutes), calories: roundKcal(calcCalories(metValue, weightKg, minutes)) };
}

describe('TEST-20a (AC-20a): sets-based modes, 1.5 min per set', () => {
  it('TEST-20a-1: WEIGHT, 3 sets, 3.5 METs, 70 kg -> 4.5 min, 18.375 -> 18.4 kcal', () => {
    expect(kcal(activity({ trackingMode: 'WEIGHT', sets: 3 }), 3.5, 70)).toEqual({ minutes: 4.5, calories: 18.4 });
  });

  it('TEST-20a-2: BODYWEIGHT_REPS, 4 sets, 3.8 METs, 50 kg -> 6 min, 19 kcal', () => {
    expect(kcal(activity({ trackingMode: 'BODYWEIGHT_REPS', sets: 4 }), 3.8, 50)).toEqual({ minutes: 6, calories: 19 });
  });

  it('TEST-20a-3: half-up tie, WEIGHT 1 set, 3.5 METs, 60 kg -> 5.25 -> 5.3 (not banker 5.2)', () => {
    expect(kcal(activity({ trackingMode: 'WEIGHT', sets: 1 }), 3.5, 60)).toEqual({ minutes: 1.5, calories: 5.3 });
  });

  it("TEST-20a-4: sets come from the day's cumulative (2 + 1 entries) -> 18.4, not one entry alone", () => {
    const day = '2026-11-05';
    const row = (sets: number) => ({ userExerciseId: 'squat', logDate: day, sets, totalReps: sets * 10, durationSec: null, distanceKm: null });
    const total = cumulativeFor([row(2), row(1)], 'squat', day);
    expect(kcal(activity({ trackingMode: 'WEIGHT', sets: total.sets }), 3.5, 70)).toEqual({ minutes: 4.5, calories: 18.4 });
    expect(kcal(activity({ trackingMode: 'WEIGHT', sets: 2 }), 3.5, 70).calories).not.toBe(18.4);
  });

  it('TEST-20a-5: boundary weight 1 kg, WEIGHT 1 set, 3.5 METs -> 0.0875 -> 0.1', () => {
    expect(kcal(activity({ trackingMode: 'WEIGHT', sets: 1 }), 3.5, 1)).toEqual({ minutes: 1.5, calories: 0.1 });
  });

  it('TEST-20a-6: no activity (0 sets) -> 0 min, 0 kcal', () => {
    expect(kcal(activity({ trackingMode: 'WEIGHT', sets: 0 }), 3.5, 70)).toEqual({ minutes: 0, calories: 0 });
  });

  it('TEST-20a-7: withCalories totals the unrounded values once (368.025 -> 368.0, not 368.1); +73.5 other -> 441.5', () => {
    const daily: DailyResult = {
      isRestDay: false,
      items: [
        { planItemId: 'p1', userExerciseId: 'squat', name: 'Barbell Squat', trackingMode: 'WEIGHT', unit: 'reps', priorityWeight: 3, target: 40, actual: 30, ratio: 0.75, itemScore: 2.25 },
        { planItemId: 'p2', userExerciseId: 'plank', name: 'Plank', trackingMode: 'BODYWEIGHT_TIME', unit: 'seconds', priorityWeight: 2, target: 120, actual: 90, ratio: 0.75, itemScore: 1.5 },
        { planItemId: 'p3', userExerciseId: 'run', name: 'Outdoor Run', trackingMode: 'CARDIO_DISTANCE', unit: 'km', priorityWeight: 5, target: 5, actual: 5, ratio: 1, itemScore: 5 },
      ],
      totalScore: 8.75,
      totalWeight: 10,
      overallPercent: 87.5,
    };
    const planned: CalorieInput[] = [
      { userExerciseId: 'squat', metValue: 3.5, ...activity({ trackingMode: 'WEIGHT', sets: 3 }) },
      { userExerciseId: 'plank', metValue: 3.8, ...activity({ trackingMode: 'BODYWEIGHT_TIME', durationSec: 90 }) },
      { userExerciseId: 'run', metValue: 9.8, ...activity({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'RUNNING', distanceKm: 5 }) },
    ];

    const result = withCalories(daily, planned, [], 70);
    expect(result.items.map((i) => i.calories)).toEqual([18.4, 6.7, 343]);
    expect(result.items.map((i) => i.estimatedMinutes)).toEqual([4.5, 1.5, 30]);
    expect(result.totalCalories).toBe(368);
    expect(result.calorieError).toBeNull();
    // Every F-06 field is unchanged.
    expect(result).toMatchObject({ isRestDay: false, totalScore: 8.75, totalWeight: 10, overallPercent: 87.5, otherActivity: [] });

    const jumpRope = {
      userExerciseId: 'rope',
      name: 'Jump Rope',
      unit: 'seconds',
      actual: 540,
      metValue: 7,
      ...activity({ trackingMode: 'CARDIO_TIME', durationSec: 540 }),
    };
    const withOther = withCalories(daily, planned, [jumpRope], 70);
    expect(withOther.otherActivity).toEqual([
      { userExerciseId: 'rope', name: 'Jump Rope', trackingMode: 'CARDIO_TIME', unit: 'seconds', actual: 540, estimatedMinutes: 9, calories: 73.5, calorieError: null },
    ]);
    expect(withOther.totalCalories).toBe(441.5);
    expect(withOther.totalScore).toBe(8.75); // unscored (R12)
  });
});

describe('TEST-20b (AC-20b): duration-based modes, seconds ÷ 60', () => {
  it('TEST-20b-1: CARDIO_TIME 1,800 s, 7.0 METs, 60 kg -> 30 min, 210 kcal', () => {
    expect(kcal(activity({ trackingMode: 'CARDIO_TIME', durationSec: 1800 }), 7, 60)).toEqual({ minutes: 30, calories: 210 });
  });

  it('TEST-20b-2: BODYWEIGHT_TIME 90 s at 70 kg -> 6.7 (no float drift); YOGA 600 s at 55.5 kg -> 23.1', () => {
    expect(kcal(activity({ trackingMode: 'BODYWEIGHT_TIME', durationSec: 90 }), 3.8, 70)).toEqual({ minutes: 1.5, calories: 6.7 });
    expect(kcal(activity({ trackingMode: 'YOGA', durationSec: 600 }), 2.5, 55.5)).toEqual({ minutes: 10, calories: 23.1 });
  });

  it('TEST-20b-3: boundary weights, CARDIO_TIME 1,800 s, 7.0 METs: 1 kg -> 3.5, 800 kg -> 2800', () => {
    const run = activity({ trackingMode: 'CARDIO_TIME', durationSec: 1800 });
    expect(kcal(run, 7, 1).calories).toBe(3.5);
    expect(kcal(run, 7, 800).calories).toBe(2800);
  });
});

describe('TEST-20c (AC-20c): CARDIO_DISTANCE, distance × standard pace', () => {
  it('TEST-20c-1: Running 5 km, no duration, 9.8 METs, 70 kg -> 30 min, 343 kcal', () => {
    expect(kcal(activity({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'RUNNING', distanceKm: 5 }), 9.8, 70)).toEqual({
      minutes: 30,
      calories: 343,
    });
  });

  it('TEST-20c-2: Walking 3 km -> 150.5; Cycling 10 km -> 280; Swimming 1.5 km -> 203 (70 kg)', () => {
    const cardio = (cardioCategory: string, distanceKm: number) => activity({ trackingMode: 'CARDIO_DISTANCE', cardioCategory, distanceKm });
    expect(kcal(cardio('WALKING', 3), 4.3, 70)).toEqual({ minutes: 30, calories: 150.5 });
    expect(kcal(cardio('CYCLING', 10), 8, 70)).toEqual({ minutes: 30, calories: 280 });
    expect(kcal(cardio('SWIMMING', 1.5), 5.8, 70)).toEqual({ minutes: 30, calories: 203 });
  });

  it('TEST-20c-3: Running 0.5 km, 9.8 METs, 70 kg -> 3 min, 34.3 kcal', () => {
    expect(kcal(activity({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'RUNNING', distanceKm: 0.5 }), 9.8, 70)).toEqual({
      minutes: 3,
      calories: 34.3,
    });
  });

  it('TEST-20c-4: boundary weights, Running 5 km, 9.8 METs: 1 kg -> 4.9, 800 kg -> 3920', () => {
    const run = activity({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'RUNNING', distanceKm: 5 });
    expect(kcal(run, 9.8, 1).calories).toBe(4.9);
    expect(kcal(run, 9.8, 800).calories).toBe(3920);
  });
});

describe('pickBodyWeight (R2; extra, not an STS row)', () => {
  const row = (weightKg: number, effectiveDate: string, createdAt: string) => ({ weightKg, effectiveDate, createdAt: new Date(createdAt) });

  it('takes the latest effectiveDate on or before the date; later rows are ignored; none -> null', () => {
    const rows = [row(70, '2026-11-01', '2026-11-01T01:00:00Z'), row(68, '2026-11-10', '2026-11-10T01:00:00Z')];
    expect(pickBodyWeight(rows, '2026-11-09')).toBe(70);
    expect(pickBodyWeight(rows, '2026-11-10')).toBe(68);
    expect(pickBodyWeight(rows, '2026-10-31')).toBeNull();
    expect(pickBodyWeight([], '2026-11-10')).toBeNull();
  });

  it('same effectiveDate: the latest createdAt wins, whatever the input order', () => {
    const rows = [row(66, '2026-11-10', '2026-11-10T05:00:00Z'), row(68, '2026-11-10', '2026-11-10T01:00:00Z')];
    expect(pickBodyWeight(rows, '2026-11-12')).toBe(66);
    expect(pickBodyWeight([...rows].reverse(), '2026-11-12')).toBe(66);
  });
});

describe('withCalories without a weight (R8-R10; extra, not an STS row)', () => {
  it('every value null with BODY_WEIGHT_REQUIRED, minutes still given; a Rest Day total is null too', () => {
    const rest: DailyResult = { isRestDay: true, items: [], totalScore: 0, totalWeight: 0, overallPercent: null };
    const other = { userExerciseId: 'yoga', name: 'Sun Salutation', unit: 'seconds', actual: 1800, metValue: 2.5, ...activity({ trackingMode: 'YOGA', durationSec: 1800 }) };
    const result = withCalories(rest, [], [other], null);
    expect(result.totalCalories).toBeNull();
    expect(result.calorieError).toBe('BODY_WEIGHT_REQUIRED');
    expect(result.otherActivity[0]).toMatchObject({ estimatedMinutes: 30, calories: null, calorieError: 'BODY_WEIGHT_REQUIRED' });
    expect(withCalories(rest, [], [], 70)).toMatchObject({ totalCalories: 0, calorieError: null, otherActivity: [] });
  });

  it('otherActivity is ordered by name, then userExerciseId', () => {
    const rest: DailyResult = { isRestDay: true, items: [], totalScore: 0, totalWeight: 0, overallPercent: null };
    const mk = (userExerciseId: string, name: string) => ({ userExerciseId, name, unit: 'seconds', actual: 60, metValue: 2.5, ...activity({ trackingMode: 'YOGA', durationSec: 60 }) });
    const result = withCalories(rest, [], [mk('b', 'Yoga'), mk('z', 'Easy Walk'), mk('a', 'Yoga')], 70);
    expect(result.otherActivity.map((o) => o.userExerciseId)).toEqual(['z', 'a', 'b']);
  });
});
