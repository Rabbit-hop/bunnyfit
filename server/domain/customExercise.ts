import type { CardioCategory, TrackingMode } from '@prisma/client';
import type { FieldError } from './errors.js';

/**
 * Custom exercise validation and defaults (F-03 §3.2 R4, R5). Pure: no storage.
 * The Participant supplies only name, body part, mode and (for distance) the cardio
 * category; unit, metValue and Valid Range are always system defaults.
 */
const TRACKING_MODES: readonly TrackingMode[] = [
  'WEIGHT',
  'BODYWEIGHT_REPS',
  'BODYWEIGHT_TIME',
  'YOGA',
  'CARDIO_TIME',
  'CARDIO_DISTANCE',
];
const CARDIO_CATEGORIES: readonly CardioCategory[] = ['RUNNING', 'WALKING', 'CYCLING', 'SWIMMING'];
const ALLOWED_KEYS = new Set(['name', 'targetBodyPart', 'trackingMode', 'cardioCategory']);

type Unit = 'reps' | 'seconds' | 'km';

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
/** SRS Appendix A.1 planning defaults. */
const MET_OF_MODE: Record<Exclude<TrackingMode, 'CARDIO_DISTANCE'>, number> = {
  WEIGHT: 3.5,
  BODYWEIGHT_REPS: 3.8,
  BODYWEIGHT_TIME: 3.8,
  YOGA: 2.5,
  CARDIO_TIME: 7.0,
};
const MET_OF_CARDIO: Record<CardioCategory, number> = { RUNNING: 9.8, WALKING: 4.3, CYCLING: 8.0, SWIMMING: 5.8 };

export interface CustomExercise {
  name: string;
  targetBodyPart: string;
  trackingMode: TrackingMode;
  unit: Unit;
  cardioCategory: CardioCategory | null;
  metValue: number;
  rangeMin: number;
  rangeMax: number;
}

export function buildCustomExercise(body: unknown): { value: CustomExercise } | { fields: FieldError[] } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { fields: [{ field: 'exercise', limit: 'must be a JSON object' }] };
  }
  const input = body as Record<string, unknown>;
  const fields: FieldError[] = [];
  const fail = (field: string, limit: string) => fields.push({ field, limit });

  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) fail(key, 'is not an allowed field');
  }

  const text = (key: 'name' | 'targetBodyPart', max: number): string => {
    const raw = input[key];
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (trimmed.length < 1 || trimmed.length > max) fail(key, `required, 1-${max} characters after trimming`);
    return trimmed;
  };
  const name = text('name', 80);
  const targetBodyPart = text('targetBodyPart', 50);

  const mode = input['trackingMode'];
  const validMode = typeof mode === 'string' && (TRACKING_MODES as readonly string[]).includes(mode);
  if (!validMode) fail('trackingMode', `required: one of ${TRACKING_MODES.join(', ')}`);

  let cardioCategory: CardioCategory | null = null;
  if (validMode) {
    const raw = input['cardioCategory'];
    if (mode === 'CARDIO_DISTANCE') {
      if (typeof raw === 'string' && (CARDIO_CATEGORIES as readonly string[]).includes(raw)) {
        cardioCategory = raw as CardioCategory;
      } else {
        fail('cardioCategory', `required for CARDIO_DISTANCE: one of ${CARDIO_CATEGORIES.join(', ')}`);
      }
    } else if (raw !== undefined && raw !== null) {
      fail('cardioCategory', 'allowed only for CARDIO_DISTANCE');
    }
  }

  if (fields.length > 0 || !validMode) return { fields };
  const trackingMode = mode as TrackingMode;
  const unit = UNIT_OF[trackingMode];
  const metValue =
    trackingMode === 'CARDIO_DISTANCE' ? MET_OF_CARDIO[cardioCategory as CardioCategory] : MET_OF_MODE[trackingMode];
  return {
    value: {
      name,
      targetBodyPart,
      trackingMode,
      unit,
      cardioCategory,
      metValue,
      rangeMin: RANGE[unit].min,
      rangeMax: RANGE[unit].max,
    },
  };
}
