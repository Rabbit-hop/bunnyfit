import { ApiError, apiFetch, messageForCode, type FieldError } from './api'

// Shapes from API spec §2.4, §2.6-2.8, §6.1-6.3, §7.1 (F-04, F-06). The server stays authoritative:
// the UI only formats these values and never recomputes scores.

export type TrackingMode =
  | 'WEIGHT'
  | 'BODYWEIGHT_REPS'
  | 'BODYWEIGHT_TIME'
  | 'YOGA'
  | 'CARDIO_TIME'
  | 'CARDIO_DISTANCE'
export type Unit = 'reps' | 'seconds' | 'km'

export const MODE_LABEL: Record<TrackingMode, string> = {
  WEIGHT: 'Weight',
  BODYWEIGHT_REPS: 'Bodyweight reps',
  BODYWEIGHT_TIME: 'Bodyweight time',
  YOGA: 'Yoga',
  CARDIO_TIME: 'Cardio time',
  CARDIO_DISTANCE: 'Cardio distance',
}

export type UserExercise = {
  id: string
  sourceTemplateId: string | null
  isCustom: boolean
  name: string
  targetBodyPart: string
  trackingMode: TrackingMode
  unit: Unit
  cardioCategory: string | null
  metValue: number
  rangeMin: number
  rangeMax: number
}

export type EntryKind = 'MANUAL' | 'QUICK_COMPLETE'

export type LedgerEntry = {
  id: string
  userExerciseId: string
  logDate: string
  sets: number | null
  totalReps: number | null
  durationSec: number | null
  distanceKm: number | null
  kind: EntryKind
  createdAt: string
}

export type Cumulative = {
  userExerciseId: string
  sets: number
  totalReps: number
  durationSec: number
  distanceKm: number
}

/** F-11 §4.1: `calories` is null exactly when `calorieError` is set (no body weight on the date). */
export type CalorieError = 'BODY_WEIGHT_REQUIRED'
export type CalorieFields = {
  estimatedMinutes: number
  calories: number | null
  calorieError: CalorieError | null
}

export type DailyItem = CalorieFields & {
  planItemId: string
  userExerciseId: string
  name: string
  trackingMode: TrackingMode
  unit: Unit
  priorityWeight: number
  target: number
  actual: number
  ratio: number
  itemScore: number
}

/** F-11 R12: an exercise logged on the date that is not in `items` (unscored). */
export type OtherActivity = CalorieFields & {
  userExerciseId: string
  name: string
  trackingMode: TrackingMode
  unit: Unit
  actual: number
}

export type DailyProgress = {
  date: string
  isRestDay: boolean
  items: DailyItem[]
  totalScore: number
  totalWeight: number
  overallPercent: number | null
  otherActivity: OtherActivity[]
  totalCalories: number | null
  calorieError: CalorieError | null
}

export type DayEntries = { date: string; entries: LedgerEntry[]; cumulative: Cumulative[] }

export type EntryInput = {
  userExerciseId: string
  logDate?: string
  sets?: number
  totalReps?: number
  durationSec?: number
  distanceKm?: number
}

export type EntryResult = { entry: LedgerEntry | null; cumulative: Cumulative }

/** F-05 R4: the measured fields of the entry's mode only (a PUT replaces them). */
export type EntryValuesInput = { sets?: number; totalReps?: number; durationSec?: number; distanceKm?: number }

export type TodayApi = {
  getDaily(): Promise<DailyProgress>
  getEntries(date: string): Promise<DayEntries>
  listUserExercises(): Promise<UserExercise[]>
  createEntry(input: EntryInput): Promise<EntryResult>
  quickComplete(userExerciseId: string, logDate: string): Promise<EntryResult>
  /** F-05 `PUT /api/entries/:id`: replace the values of an entry created today. */
  updateEntry(id: string, values: EntryValuesInput): Promise<EntryResult>
  /** F-05 `DELETE /api/entries/:id` (204): remove an entry created today. */
  deleteEntry(id: string): Promise<void>
}

// ---------------------------------------------------------------- formatting

const pad2 = (n: number) => String(n).padStart(2, '0')

/** mm:ss, or "h mm" from 60 minutes up (UI spec §3.4). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${pad2(Math.floor((s % 3600) / 60))}`
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`
}

export function formatQuantity(value: number, unit: Unit): string {
  if (unit === 'seconds') return formatDuration(value)
  if (unit === 'km') return `${Number(value.toFixed(2))} km`
  return `${value} reps`
}

/** The value an entry contributes, in the exercise unit. */
export function entryValue(entry: LedgerEntry, unit: Unit): number {
  if (unit === 'seconds') return entry.durationSec ?? 0
  if (unit === 'km') return entry.distanceKm ?? 0
  return entry.totalReps ?? 0
}

export function cumulativeValue(c: Cumulative | undefined, unit: Unit): number {
  if (!c) return 0
  if (unit === 'seconds') return c.durationSec
  if (unit === 'km') return c.distanceKm
  return c.totalReps
}

export const KIND_LABEL: Record<EntryKind, string> = { MANUAL: 'Manual', QUICK_COMPLETE: 'Quick' }

export const PRIORITY_LABEL: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High' }
export const priorityLabel = (weight: number) => PRIORITY_LABEL[weight] ?? `Weight ${weight}`

/** F-11 §6: kcal as returned (already rounded to 1 decimal by the server), shown with 1 decimal. */
export const formatKcal = (value: number) => `≈ ${value.toFixed(1)} kcal`
/** F-11 §6: estimated minutes to 1 decimal (the server returns them unrounded). */
export const formatMinutes = (value: number) => `${Number(value.toFixed(1))} min`
export const SET_BODY_WEIGHT = 'Set your body weight'

/** Percentages and scores show one decimal (UI spec §3.4); ratios are returned unrounded. */
export const formatPercent = (value: number) => `${value.toFixed(1)}%`
export const formatScore = (value: number) => `${Number(value.toFixed(2))}`

/** Entry time in Asia/Bangkok (UI spec S-02), independent of the browser zone. */
export function formatEntryTime(createdAt: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(createdAt))
}

/** Formats the server's YYYY-MM-DD without touching the browser clock or zone. */
export function formatLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

// ---------------------------------------------------------------- errors

const QUICK_SETS_MESSAGE = "Quick Complete cannot add the remaining target within today's limits."

/** Maps an API error to the UI spec §3.3 messages; the server text is only a fallback. */
export function describeError(
  error: unknown,
  context: 'log' | 'quick' = 'log',
): { code: string; message: string; fields: FieldError[] } {
  if (error instanceof ApiError) {
    if (context === 'quick' && error.code === 'VALIDATION_ERROR' && error.fields.some((f) => f.field === 'sets')) {
      return { code: error.code, message: QUICK_SETS_MESSAGE, fields: [] }
    }
    const fallback = error.code === 'VALIDATION_ERROR' && error.fields.length === 0 ? error.message : ''
    return { code: error.code, message: messageForCode(error.code, fallback || error.message), fields: error.fields }
  }
  return { code: 'INTERNAL_ERROR', message: messageForCode('INTERNAL_ERROR'), fields: [] }
}

// ---------------------------------------------------------------- real API

const realApi: TodayApi = {
  getDaily: async () => (await apiFetch<DailyProgress>('/api/progress/daily'))!,
  getEntries: async (date) => (await apiFetch<DayEntries>(`/api/entries?date=${encodeURIComponent(date)}`))!,
  listUserExercises: async () => (await apiFetch<UserExercise[]>('/api/user-exercises')) ?? [],
  createEntry: async (input) =>
    (await apiFetch<EntryResult>('/api/entries', { method: 'POST', body: JSON.stringify(input) }))!,
  quickComplete: async (userExerciseId, logDate) =>
    (await apiFetch<EntryResult>('/api/entries/quick-complete', {
      method: 'POST',
      body: JSON.stringify({ userExerciseId, logDate }),
    }))!,
  updateEntry: async (id, values) =>
    (await apiFetch<EntryResult>(`/api/entries/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(values) }))!,
  deleteEntry: async (id) => {
    await apiFetch<null>(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
}

// ---------------------------------------------------------------- mock API (phase 1)

// Phase 1 of issue #10: the screens run against responses shaped exactly like API spec §6-§7, with no
// network. `?mock=rest` and `?mock=first` open the Rest Day and first-time states. Phase 2 sets the
// default to the real API; VITE_TODAY_MOCK=1 or a ?mock= query parameter runs the screens on the mock.
// ?mock= works only on the Vite dev server (the e2e tests run there); a production build ignores it, so a deployed
// /today?mock=normal cannot show fake data. VITE_TODAY_MOCK=1 stays available for a deliberate mock build.
const USE_MOCK =
  import.meta.env.VITE_TODAY_MOCK === '1' || (import.meta.env.DEV && new URLSearchParams(window.location.search).has('mock'))

type MockPlan = { exercise: UserExercise; priorityWeight: number; target: number; targetSets: number | null }

const MOCK_DATE = '2026-11-05'

function ex(id: string, name: string, mode: TrackingMode, unit: Unit, rangeMax: number): UserExercise {
  return {
    id,
    sourceTemplateId: null,
    isCustom: false,
    name,
    targetBodyPart: 'Full body',
    trackingMode: mode,
    unit,
    cardioCategory: null,
    metValue: 3.5,
    rangeMin: 1,
    rangeMax,
  }
}

const MOCK_PLAN: MockPlan[] = [
  { exercise: ex('ue-squat', 'Barbell Squat', 'WEIGHT', 'reps', 4000), priorityWeight: 3, target: 40, targetSets: 4 },
  { exercise: ex('ue-run', 'Easy Run', 'CARDIO_DISTANCE', 'km', 100), priorityWeight: 2, target: 5, targetSets: null },
  { exercise: ex('ue-plank', 'Plank', 'BODYWEIGHT_TIME', 'seconds', 3600), priorityWeight: 1, target: 120, targetSets: null },
]

type MockState = { entries: LedgerEntry[]; seq: number }

let mockState: MockState | null = null

function mockScenario(): 'normal' | 'rest' | 'first' {
  const value = new URLSearchParams(window.location.search).get('mock')
  return value === 'rest' || value === 'first' ? value : 'normal'
}

function mockStore(): MockState {
  if (!mockState) {
    mockState = {
      seq: 1,
      entries:
        mockScenario() === 'normal'
          ? [
              {
                id: 'entry-0',
                userExerciseId: 'ue-squat',
                logDate: MOCK_DATE,
                sets: 3,
                totalReps: 28,
                durationSec: null,
                distanceKm: null,
                kind: 'MANUAL',
                createdAt: '2026-11-05T03:00:00.000Z',
              },
            ]
          : [],
    }
  }
  return mockState
}

const mockPlanToday = (): MockPlan[] => (mockScenario() === 'normal' ? MOCK_PLAN : [])
const mockExercises = (): UserExercise[] => (mockScenario() === 'first' ? [] : MOCK_PLAN.map((p) => p.exercise))
const delay = <T>(value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), 150))

function mockCumulative(userExerciseId: string): Cumulative {
  const sum = { userExerciseId, sets: 0, totalReps: 0, durationSec: 0, distanceKm: 0 }
  for (const e of mockStore().entries.filter((x) => x.userExerciseId === userExerciseId)) {
    sum.sets += e.sets ?? 0
    sum.totalReps += e.totalReps ?? 0
    sum.durationSec += e.durationSec ?? 0
    sum.distanceKm = Math.round((sum.distanceKm + (e.distanceKm ?? 0)) * 100) / 100
  }
  return sum
}

function validationError(field: string, limit: string): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', [{ field, limit }])
}

// Mock only: a fixed 70 kg, 3.5 METs and float arithmetic; real values come from the server (F-11 R5).
const MOCK_WEIGHT_KG = 70

function mockCalories(c: Cumulative, unit: Unit): CalorieFields {
  const minutes = unit === 'reps' ? c.sets * 1.5 : unit === 'seconds' ? c.durationSec / 60 : c.distanceKm * 6
  return { estimatedMinutes: minutes, calories: Math.round(3.5 * MOCK_WEIGHT_KG * (minutes / 60) * 10) / 10, calorieError: null }
}

function mockDaily(): DailyProgress {
  const plan = mockPlanToday()
  const calories = { otherActivity: [] as OtherActivity[], calorieError: null }
  if (plan.length === 0) {
    return { date: MOCK_DATE, isRestDay: true, items: [], totalScore: 0, totalWeight: 0, overallPercent: null, ...calories, totalCalories: 0 }
  }
  const items: DailyItem[] = plan.map((p) => {
    const cum = mockCumulative(p.exercise.id)
    const actual = cumulativeValue(cum, p.exercise.unit)
    const ratio = Math.min(1, actual / p.target)
    return {
      ...mockCalories(cum, p.exercise.unit),
      planItemId: `pi-${p.exercise.id}`,
      userExerciseId: p.exercise.id,
      name: p.exercise.name,
      trackingMode: p.exercise.trackingMode,
      unit: p.exercise.unit,
      priorityWeight: p.priorityWeight,
      target: p.target,
      actual,
      ratio,
      itemScore: ratio * p.priorityWeight,
    }
  })
  const totalScore = items.reduce((s, i) => s + i.itemScore, 0)
  const totalWeight = items.reduce((s, i) => s + i.priorityWeight, 0)
  const totalCalories = Math.round(items.reduce((sum, i) => sum + (i.calories ?? 0), 0) * 10) / 10
  return { date: MOCK_DATE, isRestDay: false, items, totalScore, totalWeight, overallPercent: (totalScore / totalWeight) * 100, ...calories, totalCalories }
}

function mockAddEntry(input: EntryInput, kind: EntryKind): EntryResult {
  const exercise = mockExercises().find((e) => e.id === input.userExerciseId)
  if (!exercise) throw new ApiError(404, 'NOT_FOUND', 'Not found')
  const before = mockCumulative(exercise.id)
  const store = mockStore()
  const entry: LedgerEntry = {
    id: `entry-${store.seq++}`,
    userExerciseId: exercise.id,
    logDate: MOCK_DATE,
    sets: input.sets ?? null,
    totalReps: input.totalReps ?? null,
    durationSec: input.durationSec ?? null,
    distanceKm: input.distanceKm ?? null,
    kind,
    createdAt: '2026-11-05T07:30:00.000Z',
  }
  if (exercise.unit === 'reps') {
    const sets = entry.sets ?? 0
    const reps = entry.totalReps ?? 0
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) throw validationError('sets', 'sets must be an integer from 1 to 20')
    if (!Number.isInteger(reps) || reps < 1 || reps > sets * 200) throw validationError('totalReps', 'totalReps must be between 1 and sets x 200')
    if (before.sets + sets > 20) throw validationError('sets', "today's total sets must not exceed 20")
    if (before.totalReps + reps > Math.min((before.sets + sets) * 200, exercise.rangeMax)) {
      throw validationError('totalReps', `today's total reps must not exceed ${exercise.rangeMax}`)
    }
  } else if (exercise.unit === 'seconds') {
    const d = entry.durationSec ?? 0
    const cap = Math.min(10800, exercise.rangeMax)
    if (!Number.isInteger(d) || d < 1 || d > 10800) throw validationError('durationSec', 'durationSec must be an integer from 1 to 10800')
    if (before.durationSec + d > cap) throw validationError('durationSec', `today's total must not exceed ${cap} seconds`)
  } else {
    const km = entry.distanceKm ?? 0
    const cap = Math.min(100, exercise.rangeMax)
    if (!(km > 0) || km > 100) throw validationError('distanceKm', 'distanceKm must be greater than 0 and at most 100')
    if (before.distanceKm + km > cap) throw validationError('distanceKm', `today's total must not exceed ${cap} km`)
  }
  store.entries.push(entry)
  return { entry, cumulative: mockCumulative(exercise.id) }
}

const mockApi: TodayApi = {
  getDaily: () => delay(mockDaily()),
  getEntries: (date) => {
    const entries = mockStore().entries.filter((e) => e.logDate === date)
    const ids = [...new Set(entries.map((e) => e.userExerciseId))]
    return delay({ date, entries: [...entries], cumulative: ids.map(mockCumulative) })
  },
  listUserExercises: () => delay(mockExercises()),
  createEntry: async (input) => {
    await delay(null)
    if (input.logDate && input.logDate !== MOCK_DATE) throw new ApiError(400, 'LOG_DATE_MISMATCH', 'Date mismatch')
    return mockAddEntry(input, 'MANUAL')
  },
  updateEntry: async (id, values) => {
    await delay(null)
    const store = mockStore()
    const index = store.entries.findIndex((e) => e.id === id)
    if (index < 0) throw new ApiError(404, 'NOT_FOUND', 'Not found')
    const old = store.entries[index]
    if (old.logDate !== MOCK_DATE) throw new ApiError(409, 'ENTRY_NOT_EDITABLE', 'Not editable')
    store.entries.splice(index, 1)
    try {
      const result = mockAddEntry({ userExerciseId: old.userExerciseId, ...values }, old.kind)
      const saved = { ...result.entry!, id: old.id, createdAt: old.createdAt }
      store.entries[store.entries.length - 1] = saved
      return { entry: saved, cumulative: mockCumulative(old.userExerciseId) }
    } catch (error) {
      store.entries.splice(index, 0, old)
      throw error
    }
  },
  deleteEntry: async (id) => {
    await delay(null)
    const store = mockStore()
    const index = store.entries.findIndex((e) => e.id === id)
    if (index < 0) throw new ApiError(404, 'NOT_FOUND', 'Not found')
    if (store.entries[index].logDate !== MOCK_DATE) throw new ApiError(409, 'ENTRY_NOT_EDITABLE', 'Not editable')
    store.entries.splice(index, 1)
  },
  quickComplete: async (userExerciseId, logDate) => {
    await delay(null)
    if (logDate !== MOCK_DATE) throw new ApiError(400, 'LOG_DATE_MISMATCH', 'Date mismatch')
    const plan = mockPlanToday().find((p) => p.exercise.id === userExerciseId)
    if (!plan) throw new ApiError(400, 'QUICK_COMPLETE_NOT_AVAILABLE', 'Not available')
    const cum = mockCumulative(userExerciseId)
    const remaining = plan.target - cumulativeValue(cum, plan.exercise.unit)
    if (remaining <= 0) return { entry: null, cumulative: cum }
    if (plan.exercise.unit === 'reps') {
      const sets = Math.max(Math.ceil(remaining / 200), Math.max(1, (plan.targetSets ?? 1) - cum.sets))
      return mockAddEntry({ userExerciseId, sets, totalReps: remaining }, 'QUICK_COMPLETE')
    }
    if (plan.exercise.unit === 'seconds') return mockAddEntry({ userExerciseId, durationSec: remaining }, 'QUICK_COMPLETE')
    return mockAddEntry({ userExerciseId, distanceKm: Math.round(remaining * 100) / 100 }, 'QUICK_COMPLETE')
  },
}

export const todayApi: TodayApi = USE_MOCK ? mockApi : realApi
export const isMockToday = USE_MOCK
