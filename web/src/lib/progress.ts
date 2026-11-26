import { apiFetch } from './api'
import type { MonthlyProgress } from './monthGrid'
import type { DailyProgress } from './today'

export { monthCells, monthSummary, shiftMonth } from './monthGrid'
export type { DayCell, DayState, MonthlyDay, MonthlyProgress } from './monthGrid'

// F-06 §4.1 and §4.2 progress calls used by the S-06 screen.
export const progressApi = {
  /** Without `month` the server answers for the current month, and `to` is the server's today. */
  getMonthly: async (month?: string): Promise<MonthlyProgress> =>
    (await apiFetch<MonthlyProgress>(month ? `/api/progress/monthly?month=${encodeURIComponent(month)}` : '/api/progress/monthly'))!,
  getDaily: async (date: string): Promise<DailyProgress> =>
    (await apiFetch<DailyProgress>(`/api/progress/daily?date=${encodeURIComponent(date)}`))!,
}
