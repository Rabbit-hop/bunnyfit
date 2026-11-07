import { Navigate, Route, Routes } from 'react-router-dom'
import { PlaceholderPage } from './pages/PlaceholderPage'

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>BunnyFit</h1>
        <p>Habit and activity tracking</p>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route
            path="/login"
            element={<PlaceholderPage title="Sign in" description="Authentication UI is implemented in issue #7." />}
          />
          <Route
            path="/manager/library"
            element={
              <PlaceholderPage
                title="Exercise Library"
                description="Manager template management is implemented in issue #8."
              />
            }
          />
          <Route
            path="/manager/library/templates/new"
            element={
              <PlaceholderPage
                title="New Template"
                description="Manager template creation is implemented in issue #8."
              />
            }
          />
          <Route
            path="/manager/library/templates/:id"
            element={
              <PlaceholderPage
                title="Edit Template"
                description="Manager template editing is implemented in issue #8."
              />
            }
          />
          <Route
            path="/today"
            element={<PlaceholderPage title="Today" description="Participant daily logging is implemented in issue #10." />}
          />
          <Route
            path="/plan"
            element={<PlaceholderPage title="Plan" description="Participant plan configuration is implemented in issue #9." />}
          />
          <Route
            path="/progress"
            element={<PlaceholderPage title="Progress" description="Monthly progress is planned for Sprint 2." />}
          />
          <Route
            path="/profile"
            element={<PlaceholderPage title="Profile" description="Profile and body-weight management is implemented in issue #10." />}
          />
          <Route
            path="/403"
            element={<PlaceholderPage title="Access denied" description="You don't have access to this page." />}
          />
          <Route path="*" element={<PlaceholderPage title="Not found" description="This route does not exist." />} />
        </Routes>
      </main>
    </div>
  )
}
