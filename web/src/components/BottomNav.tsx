import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

type Item = { to: string; label: string; testId: string; icon: ReactNode; comingSoon?: boolean; center?: boolean }

// Icons are the SVG files in web/public/icon, drawn as a mask so they take the button's text colour.
const icon = (file: string) => (
  <span
    className="bottom-nav-icon"
    style={{ WebkitMaskImage: `url(/icon/${file})`, maskImage: `url(/icon/${file})` }}
    aria-hidden="true"
  />
)

const TODAY = icon('home-heart.svg')
const PROGRESS = icon('stats.svg')
const PLAN = icon('calendar.svg')
const PROFILE = icon('user.svg')
const ADD = icon('add.svg')

const PARTICIPANT_ITEMS: Item[] = [
  { to: '/today', label: 'Today', testId: 'nav-today', icon: TODAY },
  { to: '/progress', label: 'Progress', testId: 'nav-progress', icon: PROGRESS, comingSoon: true },
  // Opens the Add Exercise dialog on the plan page (PlanPage reads ?add=1).
  { to: '/plan?add=1', label: 'Add exercise', testId: 'nav-add', icon: ADD, center: true },
  { to: '/plan', label: 'My Plan', testId: 'nav-plan', icon: PLAN },
  { to: '/profile', label: 'Profile', testId: 'nav-profile', icon: PROFILE, comingSoon: true },
]

export function BottomNav() {
  const { user } = useAuth()
  const [notice, setNotice] = useState('')

  // The notice dismisses itself.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  // The Manager's only Sprint 1 screen is the Library, so there is nothing to switch to.
  if (user?.role !== 'PARTICIPANT') return null
  const items = PARTICIPANT_ITEMS

  return (
    <nav className="bottom-nav" aria-label="Main">
      {notice && (
        <p className="bottom-nav-notice" role="status" data-testid="nav-coming-soon">
          {notice}
        </p>
      )}
      {items.map((item) =>
        item.center ? (
          <Link
            key={item.to}
            to={item.to}
            aria-label={item.label}
            title={item.label}
            data-testid={item.testId}
            className="bottom-nav-item is-center"
          >
            {item.icon}
          </Link>
        ) : item.comingSoon ? (
          <button
            key={item.to}
            type="button"
            aria-label={item.label}
            title={item.label}
            data-testid={item.testId}
            className="bottom-nav-item"
            onClick={() => setNotice(`${item.label} is coming in Sprint 2.`)}
          >
            {item.icon}
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        ) : (
        <NavLink
          key={item.to}
          to={item.to}
          aria-label={item.label}
          title={item.label}
          data-testid={item.testId}
          className="bottom-nav-item"
        >
          {item.icon}
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
        ),
      )}
    </nav>
  )
}
