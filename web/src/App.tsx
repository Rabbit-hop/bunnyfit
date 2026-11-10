import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { landingPath, useAuth } from './auth/AuthContext'
import { LoadingScreen } from './components/LoadingScreen'
import { SessionHeader } from './components/SessionHeader'
import { ErrorPage } from './pages/ErrorPage'
import { LibraryPage } from './pages/LibraryPage'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { PlanPage } from './pages/PlanPage'
import { TemplateFormPage } from './pages/TemplateFormPage'
import { WelcomePage } from './pages/WelcomePage'

type GuardProps = {
  role?: 'PARTICIPANT' | 'MANAGER'
  children: ReactNode
}

function Guard({ role, children }: GuardProps) {
  const { status, user, expired } = useAuth()
  if (status === 'loading') {
    return null
  }
  if (!user) {
    return <Navigate to={expired ? '/login?reason=expired' : '/welcome'} replace />
  }
  if (role && user.role !== role) {
    return <Navigate to="/403" replace />
  }
  return children
}

function RootRedirect() {
  const { status, user, expired } = useAuth()
  if (status === 'loading') {
    return null
  }
  if (user) {
    return <Navigate to={landingPath(user.role)} replace />
  }
  return <Navigate to={expired ? '/login?reason=expired' : '/welcome'} replace />
}

export default function App() {
  const { status, user, retry } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <LoadingScreen />
  }

  // The stored token could not be checked (server or network problem, not a 401):
  // keep the session and let the user retry instead of bouncing them to Welcome.
  if (status === 'error') {
    return (
      <div className="app-shell">
        <main className="app-main">
          <section className="page" role="alert" data-testid="session-error">
            <h2>We can't reach the server</h2>
            <p>Your session is still saved. Check your connection and try again.</p>
            <button type="button" className="btn btn-primary" data-testid="session-retry" onClick={retry}>
              Try again
            </button>
          </section>
        </main>
      </div>
    )
  }

  // The full-screen Welcome page lives outside the app shell
  if (location.pathname === '/welcome') {
    if (user) {
      return <Navigate to={landingPath(user.role)} replace />
    }
    return (
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
      </Routes>
    )
  }

  return (
    <div className={user ? 'app-shell has-tabbar' : 'app-shell'}>
      {user && <SessionHeader />}
      <main className="app-main">
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/403" element={<ErrorPage kind="forbidden" />} />
          <Route
            path="/today"
            element={
              <Guard role="PARTICIPANT">
                <PlaceholderPage title="Today" description="Participant daily logging is implemented in issue #10." />
              </Guard>
            }
          />
          <Route
            path="/plan"
            element={
              <Guard role="PARTICIPANT">
                <PlanPage />
              </Guard>
            }
          />
          <Route
            path="/progress"
            element={
              <Guard role="PARTICIPANT">
                <PlaceholderPage title="Progress" description="Monthly progress is planned for Sprint 2." />
              </Guard>
            }
          />
          <Route
            path="/profile"
            element={
              <Guard role="PARTICIPANT">
                <PlaceholderPage title="Profile" description="Profile and body-weight management is implemented in issue #10." />
              </Guard>
            }
          />
          <Route
            path="/manager/library"
            element={
              <Guard role="MANAGER">
                <LibraryPage />
              </Guard>
            }
          />
          <Route
            path="/manager/library/templates/new"
            element={
              <Guard role="MANAGER">
                <TemplateFormPage />
              </Guard>
            }
          />
          <Route
            path="/manager/library/templates/:id"
            element={
              <Guard role="MANAGER">
                <TemplateFormPage />
              </Guard>
            }
          />
          <Route path="*" element={<ErrorPage kind="notFound" />} />
        </Routes>
      </main>
    </div>
  )
}
