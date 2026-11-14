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

// sessionStorage can throw (blocked site data, private windows); the in-memory token still works then.
export function loadSession(): string | null {
  let token: string | null = null
  try {
    token = sessionStorage.getItem(TOKEN_KEY)
  } catch {
    token = null
  }
  memoryToken = token
  return token
}

export function saveSession(token: string, user: AuthUser): void {
  memoryToken = token
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // Not persisted across reloads, but the session works for this page load.
  }
}

export function readStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function destroySession(): void {
  memoryToken = null
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
  } catch {
    // Nothing stored that could be removed.
  }
}
