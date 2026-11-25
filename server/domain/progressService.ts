import type { EntryRepository } from '../repositories/entryRepository.js';
import type { PlanRepository, UserExerciseRecord } from '../repositories/planRepository.js';
import type { ProfileRepository } from '../repositories/profileRepository.js';
import {
  pickBodyWeight,
  withCalories,
  type CalorieInput,
  type DailyWithCalories,
  type OtherActivityInput,
} from './calorieCalc.js';
import { cumulativeFor, type Cumulative } from './entryCalc.js';
import { resolvePlan } from './planResolution.js';
import { actualOf, calcDaily } from './progressCalc.js';

function calorieInput(exercise: UserExerciseRecord, totals: Cumulative): CalorieInput {
  return {
    userExerciseId: exercise.id,
    trackingMode: exercise.trackingMode,
    cardioCategory: exercise.cardioCategory,
    metValue: exercise.metValue,
    sets: totals.sets,
    durationSec: totals.durationSec,
    distanceKm: totals.distanceKm,
  };
}

/**
 * F-06 §4.4 with the F-11 §4.4 extension: the service loads the data and the pure functions
 * calculate. Read-only (F-06 R14): the plan as it was on `date` via `resolvePlan` (R12), that
 * day's entries and one `cumulativeFor` per planned exercise, then `calcDaily` for the scores
 * (exercises not planned that day never reach `calcDaily`, F-06 R3). F-11: the weight valid on
 * `date` (R2) and the calories of planned items and of every other exercise logged that day,
 * including on a Rest Day (R10, R12), through `withCalories`. It takes the date as a parameter
 * and never calls the Clock.
 */
export async function dailyProgress(
  deps: { plans: PlanRepository; entries: EntryRepository; weights: Pick<ProfileRepository, 'listWeightsUpTo'> },
  userId: string,
  date: string,
): Promise<DailyWithCalories & { date: string }> {
  const [plan, entries, weightRows] = await Promise.all([
    resolvePlan(deps.plans, userId, date),
    deps.entries.listDayEntries(userId, date),
    deps.weights.listWeightsUpTo(userId, date),
  ]);
  const cumulative = plan.items.map((item) => cumulativeFor(entries, item.userExercise.id, date));
  const daily = calcDaily(plan.items, cumulative);
  const planned = plan.items.map((item, i) => calorieInput(item.userExercise, cumulative[i] as Cumulative));

  const plannedIds = new Set(plan.items.map((item) => item.userExercise.id));
  const otherIds = [...new Set(entries.map((e) => e.userExerciseId))].filter((id) => !plannedIds.has(id));
  const other: OtherActivityInput[] = [];
  if (otherIds.length > 0) {
    const snapshots = new Map((await deps.plans.listUserExercises(userId)).map((ex) => [ex.id, ex]));
    for (const id of otherIds) {
      const exercise = snapshots.get(id);
      if (!exercise) throw new Error(`entry for unknown exercise ${id}`);
      const totals = cumulativeFor(entries, id, date);
      other.push({ ...calorieInput(exercise, totals), name: exercise.name, unit: exercise.unit, actual: actualOf(exercise.trackingMode, totals) });
    }
  }

  return { date, ...withCalories(daily, planned, other, pickBodyWeight(weightRows, date)) };
}
