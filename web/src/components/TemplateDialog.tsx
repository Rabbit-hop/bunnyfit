import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ErrorNotice } from './ErrorNotice'
import {
  CARDIO_CATEGORIES,
  DEFAULT_TEMPLATE_IMAGE,
  IMAGE_FIELD_ENABLED,
  MODE_LABEL,
  RANGE_LIMITS,
  TEMPLATE_IMAGES,
  TRACKING_MODES,
  UNIT_OF,
  createTemplate,
  describeError,
  updateTemplate,
  type CardioCategory,
  type Category,
  type Template,
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
  imageUrl: string
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
  imageUrl: '',
  ...rangeDefaults('BODYWEIGHT_REPS'),
}

function fromTemplate(t: Template): FormState {
  return {
    categoryId: t.category.id,
    name: t.name,
    targetBodyPart: t.targetBodyPart,
    trackingMode: t.trackingMode,
    cardioCategory: t.cardioCategory ?? '',
    metValue: String(t.metValue),
    rangeMin: String(t.rangeMin),
    rangeMax: String(t.rangeMax),
    imageUrl: t.imageUrl ?? '',
  }
}

type Props = {
  /** Template to edit; null/undefined creates a new one. */
  template?: Template | null
  categories: Category[]
  onClose: () => void
  onSaved: (name: string) => void
}

export function TemplateDialog({ template, categories, onClose, onSaved }: Props) {
  const editing = Boolean(template)
  const initial = template ? fromTemplate(template) : EMPTY
  const [form, setForm] = useState<FormState>(initial)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const noticeRef = useRef<HTMLDivElement>(null)
  const initialJson = useRef(JSON.stringify(initial))

  const dirty = JSON.stringify(form) !== initialJson.current

  function requestClose() {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return
    onClose()
  }

  // Esc closes, with the same unsaved-changes guard as the ✕ button and the backdrop.
  const closeRef = useRef(requestClose)
  closeRef.current = requestClose
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      // Not in the Sprint 1 API contract yet: sent only once the backend accepts it (see IMAGE_FIELD_ENABLED).
      ...(IMAGE_FIELD_ENABLED ? { imageUrl: form.imageUrl || null } : {}),
    }

    setSaving(true)
    try {
      if (template) {
        await updateTemplate(template.id, payload)
      } else {
        await createTemplate(payload)
      }
      onSaved(payload.name)
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

  const err = (field: string) =>
    fieldErrors[field] ? (
      <p className="field-error" data-testid={`field-error-${field}`}>
        {fieldErrors[field]}
      </p>
    ) : null

  const previewSrc = form.imageUrl || DEFAULT_TEMPLATE_IMAGE

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        className="dialog dialog-wide template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
        data-testid="template-form-page"
      >
        <div className="dialog-head">
          <h3 id="template-dialog-title">{editing ? 'Edit template' : 'New template'}</h3>
          <button
            type="button"
            className="btn btn-secondary dialog-close"
            onClick={requestClose}
            aria-label="Close"
            data-testid="tpl-close"
          >
            ✕
          </button>
        </div>

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

          <fieldset className="field image-picker" data-testid="tpl-image-picker">
            <legend>Picture</legend>
            <div className="image-picker-body">
              <img src={previewSrc} alt="Current picture" className="image-picker-preview" data-testid="tpl-image-preview" />
              <div className="image-picker-options" role="radiogroup" aria-label="Choose a picture">
                {TEMPLATE_IMAGES.map((img) => (
                  <button
                    key={img.src}
                    type="button"
                    role="radio"
                    aria-checked={previewSrc === img.src}
                    aria-label={img.label}
                    className={previewSrc === img.src ? 'image-option active' : 'image-option'}
                    onClick={() => set('imageUrl', img.src)}
                    data-testid={`tpl-image-${img.id}`}
                  >
                    <img src={img.src} alt="" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => set('imageUrl', '')}
                disabled={!form.imageUrl}
                data-testid="tpl-image-clear"
              >
                Use default
              </button>
            </div>
            {!IMAGE_FIELD_ENABLED && (
              <p className="hint" data-testid="tpl-image-pending">
                Pictures are not saved yet: the API does not accept them in Sprint 1.
              </p>
            )}
            {err('imageUrl')}
          </fieldset>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={requestClose} data-testid="tpl-cancel">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving} data-testid="tpl-save">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
