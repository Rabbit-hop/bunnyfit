import type { EntryRepository } from '../repositories/entryRepository.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import { cumulativeFor } from './entryCalc.js';
import { resolveItems, resolvePlan } from './planResolution.js';
import { calcDaily, calcMonthly, type DailyResult, type MonthlyResult } from './progressCalc.js';

/**
 * F-06 §4.4: the service loads the data and the pure functions calculate. Read-only (R14):
 * the plan as it was on `date` via `resolvePlan` (R12), that day's entries, one `cumulativeFor`
 * per planned exercise (R3: entries of exercises not planned that day are never looked at),
 * then `calcDaily`. It takes the date as a parameter and never calls the Clock.
 */
export async function dailyProgress(
  deps: { plans: PlanRepository; entries: EntryRepository },
  userId: string,
  date: string,
): Promise<DailyResult & { date: string }> {
  const plan = await resolvePlan(deps.plans, userId, date);
  if (plan.isRestDay) return { date, ...calcDaily([], []) };
  const entries = await deps.entries.listDayEntries(userId, date);
  const cumulative = plan.items.map((item) => cumulativeFor(entries, item.userExercise.id, date));
  return { date, ...calcDaily(plan.items, cumulative) };
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
  const dates = datesBetween(from, to);
  const entries = dates.length === 0 ? [] : await deps.entries.listEntriesBetween(userId, from, to);

  const results = dates.map((date) => {
    const occurring = resolveItems(items, date);
    const daily = calcDaily(
      occurring,
      occurring.map((item) => cumulativeFor(entries, item.userExercise.id, date)),
    );
    return { date, isRestDay: daily.isRestDay, overallPercent: daily.overallPercent };
  });
  return { month, from, to, ...calcMonthly(results), days: results };
}
