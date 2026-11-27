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
import { cumulativeFor, type Cumulative, type CumulativeEntry } from './entryCalc.js';
import { resolveItems, resolvePlan } from './planResolution.js';
import { actualOf, calcDaily, calcMonthly, type MonthlyResult } from './progressCalc.js';

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

export interface MonthlyDay {
  date: string;
  isRestDay: boolean;
  overallPercent: number | null;
}

export interface MonthlyProgress extends MonthlyResult {
  month: string;
  from: string;
  to: string;
  days: MonthlyDay[];
}

/** Last calendar day of `YYYY-MM` as `YYYY-MM-DD`. */
function monthEnd(month: string): string {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
}

/** Every date from `from` to `to` inclusive (empty when `from` is after `to`). */
function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00.000Z`); t <= Date.parse(`${to}T00:00:00.000Z`); t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * F-06 §4.2 / R10: the monthly average over targeted days. Two reads (the user's plan items and
 * the range's entries), every day computed in memory with `resolveItems` + `calcDaily` (R12), so
 * past days use the plan version of their own date. `from` is the later of the month start and the
 * user's first `effectiveFrom`; `to` is `today` for the current month and the month end for a past
 * month, so future days are never counted. Read-only (R14); `today` is a parameter, no Clock here.
 */
export async function monthlyProgress(
  deps: { plans: PlanRepository; entries: EntryRepository },
  userId: string,
  month: string,
  today: string,
): Promise<MonthlyProgress> {
  const items = await deps.plans.listPlanItems(userId);
  const monthStart = `${month}-01`;
  const to = month === today.slice(0, 7) ? today : monthEnd(month);
  const firstEffective = items.reduce<string | null>(
    (first, item) => (first === null || item.planItem.effectiveFrom < first ? item.planItem.effectiveFrom : first),
    null,
  );
  const from = firstEffective !== null && firstEffective > monthStart ? firstEffective : monthStart;
  // With no plan item there is no first effectiveFrom: every day is "before the plan" (AC-15), not a Rest Day,
  // so no day is returned and nothing counts as an excluded Rest Day (PR #119 review).
  const dates = firstEffective === null ? [] : datesBetween(from, to);
  const entries = dates.length === 0 ? [] : await deps.entries.listCumulativeEntriesBetween(userId, from, to);
  // #108: each day's sums read only that day's rows instead of scanning the whole range per item.
  const byDate = new Map<string, CumulativeEntry[]>();
  for (const entry of entries) {
    const day = byDate.get(entry.logDate);
    if (day) day.push(entry);
    else byDate.set(entry.logDate, [entry]);
  }

  const results = dates.map((date) => {
    const occurring = resolveItems(items, date);
    const dayEntries = byDate.get(date) ?? [];
    const daily = calcDaily(
      occurring,
      occurring.map((item) => cumulativeFor(dayEntries, item.userExercise.id, date)),
    );
    return { date, isRestDay: daily.isRestDay, overallPercent: daily.overallPercent };
  });
  return { month, from, to, ...calcMonthly(results), days: results };
}
