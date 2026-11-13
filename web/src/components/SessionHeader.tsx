import { useAuth } from '../auth/AuthContext'

export function SessionHeader() {
  const { user, logout } = useAuth()

  if (!user) {
    return null
  }

  return (
    <header className="session-header">
      <span className="sr-only" data-testid="session-display-name">
        {user.displayName}
      </span>
      <span className="session-role" data-testid="session-role">
        {user.role}
      </span>
      <button
        type="button"
        className="btn btn-secondary session-logout"
        data-testid="logout-button"
        onClick={() => {
          void logout()
        }}
      >
        Log out
      </button>
    </header>
  )
}