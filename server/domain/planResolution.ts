import type { PlanItemRecord, PlanRepository, UserExerciseRecord } from '../repositories/planRepository.js';

/** A plan item with its exercise snapshot (F-03 §4.4, §4.5). */
export interface ResolvedItem {
  planItem: PlanItemRecord;
  userExercise: UserExerciseRecord;
}

export interface ResolvedPlan {
  isRestDay: boolean;
  items: ResolvedItem[];
}

/** ISO weekday (1 = Monday ... 7 = Sunday) of a `YYYY-MM-DD` calendar date. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Plan resolution (F-03 R12, SDS §3.3), pure: for each `planKey` take the version with the
 * greatest `effectiveFrom` <= date (ties: highest `version`); it occurs on the date if
 * `endDate` is null or the date is not after it, and the weekday is in `repeatDays`.
 * Input order is kept for the occurring items.
 */
export function resolveItems(items: readonly ResolvedItem[], date: string): ResolvedItem[] {
  const current = new Map<string, ResolvedItem>();
  for (const item of items) {
    if (item.planItem.effectiveFrom > date) continue;
    const best = current.get(item.planItem.planKey);
    if (
      !best ||
      item.planItem.effectiveFrom > best.planItem.effectiveFrom ||
      (item.planItem.effectiveFrom === best.planItem.effectiveFrom && item.planItem.version > best.planItem.version)
    ) {
      current.set(item.planItem.planKey, item);
    }
  }
  const weekday = isoWeekday(date);
  const chosen = new Set(current.values());
  return items.filter(
    (item) =>
      chosen.has(item) &&
      (item.planItem.endDate === null || date <= item.planItem.endDate) &&
      item.planItem.repeatDays.includes(weekday),
  );
}

/**
 * Provided to F-04 and F-06 (F-03 §4.7): reads only the caller's rows and takes the
 * date as a parameter; it never calls the Clock.
 */
export async function resolvePlan(plans: PlanRepository, userId: string, date: string): Promise<ResolvedPlan> {
  const items = resolveItems(await plans.listPlanItems(userId), date);
  return { isRestDay: items.length === 0, items };
}
