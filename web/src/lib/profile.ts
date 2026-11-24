import { ApiError, apiFetch, messageForCode, type FieldError } from './api'

// F-04 §4.5 (Sprint 2): the Participant's own profile. The server stays authoritative; the UI only shows it.
export type Profile = {
  email: string
  displayName: string
  currentWeightKg: number | null
  weightEffectiveDate: string | null
}

export const profileApi = {
  get: async (): Promise<Profile> => (await apiFetch<Profile>('/api/profile'))!,
  saveWeight: async (weightKg: number): Promise<Profile> =>
    (await apiFetch<Profile>('/api/profile', { method: 'PUT', body: JSON.stringify({ weightKg }) }))!,
}

/** A weight as the user types it: digits with at most one decimal; anything else is left to the server's 400. */
export function parseWeight(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function describeProfileError(error: unknown): { code: string; message: string; fields: FieldError[] } {
  if (error instanceof ApiError) {
    return { code: error.code, message: messageForCode(error.code, error.message), fields: error.fields }
  }
  return { code: 'INTERNAL_ERROR', message: messageForCode('INTERNAL_ERROR'), fields: [] }
}
