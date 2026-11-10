import { Link } from 'react-router-dom'
import { landingPath, useAuth } from '../auth/AuthContext'

type ErrorPageProps = {
  kind: 'forbidden' | 'notFound'
}

const TITLES: Record<ErrorPageProps['kind'], string> = {
  forbidden: "You don't have access to this page",
  notFound: 'Page not found',
}

export function ErrorPage({ kind }: ErrorPageProps) {
  const { user } = useAuth()
  const home = user ? landingPath(user.role) : '/login'

  return (
    <section className="page">
      <h2>{TITLES[kind]}</h2>
      <Link className="btn btn-primary" to={home} data-testid="error-home">
        Go to home
      </Link>
    </section>
  )
}
