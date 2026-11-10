import { ApiError, apiFetch, messageForCode, type FieldError } from './api'

export const TRACKING_MODES = [
  'WEIGHT',
  'BODYWEIGHT_REPS',
  'BODYWEIGHT_TIME',
  'YOGA',
  'CARDIO_TIME',
  'CARDIO_DISTANCE',
] as const
export type TrackingMode = (typeof TRACKING_MODES)[number]

export const CARDIO_CATEGORIES = ['RUNNING', 'WALKING', 'CYCLING', 'SWIMMING'] as const
export type CardioCategory = (typeof CARDIO_CATEGORIES)[number]

export type Unit = 'reps' | 'seconds' | 'km'

// Mirrors server/domain/templateValidation.ts (API spec §4.2, F-02 R6/R10). The server stays authoritative.
export const UNIT_OF: Record<TrackingMode, Unit> = {
  WEIGHT: 'reps',
  BODYWEIGHT_REPS: 'reps',
  BODYWEIGHT_TIME: 'seconds',
  YOGA: 'seconds',
  CARDIO_TIME: 'seconds',
  CARDIO_DISTANCE: 'km',
}

export const RANGE_LIMITS: Record<Unit, { min: number; max: number }> = {
  reps: { min: 1, max: 4000 },
  seconds: { min: 1, max: 10800 },
  km: { min: 0.01, max: 100 },
}

export const MODE_LABEL: Record<TrackingMode, string> = {
  WEIGHT: 'Weight',
  BODYWEIGHT_REPS: 'Bodyweight reps',
  BODYWEIGHT_TIME: 'Bodyweight time',
  YOGA: 'Yoga',
  CARDIO_TIME: 'Cardio time',
  CARDIO_DISTANCE: 'Cardio distance',
}

export type Category = { id: string; name: string; templateCount: number }

export type Template = {
  id: string
  category: { id: string; name: string }
  name: string
  targetBodyPart: string
  trackingMode: TrackingMode
  unit: Unit
  cardioCategory: CardioCategory | null
  metValue: number
  rangeMin: number
  rangeMax: number
}

export type TemplateInput = {
  categoryId: string
  name: string
  targetBodyPart: string
  trackingMode: TrackingMode
  cardioCategory?: CardioCategory
  metValue: number
  rangeMin: number
  rangeMax: number
}

export const listCategories = () => apiFetch<Category[]>('/api/categories').then((r) => r ?? [])

export const createCategory = (name: string) =>
  apiFetch<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) })

export const renameCategory = (id: string, name: string) =>
  apiFetch<Category>(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })

export const deleteCategory = (id: string) => apiFetch<null>(`/api/categories/${id}`, { method: 'DELETE' })

export function listTemplates(filter: { categoryId?: string; trackingMode?: string } = {}) {
  const params = new URLSearchParams()
  if (filter.categoryId) params.set('categoryId', filter.categoryId)
  if (filter.trackingMode) params.set('trackingMode', filter.trackingMode)
  const query = params.toString()
  return apiFetch<Template[]>(`/api/templates${query ? `?${query}` : ''}`).then((r) => r ?? [])
}

export const getTemplate = (id: string) => apiFetch<Template>(`/api/templates/${id}`)

export const createTemplate = (input: TemplateInput) =>
  apiFetch<Template>('/api/templates', { method: 'POST', body: JSON.stringify(input) })

export const updateTemplate = (id: string, input: TemplateInput) =>
  apiFetch<Template>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(input) })

export const deleteTemplate = (id: string) => apiFetch<null>(`/api/templates/${id}`, { method: 'DELETE' })

export function describeError(error: unknown): { message: string; fields: FieldError[] } {
  if (error instanceof ApiError) {
    return { message: messageForCode(error.code, error.message), fields: error.fields }
  }
  return { message: messageForCode('INTERNAL_ERROR'), fields: [] }
}

export function formatRange(t: Pick<Template, 'rangeMin' | 'rangeMax' | 'unit'>): string {
  return `${t.rangeMin}–${t.rangeMax} ${t.unit}`
}
