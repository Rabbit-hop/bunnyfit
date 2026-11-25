/**
 * Streak calculation (F-08 §3.2 R2-R8, §4.5). Pure: no storage, no Clock (`today` is a parameter).
 * The input is the Daily Overall % of every date (F-06 `calcDaily`, unrounded; `null` = Rest Day).
 */
export interface DayPercent {
  date: string;
  /** Unrounded Daily Overall %; `null` on a Rest Day. */
  overallPercent: number | null;
}

export interface StreakResult {
  streak: number;
  todayPending: boolean;
  todayPercent: number | null;
}

/** BR-10: a targeted day qualifies at 70% or more, compared on the unrounded value. */
const QUALIFYING_PERCENT = 70;

const MS_PER_DAY = 86_400_000;
const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00.000Z`) / MS_PER_DAY;

/**
 * `days` must contain every calendar date from its first date up to and including `today`, once each
 * (any order); dates after `today` are ignored. A gap, a duplicate or a missing `today` is a
 * programming error and throws.
 *
 * Streak = C + T. C: from yesterday back, skip Rest Days, count each closed day that qualifies and stop
 * at the first closed targeted day that does not (R6). T = 1 if today qualifies. `todayPending` is true
 * iff today is a targeted day below 70% (R7).
 */
export function calcStreak(days: readonly DayPercent[], today: string): StreakResult {
  const upToToday = days.filter((d) => d.date <= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const last = upToToday[upToToday.length - 1];
  if (!last || last.date !== today) throw new Error(`calcStreak: no entry for today (${today})`);
  for (let i = 1; i < upToToday.length; i++) {
    const gap = dayNumber(upToToday[i]!.date) - dayNumber(upToToday[i - 1]!.date);
    if (gap !== 1) throw new Error(`calcStreak: ${gap === 0 ? 'duplicate' : 'gap before'} ${upToToday[i]!.date}`);
  }

  const todayPercent = last.overallPercent;
  let streak = 0;
  for (let i = upToToday.length - 2; i >= 0; i--) {
    const percent = upToToday[i]!.overallPercent;
    if (percent === null) continue; // Rest Day: neither counts nor resets (R5)
    if (percent >= QUALIFYING_PERCENT) streak++;
    else break; // a closed targeted day below 70%, or without activity (0%), resets (R6)
  }
  const todayQualifies = todayPercent !== null && todayPercent >= QUALIFYING_PERCENT;
  if (todayQualifies) streak++;
  return { streak, todayPending: todayPercent !== null && !todayQualifies, todayPercent };
}
