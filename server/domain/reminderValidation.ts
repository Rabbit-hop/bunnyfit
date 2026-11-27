import type { FieldError } from './errors.js';

/**
 * F-09 reminder setting validation (contract §3.1 R5–R10), pure. `repeatDays` stays an ISO
 * weekday array here; the repository converts it to the SDS §3.2 bitmask (F-03 R11).
 */
export interface ReminderFields {
  timeOfDay: string;
  label: string;
  repeatDays: number[];
  enabled: boolean;
}

export type ReminderValidation<T> = { value: T } | { fields: FieldError[] };

/** R5: `HH:mm`, 24-hour, exactly 5 characters (same pattern as the DB CHECK). */
const TIME_OF_DAY = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const LABEL_MAX = 40;
const KEYS = ['timeOfDay', 'label', 'repeatDays', 'enabled'] as const;

function check(body: unknown, required: readonly string[]): ReminderValidation<Partial<ReminderFields>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { fields: [{ field: 'body', limit: 'must be a JSON object' }] };
  }
  const input = body as Record<string, unknown>;
  const fields: FieldError[] = [];
  const fail = (field: string, limit: string) => fields.push({ field, limit });
  const value: Partial<ReminderFields> = {};

  // R10: unknown fields (id, userId, createdAt, ...) are named and rejected.
  for (const key of Object.keys(input)) {
    if (!(KEYS as readonly string[]).includes(key)) fail(key, 'unknown field');
  }
  for (const key of required) {
    if (input[key] === undefined) fail(key, 'is required');
  }

  const time = input['timeOfDay'];
  if (time !== undefined) {
    if (typeof time === 'string' && TIME_OF_DAY.test(time)) value.timeOfDay = time;
    else fail('timeOfDay', 'must be HH:mm between 00:00 and 23:59');
  }

  const label = input['label'];
  if (label !== undefined) {
    const trimmed = typeof label === 'string' ? label.trim() : '';
    if (trimmed.length >= 1 && trimmed.length <= LABEL_MAX) value.label = trimmed;
    else fail('label', `must be text of 1-${LABEL_MAX} characters`);
  }

  const days = input['repeatDays'];
  if (days !== undefined) {
    const valid =
      Array.isArray(days) &&
      days.length > 0 &&
      days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) &&
      new Set(days).size === days.length;
    if (valid) value.repeatDays = [...(days as number[])].sort((a, b) => a - b);
    else fail('repeatDays', 'non-empty array of unique ISO weekdays 1 (Mon) - 7 (Sun)');
  }

  const enabled = input['enabled'];
  if (enabled !== undefined) {
    if (typeof enabled === 'boolean') value.enabled = enabled;
    else fail('enabled', 'must be true or false');
  }

  // Dedupe "is required" + format errors on the same field: keep the first message per field.
  const seen = new Set<string>();
  const unique = fields.filter((f) => (seen.has(f.field) ? false : (seen.add(f.field), true)));
  return unique.length > 0 ? { fields: unique } : { value };
}

/** R9: create needs `timeOfDay` and `label`; `repeatDays` defaults to every day, `enabled` to true. */
export function validateReminderCreate(body: unknown): ReminderValidation<ReminderFields> {
  const result = check(body, ['timeOfDay', 'label']);
  if ('fields' in result) return result;
  return {
    value: {
      timeOfDay: result.value.timeOfDay as string,
      label: result.value.label as string,
      repeatDays: result.value.repeatDays ?? [1, 2, 3, 4, 5, 6, 7],
      enabled: result.value.enabled ?? true,
    },
  };
}

/** R9: update takes any non-empty subset of the four fields; `{}` is rejected. */
export function validateReminderUpdate(body: unknown): ReminderValidation<Partial<ReminderFields>> {
  const result = check(body, []);
  if ('fields' in result) return result;
  if (Object.keys(result.value).length === 0) {
    return { fields: [{ field: 'body', limit: 'send at least one of timeOfDay, label, repeatDays, enabled' }] };
  }
  return result;
}
