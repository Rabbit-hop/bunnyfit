import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { LogEntryDialog } from '../components/LogEntryDialog'
import { ModeTile } from '../components/ModeTile'
import { messageForCode } from '../lib/api'
import { WeekRow } from '../components/WeekRow'
import { WeightChip } from '../components/WeightChip'
import {
  KIND_LABEL,
  MODE_LABEL,
  cumulativeValue,
  describeError,
  entryValue,
  formatEntryTime,
  formatLongDate,
  formatPercent,
  formatQuantity,
  formatScore,
  isMockToday,
  todayApi,
  type Cumulative,
  type DailyItem,
  type DailyProgress,
  type LedgerEntry,
  type UserExercise,
} from '../lib/today'

type LoadState = 'loading' | 'ready' | 'error'
type Snapshot = { daily: DailyProgress; entries: LedgerEntry[]; cumulative: Cumulative[]; exercises: UserExercise[] }

type LogTarget = { exercise: UserExercise; entry?: LedgerEntry }

const NOT_AVAILABLE = 'Quick Complete is not available for this exercise today'
// Tapping another day in the week row only explains this; Today has no screen for other days.
const OTHER_DAY = "Only today's activity can be viewed and logged."

type EntryListProps = {
  entries: LedgerEntry[]
  unit: UserExercise['unit']
  scored: boolean
  testId: string
  empty: string
  /** F-05: today's date; only entries of this date show the edit and delete buttons. */
  today: string
  onEdit: (entry: LedgerEntry) => void
  onDelete: (entry: LedgerEntry) => void
}

function EntryList({ entries, unit, scored, testId, empty, today, onEdit, onDelete }: EntryListProps) {
  if (entries.length === 0) return <p className="empty-state" data-testid={testId}>{empty}</p>
  return (
    <ul className="entry-list" data-testid={testId}>
      {entries.map((e) => (
        <li key={e.id}>
          <span>{formatEntryTime(e.createdAt)}</span>
          <span>{formatQuantity(entryValue(e, unit), unit)}</span>
          <span className="badge">{KIND_LABEL[e.kind]}</span>
          {!scored && <span className="badge badge-muted">not scored</span>}
          {e.logDate === today && (
            <span className="entry-actions">
              <button type="button" className="entry-action" data-testid="entry-edit" aria-label="Edit entry" title="Edit" onClick={() => onEdit(e)}>
                Edit
              </button>
              <button type="button" className="entry-action entry-action-danger" data-testid="entry-delete" aria-label="Delete entry" title="Delete" onClick={() => onDelete(e)}>
                Delete
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function TodayPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [toast, setToast] = useState('')
  const [notice, setNotice] = useState('')
  const [cardNotice, setCardNotice] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [entryNotice, setEntryNotice] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const noticeRef = useRef<HTMLDivElement>(null)
  const loadSeq = useRef(0)

  const load = useCallback(async (quiet = false) => {
    // Only the latest request may update the page.
    const seq = ++loadSeq.current
    if (!quiet) setState('loading')
    try {
      const daily = await todayApi.getDaily()
      const [day, exercises] = await Promise.all([todayApi.getEntries(daily.date), todayApi.listUserExercises()])
      if (seq !== loadSeq.current) return
      setSnap({ daily, entries: day.entries, cumulative: day.cumulative, exercises })
      setState('ready')
    } catch {
      if (seq !== loadSeq.current) return
      setState('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  async function quickComplete(userExerciseId: string) {
    if (!snap || busy) return
    setBusy(userExerciseId)
    setCardNotice((n) => ({ ...n, [userExerciseId]: '' }))
    try {
      const result = await todayApi.quickComplete(userExerciseId, snap.daily.date)
      setToast(result.entry ? 'Quick Complete added.' : 'Already completed, nothing added')
      await load(true)
    } catch (error) {
      const { code, message } = describeError(error, 'quick')
      if (code === 'LOG_DATE_MISMATCH') {
        setNotice(message)
        await load(true)
      } else {
        setCardNotice((n) => ({ ...n, [userExerciseId]: message }))
      }
    } finally {
      setBusy(null)
    }
  }

  /** F-05: the server refused (409) or no longer has (404) the entry; say why, change nothing and reload Today. */
  function entryStale(kind: 'not-editable' | 'gone') {
    setEntryNotice(kind === 'gone' ? 'This entry no longer exists.' : messageForCode('ENTRY_NOT_EDITABLE'))
    void load(true)
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await todayApi.deleteEntry(deleteTarget.id)
      setDeleteTarget(null)
      setToast('Entry deleted')
      setEntryNotice('')
      await load(true)
    } catch (error) {
      const { code, message } = describeError(error, 'log')
      setDeleteTarget(null)
      if (code === 'ENTRY_NOT_EDITABLE') entryStale('not-editable')
      else if (code === 'NOT_FOUND') entryStale('gone')
      else setEntryNotice(message)
    } finally {
      setDeleting(false)
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (state === 'loading') {
    return (
      <section className="today-page" data-testid="today-page" aria-busy="true">
        <header className="page-holder">
          <h2>Today</h2>
        </header>
        <div className="page today-panel">
          <div className="skeleton-rows" data-testid="today-skeleton">
            <div className="skeleton skeleton-tall" />
            <div className="skeleton skeleton-tall" />
            <div className="skeleton skeleton-tall" />
          </div>
        </div>
      </section>
    )
  }

  if (state === 'error' || !snap) {
    return (
      <section className="today-page" data-testid="today-page">
        <header className="page-holder">
          <h2>Today</h2>
        </header>
        <div className="page today-panel">
          <ErrorNotice>Something went wrong. Please try again.</ErrorNotice>
          <button type="button" className="btn btn-primary" data-testid="today-retry" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </section>
    )
  }

  const { daily, entries, cumulative, exercises } = snap
  const entriesOf = (id: string) => entries.filter((e) => e.userExerciseId === id)
  const cumOf = (id: string) => cumulative.find((c) => c.userExerciseId === id)
  const exerciseOf = (id: string) => exercises.find((e) => e.id === id)
  const editEntry = (entry: LedgerEntry) => {
    const exercise = exerciseOf(entry.userExerciseId)
    if (exercise) setLogTarget({ exercise, entry })
  }

  function openLog(item: DailyItem) {
    const exercise = exerciseOf(item.userExerciseId)
    if (exercise) setLogTarget({ exercise })
  }

  const firstTime = daily.isRestDay && exercises.length === 0
  // Completed activities (ratio >= 1) live behind the History button; Today lists only what is still open.
  const openItems = daily.items.filter((i) => i.ratio < 1)
  const doneItems = daily.items.filter((i) => i.ratio >= 1)

  const card = (item: DailyItem) => {
    const done = item.ratio >= 1
    const own = entriesOf(item.userExerciseId)
    const open = expanded.has(item.userExerciseId)
    const msg = cardNotice[item.userExerciseId]
    return (
        <li className="item-card" key={item.planItemId} data-testid={`item-${item.userExerciseId}`}>
          <div className="item-top">
            <ModeTile mode={item.trackingMode} />
            <div className="item-main">
              <div className="item-head">
                <strong>{item.name}</strong>
                <span className="badge">{MODE_LABEL[item.trackingMode]}</span>
              </div>
              <p className="item-target">Target {formatQuantity(item.target, item.unit)}</p>
              <p className="item-actual" data-testid="item-actual">
                Logged {formatQuantity(item.actual, item.unit)} of {formatQuantity(item.target, item.unit)} · score {formatScore(item.itemScore)}
              </p>
            </div>
            <span className="badge-p" title={`Priority ${item.priorityWeight}`} aria-label={`Priority ${item.priorityWeight}`}>
              P{item.priorityWeight}
            </span>
          </div>
          <div className="bar bar-mini" role="progressbar" aria-label={`${item.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.ratio * 100)}>
            <div className="bar-fill" style={{ width: `${Math.min(100, item.ratio * 100)}%` }} />
          </div>
          {msg && <ErrorNotice>{msg}</ErrorNotice>}
          <div className="item-actions">
            <button
              type="button"
              className={done ? 'btn pill pill-done' : 'btn btn-primary pill'}
              data-testid="item-quick-complete"
              disabled={busy === item.userExerciseId}
              onClick={() => void quickComplete(item.userExerciseId)}
            >
              {done ? 'Completed' : 'Quick Complete'}
            </button>
            <button type="button" className="btn btn-secondary pill" data-testid="item-log" onClick={() => openLog(item)}>
              Record
            </button>
            <span className="item-pct" data-testid="item-pct">
              {Math.round(item.ratio * 100)}%
            </span>
          </div>
          <button type="button" className="entries-toggle" data-testid="item-entries-toggle" aria-expanded={open} onClick={() => toggle(item.userExerciseId)}>
            Entries
          </button>
          {open && <EntryList entries={own} unit={item.unit} scored testId="item-entries" empty="No entries yet today." today={daily.date} onEdit={editEntry} onDelete={setDeleteTarget} />}
        </li>
    )
  }

  return (
    <section className="today-page" data-testid="today-page">
      <header className="page-holder">
        <h2>Today</h2>
      </header>

      <div className="today-top">
        <p className="today-date" data-testid="today-date" data-date={daily.date}>
          {formatLongDate(daily.date)}
        </p>
        {!isMockToday && <WeightChip />}
        {isMockToday && <p className="mock-banner" data-testid="mock-banner">Showing mock data (not connected to the API).</p>}
        {toast && (
          <p className="toast" role="status" data-testid="today-toast">
            {toast}
          </p>
        )}
        {notice && <ErrorNotice ref={noticeRef}>{notice}</ErrorNotice>}
        {entryNotice && (
          <div data-testid="entry-notice">
            <ErrorNotice>{entryNotice}</ErrorNotice>
          </div>
        )}

        <WeekRow today={daily.date} onOtherDay={() => setToast(OTHER_DAY)} />

        <div className="overall-card" data-testid="overall-card">
          {daily.overallPercent === null ? (
            <p className="overall-rest" data-testid="today-overall-pct">
              Rest day: no goal today
            </p>
          ) : (
            <>
              <div className="overall-row">
                <span className="overall-label">Today&apos;s progress</span>
                <span className="overall-pct" data-testid="today-overall-pct">
                  {formatPercent(daily.overallPercent)}
                </span>
              </div>
              <div className="bar" role="progressbar" aria-label="Overall progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(daily.overallPercent)}>
                <div className="bar-fill" style={{ width: `${Math.min(100, daily.overallPercent)}%` }} />
              </div>
              <p className="overall-score" data-testid="today-overall-score">
                {formatScore(daily.totalScore)} / {formatScore(daily.totalWeight)} points
              </p>
            </>
          )}
        </div>

      </div>

      <div className="page today-panel">
      {firstTime && (
        <div className="empty-card" data-testid="first-time">
          <p className="empty-state">Add an exercise to your plan first</p>
          <Link className="btn btn-primary" to="/plan" data-testid="first-time-link">
            Go to My Plan
          </Link>
        </div>
      )}

      {daily.isRestDay && !firstTime && (
        <div data-testid="rest-day">
          <p className="rest-banner" role="status" data-testid="rest-day-banner">
            Rest day: log anything you did
          </p>
          <p className="muted">Entries made today are saved but not scored.</p>
          <ul className="item-list" data-testid="rest-day-picker">
            {exercises.map((exercise) => (
              <li className="item-card" key={exercise.id} data-testid={`rest-${exercise.id}`}>
                <div className="item-top">
                  <ModeTile mode={exercise.trackingMode} />
                  <div className="item-main">
                    <div className="item-head">
                      <strong>{exercise.name}</strong>
                      <span className="badge">{MODE_LABEL[exercise.trackingMode]}</span>
                    </div>
                  </div>
                </div>
                <div className="item-actions">
                  <button type="button" className="btn btn-secondary pill" data-testid="rest-day-quick-complete" disabled aria-describedby={`why-${exercise.id}`}>
                    Quick Complete
                  </button>
                  <button type="button" className="btn btn-primary pill" data-testid="rest-day-log" onClick={() => setLogTarget({ exercise })}>
                    Record
                  </button>
                  <button type="button" className="entries-toggle" data-testid="rest-day-entries-toggle" aria-expanded={expanded.has(exercise.id)} onClick={() => toggle(exercise.id)}>
                    Entries
                  </button>
                </div>
                <p className="muted" id={`why-${exercise.id}`}>
                  {NOT_AVAILABLE}
                </p>
                {expanded.has(exercise.id) && <EntryList entries={entriesOf(exercise.id)} unit={exercise.unit} scored={false} testId="rest-day-entries" empty="No entries yet today." today={daily.date} onEdit={editEntry} onDelete={setDeleteTarget} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!daily.isRestDay && (
        <>
          <div className="panel-head">
            <h3 className="panel-title">{showHistory ? 'History' : "Today's activities"}</h3>
            <button type="button" className="btn btn-secondary pill" data-testid="history-toggle" aria-pressed={showHistory} onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? 'Back' : doneItems.length > 0 ? `History (${doneItems.length})` : 'History'}
            </button>
          </div>
          {showHistory ? (
            doneItems.length > 0 ? (
              <ul className="item-list" data-testid="history-list">
                {doneItems.map(card)}
              </ul>
            ) : (
              <p className="empty-state" data-testid="history-empty">
                Nothing completed yet today.
              </p>
            )
          ) : openItems.length > 0 ? (
            <ul className="item-list" data-testid="open-list">
              {openItems.map(card)}
            </ul>
          ) : (
            <p className="empty-state" data-testid="all-done">
              All activities are done for today. Completed ones are in History.
            </p>
          )}
        </>
      )}
      </div>

      {logTarget && (
        <LogEntryDialog
          exercise={logTarget.exercise}
          date={daily.date}
          actual={cumulativeValue(cumOf(logTarget.exercise.id), logTarget.exercise.unit)}
          entry={logTarget.entry}
          onClose={() => setLogTarget(null)}
          onSaved={() => {
            const wasEdit = logTarget.entry !== undefined
            setLogTarget(null)
            setEntryNotice('')
            setToast(wasEdit ? 'Entry updated' : 'Activity logged.')
            void load(true)
          }}
          onStale={(kind) => {
            setLogTarget(null)
            entryStale(kind)
          }}
          onDateMismatch={() => {
            setLogTarget(null)
            setNotice('This entry is not for today. Please reload the page.')
            void load(true)
          }}
        />
      )}
      {deleteTarget && (
        <div className="dialog-backdrop" data-testid="entry-delete-dialog">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="entry-delete-title">
            <h3 id="entry-delete-title">Delete this entry?</h3>
            <div className="row-actions">
              <button type="button" className="btn btn-secondary" data-testid="entry-delete-cancel" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" data-testid="entry-delete-confirm" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
