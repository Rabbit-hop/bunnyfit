import type { EntryRepository } from '../repositories/entryRepository.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import { cumulativeFor } from './entryCalc.js';
import { resolvePlan } from './planResolution.js';
import { calcDaily, type DailyResult } from './progressCalc.js';

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
