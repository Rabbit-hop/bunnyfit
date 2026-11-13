import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AddExerciseDialog } from '../components/AddExerciseDialog'
import { CalendarCard, type CalendarMode } from '../components/CalendarCard'
import { ErrorNotice } from '../components/ErrorNotice'
import { formatLongDay, isoWeekday } from '../lib/dates'
import { MODE_LABEL } from '../lib/library'
import {
  WEEKDAYS,
  formatDateRange,
  formatTarget,
  getPlan,
  itemsOn,
  listPlanItems,
  type PlanEntry,
} from '../lib/plan'

type LoadState = 'loading' | 'ready' | 'error'

export function PlanPage() {
  const [today, setToday] = useState('')
  const [selected, setSelected] = useState('')
  const [mode, setMode] = useState<CalendarMode>('month')
  const [all, setAll] = useState<PlanEntry[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [params, setParams] = useSearchParams()
  const loadSeq = useRef(0)

  // The bottom bar's "+" links to /plan?add=1.
  useEffect(() => {
    if (params.get('add') === '1') {
      setAddOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  // "Today" is the server's (GET /api/plan without a date); the UI never reads the browser clock.
  // The whole plan comes from one GET /api/plan-items, so a month can be drawn without a request per day.
  useEffect(() => {
    // Only the latest request may update the page; an older, slower response is ignored.
    const seq = ++loadSeq.current
    setState('loading')
    Promise.all([getPlan(), listPlanItems()])
      .then(([plan, items]) => {
        if (seq !== loadSeq.current) return
        if (!plan) throw new Error('empty plan response')
        setToday(plan.date)
        setSelected((current) => current || plan.date)
        setAll(items)
        setState('ready')
      })
      .catch(() => {
        if (seq !== loadSeq.current) return
        setState('error')
      })
  }, [reloadKey])

  // Toasts dismiss themselves.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const closeAdd = useCallback(() => setAddOpen(false), [])

  function onSaved(name: string, effectiveFrom?: string) {
    setAddOpen(false)
    setToast(`"${name}" added to your plan.`)
    // Show the day the new item starts on; the reload also covers the same-day case.
    if (effectiveFrom) setSelected(effectiveFrom)
    setReloadKey((k) => k + 1)
  }

  // The calendar asks about up to 42 dates per render; answer each date once per plan load.
  const hasPlan = useMemo(() => {
    const cache = new Map<string, boolean>()
    return (iso: string) => {
      let planned = cache.get(iso)
      if (planned === undefined) {
        planned = itemsOn(all, iso, isoWeekday(iso)).length > 0
        cache.set(iso, planned)
      }
      return planned
    }
  }, [all])
  const entries = selected ? itemsOn(all, selected, isoWeekday(selected)) : []
  const ready = state === 'ready' && selected !== ''

  return (
    <section className="plan-page" data-testid="plan-page">
      <header className="page-holder">
        <h2>My Plan</h2>
      </header>

      {selected && (
        <CalendarCard
          mode={mode}
          selected={selected}
          today={today}
          hasPlan={hasPlan}
          onModeChange={setMode}
          onSelect={setSelected}
        />
      )}

      <div className="day-summary" data-testid="day-summary">
        <div>
          <p className="day-summary-date" data-testid="day-summary-date">
            {selected ? formatLongDay(selected) : ' '}
          </p>
          <p className="day-summary-count" data-testid="day-summary-count">
            {ready ? (entries.length === 0 ? 'Rest Day' : `${entries.length} ${entries.length === 1 ? 'exercise' : 'exercises'} planned`) : ' '}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)} data-testid="plan-add">
          Add exercise
        </button>
      </div>

      {toast && (
        <p className="toast" role="status" data-testid="plan-toast">
          {toast}
        </p>
      )}

      <div className="day-panel">
        {state === 'loading' && (
          <div className="skeleton-rows" data-testid="plan-loading" aria-busy="true">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {state === 'error' && (
          <ErrorNotice>
            Something went wrong. Please try again.{' '}
            <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)} data-testid="plan-retry">
              Retry
            </button>
          </ErrorNotice>
        )}

        {ready && entries.length === 0 && (
          <div className="empty-state" data-testid="plan-empty">
            <p>
              {all.length === 0
                ? 'No exercises in your plan yet. Add your first one'
                : 'Rest Day: nothing is planned for this date.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)} data-testid="plan-add-first">
              {all.length === 0 ? 'Add your first one' : 'Add exercise'}
            </button>
          </div>
        )}

        {ready && entries.length > 0 && (
          <ul className="plan-list" data-testid="plan-list">
            {entries.map(({ planItem, userExercise }) => (
              <li key={planItem.id} className="plan-card" data-testid={`plan-item-${planItem.id}`}>
                <div className="plan-card-head">
                  <h3>{userExercise.name}</h3>
                  <span className="plan-priority" data-testid={`plan-priority-${planItem.id}`}>
                    Priority {planItem.priorityWeight}
                  </span>
                </div>
                <p className="plan-meta">
                  {MODE_LABEL[userExercise.trackingMode]} · {userExercise.targetBodyPart}
                </p>
                <p className="plan-target" data-testid={`plan-target-${planItem.id}`}>
                  {formatTarget(planItem)}
                </p>
                <ul className="day-chips" aria-label="Repeat days">
                  {WEEKDAYS.map(({ day, short }) => (
                    <li
                      key={day}
                      className={planItem.repeatDays.includes(day) ? 'day-chip day-chip-on' : 'day-chip'}
                      aria-label={`${short} ${planItem.repeatDays.includes(day) ? 'on' : 'off'}`}
                    >
                      {short.charAt(0)}
                    </li>
                  ))}
                </ul>
                <p className="plan-meta">{formatDateRange(planItem)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      {addOpen && <AddExerciseDialog onClose={closeAdd} onSaved={onSaved} />}
    </section>
  )
}
