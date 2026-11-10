import { useCallback, useEffect, useRef, useState } from 'react'
import { AddExerciseDialog } from '../components/AddExerciseDialog'
import { ErrorNotice } from '../components/ErrorNotice'
import { MODE_LABEL } from '../lib/library'
import {
  WEEKDAYS,
  formatDateRange,
  formatTarget,
  listPlanItems,
  type PlanEntry,
} from '../lib/plan'

type LoadState = 'loading' | 'ready' | 'error'

export function PlanPage() {
  const [entries, setEntries] = useState<PlanEntry[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToast] = useState('')
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    // Only the latest request may update the page; an older, slower response is ignored.
    const seq = ++loadSeq.current
    setState('loading')
    try {
      const items = await listPlanItems()
      if (seq !== loadSeq.current) return
      setEntries(items)
      setState('ready')
    } catch {
      if (seq !== loadSeq.current) return
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Toasts dismiss themselves.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const closeAdd = useCallback(() => setAddOpen(false), [])

  function onSaved(name: string) {
    setAddOpen(false)
    setToast(`"${name}" added to your plan.`)
    void load()
  }

  return (
    <section className="page plan-page" data-testid="plan-page">
      <div className="library-section-head">
        <h2>My Plan</h2>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)} data-testid="plan-add">
          Add exercise
        </button>
      </div>

      {toast && (
        <p className="toast" role="status" data-testid="plan-toast">
          {toast}
        </p>
      )}

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
          <button type="button" className="btn btn-secondary" onClick={() => void load()} data-testid="plan-retry">
            Retry
          </button>
        </ErrorNotice>
      )}

      {state === 'ready' && entries.length === 0 && (
        <div className="empty-state" data-testid="plan-empty">
          <p>No exercises in your plan yet. Add your first one</p>
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)} data-testid="plan-add-first">
            Add your first one
          </button>
        </div>
      )}

      {state === 'ready' && entries.length > 0 && (
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
      {addOpen && <AddExerciseDialog onClose={closeAdd} onSaved={onSaved} />}
    </section>
  )
}
