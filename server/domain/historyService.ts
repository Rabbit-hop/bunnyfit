import type { EntryRecord, EntryRepository } from '../repositories/entryRepository.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import { cumulativeFor } from './entryCalc.js';
import { resolveItems, type ResolvedItem } from './planResolution.js';
import { calcDaily, type DailyResult } from './progressCalc.js';
import { calcStreak, type StreakResult } from './streakCalc.js';

/**
 * F-08 §4.5: history and Streak are derived on every request from the plan versions (all rows) and the
 * ledger entries; nothing is stored (R13). The Daily Overall % of a date is F-06's `calcDaily` over the
 * items `resolveItems` picks for that date (R3, R9): there is no second scoring implementation.
 * Pure of the Clock: the callers pass `today` and the range.
 */

const MS_PER_DAY = 86_400_000;

/** `date` shifted by `days` calendar days (UTC arithmetic on `YYYY-MM-DD`, no zone involved). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Number of calendar days from `from` to `to`, inclusive. */
export function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / MS_PER_DAY) + 1;
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface HistoryEntry extends EntryRecord {
  exerciseName: string;
  /** True iff the exercise is planned on the entry's date (R11). */
  scored: boolean;
}

export interface HistoryDay {
  date: string;
  isRestDay: boolean;
  totalScore: number;
  totalWeight: number;
  overallPercent: number | null;
  entries: HistoryEntry[];
}

interface Evaluated {
  date: string;
  daily: DailyResult;
  plannedExerciseIds: Set<string>;
  entries: EntryRecord[];
}

/** One evaluation per date of `[from, to]`: resolve the plan of that date, score it with that date's entries. */
function evaluate(items: readonly ResolvedItem[], entries: readonly EntryRecord[], from: string, to: string): Evaluated[] {
  const byDate = new Map<string, EntryRecord[]>();
  for (const e of entries) {
    const list = byDate.get(e.logDate);
    if (list) list.push(e);
    else byDate.set(e.logDate, [e]);
  }
  return datesBetween(from, to).map((date) => {
    const dayEntries = byDate.get(date) ?? [];
    const plan = resolveItems(items, date);
    const daily = calcDaily(plan, plan.map((p) => cumulativeFor(dayEntries, p.userExercise.id, date)));
    return { date, daily, plannedExerciseIds: new Set(plan.map((p) => p.userExercise.id)), entries: dayEntries };
  });
}

/** `GET /api/history` (§4.1): one record per date of `[from, to]`, newest first, entries by `createdAt` ascending. */
export async function history(
  deps: { plans: PlanRepository; entries: EntryRepository },
  userId: string,
  from: string,
  to: string,
): Promise<{ from: string; to: string; days: HistoryDay[] }> {
  const [items, exercises, entries] = await Promise.all([
    deps.plans.listPlanItems(userId),
    deps.plans.listUserExercises(userId),
    deps.entries.listEntriesBetween(userId, from, to),
  ]);
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const days = evaluate(items, entries, from, to)
    .map<HistoryDay>(({ date, daily, plannedExerciseIds, entries: dayEntries }) => ({
      date,
      isRestDay: daily.isRestDay,
      totalScore: daily.totalScore,
      totalWeight: daily.totalWeight,
      overallPercent: daily.overallPercent,
      entries: dayEntries.map((e) => ({ ...e, exerciseName: names.get(e.userExerciseId) ?? '', scored: plannedExerciseIds.has(e.userExerciseId) })),
    }))
    .reverse();
  return { from, to, days };
}

/**
 * `GET /api/streak` (§4.2): per-date percentages from the earliest plan-item `effectiveFrom` to `today`
 * (a user without a plan item gets `[today]`, a Rest Day), then the pure `calcStreak`.
 */
export async function streak(
  deps: { plans: PlanRepository; entries: EntryRepository },
  userId: string,
  today: string,
): Promise<{ date: string } & StreakResult> {
  const items = await deps.plans.listPlanItems(userId);
  const earliest = items.reduce<string | null>((min, i) => (min === null || i.planItem.effectiveFrom < min ? i.planItem.effectiveFrom : min), null);
  const start = earliest !== null && earliest < today ? earliest : today;
  const entries = await deps.entries.listEntriesBetween(userId, start, today);
  const days = evaluate(items, entries, start, today).map((d) => ({ date: d.date, overallPercent: d.daily.overallPercent }));
  return { date: today, ...calcStreak(days, today) };
}
