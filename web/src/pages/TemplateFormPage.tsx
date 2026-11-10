import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import {
  CARDIO_CATEGORIES,
  MODE_LABEL,
  RANGE_LIMITS,
  TRACKING_MODES,
  UNIT_OF,
  createTemplate,
  describeError,
  getTemplate,
  listCategories,
  updateTemplate,
  type CardioCategory,
  type Category,
  type TemplateInput,
  type TrackingMode,
} from '../lib/library'

type FormState = {
  categoryId: string
  name: string
  targetBodyPart: string
  trackingMode: TrackingMode
  cardioCategory: CardioCategory | ''
  metValue: string
  rangeMin: string
  rangeMax: string
}

function rangeDefaults(mode: TrackingMode) {
  const limits = RANGE_LIMITS[UNIT_OF[mode]]
  return { rangeMin: String(limits.min), rangeMax: String(limits.max) }
}

const EMPTY: FormState = {
  categoryId: '',
  name: '',
  targetBodyPart: '',
  trackingMode: 'BODYWEIGHT_REPS',
  cardioCategory: '',
  metValue: '',
  ...rangeDefaults('BODYWEIGHT_REPS'),
}

export function TemplateFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const noticeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const cats = await listCategories()
        if (cancelled) return
        setCategories(cats)
        if (id) {
          const t = await getTemplate(id)
          if (cancelled || !t) return
          setForm({
            categoryId: t.category.id,
            name: t.name,
            targetBodyPart: t.targetBodyPart,
            trackingMode: t.trackingMode,
            cardioCategory: t.cardioCategory ?? '',
            metValue: String(t.metValue),
            rangeMin: String(t.rangeMin),
            rangeMax: String(t.rangeMax),
          })
        }
      } catch (error) {
        if (!cancelled) setLoadError(describeError(error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (formError) noticeRef.current?.focus()
  }, [formError])

  const unit = UNIT_OF[form.trackingMode]
  const isDistance = form.trackingMode === 'CARDIO_DISTANCE'

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Changing the mode clears the fields that no longer apply (UI spec S-09).
  function onModeChange(mode: TrackingMode) {
    setForm((prev) => ({ ...prev, trackingMode: mode, cardioCategory: '', ...rangeDefaults(mode) }))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    setFieldErrors({})

    const payload: TemplateInput = {
      categoryId: form.categoryId,
      name: form.name.trim(),
      targetBodyPart: form.targetBodyPart.trim(),
      trackingMode: form.trackingMode,
      metValue: Number(form.metValue),
      rangeMin: Number(form.rangeMin),
      rangeMax: Number(form.rangeMax),
      ...(isDistance && form.cardioCategory ? { cardioCategory: form.cardioCategory } : {}),
    }

    setSaving(true)
    try {
      if (id) {
        await updateTemplate(id, payload)
      } else {
        await createTemplate(payload)
      }
      navigate('/manager/library', { state: { toast: `Template "${payload.name}" saved.` } })
    } catch (error) {
      const { message, fields } = describeError(error)
      if (fields.length > 0) {
        const next: Record<string, string> = {}
        for (const f of fields) next[f.field] = f.limit ? `${f.field}: ${f.limit}` : f.field
        setFieldErrors(next)
      }
      setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="page" aria-busy="true" data-testid="template-form-loading">
        <div className="skeleton-rows">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className="page">
        <ErrorNotice>{loadError}</ErrorNotice>
        <Link className="btn btn-secondary" to="/manager/library">
          Back to library
        </Link>
      </section>
    )
  }

  const err = (field: string) =>
    fieldErrors[field] ? (
      <p className="field-error" data-testid={`field-error-${field}`}>
        {fieldErrors[field]}
      </p>
    ) : null

  return (
    <section className="page" data-testid="template-form-page">
      <h2>{editing ? 'Edit template' : 'New template'}</h2>
      {formError && <ErrorNotice ref={noticeRef}>{formError}</ErrorNotice>}

      <form className="template-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="tpl-category">Category</label>
          <select
            id="tpl-category"
            value={form.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
            data-testid="tpl-category"
            required
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {err('categoryId')}
        </div>

        <div className="field">
          <label htmlFor="tpl-name">Name</label>
          <input
            id="tpl-name"
            value={form.name}
            maxLength={80}
            onChange={(e) => set('name', e.target.value)}
            data-testid="tpl-name"
          />
          {err('name')}
        </div>

        <div className="field">
          <label htmlFor="tpl-mode">Tracking mode</label>
          <select
            id="tpl-mode"
            value={form.trackingMode}
            disabled={editing}
            onChange={(e) => onModeChange(e.target.value as TrackingMode)}
            data-testid="tpl-mode"
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
          <label htmlFor="tpl-body-part">Target body part</label>
          <input
            id="tpl-body-part"
            value={form.targetBodyPart}
            maxLength={50}
            onChange={(e) => set('targetBodyPart', e.target.value)}
            data-testid="tpl-body-part"
          />
          {err('targetBodyPart')}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="tpl-range-min">Range min ({unit})</label>
            <input
              id="tpl-range-min"
              type="number"
              inputMode="decimal"
              step={unit === 'km' ? 0.01 : 1}
              value={form.rangeMin}
              onChange={(e) => set('rangeMin', e.target.value)}
              data-testid="tpl-range-min"
            />
            {err('rangeMin')}
          </div>
          <div className="field">
            <label htmlFor="tpl-range-max">Range max ({unit})</label>
            <input
              id="tpl-range-max"
              type="number"
              inputMode="decimal"
              step={unit === 'km' ? 0.01 : 1}
              value={form.rangeMax}
              onChange={(e) => set('rangeMax', e.target.value)}
              data-testid="tpl-range-max"
            />
            {err('rangeMax')}
          </div>
        </div>

        <div className="field">
          <label htmlFor="tpl-met">MET value (above 0, at most 25)</label>
          <input
            id="tpl-met"
            type="number"
            inputMode="decimal"
            step={0.1}
            min={0.1}
            max={25}
            value={form.metValue}
            onChange={(e) => set('metValue', e.target.value)}
            data-testid="tpl-met"
          />
          {err('metValue')}
        </div>

        {isDistance && (
          <div className="field">
            <label htmlFor="tpl-cardio">Cardio category</label>
            <select
              id="tpl-cardio"
              value={form.cardioCategory}
              onChange={(e) => set('cardioCategory', e.target.value as CardioCategory | '')}
              data-testid="tpl-cardio"
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

        <div className="form-actions">
          <Link className="btn btn-secondary" to="/manager/library" data-testid="tpl-cancel">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving} data-testid="tpl-save">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
