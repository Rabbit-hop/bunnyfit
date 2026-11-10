import { useNavigate } from 'react-router-dom'
import { APP_NAME } from '../lib/app'

export function WelcomePage() {
  const navigate = useNavigate()

  return (
    <div className="welcome-screen" data-testid="welcome-screen">
      <img className="welcome-logo" src="/assets/logo.svg" alt={APP_NAME} data-testid="welcome-logo" />
      <button
        type="button"
        className="btn btn-primary welcome-login"
        data-testid="welcome-login"
        onClick={() => navigate('/login')}
      >
        Login
      </button>
    </div>
  )
}
