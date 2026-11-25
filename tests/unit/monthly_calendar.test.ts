import { describe, expect, it } from 'vitest'
import { monthCells, monthSummary, shiftMonth, type MonthlyProgress } from '../../web/src/lib/progress.js'

// Supplementary unit coverage for the S-06 Monthly Progress screen (ui-spec S-06, F-06 §6 month card,
// issue #75 Part 1). Not RTM evidence for AC-15: that AC is proven by the API and unit tests named in
// the RTM (tests/integration/progress_api.test.ts, tests/unit/progress_calc.test.ts). The UI only
// displays server values; these tests pin how it derives each day's display state.

const november: MonthlyProgress = {
  month: '2026-11',
  from: '2026-11-03',
  to: '2026-11-05',
  targetedDays: 2,
  restDaysExcluded: 1,
  averagePercent: 64.25,
  days: [
    { date: '2026-11-03', isRestDay: false, overallPercent: 82 },
    { date: '2026-11-04', isRestDay: true, overallPercent: null },
    { date: '2026-11-05', isRestDay: false, overallPercent: 46.5 },
  ],
}

describe('S-06 monthCells: one cell per day of the month, display state from days[] and today', () => {
  it('returns the 30 days of November in order, Monday-first offset 6 (1 Nov 2026 is a Sunday)', () => {
    const { leading, cells } = monthCells(november, '2026-11-05')
    expect(leading).toBe(6)
    expect(cells).toHaveLength(30)
    expect(cells[0]!.date).toBe('2026-11-01')
    expect(cells[29]!.date).toBe('2026-11-30')
  })

  it('a day in days[] that is not a Rest Day is TARGETED with its percentage; a Rest Day is REST', () => {
    const { cells } = monthCells(november, '2026-11-05')
    expect(cells[2]).toEqual({ date: '2026-11-03', state: 'TARGETED', percent: 82 })
    expect(cells[3]).toEqual({ date: '2026-11-04', state: 'REST', percent: null })
    expect(cells[4]).toEqual({ date: '2026-11-05', state: 'TARGETED', percent: 46.5 })
  })

  it('a date after today is FUTURE, even when the month is the current one', () => {
    const { cells } = monthCells(november, '2026-11-05')
    expect(cells[5]!.state).toBe('FUTURE')
    expect(cells[29]!.state).toBe('FUTURE')
  })

  it('a past date that is not in days[] (before the first plan start) is NO_PLAN, not counted and not selectable', () => {
    const { cells } = monthCells(november, '2026-11-05')
    expect(cells[0]).toEqual({ date: '2026-11-01', state: 'NO_PLAN', percent: null })
    expect(cells[1]!.state).toBe('NO_PLAN')
  })

  it('a past month has no FUTURE days; February 2027 has 28 cells and starts on a Monday', () => {
    const feb: MonthlyProgress = { month: '2027-02', from: '2027-02-01', to: '2027-02-28', targetedDays: 0, restDaysExcluded: 0, averagePercent: null, days: [] }
    const { leading, cells } = monthCells(feb, '2027-03-10')
    expect(leading).toBe(0)
    expect(cells).toHaveLength(28)
    expect(cells.every((c) => c.state === 'NO_PLAN')).toBe(true)
  })
})

describe('S-06 monthSummary: F-06 §6 month card text', () => {
  it('shows the average with one decimal and the counted and excluded days', () => {
    expect(monthSummary(november)).toEqual({
      average: '64.3%',
      detail: '2 targeted days counted, 1 rest day excluded',
    })
  })

  it('uses singular and plural forms', () => {
    expect(monthSummary({ ...november, targetedDays: 1, restDaysExcluded: 3, averagePercent: 50 }).detail).toBe(
      '1 targeted day counted, 3 rest days excluded',
    )
  })

  it('a month with no targeted days shows "No targeted days yet" and no percentage', () => {
    expect(monthSummary({ ...november, targetedDays: 0, restDaysExcluded: 2, averagePercent: null })).toEqual({
      average: null,
      detail: 'No targeted days yet',
    })
  })
})

describe('S-06 shiftMonth: month switcher arithmetic on YYYY-MM strings', () => {
  it('steps across a year boundary in both directions', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-11', -1)).toBe('2026-10')
  })
})
