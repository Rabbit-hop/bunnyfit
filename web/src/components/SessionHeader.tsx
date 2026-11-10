import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { APP_NAME } from '../lib/app'

const PARTICIPANT_LINKS = [
  { to: '/today', label: 'Today', testId: 'nav-today' },
  { to: '/plan', label: 'My Plan', testId: 'nav-plan' },
]

const MANAGER_LINKS = [{ to: '/manager/library', label: 'Exercise Library', testId: 'nav-library' }]

export function SessionHeader() {
  const { user, logout } = useAuth()

  if (!user) {
    return null
  }

  const links = user.role === 'MANAGER' ? MANAGER_LINKS : PARTICIPANT_LINKS

  return (
    <header className="session-header">
      <div className="session-brand">{APP_NAME}</div>
      <nav className="session-nav" aria-label="Main">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} data-testid={link.testId}>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="session-user">
        <span className="session-name" data-testid="session-display-name">
          {user.displayName}
        </span>
        <span className="session-role" data-testid="session-role">
          {user.role}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="logout-button"
          onClick={() => {
            void logout()
          }}
        >
          Log out
        </button>
      </div>
    </header>
  )
}
