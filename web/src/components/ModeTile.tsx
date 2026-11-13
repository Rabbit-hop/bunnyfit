import type { ReactNode } from 'react'
import type { TrackingMode } from '../lib/library'

// Small coloured tile with a line icon per kind of exercise (Today cards and the Rest Day picker).
const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ICON: Record<TrackingMode, { tone: string; icon: ReactNode }> = {
  WEIGHT: {
    tone: 'pink',
    icon: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  },
  BODYWEIGHT_REPS: {
    tone: 'pink',
    icon: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  },
  BODYWEIGHT_TIME: {
    tone: 'blue',
    icon: (
      <>
        <circle cx="12" cy="13" r="7" />
        <path d="M12 9.5V13l2.5 1.5M9.5 3h5" />
      </>
    ),
  },
  YOGA: {
    tone: 'yellow',
    icon: (
      <>
        <circle cx="12" cy="6" r="2" />
        <path d="M12 8.5v4M12 12.5l-5 4.5M12 12.5l5 4.5M5 17h14" />
      </>
    ),
  },
  CARDIO_TIME: {
    tone: 'green',
    icon: (
      <>
        <circle cx="14" cy="5" r="2" />
        <path d="M13 8l-3 4 3 2-1 5M10 12l-4 1M13 14l4 1" />
      </>
    ),
  },
  CARDIO_DISTANCE: {
    tone: 'green',
    icon: (
      <>
        <circle cx="14" cy="5" r="2" />
        <path d="M13 8l-3 4 3 2-1 5M10 12l-4 1M13 14l4 1" />
      </>
    ),
  },
}

export function ModeTile({ mode }: { mode: TrackingMode }) {
  const { tone, icon } = ICON[mode]
  return (
    <span className={`mode-tile mode-tile-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" {...line}>
        {icon}
      </svg>
    </span>
  )
}
