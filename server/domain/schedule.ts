import { isoWeekday, resolveItems, type ResolvedItem } from './planResolution.js';

/** F-09 §4.1 schedule view, computed on read (SDS §2.4); nothing is stored. */
export type ScheduleView = 'week' | 'month';

export interface ScheduleItem {
  planItemId: string;
  planKey: string;
  version: number;
  userExerciseId: string;
  name: string;
  trackingMode: string;
}

export interface ScheduleDay {
  date: string;
  isRestDay: boolean;
  items: ScheduleItem[];
}

export interface Schedule {
  view: ScheduleView;
  from: string;
  to: string;
  today: string;
  days: ScheduleDay[];
}

const toDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const toDay = (date: Date): string => date.toISOString().slice(0, 10);

function addDays(day: string, n: number): string {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + n);
  return toDay(date);
}

/** R2: `week` = ISO week (Mon-Sun) containing `date`; `month` = its calendar month. */
export function scheduleRange(view: ScheduleView, date: string): { from: string; to: string } {
  if (view === 'week') {
    const from = addDays(date, 1 - isoWeekday(date));
    return { from, to: addDays(from, 6) };
  }
  const d = toDate(date);
  const from = toDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const to = toDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return { from, to };
}

/**
 * R3: each day of the range resolves the caller's plan items with the F-03 rule (latest version with
 * `effectiveFrom` <= day, `endDate`, `repeatDays`); a day without items is a Rest Day (Q24). Pure:
 * `items` are the caller's plan rows, `today` comes from the Clock.
 */
export function buildSchedule(items: readonly ResolvedItem[], view: ScheduleView, date: string, today: string): Schedule {
  const { from, to } = scheduleRange(view, date);
  const days: ScheduleDay[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const occurring = resolveItems(items, day).map(({ planItem, userExercise }) => ({
      planItemId: planItem.id,
      planKey: planItem.planKey,
      version: planItem.version,
      userExerciseId: userExercise.id,
      name: userExercise.name,
      trackingMode: userExercise.trackingMode,
    }));
    days.push({ date: day, isRestDay: occurring.length === 0, items: occurring });
  }
  return { view, from, to, today, days };
}
