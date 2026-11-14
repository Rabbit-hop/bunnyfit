export function LoadingScreen() {
  return (
    <div className="loading-screen welcome-screen" data-testid="loading-screen" role="status">
      <img
        className="welcome-logo"
        src="/assets/letgetmoving-title.svg"
        alt=""
        aria-hidden="true"
      />
      <img
        className="loading-mascot"
        src="/character/full_character.png"
        alt=""
        aria-hidden="true"
      />
      {/* Same box as the Welcome page's Login button (kept invisible) so the mascot sits identically */}
      <span className="welcome-login welcome-login-spacer" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
