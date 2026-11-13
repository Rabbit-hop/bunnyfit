import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { LogEntryDialog } from '../components/LogEntryDialog'
import { ModeTile } from '../components/ModeTile'
import { WeekRow } from '../components/WeekRow'
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

type LogTarget = { exercise: UserExercise }

const NOT_AVAILABLE = 'Quick Complete is not available for this exercise today'

function EntryList({ entries, unit, scored, testId, empty }: { entries: LedgerEntry[]; unit: UserExercise['unit']; scored: boolean; testId: string; empty: string }) {
  if (entries.length === 0) return <p className="empty-state" data-testid={testId}>{empty}</p>
  return (
    <ul className="entry-list" data-testid={testId}>
      {entries.map((e) => (
        <li key={e.id}>
          <span>{formatEntryTime(e.createdAt)}</span>
          <span>{formatQuantity(entryValue(e, unit), unit)}</span>
          <span className="badge">{KIND_LABEL[e.kind]}</span>
          {!scored && <span className="badge badge-muted">not scored</span>}
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
  // '' = today (the live, loggable view); otherwise a past day opened from the week row (read-only).
  const [viewDate, setViewDate] = useState('')
  const [todayDate, setTodayDate] = useState('')
  const noticeRef = useRef<HTMLDivElement>(null)
  const loadSeq = useRef(0)

  const load = useCallback(async (quiet = false) => {
    // Only the latest request may update the page.
    const seq = ++loadSeq.current
    if (!quiet) setState('loading')
    try {
      const daily = await todayApi.getDaily(viewDate || undefined)
      if (!viewDate) setTodayDate(daily.date)
      const [day, exercises] = await Promise.all([todayApi.getEntries(daily.date), todayApi.listUserExercises()])
      if (seq !== loadSeq.current) return
      setSnap({ daily, entries: day.entries, cumulative: day.cumulative, exercises })
      setState('ready')
    } catch {
      if (seq !== loadSeq.current) return
      setState('error')
    }
  }, [viewDate])

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

  function selectDay(iso: string) {
    setViewDate(iso === todayDate ? '' : iso)
    setExpanded(new Set())
    setToast('')
    setNotice('')
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
          <h2>{viewDate ? 'Past day' : 'Today'}</h2>
        </header>
        {todayDate && <WeekRow today={todayDate} selected={viewDate || todayDate} onSelect={selectDay} />}
        <div className="skeleton-rows" data-testid="today-skeleton">
          <div className="skeleton skeleton-tall" />
          <div className="skeleton skeleton-tall" />
          <div className="skeleton skeleton-tall" />
        </div>
      </section>
    )
  }

  if (state === 'error' || !snap) {
    return (
      <section className="today-page" data-testid="today-page">
        <header className="page-holder">
          <h2>{viewDate ? 'Past day' : 'Today'}</h2>
        </header>
        {/* The week row stays so a failed past day is never a dead end: pick another day or go back to today. */}
        {todayDate && <WeekRow today={todayDate} selected={viewDate || todayDate} onSelect={selectDay} />}
        <ErrorNotice>Something went wrong. Please try again.</ErrorNotice>
        <button type="button" className="btn btn-primary" data-testid="today-retry" onClick={() => void load()}>
          Retry
        </button>
      </section>
    )
  }

  const { daily, entries, cumulative, exercises } = snap
  const entriesOf = (id: string) => entries.filter((e) => e.userExerciseId === id)
  const cumOf = (id: string) => cumulative.find((c) => c.userExerciseId === id)
  const exerciseOf = (id: string) => exercises.find((e) => e.id === id)

  function openLog(item: DailyItem) {
    const exercise = exerciseOf(item.userExerciseId)
    if (exercise) setLogTarget({ exercise })
  }

  const readOnly = viewDate !== ''
  const firstTime = !readOnly && daily.isRestDay && exercises.length === 0

  return (
    <section className="today-page" data-testid="today-page">
      <header className="page-holder">
        <h2>{readOnly ? 'Past day' : 'Today'}</h2>
        <p className="today-date" data-testid="today-date" data-date={daily.date}>
          {formatLongDate(daily.date)}
        </p>
      </header>
      {isMockToday && <p className="mock-banner" data-testid="mock-banner">Showing mock data (not connected to the API).</p>}

      {toast && (
        <p className="toast" role="status" data-testid="today-toast">
          {toast}
        </p>
      )}
      {notice && <ErrorNotice ref={noticeRef}>{notice}</ErrorNotice>}

      <WeekRow today={todayDate || daily.date} selected={daily.date} onSelect={selectDay} />

      {readOnly && (
        <div className="view-only" data-testid="today-readonly">
          <p>Viewing a past day: view only. Logging is for today.</p>
          <button type="button" className="btn btn-secondary pill" data-testid="today-back" onClick={() => selectDay(todayDate)}>
            Back to today
          </button>
        </div>
      )}

      <div className="overall-card" data-testid="overall-card">
        {daily.overallPercent === null ? (
          <p className="overall-rest" data-testid="today-overall-pct">
            {readOnly ? 'Rest day: no goal that day' : 'Rest day: no goal today'}
          </p>
        ) : (
          <>
            <div className="overall-row">
              <span className="overall-label">{readOnly ? 'Progress that day' : "Today's progress"}</span>
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

      {firstTime && (
        <div className="empty-card" data-testid="first-time">
          <p className="empty-state">Add an exercise to your plan first</p>
          <Link className="btn btn-primary" to="/plan" data-testid="first-time-link">
            Go to My Plan
          </Link>
        </div>
      )}

      {daily.isRestDay && !firstTime && !readOnly && (
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
                    Log
                  </button>
                  <button type="button" className="entries-toggle" data-testid="rest-day-entries-toggle" aria-expanded={expanded.has(exercise.id)} onClick={() => toggle(exercise.id)}>
                    Entries
                  </button>
                </div>
                <p className="muted" id={`why-${exercise.id}`}>
                  {NOT_AVAILABLE}
                </p>
                {expanded.has(exercise.id) && <EntryList entries={entriesOf(exercise.id)} unit={exercise.unit} scored={false} testId="rest-day-entries" empty="No entries yet today." />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!daily.isRestDay && (
        <ul className="item-list">
          {daily.items.map((item) => {
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
                  {!readOnly && (
                    <>
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
                        Log
                      </button>
                    </>
                  )}
                  <span className="item-pct" data-testid="item-pct">
                    {Math.round(item.ratio * 100)}%
                  </span>
                </div>
                <button type="button" className="entries-toggle" data-testid="item-entries-toggle" aria-expanded={open} onClick={() => toggle(item.userExerciseId)}>
                  Entries
                </button>
                {open && <EntryList entries={own} unit={item.unit} scored testId="item-entries" empty={readOnly ? 'No entries that day.' : 'No entries yet today.'} />}
              </li>
            )
          })}
        </ul>
      )}

      {logTarget && (
        <LogEntryDialog
          exercise={logTarget.exercise}
          date={daily.date}
          actual={cumulativeValue(cumOf(logTarget.exercise.id), logTarget.exercise.unit)}
          onClose={() => setLogTarget(null)}
          onSaved={() => {
            setLogTarget(null)
            setToast('Activity logged.')
            void load(true)
          }}
          onDateMismatch={() => {
            setLogTarget(null)
            setNotice('This entry is not for today. Please reload the page.')
            void load(true)
          }}
        />
      )}
    </section>
  )
}
