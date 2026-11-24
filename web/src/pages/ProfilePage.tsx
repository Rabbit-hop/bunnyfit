import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ErrorNotice } from '../components/ErrorNotice'
import { describeProfileError, parseWeight, profileApi, type Profile } from '../lib/profile'

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; profile: Profile }

/**
 * S-07 Profile (ui-spec.md, F-04 §4.5): email and display name (read-only), the current weight with its date,
 * and the "Body weight (kg)" form. Each save appends a new weight record on the server; a 400 is shown
 * inline under the field and the typed value stays (UI spec §3.4).
 */
export function ProfilePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [weight, setWeight] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [pending, setPending] = useState(false)
  const noticeRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'ready', profile: await profileApi.get() })
    } catch (error) {
      setState({ status: 'error', message: describeProfileError(error).message })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setToast('')
    setNotice('')
    setFieldError('')
    const value = parseWeight(weight)
    if (value === null) {
      setFieldError('weightKg: enter a number, for example 68.5.')
      return
    }
    setPending(true)
    try {
      const profile = await profileApi.saveWeight(value)
      setState({ status: 'ready', profile })
      setWeight('')
      setToast('Weight saved')
    } catch (error) {
      const { fields, message } = describeProfileError(error)
      const own = fields.find((f) => f.field === 'weightKg')
      // The typed value stays in place after a rejected save.
      if (own) {
        setFieldError(`weightKg: ${own.limit ?? 'invalid value'}`)
        setNotice('Please fix the highlighted field.')
      } else {
        setNotice(message)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="profile-page" data-testid="profile-page">
      <header className="page-holder">
        <h2>Profile</h2>
      </header>
      <div className="page">
        {state.status === 'loading' && <p data-testid="profile-loading">Loading…</p>}
        {state.status === 'error' && (
          <>
            <ErrorNotice>{state.message}</ErrorNotice>
            <button type="button" className="btn btn-secondary" data-testid="profile-retry" onClick={() => void load()}>
              Retry
            </button>
          </>
        )}
        {state.status === 'ready' && (
          <>
            {toast && (
              <p className="toast" role="status" data-testid="profile-toast">
                {toast}
              </p>
            )}
            {notice && <ErrorNotice ref={noticeRef}>{notice}</ErrorNotice>}
            <dl className="profile-details">
              <dt>Name</dt>
              <dd data-testid="profile-display-name">{state.profile.displayName}</dd>
              <dt>Email</dt>
              <dd data-testid="profile-email">{state.profile.email}</dd>
              <dt>Current weight</dt>
              <dd data-testid="profile-current-weight">
                {state.profile.currentWeightKg === null ? (
                  <span data-testid="profile-no-weight">No weight set. Needed to estimate calories.</span>
                ) : (
                  <>
                    {state.profile.currentWeightKg} kg <span className="muted" data-testid="profile-weight-date">(since {state.profile.weightEffectiveDate})</span>
                  </>
                )}
              </dd>
            </dl>
            <form onSubmit={onSubmit} noValidate data-testid="profile-form">
              <div className="field">
                <label htmlFor="profile-weight">Body weight (kg)</label>
                <input id="profile-weight" data-testid="profile-weight-input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
                {fieldError && (
                  <p className="field-error" data-testid="field-error-weightKg">
                    {fieldError}
                  </p>
                )}
              </div>
              <button type="submit" className="btn btn-primary" data-testid="profile-save" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  )
}
