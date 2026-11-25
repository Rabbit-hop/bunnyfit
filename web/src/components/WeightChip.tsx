import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { profileApi } from '../lib/profile'

/**
 * Body-weight chip on Today (issue #71 Part 1): the current weight, or "Set body weight" when there is none,
 * linking to the Profile screen. It is a convenience only: if the profile cannot be loaded it renders nothing
 * and never shows an error on Today.
 */
export function WeightChip() {
  const [kg, setKg] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    profileApi
      .get()
      .then((p) => {
        if (alive) setKg(p.currentWeightKg)
      })
      .catch(() => {
        if (alive) setKg(undefined)
      })
    return () => {
      alive = false
    }
  }, [])

  if (kg === undefined) return null
  return (
    <Link to="/profile" className="weight-chip" data-testid="weight-chip">
      {kg === null ? 'Set body weight' : `Body weight: ${kg} kg`}
    </Link>
  )
}
