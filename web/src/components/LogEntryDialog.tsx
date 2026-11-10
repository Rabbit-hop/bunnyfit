import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ErrorNotice } from './ErrorNotice'
import {
  describeError,
  formatQuantity,
  todayApi,
  type LedgerEntry,
  type Unit,
  type UserExercise,
} from '../lib/today'

type Props = {
  exercise: Pick<UserExercise, 'id' | 'name' | 'unit' | 'rangeMax'>
  /** Server date shown on Today; sent as `logDate` (UI spec §3.5). */
  date: string
  /** Today's cumulative so far, in the exercise unit. */
  actual: number
  /** Planned target in the exercise unit; null on a Rest Day or for an unplanned exercise. */
  target: number | null
  onClose: () => void
  onSaved: (entry: LedgerEntry | null) => void
  /** LOG_DATE_MISMATCH: the page reloads Today (UI spec §3.5). */
  onDateMismatch: () => void
}

const DAILY_CAP: Record<Unit, number> = { reps: 4000, seconds: 10800, km: 100 }

const FIELD_LABEL: Record<string, string> = {
  sets: 'Sets',
  totalReps: 'Reps per set',
  durationSec: 'Duration',
  distanceKm: 'Distance',
}

/** Stricter of the target and the daily cap (F-04 §6), never below zero. */
export function remainingToday(unit: Unit, rangeMax: number, actual: number, target: number | null): number {
  const limit = Math.min(DAILY_CAP[unit], rangeMax, target ?? Infinity)
  return Math.max(0, Math.round((limit - actual) * 100) / 100)
}

const toInt = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN)

export function LogEntryDialog({ exercise, date, actual, target, onClose, onSaved, onDateMismatch }: Props) {
  const { unit } = exercise
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [distance, setDistance] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const noticeRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pending])

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  const setsN = toInt(sets)
  const repsN = toInt(reps)
  const totalSeconds = (minutes.trim() === '' ? 0 : toInt(minutes)) * 60 + (seconds.trim() === '' ? 0 : toInt(seconds))
  const distanceN = /^\d+(\.\d{1,2})?$/.test(distance.trim()) ? Number(distance.trim()) : NaN

  let preview = ''
  if (unit === 'reps' && setsN > 0 && repsN > 0) preview = `Adds ${setsN * repsN} reps (${setsN} x ${repsN})`
  if (unit === 'seconds' && totalSeconds > 0) preview = `Adds ${formatQuantity(totalSeconds, 'seconds')}`
  if (unit === 'km' && distanceN > 0) preview = `Adds ${formatQuantity(distanceN, 'km')}`

  const remaining = remainingToday(unit, exercise.rangeMax, actual, target)

  // The client checks only required, numeric, integer and > 0 (UI spec §3.4); the server owns the limits.
  function validate(): Record<string, string> {
    const errors: Record<string, string> = {}
    if (unit === 'reps') {
      if (!(setsN > 0)) errors.sets = 'Sets: enter a whole number greater than 0.'
      if (!(repsN > 0)) errors.totalReps = 'Reps per set: enter a whole number greater than 0.'
    } else if (unit === 'seconds') {
      if (Number.isNaN(totalSeconds) || totalSeconds <= 0) errors.durationSec = 'Duration: enter minutes and/or seconds greater than 0.'
    } else if (!(distanceN > 0)) {
      errors.distanceKm = 'Distance: enter a number greater than 0 (up to 2 decimals).'
    }
    return errors
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setNotice('')
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const body =
      unit === 'reps'
        ? { sets: setsN, totalReps: setsN * repsN }
        : unit === 'seconds'
          ? { durationSec: totalSeconds }
          : { distanceKm: distanceN }

    setPending(true)
    try {
      const result = await todayApi.createEntry({ userExerciseId: exercise.id, logDate: date, ...body })
      onSaved(result.entry)
    } catch (error) {
      const { code, message, fields } = describeError(error, 'log')
      setPending(false)
      if (code === 'LOG_DATE_MISMATCH') {
        setNotice(message)
        onDateMismatch()
        return
      }
      // Entered values stay in place after a rejected submit (UI spec §3.4).
      const mapped: Record<string, string> = {}
      const formLevel: string[] = []
      for (const f of fields) {
        const text = `${FIELD_LABEL[f.field] ?? f.field}: ${f.limit ?? 'invalid value'}`
        if (f.field in FIELD_LABEL) mapped[f.field] = text
        else formLevel.push(text)
      }
      setFieldErrors(mapped)
      setNotice(Object.keys(mapped).length > 0 && formLevel.length === 0 ? 'Please fix the highlighted fields.' : formLevel[0] ?? message)
    }
  }

  const err = (field: string) =>
    fieldErrors[field] ? (
      <p className="field-error" data-testid={`field-error-${field}`}>
        {fieldErrors[field]}
      </p>
    ) : null

  return (
    <div className="dialog-backdrop" data-testid="log-dialog">
      <form className="dialog log-dialog" role="dialog" aria-modal="true" aria-labelledby="log-title" onSubmit={onSubmit} noValidate>
        <h3 id="log-title">Log activity - {exercise.name}</h3>
        {notice && <ErrorNotice ref={noticeRef}>{notice}</ErrorNotice>}

        {unit === 'reps' && (
          <>
            <div className="field">
              <label htmlFor="log-sets">Sets</label>
              <input id="log-sets" data-testid="log-sets" inputMode="numeric" ref={firstRef} value={sets} onChange={(e) => setSets(e.target.value)} />
              {err('sets')}
            </div>
            <div className="field">
              <label htmlFor="log-reps">Reps per set</label>
              <input id="log-reps" data-testid="log-reps" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
              {err('totalReps')}
            </div>
          </>
        )}

        {unit === 'seconds' && (
          <div className="field">
            <label htmlFor="log-duration-min">Duration</label>
            <div className="duration-inputs">
              <input id="log-duration-min" data-testid="log-duration-min" aria-label="Minutes" placeholder="min" inputMode="numeric" ref={firstRef} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              <input id="log-duration-sec" data-testid="log-duration-sec" aria-label="Seconds" placeholder="sec" inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value)} />
            </div>
            {err('durationSec')}
          </div>
        )}

        {unit === 'km' && (
          <div className="field">
            <label htmlFor="log-distance">Distance (km)</label>
            <input id="log-distance" data-testid="log-distance" inputMode="decimal" ref={firstRef} value={distance} onChange={(e) => setDistance(e.target.value)} />
            {err('distanceKm')}
          </div>
        )}

        <p className="log-preview" data-testid="log-preview" aria-live="polite">
          {preview}
        </p>
        <p className="log-helper" data-testid="log-remaining">
          Remaining today: {formatQuantity(remaining, unit)} ({target == null ? 'daily limit' : 'target or daily limit, whichever is lower'})
        </p>

        <div className="row-actions">
          <button type="button" className="btn btn-secondary" data-testid="log-cancel" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" data-testid="log-save" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
