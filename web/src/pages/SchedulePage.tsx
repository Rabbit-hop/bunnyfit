import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { ReminderList } from '../components/ReminderList'
import { addDays, addMonths, formatLongDay, formatMonthYear } from '../lib/dates'
import { formatDay, WEEKDAYS } from '../lib/plan'
import {
  describeReminderError,
  remindersApi,
  type Reminder,
  type ReminderInput,
  type Schedule,
  type ScheduleView,
} from '../lib/reminders'

type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }

const EMPTY_FORM: ReminderInput = { timeOfDay: '07:00', label: '', repeatDays: [1, 2, 3, 4, 5, 6, 7], enabled: true }
const FORM_FIELDS = ['timeOfDay', 'label', 'repeatDays', 'enabled'] as const

/**
 * F-09 §6 Schedule & reminders: the week/month schedule derived on the server from the plan versions
 * (Rest Day = nothing planned) and the reminder settings (list, add, edit, On/Off, delete). Reminders are
 * display only; the notice in ReminderList says so.
 */
export function SchedulePage() {
  const [view, setView] = useState<ScheduleView>('week')
  const [anchor, setAnchor] = useState<string | undefined>(undefined)
  const [schedule, setSchedule] = useState<Load<Schedule>>({ status: 'loading' })
  const [reminders, setReminders] = useState<Load<Reminder[]>>({ status: 'loading' })
  const [form, setForm] = useState<ReminderInput>(EMPTY_FORM)
  const [editing, setEditing] = useState<Reminder | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [pending, setPending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  // Only the latest schedule request may update the screen: a slow earlier response (for example the first
  // load, still in flight when the user presses "next") must not overwrite a newer week or month.
  const latestRequest = useRef(0)
  // `${view}|${date}` of the schedule on screen, so setting the anchor from the first response does not refetch.
  const shownKey = useRef('')

  const loadSchedule = useCallback(async (v: ScheduleView, date?: string) => {
    const id = ++latestRequest.current
    setSchedule({ status: 'loading' })
    try {
      const data = await remindersApi.schedule(v, date)
      if (id !== latestRequest.current) return
      shownKey.current = `${v}|${date ?? data.today}`
      setSchedule({ status: 'ready', data })
      setAnchor((current) => current ?? data.today)
    } catch (error) {
      if (id !== latestRequest.current) return
      setSchedule({ status: 'error', message: describeReminderError(error).message })
    }
  }, [])

  const loadReminders = useCallback(async () => {
    try {
      setReminders({ status: 'ready', data: await remindersApi.list() })
    } catch (error) {
      setReminders({ status: 'error', message: describeReminderError(error).message })
    }
  }, [])

  // The first load has no date (the server's Bangkok today); afterwards the arrows and the toggle change
  // `anchor` / `view` and this effect fetches the new range.
  useEffect(() => {
    if (anchor !== undefined && shownKey.current === `${view}|${anchor}`) return
    void loadSchedule(view, anchor)
  }, [view, anchor, loadSchedule])

  useEffect(() => {
    void loadReminders()
  }, [loadReminders])

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  function step(n: number) {
    if (!anchor) return
    setAnchor(view === 'week' ? addDays(anchor, 7 * n) : addMonths(anchor, n))
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setNotice('')
    setFormOpen(true)
  }

  function openEdit(r: Reminder) {
    setEditing(r)
    setForm({ timeOfDay: r.timeOfDay, label: r.label, repeatDays: r.repeatDays, enabled: r.enabled })
    setFieldErrors({})
    setNotice('')
    setFormOpen(true)
  }

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      repeatDays: f.repeatDays.includes(day) ? f.repeatDays.filter((d) => d !== day) : [...f.repeatDays, day].sort((a, b) => a - b),
    }))
  }

  function showError(error: unknown) {
    const { fields, message } = describeReminderError(error)
    const own = fields.filter((f) => (FORM_FIELDS as readonly string[]).includes(f.field))
    if (own.length > 0) {
      setFieldErrors(Object.fromEntries(own.map((f) => [f.field, f.limit ?? 'invalid value'])))
      setNotice('Please fix the highlighted fields.')
    } else {
      setNotice(message)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldErrors({})
    setNotice('')
    setPending(true)
    try {
      if (editing) {
        await remindersApi.update(editing.id, form)
        setToast('Reminder updated')
      } else {
        await remindersApi.create(form)
        setToast('Reminder added')
      }
      setFormOpen(false)
      setEditing(null)
      await loadReminders()
    } catch (error) {
      // The typed values stay in the form after a rejected save.
      showError(error)
    } finally {
      setPending(false)
    }
  }

  async function onToggle(r: Reminder) {
    setBusyId(r.id)
    setNotice('')
    try {
      await remindersApi.update(r.id, { enabled: !r.enabled })
      await loadReminders()
    } catch (error) {
      showError(error)
    } finally {
      setBusyId(null)
    }
  }

  async function onDelete(r: Reminder) {
    if (!window.confirm(`Delete the reminder "${r.label}"?`)) return
    setBusyId(r.id)
    setNotice('')
    try {
      await remindersApi.remove(r.id)
      setToast('Reminder deleted')
      if (editing?.id === r.id) setFormOpen(false)
      await loadReminders()
    } catch (error) {
      showError(error)
    } finally {
      setBusyId(null)
    }
  }

  const title =
    schedule.status === 'ready'
      ? view === 'week'
        ? `${formatDay(schedule.data.from)} – ${formatDay(schedule.data.to)}`
        : formatMonthYear(schedule.data.from)
      : ''

  return (
    <section className="schedule-page" data-testid="schedule-page">
      <header className="page-holder">
        <h2>Schedule &amp; reminders</h2>
        <Link to="/plan" className="btn btn-secondary" data-testid="schedule-back">
          Back to My Plan
        </Link>
      </header>

      <div className="page schedule-panel">
        <div className="schedule-head">
          <div className="cal-toggle" role="group" aria-label="Schedule view">
            {(['week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? 'cal-toggle-on' : undefined}
                aria-pressed={view === v}
                data-testid={`schedule-view-${v}`}
                onClick={() => setView(v)}
              >
                {v === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <div className="schedule-nav">
            <button type="button" className="cal-arrow" aria-label="Previous" data-testid="schedule-prev" onClick={() => step(-1)}>
              ‹
            </button>
            <span className="cal-title" data-testid="schedule-title">
              {title}
            </span>
            <button type="button" className="cal-arrow" aria-label="Next" data-testid="schedule-next" onClick={() => step(1)}>
              ›
            </button>
          </div>
        </div>

        {schedule.status === 'loading' && <p data-testid="schedule-loading">Loading…</p>}
        {schedule.status === 'error' && <ErrorNotice>{schedule.message}</ErrorNotice>}
        {schedule.status === 'ready' && (
          <ul className="schedule-days" data-testid="schedule-days">
            {schedule.data.days.map((d) => (
              <li
                key={d.date}
                className={d.date === schedule.data.today ? 'schedule-day schedule-today' : 'schedule-day'}
                data-testid="schedule-day"
                data-date={d.date}
                data-rest={d.isRestDay ? 'true' : 'false'}
              >
                <span className="schedule-date">
                  {formatLongDay(d.date)}
                  {d.date === schedule.data.today && <span className="badge badge-muted"> Today</span>}
                </span>
                <span className="schedule-items">
                  {d.isRestDay ? (
                    <span className="muted" data-testid="schedule-rest">
                      Rest day
                    </span>
                  ) : (
                    d.items.map((i) => i.name).join(', ')
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="page reminder-panel" data-testid="reminder-panel">
        <div className="panel-head">
          <h3 className="panel-title">Reminders</h3>
          {!formOpen && (
            <button type="button" className="btn btn-primary" data-testid="reminder-add" onClick={openAdd}>
              Add reminder
            </button>
          )}
        </div>
        {toast && (
          <p className="toast" role="status" data-testid="reminder-toast">
            {toast}
          </p>
        )}
        {notice && <ErrorNotice ref={noticeRef}>{notice}</ErrorNotice>}

        {formOpen && (
          <form className="reminder-form" onSubmit={onSubmit} noValidate data-testid="reminder-form">
            <div className="field">
              <label htmlFor="reminder-time">Time</label>
              <input
                id="reminder-time"
                type="time"
                data-testid="reminder-time-input"
                value={form.timeOfDay}
                onChange={(e) => setForm((f) => ({ ...f, timeOfDay: e.target.value }))}
              />
              {fieldErrors['timeOfDay'] && (
                <p className="field-error" data-testid="field-error-timeOfDay">
                  Time: {fieldErrors['timeOfDay']}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="reminder-label">Label</label>
              <input
                id="reminder-label"
                data-testid="reminder-label-input"
                maxLength={60}
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
              {fieldErrors['label'] && (
                <p className="field-error" data-testid="field-error-label">
                  Label: {fieldErrors['label']}
                </p>
              )}
            </div>
            <fieldset className="field">
              <legend>Repeat on</legend>
              <div className="day-chips">
                {WEEKDAYS.map(({ day, short }) => (
                  <button
                    key={day}
                    type="button"
                    className={form.repeatDays.includes(day) ? 'day-chip day-chip-on' : 'day-chip'}
                    aria-pressed={form.repeatDays.includes(day)}
                    data-testid={`reminder-day-${day}`}
                    onClick={() => toggleDay(day)}
                  >
                    {short}
                  </button>
                ))}
              </div>
              {fieldErrors['repeatDays'] && (
                <p className="field-error" data-testid="field-error-repeatDays">
                  Repeat on: {fieldErrors['repeatDays']}
                </p>
              )}
            </fieldset>
            <label className="input-toggle">
              <input
                type="checkbox"
                data-testid="reminder-enabled-input"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />{' '}
              On
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" data-testid="reminder-cancel" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" data-testid="reminder-save" disabled={pending}>
                {pending ? 'Saving…' : editing ? 'Save changes' : 'Save reminder'}
              </button>
            </div>
          </form>
        )}

        {reminders.status === 'loading' && <p data-testid="reminder-loading">Loading…</p>}
        {reminders.status === 'error' && <ErrorNotice>{reminders.message}</ErrorNotice>}
        {reminders.status === 'ready' && (
          <ReminderList reminders={reminders.data} onEdit={openEdit} onDelete={(r) => void onDelete(r)} onToggle={(r) => void onToggle(r)} busyId={busyId} />
        )}
      </div>
    </section>
  )
}
