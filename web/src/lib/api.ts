import { destroySession, getToken } from '../auth/session'

export type FieldError = {
  field: string
  limit?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: FieldError[]

  constructor(status: number, code: string, message: string, fields: FieldError[] = []) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export const SESSION_EXPIRED_EVENT = 'bunnyfit:session-expired'
export const FORBIDDEN_EVENT = 'bunnyfit:forbidden'

const CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  UNAUTHENTICATED: 'Please sign in again.',
  FORBIDDEN: 'You do not have permission to do this.',
  LOG_DATE_MISMATCH: 'This entry is not for today. Please reload the page.',
  QUICK_COMPLETE_NOT_AVAILABLE: 'Quick Complete is not available for this exercise today.',
  CATEGORY_HAS_TEMPLATES: 'This category still has templates. Delete or move them first.',
  NOT_FOUND: 'That item no longer exists.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  NETWORK_ERROR: 'Something went wrong. Please try again.',
}

export function messageForCode(code: string, fallback = ''): string {
  return CODE_MESSAGES[code] || fallback
}

function codeFromStatus(status: number): string {
  if (status === 400) return 'VALIDATION_ERROR'
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  return 'INTERNAL_ERROR'
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init.body) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Accept', 'application/json')

  let response: Response
  try {
    response = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed')
  }

  if (response.status === 204) {
    return null
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { code?: string; message?: string; fields?: FieldError[] }
    const code = body.code ?? codeFromStatus(response.status)
    const error = new ApiError(response.status, code, body.message ?? '', body.fields ?? [])
    if (response.status === 401 && token && path !== '/api/auth/logout') {
      destroySession()
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
    }
    if (response.status === 403) {
      window.dispatchEvent(new CustomEvent(FORBIDDEN_EVENT))
    }
    throw error
  }

  return payload as T
}
