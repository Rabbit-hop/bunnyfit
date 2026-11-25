import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PENDING_HINT, getStreak, streakLabel, type StreakResponse } from '../lib/history'

/**
 * Streak badge (F-08 §6): the value of GET /api/streak and nothing computed in the browser (R12).
 * It links to History. `refreshKey` lets the host page refetch after the day's entries changed.
 * It is a convenience: if the streak cannot be loaded it renders nothing instead of an error.
 */
export function StreakBadge({ refreshKey }: { refreshKey?: unknown }) {
  const [streak, setStreak] = useState<StreakResponse | null>(null)

  useEffect(() => {
    let alive = true
    getStreak()
      .then((s) => {
        if (alive) setStreak(s)
      })
      .catch(() => {
        if (alive) setStreak(null)
      })
    return () => {
      alive = false
    }
  }, [refreshKey])

  if (!streak) return null
  return (
    <Link to="/history" className="streak-badge" data-testid="streak-badge">
      <span data-testid="streak-value" data-streak={streak.streak}>
        {streakLabel(streak.streak)}
      </span>
      {streak.todayPending && (
        <span className="streak-hint" data-testid="streak-pending-hint">
          {PENDING_HINT}
        </span>
      )}
    </Link>
  )
}
