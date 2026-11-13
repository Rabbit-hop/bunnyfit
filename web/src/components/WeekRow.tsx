import { addDays, dayOfMonth, weekOf } from '../lib/dates'
import { WEEKDAYS, formatDay } from '../lib/plan'

type Props = {
  /** The server's today (from GET /api/progress/daily); days after it cannot be opened. */
  today: string
  selected: string
  onSelect: (iso: string) => void
}

// Monday-to-Sunday strip for the Today screen. Tapping a day shows that day's progress read-only
// (GET /api/progress/daily?date=); logging stays for today only (LOG_DATE_MISMATCH). Future days
// are disabled because the endpoint rejects a date after today (F-06 R13).
export function WeekRow({ today, selected, onSelect }: Props) {
  const days = weekOf(selected)
  const prev = addDays(selected, -7)
  const next = addDays(selected, 7)
  const nextDisabled = weekOf(next)[0] > today

  return (
    <div className="week-row-card" data-testid="today-week" role="group" aria-label="Week">
      <div className="cal-head">
        <button type="button" className="cal-arrow" aria-label="Previous week" data-testid="today-week-prev" onClick={() => onSelect(prev)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h3 className="cal-title">
          {formatDay(days[0])} – {formatDay(days[6])}
        </h3>
        <button
          type="button"
          className="cal-arrow"
          aria-label="Next week"
          data-testid="today-week-next"
          disabled={nextDisabled}
          onClick={() => onSelect(next > today ? today : next)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className="cal-labels" aria-hidden="true">
        {WEEKDAYS.map(({ short }) => (
          <span key={short}>{short}</span>
        ))}
      </div>
      <ol className="cal-grid cal-grid-week">
        {days.map((iso) => {
          const future = iso > today
          const cls = ['cal-day', iso === selected ? 'cal-day-selected' : '', iso === today ? 'cal-day-today' : '', future ? 'cal-day-outside' : '']
            .filter(Boolean)
            .join(' ')
          return (
            <li key={iso}>
              <button
                type="button"
                className={cls}
                disabled={future}
                aria-pressed={iso === selected}
                aria-label={`${iso}${iso === today ? ' (today)' : ''}`}
                data-testid={`today-day-${iso}`}
                onClick={() => onSelect(iso)}
              >
                {dayOfMonth(iso)}
              </button>
              <img className={future ? 'cal-mascot cal-mascot-dim' : 'cal-mascot'} src="/character/emoji.png" alt="" aria-hidden="true" />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
