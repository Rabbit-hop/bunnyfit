import { useNavigate } from 'react-router-dom'
import { APP_NAME } from '../lib/app'

export function WelcomePage() {
  const navigate = useNavigate()

  return (
    <div className="loading-screen welcome-screen" data-testid="welcome-screen">
      <img className="welcome-logo" src="/assets/letgetmoving-title.svg" alt={APP_NAME} data-testid="welcome-logo" />
      <img className="loading-mascot" src="/character/full_character.png" alt="" aria-hidden="true" />
      <button
        type="button"
        className="btn btn-primary welcome-login"
        data-testid="welcome-login"
        onClick={() => navigate('/login')}
      >
        <img src="/assets/login-word.svg" alt="Login" className="welcome-login-word" />
      </button>
    </div>
  )
}
