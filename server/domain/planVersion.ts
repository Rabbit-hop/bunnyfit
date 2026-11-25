import type { TrackingMode } from '@prisma/client';
import type { PlanItemRecord, UserExerciseRecord } from '../repositories/planRepository.js';
import type { FieldError } from './errors.js';
import { isCalendarDate, validateTarget, type TargetFields } from './planValidation.js';

/**
 * Next plan version (F-07 §4.6, R4-R6, R10). Pure: no storage, no Clock (`today` is a parameter).
 * The change is merged into the latest version, the merged values are validated with the
 * F-03 rules, and the fields of the row to insert are returned. The old row is never touched (R1).
 */
export interface NextVersionFields {
  priorityWeight: number;
  target: TargetFields;
  effectiveFrom: string;
  endDate: string | null;
  repeatDays: number[];
}

export type NextVersion = { value: NextVersionFields } | { fields: FieldError[] };

const EDITABLE = new Set([
  'priorityWeight',
  'targetSets',
  'targetRepsPerSet',
  'loadKg',
  'targetDurationSec',
  'targetDistanceKm',
  'repeatDays',
  'endDate',
  'effectiveFrom',
]);
const TARGET_KEYS = ['targetSets', 'targetRepsPerSet', 'loadKg', 'targetDurationSec', 'targetDistanceKm'] as const;

/** R3 first stage: shape of the body, answered before the stored row is looked at. */
function checkShape(patch: unknown): { input: Record<string, unknown> } | { fields: FieldError[] } {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { fields: [{ field: 'body', limit: 'must be a JSON object' }] };
  }
  const input = patch as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length === 0) return { fields: [{ field: 'body', limit: 'at least one editable field is required' }] };

  const fields: FieldError[] = [];
  for (const key of keys) {
    if (!EDITABLE.has(key)) fields.push({ field: key, limit: 'is not an editable field' });
  }
  if (fields.length > 0) return { fields };

  const wrongType = (field: string, limit: string) => fields.push({ field, limit });
  if (input['priorityWeight'] !== undefined && typeof input['priorityWeight'] !== 'number') wrongType('priorityWeight', 'must be a number');
  for (const key of TARGET_KEYS) {
    const v = input[key];
    if (v !== undefined && v !== null && typeof v !== 'number') wrongType(key, 'must be a number');
  }
  if (input['repeatDays'] !== undefined && !Array.isArray(input['repeatDays'])) wrongType('repeatDays', 'must be an array of ISO weekdays 1-7');
  if (input['endDate'] !== undefined && input['endDate'] !== null && typeof input['endDate'] !== 'string') wrongType('endDate', 'must be a date YYYY-MM-DD or null');
  if (input['effectiveFrom'] !== undefined && typeof input['effectiveFrom'] !== 'string') wrongType('effectiveFrom', 'must be a date YYYY-MM-DD');
  return fields.length > 0 ? { fields } : { input };
}

export function buildNextVersion(latest: PlanItemRecord, exercise: UserExerciseRecord, patch: unknown, today: string): NextVersion {
  const shape = checkShape(patch);
  if ('fields' in shape) return shape;
  const input = shape.input;

  // R10: an item that has ended or has not started cannot be edited (a new row would apply from the wrong day).
  if (latest.endDate !== null && latest.endDate < today) {
    return { fields: [{ field: 'id', limit: 'plan item has ended and cannot be changed' }] };
  }
  if (latest.effectiveFrom > today) {
    return { fields: [{ field: 'id', limit: `plan item starts on ${latest.effectiveFrom} and cannot be changed before then` }] };
  }

  const fields: FieldError[] = [];
  const fail = (field: string, limit: string) => fields.push({ field, limit });

  // R5: the new version always starts today; a given effectiveFrom must be today.
  if (input['effectiveFrom'] !== undefined && input['effectiveFrom'] !== today) {
    fail('effectiveFrom', `must be today (${today})`);
  }

  const priorityWeight = input['priorityWeight'] !== undefined ? input['priorityWeight'] : latest.priorityWeight;
  if (!Number.isInteger(priorityWeight) || (priorityWeight as number) < 1 || (priorityWeight as number) > 5) {
    fail('priorityWeight', 'integer 1-5');
  }

  let repeatDays = latest.repeatDays;
  if (input['repeatDays'] !== undefined) {
    const days = input['repeatDays'] as unknown[];
    const valid =
      days.length > 0 && days.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7) && new Set(days).size === days.length;
    if (!valid) fail('repeatDays', 'non-empty array of unique ISO weekdays 1 (Mon) - 7 (Sun)');
    else repeatDays = [...(days as number[])].sort((a, b) => a - b);
  }

  let endDate = latest.endDate;
  if (input['endDate'] !== undefined) {
    const value = input['endDate'];
    if (value === null) endDate = null;
    else if (!isCalendarDate(value)) fail('endDate', 'must be a date YYYY-MM-DD');
    else if (value < today) fail('endDate', `must not be before today (${today})`);
    else endDate = value;
  }

  // R6: validate the merged target (the omitted fields keep the latest version's values).
  const merged = {
    targetSets: latest.targetSets,
    targetRepsPerSet: latest.targetRepsPerSet,
    loadKg: latest.loadKg,
    targetDurationSec: latest.targetDurationSec,
    targetDistanceKm: latest.targetDistanceKm,
  } as Record<(typeof TARGET_KEYS)[number], unknown>;
  for (const key of TARGET_KEYS) if (input[key] !== undefined) merged[key] = input[key];
  const target = validateTarget({
    trackingMode: exercise.trackingMode as TrackingMode,
    range: { min: exercise.rangeMin, max: exercise.rangeMax },
    ...merged,
  });
  if ('fields' in target) fields.push(...target.fields);

  if (fields.length > 0 || !('value' in target)) return { fields };
  return { value: { priorityWeight: priorityWeight as number, target: target.value, effectiveFrom: today, endDate, repeatDays } };
}
