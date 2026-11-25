import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorNotice } from '../components/ErrorNotice'
import { StreakBadge } from '../components/StreakBadge'
import { addDays } from '../lib/dates'
import {
  dayStatus,
  describeHistoryError,
  formatHistoryValue,
  getHistory,
  type HistoryDay,
} from '../lib/history'
import { KIND_LABEL, formatEntryTime, formatLongDate, formatPercent } from '../lib/today'
import { getPlan } from '../lib/plan'

type LoadState = 'loading' | 'ready' | 'error'
type Range = { from?: string; to?: string }

/** S-11 History (F-08 §6): newest first, default 30 days, a range control and the streak badge. */
export function HistoryPage() {
  const [today, setToday] = useState('')
  const [range, setRange] = useState<Range>({})
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [days, setDays] = useState<HistoryDay[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const loadSeq = useRef(0)

  // "Today" is the server date (UI spec §3.5); the history response carries `to` (today by default).
  useEffect(() => {
    const seq = ++loadSeq.current
    setState('loading')
    Promise.all([getPlan(), getHistory(range)])
      .then(([plan, hist]) => {
        if (seq !== loadSeq.current) return
        if (!plan || !hist) throw new Error('empty response')
        setToday(plan.date)
        setDays(hist.days)
        setFromInput(hist.from)
        setToInput(hist.to)
        setFieldErrors({})
        setFormError('')
        setState('ready')
      })
      .catch((error) => {
        if (seq !== loadSeq.current) return
        const { message, fields } = describeHistoryError(error)
        if (fields.length > 0) {
          // 400: show the limit under From / To and keep the previous list (UI spec §3.4).
          setFieldErrors(Object.fromEntries(fields.map((f) => [f.field, f.limit ? `${f.field}: ${f.limit}` : f.field])))
          setFormError('')
          setState('ready')
        } else {
          setFormError(message)
          setState('error')
        }
      })
  }, [range, reloadKey])

  const chooseDays = useCallback(
    (n: number) => {
      if (today) setRange({ from: addDays(today, -(n - 1)), to: today })
      else setRange({})
    },
    [today],
  )

  const hasActivity = days.some((d) => d.entries.length > 0 || !d.isRestDay)

  return (
    <section className="history-page" data-testid="history-page">
      <header className="page-holder">
        <h2>History</h2>
      </header>
      <StreakBadge refreshKey={reloadKey} />

      <div className="history-range" data-testid="history-range">
        <div className="priority-row">
          <button type="button" className="btn btn-secondary" onClick={() => chooseDays(7)} data-testid="history-range-7">
            Last 7 days
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => chooseDays(30)} data-testid="history-range-30">
            Last 30 days
          </button>
        </div>
        <form
          className="field-row"
          onSubmit={(e) => {
            e.preventDefault()
            setRange({ ...(fromInput ? { from: fromInput } : {}), ...(toInput ? { to: toInput } : {}) })
          }}
        >
          <div className="field">
            <label htmlFor="history-from">From</label>
            <input id="history-from" type="date" max={today || undefined} value={fromInput} onChange={(e) => setFromInput(e.target.value)} data-testid="history-from" />
            {fieldErrors.from && <p className="field-error" data-testid="field-error-from">{fieldErrors.from}</p>}
          </div>
          <div className="field">
            <label htmlFor="history-to">To</label>
            <input id="history-to" type="date" max={today || undefined} value={toInput} onChange={(e) => setToInput(e.target.value)} data-testid="history-to" />
            {fieldErrors.to && <p className="field-error" data-testid="field-error-to">{fieldErrors.to}</p>}
          </div>
          <button type="submit" className="btn btn-primary" data-testid="history-apply">
            Show
          </button>
        </form>
      </div>

      {state === 'loading' && (
        <div className="skeleton-rows" data-testid="history-loading" aria-busy="true">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}
      {state === 'error' && (
        <ErrorNotice>
          {formError || 'Something went wrong. Please try again.'}{' '}
          <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)} data-testid="history-retry">
            Retry
          </button>
        </ErrorNotice>
      )}

      {state === 'ready' && !hasActivity && <p className="empty-state" data-testid="history-empty">No activity in this range.</p>}
      {state === 'ready' && (
        <ul className="history-list" data-testid="history-days">
          {days.map((d) => {
            const status = dayStatus(d, today)
            const expanded = open === d.date
            return (
              <li key={d.date} className="history-day" data-testid={`history-day-${d.date}`}>
                <button type="button" className="history-day-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : d.date)}>
                  <span>{formatLongDate(d.date)}</span>
                  <span data-testid="history-day-percent">{d.overallPercent === null ? 'Rest day' : formatPercent(d.overallPercent)}</span>
                  {status && <span className="plan-meta" data-testid="history-day-status">{status}</span>}
                </button>
                {expanded && (
                  <ul className="entry-list" data-testid="history-entries">
                    {d.entries.length === 0 && <li className="plan-meta">No entries.</li>}
                    {d.entries.map((e) => (
                      <li key={e.id}>
                        <span>{formatEntryTime(e.createdAt)}</span>
                        <span>{e.exerciseName}</span>
                        <span>{formatHistoryValue(e)}</span>
                        <span className="badge">{KIND_LABEL[e.kind]}</span>
                        {!e.scored && <span className="badge badge-muted">not scored</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
