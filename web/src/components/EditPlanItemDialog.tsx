import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MODE_LABEL, describeError } from '../lib/library'
import { WEEKDAYS, formatDay, updatePlanItem, type PlanEntry, type UpdatePlanItemInput } from '../lib/plan'

// F-07 §6: Edit and End on My Plan. Both start from the LATEST version of the item (the parent passes it)
// and both end in PUT /api/plan-items/:id, which inserts a new version that applies from today.

const ID_MESSAGES = {
  ended: 'This exercise has ended and can no longer be changed.',
  notStarted: (date: string) => `This exercise starts on ${date}. You can change it from that day.`,
}

/** 400 with field `id`: the item cannot be edited (R10); the message depends on what the client knows. */
function idMessage(latest: { effectiveFrom: string; endDate: string | null }, today: string): string {
  return latest.endDate !== null && latest.endDate < today ? ID_MESSAGES.ended : ID_MESSAGES.notStarted(formatDay(latest.effectiveFrom))
}

function positive(value: string, integer: boolean): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  if (integer && !Number.isInteger(n)) return null
  return n
}

type CommonProps = { entry: PlanEntry; today: string; onClose: () => void; onSaved: (message: string) => void }

function useDialogChrome(onEscape: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escapeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return ref
}

export function EditPlanItemDialog({ entry, today, onClose, onSaved }: CommonProps) {
  const { planItem: latest, userExercise: exercise } = entry
  const mode = exercise.trackingMode
  const hasReps = mode === 'WEIGHT' || mode === 'BODYWEIGHT_REPS'
  const hasLoad = mode === 'WEIGHT'
  const hasDuration = mode === 'BODYWEIGHT_TIME' || mode === 'YOGA' || mode === 'CARDIO_TIME'
  const hasDistance = mode === 'CARDIO_DISTANCE'

  const initial = {
    sets: latest.targetSets === null ? '' : String(latest.targetSets),
    reps: latest.targetRepsPerSet === null ? '' : String(latest.targetRepsPerSet),
    load: latest.loadKg === null ? '' : String(latest.loadKg),
    durMin: latest.targetDurationSec === null ? '' : String(Math.floor(latest.targetDurationSec / 60)),
    durSec: latest.targetDurationSec === null ? '' : String(latest.targetDurationSec % 60),
    distance: latest.targetDistanceKm === null ? '' : String(latest.targetDistanceKm),
    endDate: latest.endDate ?? '',
  }
  const [sets, setSets] = useState(initial.sets)
  const [reps, setReps] = useState(initial.reps)
  const [load, setLoad] = useState(initial.load)
  const [durMin, setDurMin] = useState(initial.durMin)
  const [durSec, setDurSec] = useState(initial.durSec)
  const [distance, setDistance] = useState(initial.distance)
  const [priority, setPriority] = useState(latest.priorityWeight)
  const [days, setDays] = useState<number[]>([...latest.repeatDays].sort((a, b) => a - b))
  const [endDate, setEndDate] = useState(initial.endDate)

  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [body, setBody] = useState<UpdatePlanItemInput | null>(null)

  const dirty =
    sets !== initial.sets || reps !== initial.reps || load !== initial.load || durMin !== initial.durMin ||
    durSec !== initial.durSec || distance !== initial.distance || endDate !== initial.endDate ||
    priority !== latest.priorityWeight || days.join() !== [...latest.repeatDays].sort((a, b) => a - b).join()

  function requestClose() {
    if (saving) return
    if (dirty && !window.confirm('Discard your unsaved changes?')) return
    onClose()
  }
  const dialogRef = useDialogChrome(requestClose)

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)))
  }

  // Client checks only (UI spec §3.4); the server owns the range and cap rules.
  function onReview(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    const errors: Record<string, string> = {}
    const input: UpdatePlanItemInput = { priorityWeight: priority }
    if (hasReps) {
      const s = positive(sets, true)
      const r = positive(reps, true)
      if (s === null) errors.targetSets = 'Enter a whole number greater than 0'
      else input.targetSets = s
      if (r === null) errors.targetRepsPerSet = 'Enter a whole number greater than 0'
      else input.targetRepsPerSet = r
    }
    if (hasLoad) {
      const l = positive(load, false)
      if (l === null) errors.loadKg = 'Enter a number greater than 0'
      else input.loadKg = l
    }
    if (hasDuration) {
      const m = durMin.trim() === '' ? 0 : Number(durMin)
      const s = durSec.trim() === '' ? 0 : Number(durSec)
      if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || m * 60 + s <= 0) {
        errors.targetDurationSec = 'Enter minutes and seconds greater than 0'
      } else input.targetDurationSec = m * 60 + s
    }
    if (hasDistance) {
      const d = positive(distance, false)
      if (d === null) errors.targetDistanceKm = 'Enter a distance greater than 0'
      else input.targetDistanceKm = d
    }
    if (days.length === 0) errors.repeatDays = 'Choose at least one day'
    else input.repeatDays = days
    if (endDate !== '' && endDate < today) errors.endDate = 'End date cannot be before today'
    else input.endDate = endDate === '' ? null : endDate
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setBody(input)
    setStep('confirm')
  }

  async function onConfirm() {
    if (!body || saving) return
    setSaving(true)
    setFormError('')
    try {
      await updatePlanItem(latest.id, body)
      onSaved('Goal updated from today.')
    } catch (error) {
      const { message, fields } = describeError(error)
      const shown: Record<string, string> = {}
      let general = ''
      for (const f of fields) {
        if (f.field === 'id') general = idMessage(latest, today)
        else shown[f.field] = f.limit ? `${f.field}: ${f.limit}` : f.field
      }
      setFieldErrors(shown)
      setFormError(general || (Object.keys(shown).length > 0 ? '' : message))
      setStep('form') // the form keeps what was typed (UI spec §3.4)
    } finally {
      setSaving(false)
    }
  }

  const err = (field: string) =>
    fieldErrors[field] ? (
      <p className="field-error" data-testid={`field-error-${field}`}>
        {fieldErrors[field]}
      </p>
    ) : null

  return (
    <div className="dialog-backdrop">
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="edit-plan-title" data-testid="edit-plan-dialog" tabIndex={-1} ref={dialogRef}>
        <div className="dialog-head">
          <h3 id="edit-plan-title">Edit plan item</h3>
          <button type="button" className="btn btn-secondary dialog-close" onClick={requestClose} aria-label="Close" data-testid="edit-plan-close">
            ✕
          </button>
        </div>

        {formError && (
          <p className="field-error" role="alert" data-testid="edit-plan-error">
            {formError}
          </p>
        )}

        {step === 'confirm' ? (
          <div data-testid="plan-edit-confirm">
            <p data-testid="plan-edit-confirm-text">
              {`Save changes from today? The new goal applies from today (${formatDay(today)}) onward. Past days keep the goal they had, so their scores and the streak of past days do not change. Today's progress and today's streak count are recalculated with the new goal.`}
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep('form')} disabled={saving} data-testid="plan-edit-cancel">
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={saving} data-testid="plan-edit-save">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onReview} noValidate data-testid="edit-plan-form">
            <p className="plan-meta" data-testid="edit-plan-exercise">
              {exercise.name} · {MODE_LABEL[mode]}
            </p>
            <p className="plan-meta">Start date: From today</p>

            <fieldset className="plan-target-fields">
              <legend>Target</legend>
              <p className="plan-meta" data-testid="range-helper">
                Allowed range: {exercise.rangeMin}–{exercise.rangeMax} {exercise.unit}
                {hasReps ? ' total reps (sets × reps per set)' : ''}
              </p>
              {hasReps && (
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="edit-sets">Sets</label>
                    <input id="edit-sets" type="number" inputMode="numeric" min={1} value={sets} onChange={(e) => setSets(e.target.value)} data-testid="target-sets" />
                    {err('targetSets')}
                  </div>
                  <div className="field">
                    <label htmlFor="edit-reps">Reps per set</label>
                    <input id="edit-reps" type="number" inputMode="numeric" min={1} value={reps} onChange={(e) => setReps(e.target.value)} data-testid="target-reps" />
                    {err('targetRepsPerSet')}
                  </div>
                </div>
              )}
              {hasLoad && (
                <div className="field">
                  <label htmlFor="edit-load">Load (kg)</label>
                  <input id="edit-load" type="number" inputMode="decimal" step={0.5} min={0} value={load} onChange={(e) => setLoad(e.target.value)} data-testid="target-load" />
                  {err('loadKg')}
                </div>
              )}
              {hasDuration && (
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="edit-dur-min">Minutes</label>
                    <input id="edit-dur-min" type="number" inputMode="numeric" min={0} value={durMin} onChange={(e) => setDurMin(e.target.value)} data-testid="target-duration-min" />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-dur-sec">Seconds</label>
                    <input id="edit-dur-sec" type="number" inputMode="numeric" min={0} max={59} value={durSec} onChange={(e) => setDurSec(e.target.value)} data-testid="target-duration-sec" />
                  </div>
                  {err('targetDurationSec')}
                </div>
              )}
              {hasDistance && (
                <div className="field">
                  <label htmlFor="edit-distance">Distance (km)</label>
                  <input id="edit-distance" type="number" inputMode="decimal" step={0.01} min={0} value={distance} onChange={(e) => setDistance(e.target.value)} data-testid="target-distance" />
                  {err('targetDistanceKm')}
                </div>
              )}
            </fieldset>

            <fieldset className="plan-common-fields">
              <legend>Priority weight</legend>
              <div className="priority-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className={priority === n ? 'chip-toggle chip-toggle-on' : 'chip-toggle'}>
                    <input type="radio" name="edit-priority" value={n} checked={priority === n} onChange={() => setPriority(n)} data-testid={`priority-${n}`} />
                    {n}
                  </label>
                ))}
              </div>
              {err('priorityWeight')}
            </fieldset>

            <fieldset className="plan-common-fields">
              <legend>Repeat days</legend>
              <div className="priority-row">
                {WEEKDAYS.map(({ day, short }) => (
                  <label key={day} className={days.includes(day) ? 'chip-toggle chip-toggle-on' : 'chip-toggle'}>
                    <input type="checkbox" checked={days.includes(day)} onChange={() => toggleDay(day)} data-testid={`repeat-day-${day}`} />
                    {short}
                  </label>
                ))}
              </div>
              {err('repeatDays')}
            </fieldset>

            <div className="field">
              <label htmlFor="edit-end">End date (optional)</label>
              <input id="edit-end" type="date" min={today} value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="plan-end" />
              {err('endDate')}
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={requestClose} data-testid="plan-cancel">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" data-testid="plan-save">
                Save changes
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export function EndPlanItemDialog({ entry, today, onClose, onSaved }: CommonProps) {
  const { planItem: latest, userExercise: exercise } = entry
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialogChrome(() => {
    if (!saving) onClose()
  })

  async function onEnd() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      // End = the same route with endDate = today (F-07 R9): the item stays through today and stops after.
      await updatePlanItem(latest.id, { endDate: today })
      onSaved('Exercise ended after today.')
    } catch (e) {
      const { message, fields } = describeError(e)
      setError(fields.some((f) => f.field === 'id') ? idMessage(latest, today) : message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="end-plan-title" data-testid="end-plan-dialog" tabIndex={-1} ref={dialogRef}>
        <h3 id="end-plan-title">End {exercise.name}?</h3>
        {error && (
          <p className="field-error" role="alert" data-testid="end-plan-error">
            {error}
          </p>
        )}
        <p data-testid="plan-end-confirm-text">
          {`End this exercise? It stays in your plan through today (${formatDay(today)}) and stops after that. Today's score still includes it, so ending it before you have done it can lower today's percentage and your streak. Past days are not changed.`}
        </p>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving} data-testid="plan-end-keep">
            Keep
          </button>
          <button type="button" className="btn btn-primary" onClick={onEnd} disabled={saving} data-testid="plan-end-confirm">
            {saving ? 'Ending…' : 'End exercise'}
          </button>
        </div>
      </div>
    </div>
  )
}
