import { ApiError, apiFetch, messageForCode, type FieldError } from './api'
import { formatDuration } from './today'

// Shapes from F-08 §4.1 and §4.2. The server stays authoritative: the UI computes nothing about the streak (R12).
export type HistoryEntry = {
  id: string
  userExerciseId: string
  exerciseName: string
  logDate: string
  sets: number | null
  totalReps: number | null
  durationSec: number | null
  distanceKm: number | null
  kind: 'MANUAL' | 'QUICK_COMPLETE'
  createdAt: string
  scored: boolean
}

export type HistoryDay = {
  date: string
  isRestDay: boolean
  totalScore: number
  totalWeight: number
  overallPercent: number | null
  entries: HistoryEntry[]
}

export type HistoryResponse = { from: string; to: string; days: HistoryDay[] }
export type StreakResponse = { date: string; streak: number; todayPending: boolean; todayPercent: number | null }

export const getStreak = () => apiFetch<StreakResponse>('/api/streak')

export function getHistory(range: { from?: string; to?: string }) {
  const q = new URLSearchParams()
  if (range.from) q.set('from', range.from)
  if (range.to) q.set('to', range.to)
  const qs = q.toString()
  return apiFetch<HistoryResponse>(`/api/history${qs ? `?${qs}` : ''}`)
}

export function describeHistoryError(error: unknown): { message: string; fields: FieldError[] } {
  if (error instanceof ApiError) return { message: messageForCode(error.code, error.message), fields: error.fields }
  return { message: messageForCode('INTERNAL_ERROR'), fields: [] }
}

/** "3-day streak" or "No streak yet" (F-08 §6). */
export const streakLabel = (streak: number) => (streak >= 1 ? `${streak}-day streak` : 'No streak yet')

export const PENDING_HINT = 'Today counts once you reach 70%'

/** Status text of a day row (F-08 §6); `today` is the server date. Null on a Rest Day. */
export function dayStatus(day: Pick<HistoryDay, 'date' | 'overallPercent'>, today: string): string | null {
  if (day.overallPercent === null) return null
  const qualifies = day.overallPercent >= 70
  if (day.date === today) return qualifies ? 'Today, counts toward your streak' : 'Today, in progress'
  return qualifies ? 'Counts toward your streak' : 'Below 70%'
}

/** One entry value with its unit, from whichever measured column is set. */
export function formatHistoryValue(e: Pick<HistoryEntry, 'totalReps' | 'durationSec' | 'distanceKm'>): string {
  if (e.totalReps !== null) return `${e.totalReps} reps`
  if (e.durationSec !== null) return formatDuration(e.durationSec)
  if (e.distanceKm !== null) return `${Number(e.distanceKm.toFixed(2))} km`
  return '—'
}
