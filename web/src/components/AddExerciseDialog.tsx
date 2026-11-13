import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ErrorNotice } from './ErrorNotice'
import {
  CARDIO_CATEGORIES,
  MODE_LABEL,
  RANGE_LIMITS,
  TRACKING_MODES,
  UNIT_OF,
  describeError,
  formatRange,
  listCategories,
  listTemplates,
  type CardioCategory,
  type Category,
  type Template,
  type TrackingMode,
} from '../lib/library'
import {
  WEEKDAYS,
  createPlanItem,
  formatDay,
  formatRepeatDays,
  formatTarget,
  getPlan,
  type CreatePlanItemInput,
  type TargetFields,
} from '../lib/plan'

type Props = {
  onClose: () => void
  /** `effectiveFrom` lets the calendar jump to the day the new item starts on. */
  onSaved: (name: string, effectiveFrom?: string) => void
}

type Tab = 'library' | 'custom'

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

function modeFields(mode: TrackingMode) {
  return {
    reps: mode === 'WEIGHT' || mode === 'BODYWEIGHT_REPS',
    load: mode === 'WEIGHT',
    duration: mode === 'BODYWEIGHT_TIME' || mode === 'YOGA' || mode === 'CARDIO_TIME',
    distance: mode === 'CARDIO_DISTANCE',
  }
}

// Client checks only: required, numeric, integer where needed, greater than zero (UI spec §3.4).
// The server owns range and cap validation.
function positive(value: string, integer: boolean): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  if (integer && !Number.isInteger(n)) return null
  return n
}

export function AddExerciseDialog({ onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>('library')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [today, setToday] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Template | null>(null)

  const [name, setName] = useState('')
  const [bodyPart, setBodyPart] = useState('')
  const [customMode, setCustomMode] = useState<TrackingMode>('BODYWEIGHT_REPS')
  const [cardio, setCardio] = useState<CardioCategory | ''>('')

  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [load, setLoad] = useState('')
  const [durMin, setDurMin] = useState('')
  const [durSec, setDurSec] = useState('')
  const [distance, setDistance] = useState('')

  const [priority, setPriority] = useState(3)
  const [days, setDays] = useState<number[]>(ALL_DAYS)
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [endDate, setEndDate] = useState('')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const noticeRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const loadSeq = useRef(0)

  // Today comes from the server (GET /api/plan defaults to today), never the browser clock.
  useEffect(() => {
    let cancelled = false
    Promise.all([getPlan(), listCategories()])
      .then(([plan, cats]) => {
        if (cancelled || !plan) return
        setToday(plan.date)
        setEffectiveFrom(plan.date)
        setCategories(cats)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Templates reload when a server-side filter changes; an older, slower response is ignored.
  useEffect(() => {
    const seq = ++loadSeq.current
    listTemplates({ categoryId: categoryFilter, trackingMode: modeFilter })
      .then((rows) => {
        if (seq === loadSeq.current) setTemplates(rows)
      })
      .catch(() => {
        if (seq === loadSeq.current) setLoadState('error')
      })
  }, [categoryFilter, modeFilter])

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (formError) noticeRef.current?.focus()
  }, [formError])

  const mode: TrackingMode | null = tab === 'library' ? (selected?.trackingMode ?? null) : customMode
  const fields = mode ? modeFields(mode) : null
  const range =
    tab === 'library'
      ? selected
        ? { min: selected.rangeMin, max: selected.rangeMax, unit: selected.unit }
        : null
      : mode
        ? { ...RANGE_LIMITS[UNIT_OF[mode]], unit: UNIT_OF[mode] }
        : null

  const visibleTemplates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates
  }, [templates, search])

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: Template[] }>()
    for (const t of visibleTemplates) {
      const group = map.get(t.category.id) ?? { name: t.category.name, items: [] }
      group.items.push(t)
      map.set(t.category.id, group)
    }
    return [...map.values()]
  }, [visibleTemplates])

  // One parse for both the submit check and the live summary line; errors are keyed by API field name.
  function parseTarget(): { target: CreateTarget; errors: Record<string, string> } {
    const target: CreateTarget = {}
    const errors: Record<string, string> = {}
    if (fields?.reps) {
      const s = positive(sets, true)
      const r = positive(reps, true)
      if (s === null) errors.targetSets = 'Enter a whole number greater than 0'
      else target.targetSets = s
      if (r === null) errors.targetRepsPerSet = 'Enter a whole number greater than 0'
      else target.targetRepsPerSet = r
    }
    if (fields?.load) {
      const l = positive(load, false)
      if (l === null) errors.loadKg = 'Enter a number greater than 0'
      else target.loadKg = l
    }
    if (fields?.duration) {
      const m = durMin.trim() === '' ? 0 : Number(durMin)
      const s = durSec.trim() === '' ? 0 : Number(durSec)
      if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || m * 60 + s <= 0) {
        errors.targetDurationSec = 'Enter minutes and seconds greater than 0'
      } else target.targetDurationSec = m * 60 + s
    }
    if (fields?.distance) {
      const d = positive(distance, false)
      if (d === null) errors.targetDistanceKm = 'Enter a distance greater than 0'
      else target.targetDistanceKm = d
    }
    return { target, errors }
  }

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)))
  }

  function onModeChange(next: TrackingMode) {
    setCustomMode(next)
    setCardio('')
    setSets('')
    setReps('')
    setLoad('')
    setDurMin('')
    setDurSec('')
    setDistance('')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    setFieldErrors({})
    if (!mode) {
      setFormError('Choose an exercise from the library first.')
      return
    }

    const local: Record<string, string> = {}
    if (tab === 'custom') {
      if (name.trim() === '') local.name = 'Enter a name'
      if (bodyPart.trim() === '') local.targetBodyPart = 'Enter a body part'
      if (mode === 'CARDIO_DISTANCE' && cardio === '') local.cardioCategory = 'Choose a cardio category'
    }
    const { target, errors } = parseTarget()
    Object.assign(local, errors)
    if (days.length === 0) local.repeatDays = 'Choose at least one day'
    if (Object.keys(local).length > 0) {
      setFieldErrors(local)
      return
    }

    const base = {
      priorityWeight: priority,
      repeatDays: days,
      effectiveFrom,
      ...(endDate ? { endDate } : {}),
      ...target,
    }
    const body: CreatePlanItemInput =
      tab === 'library' && selected
        ? { source: 'TEMPLATE', templateId: selected.id, ...base }
        : {
            source: 'CUSTOM',
            exercise: {
              name: name.trim(),
              targetBodyPart: bodyPart.trim(),
              trackingMode: customMode,
              ...(customMode === 'CARDIO_DISTANCE' && cardio ? { cardioCategory: cardio } : {}),
            },
            ...base,
          }

    setSaving(true)
    try {
      const created = await createPlanItem(body)
      onSaved(
        created?.userExercise.name ?? (tab === 'library' ? (selected?.name ?? '') : name.trim()),
        created?.planItem.effectiveFrom ?? effectiveFrom,
      )
    } catch (error) {
      const { message, fields: apiFields } = describeError(error)
      const shown: Record<string, string> = {}
      let formLevel = ''
      for (const f of apiFields) {
        const text = f.limit ? `${f.field}: ${f.limit}` : f.field
        // templateId / userExerciseId problems are form-level notices (UI spec §3.3).
        if (f.field === 'templateId' || f.field === 'source' || f.field === 'exercise') formLevel = text
        else shown[f.field.replace(/^exercise\./, '')] = text
      }
      setFieldErrors(shown)
      setFormError(formLevel || message)
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

  const parsed = parseTarget()
  const summaryTarget =
    fields && Object.keys(parsed.errors).length === 0
      ? formatTarget({
          targetSets: null,
          targetRepsPerSet: null,
          loadKg: null,
          targetDurationSec: null,
          targetDistanceKm: null,
          ...parsed.target,
        })
      : null

  const summary =
    summaryTarget && effectiveFrom
      ? `${formatRepeatDays(days)} - ${summaryTarget} - from ${formatDay(effectiveFrom)}${endDate ? ` until ${formatDay(endDate)}` : ''}`
      : null

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-exercise-title"
        data-testid="add-exercise-dialog"
        tabIndex={-1}
        ref={dialogRef}
      >
        <h3 id="add-exercise-title">Add exercise</h3>

        {loadState === 'loading' && (
          <div className="skeleton-rows" aria-busy="true" data-testid="add-exercise-loading">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {loadState === 'error' && (
          <>
            <ErrorNotice>Something went wrong. Please try again.</ErrorNotice>
            <div className="row-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}

        {loadState === 'ready' && (
          <form onSubmit={onSubmit} noValidate className="add-exercise-form">
            {formError && <ErrorNotice ref={noticeRef}>{formError}</ErrorNotice>}

            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'library'}
                className={tab === 'library' ? 'tab tab-active' : 'tab'}
                onClick={() => setTab('library')}
                data-testid="tab-from-library"
              >
                From library
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'custom'}
                className={tab === 'custom' ? 'tab tab-active' : 'tab'}
                onClick={() => setTab('custom')}
                data-testid="tab-custom"
              >
                Custom
              </button>
            </div>

            {tab === 'library' && (
              <div className="library-picker">
                <div className="library-filters">
                  <label>
                    Category
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      data-testid="picker-category"
                    >
                      <option value="">All categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Mode
                    <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} data-testid="picker-mode">
                      <option value="">All modes</option>
                      {TRACKING_MODES.map((m) => (
                        <option key={m} value={m}>
                          {MODE_LABEL[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field">
                  <label htmlFor="picker-search">Search by name</label>
                  <input
                    id="picker-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="picker-search"
                  />
                </div>

                {visibleTemplates.length === 0 && (
                  <p className="empty-state" data-testid="picker-empty">
                    No templates match
                  </p>
                )}
                {grouped.map((group) => (
                  <div key={group.name} className="picker-group">
                    <h4>{group.name}</h4>
                    <ul className="picker-list">
                      {group.items.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className={selected?.id === t.id ? 'template-card template-card-selected' : 'template-card'}
                            aria-pressed={selected?.id === t.id}
                            onClick={() => setSelected(t)}
                            data-testid={`template-card-${t.id}`}
                          >
                            <strong>{t.name}</strong>
                            <span>
                              {MODE_LABEL[t.trackingMode]} · {t.targetBodyPart}
                            </span>
                            <span>Range {formatRange(t)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {selected && (
                  <p className="plan-meta" data-testid="selected-template">
                    Selected: {selected.name} ({selected.targetBodyPart}, {selected.unit}, range {formatRange(selected)})
                  </p>
                )}
              </div>
            )}

            {tab === 'custom' && (
              <div className="custom-fields">
                <div className="field">
                  <label htmlFor="custom-name">Name</label>
                  <input
                    id="custom-name"
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="custom-name"
                  />
                  {err('name')}
                </div>
                <div className="field">
                  <label htmlFor="custom-mode">Tracking mode</label>
                  <select
                    id="custom-mode"
                    value={customMode}
                    onChange={(e) => onModeChange(e.target.value as TrackingMode)}
                    data-testid="custom-mode"
                  >
                    {TRACKING_MODES.map((m) => (
                      <option key={m} value={m}>
                        {MODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                  {err('trackingMode')}
                </div>
                <div className="field">
                  <label htmlFor="custom-body-part">Body part</label>
                  <input
                    id="custom-body-part"
                    value={bodyPart}
                    maxLength={50}
                    onChange={(e) => setBodyPart(e.target.value)}
                    data-testid="custom-body-part"
                  />
                  {err('targetBodyPart')}
                </div>
                {customMode === 'CARDIO_DISTANCE' && (
                  <div className="field">
                    <label htmlFor="custom-cardio">Cardio category</label>
                    <select
                      id="custom-cardio"
                      value={cardio}
                      onChange={(e) => setCardio(e.target.value as CardioCategory | '')}
                      data-testid="custom-cardio"
                    >
                      <option value="">Select a cardio category</option>
                      {CARDIO_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c.charAt(0) + c.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                    {err('cardioCategory')}
                  </div>
                )}
                <p className="plan-meta">Default calories value is set by the system</p>
              </div>
            )}

            {fields && range && (
              <fieldset className="plan-target-fields">
                <legend>Target</legend>
                <p className="plan-meta" data-testid="range-helper">
                  Allowed range: {range.min}–{range.max} {range.unit}
                  {fields.reps ? ' total reps (sets × reps per set)' : ''}
                </p>
                {fields.reps && (
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="target-sets">Sets</label>
                      <input
                        id="target-sets"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={sets}
                        onChange={(e) => setSets(e.target.value)}
                        data-testid="target-sets"
                      />
                      {err('targetSets')}
                    </div>
                    <div className="field">
                      <label htmlFor="target-reps">Reps per set</label>
                      <input
                        id="target-reps"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={reps}
                        onChange={(e) => setReps(e.target.value)}
                        data-testid="target-reps"
                      />
                      {err('targetRepsPerSet')}
                    </div>
                  </div>
                )}
                {fields.load && (
                  <div className="field">
                    <label htmlFor="target-load">Load (kg)</label>
                    <input
                      id="target-load"
                      type="number"
                      inputMode="decimal"
                      step={0.5}
                      min={0}
                      value={load}
                      onChange={(e) => setLoad(e.target.value)}
                      data-testid="target-load"
                    />
                    {err('loadKg')}
                  </div>
                )}
                {fields.duration && (
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="target-duration-min">Minutes</label>
                      <input
                        id="target-duration-min"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={durMin}
                        onChange={(e) => setDurMin(e.target.value)}
                        data-testid="target-duration-min"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="target-duration-sec">Seconds</label>
                      <input
                        id="target-duration-sec"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={59}
                        value={durSec}
                        onChange={(e) => setDurSec(e.target.value)}
                        data-testid="target-duration-sec"
                      />
                    </div>
                    {err('targetDurationSec')}
                  </div>
                )}
                {fields.distance && (
                  <div className="field">
                    <label htmlFor="target-distance">Distance (km)</label>
                    <input
                      id="target-distance"
                      type="number"
                      inputMode="decimal"
                      step={0.01}
                      min={0}
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                      data-testid="target-distance"
                    />
                    {err('targetDistanceKm')}
                  </div>
                )}
              </fieldset>
            )}

            {fields && (
              <>
                <fieldset className="plan-common-fields">
                  <legend>Priority weight</legend>
                  <div className="priority-row">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className={priority === n ? 'chip-toggle chip-toggle-on' : 'chip-toggle'}>
                        <input
                          type="radio"
                          name="priority"
                          value={n}
                          checked={priority === n}
                          onChange={() => setPriority(n)}
                          data-testid={`priority-${n}`}
                        />
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
                        <input
                          type="checkbox"
                          checked={days.includes(day)}
                          onChange={() => toggleDay(day)}
                          data-testid={`repeat-day-${day}`}
                        />
                        {short}
                      </label>
                    ))}
                  </div>
                  {err('repeatDays')}
                </fieldset>

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="plan-start">Start date</label>
                    <input
                      id="plan-start"
                      type="date"
                      min={today}
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      data-testid="plan-start"
                    />
                    {err('effectiveFrom')}
                  </div>
                  <div className="field">
                    <label htmlFor="plan-end">End date (optional)</label>
                    <input
                      id="plan-end"
                      type="date"
                      min={effectiveFrom || today}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      data-testid="plan-end"
                    />
                    {err('endDate')}
                  </div>
                </div>

                {summary && (
                  <p className="plan-summary" data-testid="plan-summary">
                    {summary}
                  </p>
                )}
              </>
            )}

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} data-testid="plan-cancel">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving} data-testid="plan-save">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

type CreateTarget = {
  targetSets?: number
  targetRepsPerSet?: number
  loadKg?: number
  targetDurationSec?: number
  targetDistanceKm?: number
}
