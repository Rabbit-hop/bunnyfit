import { apiFetch } from './api'
import type { CardioCategory, TrackingMode, Unit } from './library'

// Shapes from API spec §2.4, §2.5, §2.9 (F-03). The server stays authoritative.
export type UserExercise = {
  id: string
  sourceTemplateId: string | null
  isCustom: boolean
  name: string
  targetBodyPart: string
  trackingMode: TrackingMode
  unit: Unit
  cardioCategory: CardioCategory | null
  metValue: number
  rangeMin: number
  rangeMax: number
}

export type PlanItem = {
  id: string
  userExerciseId: string
  planKey: string
  version: number
  priorityWeight: number
  targetSets: number | null
  targetRepsPerSet: number | null
  loadKg: number | null
  targetDurationSec: number | null
  targetDistanceKm: number | null
  effectiveFrom: string
  endDate: string | null
  repeatDays: number[]
  createdAt: string
}

export type PlanEntry = { planItem: PlanItem; userExercise: UserExercise }

export type PlanForDate = { date: string; isRestDay: boolean; items: PlanEntry[] }

export const listPlanItems = () => apiFetch<PlanEntry[]>('/api/plan-items').then((r) => r ?? [])

// Without `date` the server resolves today (Asia/Bangkok); the UI never reads the browser clock.
export const getPlan = (date?: string) =>
  apiFetch<PlanForDate>(`/api/plan${date ? `?date=${encodeURIComponent(date)}` : ''}`)

export type NewExercise = {
  name: string
  targetBodyPart: string
  trackingMode: TrackingMode
  cardioCategory?: CardioCategory
}

// Body of POST /api/plan-items (API spec §5.1): TEMPLATE needs templateId, CUSTOM needs exercise.
export type CreatePlanItemInput = {
  source: 'TEMPLATE' | 'CUSTOM'
  templateId?: string
  exercise?: NewExercise
  priorityWeight: number
  effectiveFrom?: string
  endDate?: string
  repeatDays: number[]
  targetSets?: number
  targetRepsPerSet?: number
  loadKg?: number
  targetDurationSec?: number
  targetDistanceKm?: number
}

export const createPlanItem = (input: CreatePlanItemInput) =>
  apiFetch<PlanEntry>('/api/plan-items', { method: 'POST', body: JSON.stringify(input) })

export const WEEKDAYS = [
  { day: 1, short: 'Mon' },
  { day: 2, short: 'Tue' },
  { day: 3, short: 'Wed' },
  { day: 4, short: 'Thu' },
  { day: 5, short: 'Fri' },
  { day: 6, short: 'Sat' },
  { day: 7, short: 'Sun' },
] as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-11-09" -> "9 Nov" (string arithmetic only, no Date/timezone involved). */
export function formatDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}`
}

/** "Every day", "Mon, Wed, Fri". */
export function formatRepeatDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 7) return 'Every day'
  return sorted.map((d) => WEEKDAYS[d - 1]?.short ?? String(d)).join(', ')
}

/** Duration in seconds -> "mm:ss", or "h mm" from 60 minutes (UI spec §3.4). */
export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (totalSec >= 3600) return `${h} h ${String(m).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Readable target, e.g. "4 × 10 reps @ 40 kg", "30:00", "3.5 km" (UI spec S-05). */
export type TargetFields = Pick<
  PlanItem,
  'targetSets' | 'targetRepsPerSet' | 'loadKg' | 'targetDurationSec' | 'targetDistanceKm'
>

export function formatTarget(item: TargetFields): string {
  if (item.targetSets !== null && item.targetRepsPerSet !== null) {
    const base = `${item.targetSets} × ${item.targetRepsPerSet} reps`
    return item.loadKg !== null ? `${base} @ ${item.loadKg} kg` : base
  }
  if (item.targetDurationSec !== null) return formatDuration(item.targetDurationSec)
  if (item.targetDistanceKm !== null) return `${item.targetDistanceKm} km`
  return '—'
}

export function formatDateRange(item: Pick<PlanItem, 'effectiveFrom' | 'endDate'>): string {
  return item.endDate
    ? `${formatDay(item.effectiveFrom)} – ${formatDay(item.endDate)}`
    : `From ${formatDay(item.effectiveFrom)}`
}

/**
 * Which plan items occur on `iso` (F-03 contract R12, mirrored for the calendar so a whole month
 * can be drawn from one GET /api/plan-items). For each planKey take the version with the greatest
 * effectiveFrom <= date (ties: highest version); it occurs when the date is not past endDate and
 * the ISO weekday (1 = Mon ... 7 = Sun) is in repeatDays. ISO dates compare correctly as strings.
 */
export function itemsOn(entries: PlanEntry[], iso: string, weekday: number): PlanEntry[] {
  const current = new Map<string, PlanEntry>()
  for (const entry of entries) {
    const { planKey, effectiveFrom, version } = entry.planItem
    if (effectiveFrom > iso) continue
    const best = current.get(planKey)
    if (
      !best ||
      effectiveFrom > best.planItem.effectiveFrom ||
      (effectiveFrom === best.planItem.effectiveFrom && version > best.planItem.version)
    ) {
      current.set(planKey, entry)
    }
  }
  return [...current.values()].filter(
    ({ planItem }) => (planItem.endDate === null || iso <= planItem.endDate) && planItem.repeatDays.includes(weekday),
  )
}
