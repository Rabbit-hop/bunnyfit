import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { landingPath, useAuth } from '../auth/AuthContext'
import { LOGOUT_FAILED_KEY } from '../auth/session'
import { ErrorNotice } from '../components/ErrorNotice'
import { APP_NAME } from '../lib/app'

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Password',
}

type FocusRequest =
  | { kind: 'password' }
  | { kind: 'notice' }
  | { kind: 'field'; field: string }

function EyeIcon({ off }: { off: boolean }) {
  if (off) {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" x2="22" y1="2" y2="22" />
      </svg>
    )
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function LoginPage() {
  const { status, user, expired: expiredSession, login } = useAuth()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const [logoutFailed, setLogoutFailed] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  const expired = expiredSession || searchParams.get('reason') === 'expired'

  useEffect(() => {
    if (sessionStorage.getItem(LOGOUT_FAILED_KEY) === '1') {
      sessionStorage.removeItem(LOGOUT_FAILED_KEY)
      setLogoutFailed(true)
    }
  }, [])

  useEffect(() => {
    if (!focusRequest) {
      return
    }
    if (focusRequest.kind === 'password') {
      passwordRef.current?.focus()
      return
    }
    if (focusRequest.kind === 'notice') {
      noticeRef.current?.focus()
      return
    }
    document.querySelector<HTMLInputElement>(`[name="${focusRequest.field}"]`)?.focus()
  }, [focusRequest])

  if (status === 'ready' && user) {
    return <Navigate to={landingPath(user.role)} replace />
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setNotice(null)
    setFieldErrors({})
    setLogoutFailed(false)

    const result = await login(email, password)
    setPending(false)

    if (result.ok) {
      return
    }

    if (result.cause === 'credentials') {
      setPassword('')
      setNotice(result.notice)
      setFocusRequest({ kind: 'password' })
      return
    }

    if (result.fields.length > 0) {
      const errors: Record<string, string> = {}
      const unmatched: string[] = []
      for (const fieldError of result.fields) {
        const label = FIELD_LABELS[fieldError.field]
        if (label) {
          errors[fieldError.field] = fieldError.limit
            ? `${label}: ${fieldError.limit}`
            : `${label} is not valid`
        } else if (fieldError.limit) {
          unmatched.push(`${fieldError.field}: ${fieldError.limit}`)
        } else {
          unmatched.push(fieldError.field)
        }
      }
      setFieldErrors(errors)
      const formNotice = result.notice ?? (unmatched.length > 0 ? unmatched.join(' · ') : null)
      setNotice(formNotice)
      const firstError = Object.keys(errors)[0]
      if (formNotice) {
        setFocusRequest({ kind: 'notice' })
      } else if (firstError) {
        setFocusRequest({ kind: 'field', field: firstError })
      }
      return
    }

    setNotice(result.notice)
    setFocusRequest({ kind: 'notice' })
  }

  return (
    <div className="login-stage">
      <img
        className="login-logo"
        src="/assets/logo.svg"
        alt={APP_NAME}
        data-testid="login-title-art"
      />
      <section className="page login-card">
        <h1 className="login-title">Welcome!</h1>
        <p className="login-subtitle">Sign in to continue your journey</p>
        {expired && (
          <div className="session-banner" data-testid="session-banner">
            Your session has expired. Please sign in again.
          </div>
        )}
        {logoutFailed && <ErrorNotice>Log out did not complete on the server. You are signed out on this device.</ErrorNotice>}
        {notice && <ErrorNotice ref={noticeRef}>{notice}</ErrorNotice>}
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="text"
              inputMode="email"
              autoComplete="username"
              placeholder="Enter your email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              data-testid="login-email"
            />
            {fieldErrors.email && (
              <p className="field-error" data-testid="field-error-email">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <div className="input-with-toggle">
              <input
                id="login-password"
                name="password"
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                ref={passwordRef}
                data-testid="login-password"
              />
              <button
                type="button"
                className="input-toggle"
                data-testid="login-password-toggle"
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                <EyeIcon off={passwordVisible} />
              </button>
            </div>
            {fieldErrors.password && (
              <p className="field-error" data-testid="field-error-password">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="login-options">
            {/* "Remember me" is not built (UI spec: the API has no remember-me; no disabled placeholders). */}
            {/* TODO: wire up to the forgot-password page once that route exists */}
            <a href="#" onClick={(event) => event.preventDefault()}>
              Forgot password?
            </a>
          </div>

          <button type="submit" className="btn btn-primary login-submit" disabled={pending} data-testid="login-submit">
            {pending && <span className="btn-spinner" aria-hidden="true" />}
            {pending ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="login-footer">
          Don’t have an account?{' '}
          {/* TODO: switch to <Link to="/register"> once the signup page exists */}
          <a href="#" onClick={(event) => event.preventDefault()}>
            Create account
          </a>
        </p>
      </section>
    </div>
  )
}
