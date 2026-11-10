export type Role = 'PARTICIPANT' | 'MANAGER'

export type AuthUser = {
  id: string
  email: string
  role: Role
  displayName: string
}

const TOKEN_KEY = 'bunnyfit.token'
const USER_KEY = 'bunnyfit.user'

export const LOGOUT_FAILED_KEY = 'bunnyfit.logout-failed'

let memoryToken: string | null = null

export function getToken(): string | null {
  return memoryToken
}

export function loadSession(): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY)
  memoryToken = token
  return token
}

export function saveSession(token: string, user: AuthUser): void {
  memoryToken = token
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function readStoredUser(): AuthUser | null {
  const raw = sessionStorage.getItem(USER_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function destroySession(): void {
  memoryToken = null
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}
