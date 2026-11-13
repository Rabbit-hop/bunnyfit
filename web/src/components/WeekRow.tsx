import { dayOfMonth, weekOf } from '../lib/dates'
import { WEEKDAYS } from '../lib/plan'

// Read-only Monday-to-Sunday strip for the Today screen: today is the dark chip, every day has the
// mascot under it. Logging is only for today (LOG_DATE_MISMATCH), so the days are not buttons.
export function WeekRow({ today }: { today: string }) {
  const days = weekOf(today)
  return (
    <div className="week-row-card" data-testid="today-week" role="group" aria-label="This week">
      <div className="cal-labels" aria-hidden="true">
        {WEEKDAYS.map(({ short }) => (
          <span key={short}>{short}</span>
        ))}
      </div>
      <ol className="cal-grid cal-grid-week">
        {days.map((iso) => (
          <li key={iso}>
            <span
              className={iso === today ? 'cal-day cal-day-selected week-static' : 'cal-day week-static'}
              aria-current={iso === today ? 'date' : undefined}
              data-date={iso}
            >
              {dayOfMonth(iso)}
            </span>
            <img className="cal-mascot" src="/character/emoji.png" alt="" aria-hidden="true" />
          </li>
        ))}
      </ol>
    </div>
  )
}
