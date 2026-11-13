import { addDays, addMonths, dayOfMonth, formatMonthYear, isSameMonth, monthGrid, weekOf } from '../lib/dates'
import { formatDay, WEEKDAYS } from '../lib/plan'

export type CalendarMode = 'month' | 'week'

type Props = {
  mode: CalendarMode
  selected: string
  today: string
  /** Does anything occur on this date? (false = Rest Day) */
  hasPlan: (iso: string) => boolean
  onModeChange: (mode: CalendarMode) => void
  onSelect: (iso: string) => void
}

function Arrow({ dir, label, testId, onClick }: { dir: 'prev' | 'next'; label: string; testId: string; onClick: () => void }) {
  return (
    <button type="button" className="cal-arrow" aria-label={label} data-testid={testId} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}

export function CalendarCard({ mode, selected, today, hasPlan, onModeChange, onSelect }: Props) {
  const week = weekOf(selected)
  const step = mode === 'month' ? (n: number) => addMonths(selected, n) : (n: number) => addDays(selected, 7 * n)
  const title = mode === 'month' ? formatMonthYear(selected) : `${formatDay(week[0])} – ${formatDay(week[6])}`
  const days = mode === 'month' ? monthGrid(selected) : week

  return (
    <div className="calendar-card" data-testid="calendar">
      <div className="cal-toggle" role="group" aria-label="Calendar view">
        <button
          type="button"
          className={mode === 'month' ? 'cal-toggle-on' : undefined}
          aria-pressed={mode === 'month'}
          data-testid="view-month"
          onClick={() => onModeChange('month')}
        >
          Month
        </button>
        <button
          type="button"
          className={mode === 'week' ? 'cal-toggle-on' : undefined}
          aria-pressed={mode === 'week'}
          data-testid="view-week"
          onClick={() => onModeChange('week')}
        >
          Week
        </button>
      </div>

      <div className="cal-head">
        <Arrow dir="prev" label={mode === 'month' ? 'Previous month' : 'Previous week'} testId="cal-prev" onClick={() => onSelect(step(-1))} />
        <h3 className="cal-title" data-testid="cal-title">
          {title}
        </h3>
        <Arrow dir="next" label={mode === 'month' ? 'Next month' : 'Next week'} testId="cal-next" onClick={() => onSelect(step(1))} />
      </div>

      <div className="cal-labels" aria-hidden="true">
        {WEEKDAYS.map(({ short }) => (
          <span key={short}>{short}</span>
        ))}
      </div>

      <ol className={mode === 'month' ? 'cal-grid' : 'cal-grid cal-grid-week'} data-testid={`cal-grid-${mode}`}>
        {days.map((iso) => {
          const isSelected = iso === selected
          const planned = hasPlan(iso)
          const outside = mode === 'month' && !isSameMonth(iso, selected)
          const cls = [
            'cal-day',
            isSelected ? 'cal-day-selected' : '',
            iso === today ? 'cal-day-today' : '',
            outside ? 'cal-day-outside' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <li key={iso}>
              <button
                type="button"
                className={cls}
                aria-pressed={isSelected}
                aria-label={`${iso}${iso === today ? ' (today)' : ''}${planned ? ', has exercises' : ''}`}
                data-testid={`day-${iso}`}
                data-date={iso}
                onClick={() => onSelect(iso)}
              >
                {dayOfMonth(iso)}
              </button>
              {mode === 'week' ? (
                <img
                  className={planned ? 'cal-mascot' : 'cal-mascot cal-mascot-dim'}
                  src="/character/emoji.png"
                  alt=""
                  aria-hidden="true"
                />
              ) : (
                <span className={planned ? 'cal-dot' : 'cal-dot cal-dot-off'} aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
