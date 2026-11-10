export function LoadingScreen() {
  return (
    <div className="loading-screen" data-testid="loading-screen" role="status">
      <img
        className="loading-title"
        src="/assets/letgetmoving.svg"
        alt=""
        aria-hidden="true"
      />
      <img
        className="loading-mascot"
        src="/character/full_character.png"
        alt=""
        aria-hidden="true"
      />
      <span className="sr-only">Loading…</span>
    </div>
  )
}