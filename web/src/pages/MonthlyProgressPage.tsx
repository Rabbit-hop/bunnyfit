import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { StreakBadge } from '../components/StreakBadge'
import { dayOfMonth, formatMonthYear } from '../lib/dates'
import { monthCells, monthSummary, progressApi, shiftMonth, type DayCell, type MonthlyProgress } from '../lib/progress'
import { describeError, formatLongDate, formatPercent, formatQuantity, formatScore, type DailyProgress } from '../lib/today'

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; progress: MonthlyProgress }
type DrawerState =
  | { status: 'closed' }
  | { status: 'loading'; date: string }
  | { status: 'error'; date: string; message: string }
  | { status: 'ready'; date: string; daily: DailyProgress }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function cellLabel(cell: DayCell): string {
  if (cell.state === 'TARGETED') return cell.percent === null ? '' : `${Math.round(cell.percent)}%`
  if (cell.state === 'REST') return 'Rest'
  if (cell.state === 'NO_PLAN') return '–'
  return ''
}

function Arrow({ dir, label, testId, disabled, onClick }: { dir: 'prev' | 'next'; label: string; testId: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="cal-arrow" aria-label={label} data-testid={testId} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}

/**
 * S-06 Monthly Progress (ui-spec S-06, F-06 §4.2 and §6, AC-15 on the server). The first request has no
 * `month`, so the server picks the current month and its `to` is the server's today (ui-spec §3.5: never the
 * browser clock). The switcher never goes past that month. Selecting a day opens a read-only drawer from
 * `GET /api/progress/daily`; it has no log buttons. The F-08 Streak badge and the History link sit above and below the card.
 */
export function MonthlyProgressPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [current, setCurrent] = useState<{ month: string; today: string } | null>(null)
  const [month, setMonth] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<DrawerState>({ status: 'closed' })
  const closeRef = useRef<HTMLButtonElement>(null)
  // Only the latest request may update the screen; an older answer that arrives late is ignored.
  const requestId = useRef(0)

  const load = useCallback(async (wanted: string | null) => {
    const id = ++requestId.current
    // The title and Retry follow the month that was asked for, also while it loads or after it fails.
    if (wanted !== null) setMonth(wanted)
    setState({ status: 'loading' })
    try {
      const progress = await progressApi.getMonthly(wanted ?? undefined)
      if (id !== requestId.current) return
      if (wanted === null) setCurrent({ month: progress.month, today: progress.to })
      setMonth(progress.month)
      setState({ status: 'ready', progress })
    } catch (error) {
      if (id !== requestId.current) return
      setState({ status: 'error', message: describeError(error).message })
    }
  }, [])

  useEffect(() => {
    void load(null)
  }, [load])

  useEffect(() => {
    if (drawer.status !== 'closed') closeRef.current?.focus()
  }, [drawer.status])

  // A drawer that was closed (or replaced) while its request was running must not be reopened by the answer.
  const drawerRequest = useRef(0)

  async function openDay(date: string) {
    const id = ++drawerRequest.current
    setDrawer({ status: 'loading', date })
    try {
      const daily = await progressApi.getDaily(date)
      if (id === drawerRequest.current) setDrawer({ status: 'ready', date, daily })
    } catch (error) {
      if (id === drawerRequest.current) setDrawer({ status: 'error', date, message: describeError(error).message })
    }
  }

  function closeDrawer() {
    drawerRequest.current += 1
    setDrawer({ status: 'closed' })
  }

  // Before the first answer there is no current month yet, so a retry asks for the default month again.
  const shown = month ?? current?.month ?? null
  const atCurrent = current !== null && shown === current.month

  return (
    <section className="progress-page" data-testid="progress-page">
      <header className="page-holder">
        <h2>Progress</h2>
      </header>
      <div className="page">
        {/* F-08 §6: the Streak badge is on Today and Progress, and Progress links to History. */}
        <StreakBadge />
        <div className="calendar-card">
          <div className="cal-head">
            <Arrow
              dir="prev"
              label="Previous month"
              testId="month-prev"
              disabled={shown === null || state.status === 'loading'}
              onClick={() => shown && void load(shiftMonth(shown, -1))}
            />
            <h3 className="cal-title" data-testid="month-title">
              {shown ? formatMonthYear(`${shown}-01`) : 'This month'}
            </h3>
            <Arrow
              dir="next"
              label="Next month"
              testId="month-next"
              disabled={shown === null || atCurrent || state.status === 'loading'}
              onClick={() => shown && void load(shiftMonth(shown, 1))}
            />
          </div>

          {state.status === 'loading' && (
            <div className="skeleton-rows" data-testid="progress-loading" aria-busy="true">
              <div className="skeleton skeleton-tall" />
              <div className="skeleton skeleton-tall" />
            </div>
          )}

          {state.status === 'error' && (
            <>
              <ErrorNotice>{state.message}</ErrorNotice>
              <button type="button" className="btn btn-secondary" data-testid="progress-retry" onClick={() => void load(month)}>
                Retry
              </button>
            </>
          )}

          {state.status === 'ready' && current && <MonthBody progress={state.progress} today={current.today} onOpen={(d) => void openDay(d)} />}
        </div>
        <p className="progress-history">
          <Link to="/history" data-testid="progress-history-link">
            View your history
          </Link>
        </p>
      </div>

      {drawer.status !== 'closed' && (
        <div className="dialog-backdrop" onClick={closeDrawer}>
          <div
            className="dialog dialog-wide day-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-drawer-title"
            data-testid="day-drawer"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && closeDrawer()}
          >
            <div className="dialog-head">
              <h3 id="day-drawer-title" data-testid="day-drawer-date">
                {formatLongDate(drawer.date)}
              </h3>
              <button type="button" className="btn btn-secondary dialog-close" aria-label="Close" data-testid="day-drawer-close" ref={closeRef} onClick={closeDrawer}>
                ×
              </button>
            </div>
            {drawer.status === 'loading' && <p data-testid="day-drawer-loading">Loading…</p>}
            {drawer.status === 'error' && (
              <>
                <ErrorNotice>{drawer.message}</ErrorNotice>
                <button type="button" className="btn btn-secondary" data-testid="day-drawer-retry" onClick={() => void openDay(drawer.date)}>
                  Retry
                </button>
              </>
            )}
            {drawer.status === 'ready' && <DayDetail daily={drawer.daily} />}
          </div>
        </div>
      )}
    </section>
  )
}

function MonthBody({ progress, today, onOpen }: { progress: MonthlyProgress; today: string; onOpen: (date: string) => void }) {
  const summary = monthSummary(progress)
  const { leading, cells } = monthCells(progress, today)
  return (
    <>
      <div className="overall-card month-card" data-testid="month-card">
        <span className="overall-label">Monthly average (targeted days only)</span>
        {summary.average !== null && (
          <span className="overall-pct month-average" data-testid="month-average">
            {summary.average}
          </span>
        )}
        <p className={summary.average === null ? 'empty-state' : 'overall-score'} data-testid="month-detail">
          {summary.detail}
        </p>
      </div>

      <div className="cal-labels" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <ul className="cal-grid month-grid" data-testid="month-grid">
        {Array.from({ length: leading }, (_, i) => (
          <li key={`blank-${i}`} aria-hidden="true" />
        ))}
        {cells.map((cell) => {
          const selectable = cell.state === 'TARGETED' || cell.state === 'REST'
          const label = cellLabel(cell)
          return (
            <li key={cell.date}>
              <button
                type="button"
                className={`cal-day month-day month-day-${cell.state.toLowerCase()}${cell.date === today ? ' cal-day-today' : ''}`}
                data-testid={`month-day-${cell.date}`}
                data-state={cell.state}
                disabled={!selectable}
                aria-label={`${formatLongDate(cell.date)}: ${cell.state === 'TARGETED' ? label : cell.state === 'REST' ? 'Rest day' : cell.state === 'FUTURE' ? 'not yet' : 'no plan'}`}
                onClick={() => onOpen(cell.date)}
              >
                <span className="month-day-num">{dayOfMonth(cell.date)}</span>
                <span className="month-day-value">{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function DayDetail({ daily }: { daily: DailyProgress }) {
  if (daily.overallPercent === null) {
    return (
      <p className="overall-rest" data-testid="day-drawer-overall">
        Rest day: no goal that day
      </p>
    )
  }
  return (
    <>
      <p className="overall-row">
        <span className="overall-label">Daily progress</span>
        <span className="overall-pct" data-testid="day-drawer-overall">
          {formatPercent(daily.overallPercent)}
        </span>
      </p>
      <p className="overall-score">
        {formatScore(daily.totalScore)} / {formatScore(daily.totalWeight)} points
      </p>
      <ul className="day-drawer-items" data-testid="day-drawer-items">
        {daily.items.map((item) => (
          <li key={item.planItemId} data-testid={`day-drawer-item-${item.userExerciseId}`}>
            <strong>{item.name}</strong>
            <span>
              {formatQuantity(item.actual, item.unit)} of {formatQuantity(item.target, item.unit)} · score {formatScore(item.itemScore)} / {item.priorityWeight}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
