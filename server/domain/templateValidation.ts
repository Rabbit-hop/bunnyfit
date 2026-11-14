import type { CardioCategory, TrackingMode } from '@prisma/client';
import type { FieldError } from './errors.js';

/**
 * Exercise template validation (F-02 §3.2 R4-R10, §3.3). Pure: no storage, so
 * rules that need the database (name uniqueness, category existence) live elsewhere.
 */
export const TRACKING_MODES: readonly TrackingMode[] = [
  'WEIGHT',
  'BODYWEIGHT_REPS',
  'BODYWEIGHT_TIME',
  'YOGA',
  'CARDIO_TIME',
  'CARDIO_DISTANCE',
];
const CARDIO_CATEGORIES: readonly CardioCategory[] = ['RUNNING', 'WALKING', 'CYCLING', 'SWIMMING'];
const ALLOWED_KEYS = new Set([
  'categoryId',
  'name',
  'targetBodyPart',
  'trackingMode',
  'unit',
  'cardioCategory',
  'metValue',
  'rangeMin',
  'rangeMax',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Unit = 'reps' | 'seconds' | 'km';

/** R6 unit per mode, R10 minimum and central limit per unit. */
const UNIT_OF: Record<TrackingMode, Unit> = {
  WEIGHT: 'reps',
  BODYWEIGHT_REPS: 'reps',
  BODYWEIGHT_TIME: 'seconds',
  YOGA: 'seconds',
  CARDIO_TIME: 'seconds',
  CARDIO_DISTANCE: 'km',
};
const RANGE: Record<Unit, { min: number; max: number }> = {
  reps: { min: 1, max: 4000 },
  seconds: { min: 1, max: 10800 },
  km: { min: 0.01, max: 100 },
};

export interface TemplateInput {
  categoryId: string;
  name: string;
  targetBodyPart: string;
  trackingMode: TrackingMode;
  unit: Unit;
  cardioCategory: CardioCategory | null;
  metValue: number;
  rangeMin: number;
  rangeMax: number;
}

export interface TemplateValidationOptions {
  /** Update: the stored mode. `trackingMode` may be omitted or equal to it, never different (R5). */
  existingMode?: TrackingMode;
}

export type TemplateValidation = { value: TemplateInput } | { fields: FieldError[] };

/** True if `value` has at most `decimals` decimal places (avoids float noise such as 1.1 * 10). */
function hasAtMostDecimals(value: number, decimals: number): boolean {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor === value;
}

function trimmedLength(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

export function validateTemplate(body: unknown, options: TemplateValidationOptions = {}): TemplateValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { fields: [{ field: 'body', limit: 'must be a JSON object' }] };
  }
  const input = body as Record<string, unknown>;
  const fields: FieldError[] = [];
  const fail = (field: string, limit: string) => fields.push({ field, limit });

  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) fail(key, 'is not an allowed field');
  }

  const categoryId = input['categoryId'];
  if (typeof categoryId !== 'string' || !UUID.test(categoryId)) fail('categoryId', 'must be a UUID');

  const name = trimmedLength(input['name'], 1, 80);
  if (name === null) fail('name', '1-80 characters');

  const targetBodyPart = trimmedLength(input['targetBodyPart'], 1, 50);
  if (targetBodyPart === null) fail('targetBodyPart', '1-50 characters');

  // trackingMode (R5): required on create; on update omitted or unchanged.
  let mode: TrackingMode | null = null;
  const rawMode = input['trackingMode'];
  if (options.existingMode !== undefined) {
    if (rawMode !== undefined && rawMode !== options.existingMode) {
      fail('trackingMode', 'cannot be changed after creation');
    } else {
      mode = options.existingMode;
    }
  } else if (typeof rawMode === 'string' && (TRACKING_MODES as readonly string[]).includes(rawMode)) {
    mode = rawMode as TrackingMode;
  } else {
    fail('trackingMode', `must be one of ${TRACKING_MODES.join(', ')}`);
  }

  const rawMet = input['metValue'];
  if (typeof rawMet !== 'number' || !Number.isFinite(rawMet) || rawMet <= 0 || rawMet > 25 || !hasAtMostDecimals(rawMet, 1)) {
    fail('metValue', 'a number greater than 0 and at most 25 with at most 1 decimal');
  }

  let unit: Unit | null = null;
  let cardioCategory: CardioCategory | null = null;
  let rangeMin = 0;
  let rangeMax = 0;
  if (mode !== null) {
    unit = UNIT_OF[mode];
    if (input['unit'] !== undefined && input['unit'] !== unit) fail('unit', `must be '${unit}' for ${mode}`);

    // R7: required for CARDIO_DISTANCE, forbidden otherwise.
    const rawCardio = input['cardioCategory'];
    if (mode === 'CARDIO_DISTANCE') {
      if (typeof rawCardio === 'string' && (CARDIO_CATEGORIES as readonly string[]).includes(rawCardio)) {
        cardioCategory = rawCardio as CardioCategory;
      } else {
        fail('cardioCategory', `required for CARDIO_DISTANCE: one of ${CARDIO_CATEGORIES.join(', ')}`);
      }
    } else if (rawCardio !== undefined && rawCardio !== null) {
      fail('cardioCategory', 'allowed only for CARDIO_DISTANCE');
    }

    // R10: Valid Range, defaults when omitted.
    const limits = RANGE[unit];
    const rawMin = input['rangeMin'] ?? limits.min;
    const rawMax = input['rangeMax'] ?? limits.max;
    const minOk = typeof rawMin === 'number' && Number.isFinite(rawMin) && rawMin >= limits.min && hasAtMostDecimals(rawMin, 2);
    const maxOk = typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax <= limits.max && hasAtMostDecimals(rawMax, 2);
    if (!minOk) fail('rangeMin', `at least ${limits.min} ${unit}, at most 2 decimals`);
    if (!maxOk) fail('rangeMax', `at most ${limits.max} ${unit}, at most 2 decimals`);
    if (minOk && maxOk) {
      if ((rawMin as number) > (rawMax as number)) fail('rangeMin', 'must not exceed rangeMax');
      rangeMin = rawMin as number;
      rangeMax = rawMax as number;
    }
  }

  if (fields.length > 0 || mode === null || unit === null) return { fields };
  return {
    value: {
      categoryId: categoryId as string,
      name: name as string,
      targetBodyPart: targetBodyPart as string,
      trackingMode: mode,
      unit,
      cardioCategory,
      metValue: rawMet as number,
      rangeMin,
      rangeMax,
    },
  };
}
