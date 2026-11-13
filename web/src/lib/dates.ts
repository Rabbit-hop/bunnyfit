// ISO date ("YYYY-MM-DD") arithmetic done in UTC so it never depends on the browser time zone.
// "Which day is today" always comes from the server (GET /api/plan); these helpers only move
// around a calendar from that starting point.

const DAY_MS = 86_400_000

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

export function addDays(iso: string, n: number): string {
  return new Date(toUtc(iso).getTime() + n * DAY_MS).toISOString().slice(0, 10)
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const d = toUtc(iso).getUTCDay()
  return d === 0 ? 7 : d
}

export function mondayOf(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso))
}

/** The seven dates of the Monday-to-Sunday week that contains `iso`. */
export function weekOf(iso: string): string[] {
  const monday = mondayOf(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10))
}

const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/**
 * Same day-of-month `n` months away, clamped to the last day (31 Jan + 1 month = 28/29 Feb).
 * `anchorDay` is the day the user really wants (default: the day of `iso`); a calendar that steps
 * month by month passes the original day so 31 Jan -> 28 Feb -> 31 Mar instead of drifting to the 28th.
 */
export function addMonths(iso: string, n: number, anchorDay: number = dayOfMonth(iso)): string {
  const total = Number(iso.slice(0, 4)) * 12 + (Number(iso.slice(5, 7)) - 1) + n
  const year = Math.floor(total / 12)
  const month1 = (total % 12) + 1
  const day = Math.min(anchorDay, daysInMonth(year, month1))
  return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Six Monday-first weeks (42 dates) covering the month of `iso`, with the neighbouring months' days. */
export function monthGrid(iso: string): string[] {
  const first = `${iso.slice(0, 7)}-01`
  const start = mondayOf(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/** "2026-11-10" -> "November 2026". */
export function formatMonthYear(iso: string): string {
  return `${MONTH_LONG[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/** "2026-11-10" -> "Tuesday, 10 November". */
export function formatLongDay(iso: string): string {
  return `${WEEKDAY_LONG[isoWeekday(iso) - 1]}, ${dayOfMonth(iso)} ${MONTH_LONG[Number(iso.slice(5, 7)) - 1]}`
}
