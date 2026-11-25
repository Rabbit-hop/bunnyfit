// Which plan items occur on a date. Kept free of imports so unit tests can load it directly.

/** The plan-item fields the occurrence rule reads. */
export type OccurrenceItem = {
  planKey: string
  version: number
  effectiveFrom: string
  endDate: string | null
  repeatDays: number[]
}

/**
 * Which plan items occur on `iso` (F-03 contract R12, mirrored for the calendar so a whole month
 * can be drawn from one GET /api/plan-items). For each planKey take the version with the greatest
 * effectiveFrom <= date (ties: highest version); it occurs when the date is not past endDate and
 * the ISO weekday (1 = Mon ... 7 = Sun) is in repeatDays. ISO dates compare correctly as strings.
 */
export function itemsOn<T extends { planItem: OccurrenceItem }>(entries: T[], iso: string, weekday: number): T[] {
  const current = new Map<string, T>()
  for (const entry of entries) {
    const { planKey, effectiveFrom, version } = entry.planItem
    if (effectiveFrom > iso) continue
    const best = current.get(planKey)
    if (
      !best ||
      effectiveFrom > best.planItem.effectiveFrom ||
      (effectiveFrom === best.planItem.effectiveFrom && version > best.planItem.version)
    ) {
      current.set(planKey, entry)
    }
  }
  return [...current.values()].filter(
    ({ planItem }) => (planItem.endDate === null || iso <= planItem.endDate) && planItem.repeatDays.includes(weekday),
  )
}

/**
 * The newest version of a plan item (F-07 R7): the highest `version` of its planKey, whichever day
 * is selected on My Plan. Edit and End always start from this row, never from the version shown for a past day.
 */
export function latestVersionOf<T extends { planItem: { planKey: string; version: number } }>(entries: T[], planKey: string): T | null {
  let best: T | null = null
  for (const entry of entries) {
    if (entry.planItem.planKey !== planKey) continue
    if (!best || entry.planItem.version > best.planItem.version) best = entry
  }
  return best
}

/**
 * Whether the latest version can still be changed (F-07 R10): an item that has already ended
 * (`endDate` before today) or that starts after today is read-only. ISO dates compare as strings.
 */
export function editState(latest: { effectiveFrom: string; endDate: string | null }, today: string): 'editable' | 'ended' | 'not-started' {
  if (latest.endDate !== null && latest.endDate < today) return 'ended'
  if (latest.effectiveFrom > today) return 'not-started'
  return 'editable'
}
