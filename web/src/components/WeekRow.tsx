import { dayOfMonth, weekOf } from '../lib/dates'
import { WEEKDAYS, formatDay } from '../lib/plan'

type Props = {
  /** The server's today (from GET /api/progress/daily). */
  today: string
  /** Called when any other day is tapped; the Today screen has no view for other days. */
  onOtherDay: () => void
}

// Monday-to-Sunday strip for the Today screen: today is the dark chip. Tapping another day does not
// open anything, it only asks the page to show a short message (logging is for today only).
export function WeekRow({ today, onOtherDay }: Props) {
  const days = weekOf(today)

  return (
    <div className="week-row-card" data-testid="today-week" role="group" aria-label="This week">
      <h3 className="cal-title week-title">
        {formatDay(days[0])} – {formatDay(days[6])}
      </h3>
      <div className="cal-labels" aria-hidden="true">
        {WEEKDAYS.map(({ short }) => (
          <span key={short}>{short}</span>
        ))}
      </div>
      <ol className="cal-grid cal-grid-week">
        {days.map((iso) => {
          const isToday = iso === today
          const cls = ['cal-day', isToday ? 'cal-day-selected' : '', iso > today ? 'cal-day-outside' : ''].filter(Boolean).join(' ')
          return (
            <li key={iso}>
              <button
                type="button"
                className={cls}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${iso}${isToday ? ' (today)' : ''}`}
                data-testid={`today-day-${iso}`}
                onClick={isToday ? undefined : onOtherDay}
              >
                {dayOfMonth(iso)}
              </button>
              <img className={iso > today ? 'cal-mascot cal-mascot-dim' : 'cal-mascot'} src="/character/emoji.png" alt="" aria-hidden="true" />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
