import { addDays, isoWeekday } from './dates.js'

// F-06 §4.2 `GET /api/progress/monthly` response (Sprint 2, CHANGE-06) and the pure display helpers of the
// S-06 screen. The server computes every value; this module only decides how each calendar day is shown.
// No browser or API import here, so the unit tests can load it under NodeNext.

export type MonthlyDay = { date: string; isRestDay: boolean; overallPercent: number | null }

export type MonthlyProgress = {
  month: string
  from: string
  to: string
  targetedDays: number
  restDaysExcluded: number
  averagePercent: number | null
  days: MonthlyDay[]
}

/**
 * ui-spec S-06: a date after today is FUTURE, a Rest Day is REST, any other day in `days[]` is TARGETED.
 * A past date that the server did not return (before the first plan start, F-06 §4.2 `from`) is NO_PLAN:
 * it is not part of the average and has nothing to open.
 */
export type DayState = 'TARGETED' | 'REST' | 'FUTURE' | 'NO_PLAN'
export type DayCell = { date: string; state: DayState; percent: number | null }

function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
}

/** Every day of `progress.month`, plus the number of blank cells before day 1 in a Monday-first week. */
export function monthCells(progress: MonthlyProgress, today: string): { leading: number; cells: DayCell[] } {
  const first = `${progress.month}-01`
  const byDate = new Map(progress.days.map((d) => [d.date, d]))
  const cells = Array.from({ length: daysInMonth(progress.month) }, (_, i): DayCell => {
    const date = addDays(first, i)
    if (date > today) return { date, state: 'FUTURE', percent: null }
    const day = byDate.get(date)
    if (!day) return { date, state: 'NO_PLAN', percent: null }
    if (day.isRestDay) return { date, state: 'REST', percent: null }
    return { date, state: 'TARGETED', percent: day.overallPercent }
  })
  return { leading: isoWeekday(first) - 1, cells }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** F-06 §6 month card: "64.3%" and "5 targeted days counted, 3 rest days excluded", or "No targeted days yet". */
export function monthSummary(progress: MonthlyProgress): { average: string | null; detail: string } {
  if (progress.averagePercent === null) return { average: null, detail: 'No targeted days yet' }
  return {
    average: `${progress.averagePercent.toFixed(1)}%`,
    detail: `${plural(progress.targetedDays, 'targeted day')} counted, ${plural(progress.restDaysExcluded, 'rest day')} excluded`,
  }
}

/** "2026-01" - 1 = "2025-12". */
export function shiftMonth(month: string, n: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
