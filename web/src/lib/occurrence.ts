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
