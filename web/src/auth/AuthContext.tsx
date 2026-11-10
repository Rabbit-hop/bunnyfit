import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { FORBIDDEN_EVENT, SESSION_EXPIRED_EVENT, apiFetch, ApiError, messageForCode, type FieldError } from '../lib/api'
import {
  LOGOUT_FAILED_KEY,
  destroySession,
  loadSession,
  saveSession,
  type AuthUser,
  type Role,
} from './session'

export type LoginResult =
  | { ok: true }
  | {
      ok: false
      cause: 'credentials' | 'validation' | 'request'
      notice: string | null
      fields: FieldError[]
    }

type AuthContextValue = {
  status: 'loading' | 'ready'
  user: AuthUser | null
  expired: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function landingPath(role: Role): string {
  return role === 'MANAGER' ? '/manager/library' : '/today'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const onSessionExpired = () => {
      destroySession()
      setUser(null)
      setStatus('ready')
      setExpired(true)
      navigate('/login?reason=expired', { replace: true })
    }
    const onForbidden = () => {
      navigate('/403')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
    window.addEventListener(FORBIDDEN_EVENT, onForbidden)
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
      window.removeEventListener(FORBIDDEN_EVENT, onForbidden)
    }
  }, [navigate])

  useEffect(() => {
    const token = loadSession()
    if (!token) {
      setStatus('ready')
      return
    }
    let active = true
    apiFetch<AuthUser>('/api/auth/me')
      .then((me) => {
        if (active && me) {
          setUser(me)
        }
      })
      .catch((error) => {
        // Only a real 401 means the token is invalid - apiFetch already
        // destroys the session and dispatches SESSION_EXPIRED_EVENT for that
        // case. Any other failure (a transient 500, a dropped connection) must
        // not sign the user out of a still-valid session.
        if (active && error instanceof ApiError && error.status === 401) {
          destroySession()
        }
      })
      .finally(() => {
        if (active) {
          setStatus('ready')
        }
      })
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      if (!data) {
        return {
          ok: false,
          cause: 'request',
          notice: messageForCode('INTERNAL_ERROR'),
          fields: [],
        }
      }
      saveSession(data.token, data.user)
      setUser(data.user)
      setExpired(false)
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'INVALID_CREDENTIALS') {
          return {
            ok: false,
            cause: 'credentials',
            notice: messageForCode('INVALID_CREDENTIALS'),
            fields: [],
          }
        }
        if (error.status === 400) {
          return {
            ok: false,
            cause: 'validation',
            notice: error.fields.length === 0 ? error.message || messageForCode('VALIDATION_ERROR') : null,
            fields: error.fields,
          }
        }
        return {
          ok: false,
          cause: 'request',
          notice: messageForCode(error.code, error.message || messageForCode('INTERNAL_ERROR')),
          fields: [],
        }
      }
      return {
        ok: false,
        cause: 'request',
        notice: messageForCode('NETWORK_ERROR'),
        fields: [],
      }
    }
  }, [])

  const logout = useCallback(async () => {
    let failed = false
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      failed = true
    }
    if (failed) {
      sessionStorage.setItem(LOGOUT_FAILED_KEY, '1')
    } else {
      sessionStorage.removeItem(LOGOUT_FAILED_KEY)
    }
    destroySession()
    setUser(null)
    setStatus('ready')
    setExpired(false)
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo(
    () => ({ status, user, expired, login, logout }),
    [status, user, expired, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
