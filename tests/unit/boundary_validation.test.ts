import { describe, expect, it } from 'vitest';
import { buildCustomExercise } from '../../server/domain/customExercise.js';
import { validateEntry, validateWeight } from '../../server/domain/entryValidation.js';
import { validateTarget } from '../../server/domain/planValidation.js';
import { validateTemplate } from '../../server/domain/templateValidation.js';

// TEST-11 (F-02 cases) — F-02 STS §8: `validateTemplate` boundary pairs and unit/mode
// derivation, asserted without HTTP. F-03 cases (`validateTarget`, F-03 STS TEST-11) follow below;
// the F-04 cases of AC-11 (`validateEntry`, `validateWeight`) are the last two blocks.

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    categoryId: CATEGORY_ID,
    name: 'Goblet Squat',
    targetBodyPart: 'Legs',
    trackingMode: 'WEIGHT',
    metValue: 3.5,
    ...overrides,
  };
}

function accepted(overrides: Record<string, unknown> = {}, existingMode?: string) {
  const result = validateTemplate(body(overrides), existingMode ? { existingMode: existingMode as never } : {});
  if ('fields' in result) throw new Error(`expected accepted, got ${JSON.stringify(result.fields)}`);
  return result.value;
}

function rejectedFields(overrides: Record<string, unknown> = {}, existingMode?: string): string[] {
  const result = validateTemplate(body(overrides), existingMode ? { existingMode: existingMode as never } : {});
  if (!('fields' in result)) throw new Error('expected rejected, got accepted');
  for (const f of result.fields) {
    expect(f.limit.length).toBeGreaterThan(0); // every error names the field and its limit
  }
  return result.fields.map((f) => f.field);
}

describe('TEST-11 (F-02 cases): validateTemplate', () => {
  describe('unit derives from trackingMode (R6)', () => {
    it.each([
      ['WEIGHT', 'reps'],
      ['BODYWEIGHT_REPS', 'reps'],
      ['BODYWEIGHT_TIME', 'seconds'],
      ['YOGA', 'seconds'],
      ['CARDIO_TIME', 'seconds'],
    ])('%s → %s', (mode, unit) => {
      expect(accepted({ trackingMode: mode }).unit).toBe(unit);
    });

    it('CARDIO_DISTANCE → km, with cardioCategory', () => {
      const v = accepted({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'RUNNING' });
      expect(v.unit).toBe('km');
      expect(v.cardioCategory).toBe('RUNNING');
    });

    it('a supplied unit that does not match is rejected, naming unit', () => {
      expect(rejectedFields({ unit: 'kg' })).toEqual(['unit']);
    });

    it('a matching supplied unit is accepted', () => {
      expect(accepted({ unit: 'reps' }).unit).toBe('reps');
    });
  });

  describe('Valid Range limits (R10): same pairs as TEST-02d-5', () => {
    it.each([
      ['WEIGHT', 4000, 4001],
      ['BODYWEIGHT_TIME', 10800, 10801],
      ['CARDIO_DISTANCE', 100, 100.01],
    ])('%s rangeMax %s accepted, %s rejected', (mode, ok, bad) => {
      const extra = mode === 'CARDIO_DISTANCE' ? { cardioCategory: 'RUNNING' } : {};
      expect(accepted({ trackingMode: mode, rangeMax: ok, ...extra }).rangeMax).toBe(ok);
      expect(rejectedFields({ trackingMode: mode, rangeMax: bad, ...extra })).toEqual(['rangeMax']);
    });

    it('rangeMin 0 is rejected (minimum 1 for reps and seconds)', () => {
      expect(rejectedFields({ rangeMin: 0 })).toEqual(['rangeMin']);
    });

    it('rangeMin 0.01 km is the minimum for distance; 0 is rejected', () => {
      const extra = { trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'RUNNING' };
      expect(accepted({ ...extra, rangeMin: 0.01 }).rangeMin).toBe(0.01);
      expect(rejectedFields({ ...extra, rangeMin: 0 })).toEqual(['rangeMin']);
    });

    it('rangeMin > rangeMax is rejected; rangeMin = rangeMax is accepted', () => {
      expect(rejectedFields({ rangeMin: 10, rangeMax: 5 })).toContain('rangeMin');
      const v = accepted({ rangeMin: 7, rangeMax: 7 });
      expect([v.rangeMin, v.rangeMax]).toEqual([7, 7]);
    });

    it('omitted range defaults to the minimum and the central limit', () => {
      expect([accepted().rangeMin, accepted().rangeMax]).toEqual([1, 4000]);
      expect([accepted({ trackingMode: 'YOGA' }).rangeMin, accepted({ trackingMode: 'YOGA' }).rangeMax]).toEqual([1, 10800]);
      const km = accepted({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'CYCLING' });
      expect([km.rangeMin, km.rangeMax]).toEqual([0.01, 100]);
    });
  });

  describe('field rules', () => {
    it('name: 80 characters accepted; 81, empty and whitespace-only rejected; trimmed', () => {
      expect(accepted({ name: 'a'.repeat(80) }).name).toHaveLength(80);
      expect(rejectedFields({ name: 'a'.repeat(81) })).toEqual(['name']);
      expect(rejectedFields({ name: '' })).toEqual(['name']);
      expect(rejectedFields({ name: '   ' })).toEqual(['name']);
      expect(accepted({ name: '  Row  ' }).name).toBe('Row');
    });

    it('targetBodyPart: 50 accepted; 51 and empty rejected', () => {
      expect(accepted({ targetBodyPart: 'b'.repeat(50) }).targetBodyPart).toHaveLength(50);
      expect(rejectedFields({ targetBodyPart: 'b'.repeat(51) })).toEqual(['targetBodyPart']);
      expect(rejectedFields({ targetBodyPart: '' })).toEqual(['targetBodyPart']);
    });

    it('metValue: 25 and 0.1 accepted; 0, 25.1, 3.55 and a string rejected', () => {
      expect(accepted({ metValue: 25 }).metValue).toBe(25);
      expect(accepted({ metValue: 0.1 }).metValue).toBe(0.1);
      for (const bad of [0, 25.1, 3.55, '3.5']) expect(rejectedFields({ metValue: bad })).toEqual(['metValue']);
    });

    it('unknown trackingMode, malformed categoryId and unknown extra field are rejected by name', () => {
      expect(rejectedFields({ trackingMode: 'SWIM' })).toEqual(['trackingMode']);
      expect(rejectedFields({ categoryId: 'not-a-uuid' })).toEqual(['categoryId']);
      expect(rejectedFields({ colour: 'red' })).toEqual(['colour']);
    });

    it('cardioCategory is required for CARDIO_DISTANCE and forbidden otherwise (R7)', () => {
      expect(rejectedFields({ trackingMode: 'CARDIO_DISTANCE' })).toEqual(['cardioCategory']);
      expect(rejectedFields({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'RUNNING ' })).toEqual(['cardioCategory']);
      expect(rejectedFields({ cardioCategory: 'RUNNING' })).toEqual(['cardioCategory']);
      for (const c of ['RUNNING', 'WALKING', 'CYCLING', 'SWIMMING']) {
        expect(accepted({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: c }).cardioCategory).toBe(c);
      }
    });
  });

  describe('update (existingMode given)', () => {
    it('trackingMode omitted or unchanged is accepted and keeps the existing mode', () => {
      const { trackingMode: _omit, ...rest } = body();
      const result = validateTemplate(rest, { existingMode: 'WEIGHT' });
      if ('fields' in result) throw new Error(JSON.stringify(result.fields));
      expect(result.value.trackingMode).toBe('WEIGHT');
      expect(accepted({ trackingMode: 'WEIGHT' }, 'WEIGHT').trackingMode).toBe('WEIGHT');
    });

    it('changing trackingMode is rejected, naming trackingMode (R5)', () => {
      expect(rejectedFields({ trackingMode: 'YOGA' }, 'WEIGHT')).toEqual(['trackingMode']);
    });
  });
});

// TEST-11 (F-03 cases) — F-03 STS §8: boundary pairs of TEST-03b-1 / 03b-2, asserted without HTTP.
type TargetMode = 'WEIGHT' | 'BODYWEIGHT_REPS' | 'BODYWEIGHT_TIME' | 'YOGA' | 'CARDIO_TIME' | 'CARDIO_DISTANCE';
const FULL_RANGE = { WEIGHT: { min: 1, max: 4000 }, SECONDS: { min: 1, max: 10800 }, KM: { min: 0.01, max: 100 } };

function target(mode: TargetMode, input: Record<string, unknown>, range = FULL_RANGE.WEIGHT) {
  return validateTarget({ trackingMode: mode, range, ...input } as never);
}
function targetAccepted(mode: TargetMode, input: Record<string, unknown>, range = FULL_RANGE.WEIGHT) {
  const result = target(mode, input, range);
  if ('fields' in result) throw new Error(`expected accepted, got ${JSON.stringify(result.fields)}`);
  return result.value;
}
function targetRejected(mode: TargetMode, input: Record<string, unknown>, range = FULL_RANGE.WEIGHT): string[] {
  const result = target(mode, input, range);
  if (!('fields' in result)) throw new Error('expected rejected, got accepted');
  for (const f of result.fields) expect(f.limit.length).toBeGreaterThan(0); // names the limit
  return result.fields.map((f) => f.field);
}

// TEST-11 (F-04 cases) — F-04 §8 TEST-11-1/11-2: boundary pairs of the entry value field per
// tracking mode (R4) and the cumulative rule (R5), asserted without HTTP. Totals are day totals
// of the OTHER entries for the same exercise on the same day; `NONE` = first entry of the day.
type EntryValues = Record<string, unknown>;
type DayTotals = { sets?: number | null; seconds?: number | null; km?: number | null };

const NONE: DayTotals = {};
const RANGE = FULL_RANGE.WEIGHT; // R4 uses the same published ranges as R3

function entry(values: EntryValues, mode: string, totals: DayTotals = NONE) {
  return validateEntry(values, mode, totals);
}
function entryAccepted(values: EntryValues, mode: string, totals: DayTotals = NONE) {
  const result = entry(values, mode, totals);
  if ('fields' in result) throw new Error(`expected accepted, got ${JSON.stringify(result.fields)}`);
  return result.value;
}
function entryRejected(values: EntryValues, mode: string, totals: DayTotals = NONE): string[] {
  const result = entry(values, mode, totals);
  if (!('fields' in result)) throw new Error('expected rejected, got accepted');
  for (const f of result.fields) expect(f.limit.length).toBeGreaterThan(0); // names the limit
  return result.fields.map((f) => f.field);
}
function weightAccepted(input: unknown) {
  const result = validateWeight(input);
  if ('fields' in result) throw new Error(`expected accepted, got ${JSON.stringify(result.fields)}`);
  return result.value;
}
function weightRejected(input: unknown): string[] {
  const result = validateWeight(input);
  if (!('fields' in result)) throw new Error('expected rejected, got accepted');
  for (const f of result.fields) expect(f.limit.length).toBeGreaterThan(0); // names the limit
  return result.fields.map((f) => f.field);
}

describe('TEST-11 (F-04 cases): validateEntry (R4/R5)', () => {
  it('WEIGHT: 20 kg accepted; 21 kg rejected; 0 kg rejected', () => {
    expect(entryAccepted({ kg: 20 }, 'WEIGHT')).toEqual({ sets: 20 });
    expect(entryRejected({ kg: 21 }, 'WEIGHT')).toEqual(['sets']);
    expect(entryRejected({ kg: 0 }, 'WEIGHT')).toEqual(['sets']);
  });

  it('BODYWEIGHT_REPS: 400 reps accepted; 401 rejected (R5: 19 + 1 = 20)', () => {
    expect(entryAccepted({ reps: 400 }, 'BODYWEIGHT_REPS')).toEqual({ sets: 400 });
    expect(entryRejected({ reps: 401 }, 'BODYWEIGHT_REPS')).toEqual(['sets']);
    expect(entryAccepted({ reps: 1 }, 'BODYWEIGHT_REPS', { sets: 19 })).toEqual({ sets: 20 });
    expect(entryRejected({ reps: 2 }, 'BODYWEIGHT_REPS', { sets: 19 })).toEqual(['sets']);
  });

  it('rangeMax applies: 50 kg accepted at cap, 51 kg rejected', () => {
    expect(entryAccepted({ kg: 50 }, 'WEIGHT', NONE)).toEqual({ sets: 50 });
    expect(entryRejected({ kg: 51 }, 'WEIGHT', NONE)).toEqual(['sets']);
  });

  it('BODYWEIGHT_TIME/YOGA/CARDIO_TIME: 10800 s accepted; 10801 rejected; cumulative at cap', () => {
    for (const mode of ['BODYWEIGHT_TIME', 'YOGA', 'CARDIO_TIME']) {
      expect(entryAccepted({ seconds: 10800 }, mode)).toEqual({ seconds: 10800 });
      expect(entryRejected({ seconds: 10801 }, mode)).toEqual(['seconds']);
      expect(entryAccepted({ seconds: 800 }, mode, { seconds: 10000 })).toEqual({ seconds: 800 });
      expect(entryRejected({ seconds: 801 }, mode, { seconds: 10000 })).toEqual(['seconds']);
    }
  });

  it('CARDIO_DISTANCE: 100.00 km accepted, 100.01 km and 0 km rejected; cumulative at cap', () => {
    expect(entryAccepted({ km: 100 }, 'CARDIO_DISTANCE')).toEqual({ km: 100 });
    expect(entryAccepted({ km: 100.00 }, 'CARDIO_DISTANCE')).toEqual({ km: 100 });
    expect(entryRejected({ km: 100.01 }, 'CARDIO_DISTANCE')).toEqual(['km']);
    expect(entryRejected({ km: 0 }, 'CARDIO_DISTANCE')).toEqual(['km']);
    expect(entryAccepted({ km: 2.555 }, 'CARDIO_DISTANCE')).toEqual({ km: 2.555 }); // R4 precision kept
    expect(entryAccepted({ km: 1 }, 'CARDIO_DISTANCE', { km: 99 })).toEqual({ km: 1 });
    expect(entryRejected({ km: 1.01 }, 'CARDIO_DISTANCE', { km: 99 })).toEqual(['km']);
  });

  it('a value field for another mode is rejected (R6) and missing fields are rejected', () => {
    expect(entryRejected({ seconds: 60 }, 'WEIGHT')).toEqual(['seconds']);
    expect(entryRejected({ sets: 5 }, 'YOGA')).toEqual(['sets']);
    expect(entryRejected({}, 'WEIGHT')).toEqual(['sets']);
    expect(entryRejected({ seconds: '60' }, 'BODYWEIGHT_TIME')).toEqual(['seconds']);
  });
});

describe('TEST-11 (F-04 cases): validateWeight (WeightLog bounds)', () => {
  it('1.0 kg and 800.0 kg accepted; 0.9, 0.99, 800.01 rejected (R4)', () => {
    expect(weightAccepted(1)).toBe(1);
    expect(weightAccepted(1.0)).toBe(1);
    expect(weightAccepted(800)).toBe(800);
    expect(weightRejected(0.9)).toEqual(['weightKg']);
    expect(weightRejected(0.99)).toEqual(['weightKg']);
    expect(weightRejected(800.01)).toEqual(['weightKg']);
  });

  it('5 decimal places rejected, 2 accepted (R4 precision)', () => {
    expect(weightAccepted(70.55)).toBe(70.55);
    expect(weightRejected(70.555)).toEqual(['weightKg']);
  });
});

describe('TEST-11 (F-03 cases): validateTarget', () => {
  const weight = { targetSets: 4, targetRepsPerSet: 10, loadKg: 40 };

  describe('WEIGHT (sets, reps per set, load)', () => {
    it('accepts the base body; other mode fields come back null', () => {
      expect(targetAccepted('WEIGHT', weight)).toEqual({
        targetSets: 4,
        targetRepsPerSet: 10,
        loadKg: 40,
        targetDurationSec: null,
        targetDistanceKm: null,
      });
    });

    it('targetSets 20 accepted; 0 and 21 rejected', () => {
      expect(targetAccepted('WEIGHT', { ...weight, targetSets: 20, targetRepsPerSet: 10 }).targetSets).toBe(20);
      for (const bad of [0, 21]) expect(targetRejected('WEIGHT', { ...weight, targetSets: bad })).toEqual(['targetSets']);
    });

    it('targetRepsPerSet 200 accepted; 0 and 201 rejected', () => {
      expect(targetAccepted('WEIGHT', { ...weight, targetSets: 1, targetRepsPerSet: 200 }).targetRepsPerSet).toBe(200);
      for (const bad of [0, 201]) {
        expect(targetRejected('WEIGHT', { ...weight, targetSets: 1, targetRepsPerSet: bad })).toEqual(['targetRepsPerSet']);
      }
    });

    it('20 x 200 = 4,000 total reps is the central limit and is accepted', () => {
      expect(targetAccepted('WEIGHT', { targetSets: 20, targetRepsPerSet: 200, loadKg: 40 }).targetSets).toBe(20);
    });

    it('loadKg 500 and 0.01 accepted; missing, 0, 500.01 and 12.345 rejected', () => {
      expect(targetAccepted('WEIGHT', { ...weight, loadKg: 500 }).loadKg).toBe(500);
      expect(targetAccepted('WEIGHT', { ...weight, loadKg: 0.01 }).loadKg).toBe(0.01);
      for (const bad of [0, 500.01, 12.345]) expect(targetRejected('WEIGHT', { ...weight, loadKg: bad })).toEqual(['loadKg']);
      expect(targetRejected('WEIGHT', { targetSets: 4, targetRepsPerSet: 10 })).toEqual(['loadKg']);
    });

    it('non-integer or non-number sets / reps are rejected', () => {
      expect(targetRejected('WEIGHT', { ...weight, targetSets: 2.5 })).toEqual(['targetSets']);
      expect(targetRejected('WEIGHT', { ...weight, targetRepsPerSet: '10' })).toEqual(['targetRepsPerSet']);
    });

    it('a target field of another mode (targetDurationSec) is rejected, naming it', () => {
      expect(targetRejected('WEIGHT', { ...weight, targetDurationSec: 60 })).toEqual(['targetDurationSec']);
    });

    it('missing sets and reps are both reported', () => {
      expect(targetRejected('WEIGHT', { loadKg: 40 }).sort()).toEqual(['targetRepsPerSet', 'targetSets']);
    });
  });

  describe('BODYWEIGHT_REPS (sets, reps per set; no load)', () => {
    it('accepted without loadKg; loadKg is rejected', () => {
      expect(targetAccepted('BODYWEIGHT_REPS', { targetSets: 3, targetRepsPerSet: 15 }).loadKg).toBeNull();
      expect(targetRejected('BODYWEIGHT_REPS', { targetSets: 3, targetRepsPerSet: 15, loadKg: 5 })).toEqual(['loadKg']);
    });
  });

  describe.each(['BODYWEIGHT_TIME', 'YOGA', 'CARDIO_TIME'] as const)('%s (duration in seconds)', (mode) => {
    const range = FULL_RANGE.SECONDS;
    it('10,800 and 1 accepted; 0, 10,801 and 59.5 rejected', () => {
      expect(targetAccepted(mode, { targetDurationSec: 10800 }, range).targetDurationSec).toBe(10800);
      expect(targetAccepted(mode, { targetDurationSec: 1 }, range).targetDurationSec).toBe(1);
      for (const bad of [0, 10801, 59.5]) expect(targetRejected(mode, { targetDurationSec: bad }, range)).toEqual(['targetDurationSec']);
    });
    it('missing duration and a sets field are rejected', () => {
      expect(targetRejected(mode, {}, range)).toEqual(['targetDurationSec']);
      expect(targetRejected(mode, { targetDurationSec: 60, targetSets: 2 }, range)).toEqual(['targetSets']);
    });
  });

  describe('CARDIO_DISTANCE (km)', () => {
    const range = FULL_RANGE.KM;
    it('100 and 0.01 accepted; 0, 100.01 and 5.123 rejected', () => {
      expect(targetAccepted('CARDIO_DISTANCE', { targetDistanceKm: 100 }, range).targetDistanceKm).toBe(100);
      expect(targetAccepted('CARDIO_DISTANCE', { targetDistanceKm: 0.01 }, range).targetDistanceKm).toBe(0.01);
      for (const bad of [0, 100.01, 5.123]) {
        expect(targetRejected('CARDIO_DISTANCE', { targetDistanceKm: bad }, range)).toEqual(['targetDistanceKm']);
      }
    });
    it('3.5 km accepted; missing distance rejected', () => {
      expect(targetAccepted('CARDIO_DISTANCE', { targetDistanceKm: 3.5 }, range).targetDistanceKm).toBe(3.5);
      expect(targetRejected('CARDIO_DISTANCE', {}, range)).toEqual(['targetDistanceKm']);
    });
  });

  describe('template Valid Range (R7, stricter than the central limit)', () => {
    it('range max 100 reps: 10 x 11 = 110 rejected naming targetRepsPerSet; 10 x 10 = 100 accepted', () => {
      const range = { min: 1, max: 100 };
      expect(targetRejected('WEIGHT', { targetSets: 10, targetRepsPerSet: 11, loadKg: 20 }, range)).toEqual(['targetRepsPerSet']);
      expect(targetAccepted('WEIGHT', { targetSets: 10, targetRepsPerSet: 10, loadKg: 20 }, range).targetSets).toBe(10);
    });
    it('range min 50 reps: 4 x 10 = 40 rejected; 5 x 10 = 50 accepted', () => {
      const range = { min: 50, max: 4000 };
      expect(targetRejected('BODYWEIGHT_REPS', { targetSets: 4, targetRepsPerSet: 10 }, range)).toEqual(['targetRepsPerSet']);
      expect(targetAccepted('BODYWEIGHT_REPS', { targetSets: 5, targetRepsPerSet: 10 }, range).targetSets).toBe(5);
    });
    it('seconds and km are checked against the template range too', () => {
      expect(targetRejected('YOGA', { targetDurationSec: 900 }, { min: 60, max: 600 })).toEqual(['targetDurationSec']);
      expect(targetRejected('CARDIO_DISTANCE', { targetDistanceKm: 6 }, { min: 0.5, max: 5 })).toEqual(['targetDistanceKm']);
    });
  });
});

// TEST-16a-1 / TEST-16b-1 / TEST-03d-3 (unit part): custom exercise defaults and rules, F-03 R4, R5.
describe('F-03 custom exercise: buildCustomExercise', () => {
  const custom = (overrides: Record<string, unknown> = {}) => ({
    name: 'Hill Walk',
    targetBodyPart: 'Legs',
    trackingMode: 'WEIGHT',
    ...overrides,
  });
  const built = (overrides: Record<string, unknown> = {}) => {
    const result = buildCustomExercise(custom(overrides));
    if (!('value' in result)) throw new Error(`rejected: ${JSON.stringify(result.fields)}`);
    return result.value;
  };
  const rejected = (overrides: Record<string, unknown> = {}): string[] => {
    const result = buildCustomExercise(custom(overrides));
    if ('value' in result) throw new Error('expected a rejection');
    return result.fields.map((f) => f.field).sort();
  };

  describe('TEST-16a-1: metValue and unit by mode (SRS Appendix A.1)', () => {
    it.each([
      ['WEIGHT', 3.5, 'reps'],
      ['BODYWEIGHT_REPS', 3.8, 'reps'],
      ['BODYWEIGHT_TIME', 3.8, 'seconds'],
      ['YOGA', 2.5, 'seconds'],
      ['CARDIO_TIME', 7.0, 'seconds'],
    ])('%s -> metValue %s, unit %s', (mode, met, unit) => {
      const v = built({ trackingMode: mode });
      expect(v.metValue).toBe(met);
      expect(v.unit).toBe(unit);
      expect(v.cardioCategory).toBeNull();
    });
    it.each([
      ['RUNNING', 9.8],
      ['WALKING', 4.3],
      ['CYCLING', 8.0],
      ['SWIMMING', 5.8],
    ])('CARDIO_DISTANCE + %s -> metValue %s, unit km', (category, met) => {
      const v = built({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: category });
      expect(v.metValue).toBe(met);
      expect(v.unit).toBe('km');
      expect(v.cardioCategory).toBe(category);
    });
  });

  describe('TEST-16b-1: default Valid Range per unit', () => {
    it.each([
      ['WEIGHT', 1, 4000],
      ['YOGA', 1, 10800],
      ['CARDIO_DISTANCE', 0.01, 100],
    ])('%s -> %s..%s', (mode, min, max) => {
      const v = built({ trackingMode: mode, ...(mode === 'CARDIO_DISTANCE' ? { cardioCategory: 'RUNNING' } : {}) });
      expect([v.rangeMin, v.rangeMax]).toEqual([min, max]);
    });
  });

  describe('TEST-16b-2 (unit part): default range lets targets reach the BR-02 limits and no further', () => {
    it('20 x 200 reps accepted, 21 sets rejected; 10,800 s accepted, 10,801 s rejected; 100 km accepted, 100.01 km rejected', () => {
      const w = built({ trackingMode: 'WEIGHT' });
      const wr = { min: w.rangeMin, max: w.rangeMax };
      expect('value' in validateTarget({ trackingMode: 'WEIGHT', range: wr, targetSets: 20, targetRepsPerSet: 200, loadKg: 10 })).toBe(true);
      expect('fields' in validateTarget({ trackingMode: 'WEIGHT', range: wr, targetSets: 21, targetRepsPerSet: 200, loadKg: 10 })).toBe(true);
      const y = built({ trackingMode: 'YOGA' });
      const yr = { min: y.rangeMin, max: y.rangeMax };
      expect('value' in validateTarget({ trackingMode: 'YOGA', range: yr, targetDurationSec: 10800 })).toBe(true);
      expect('fields' in validateTarget({ trackingMode: 'YOGA', range: yr, targetDurationSec: 10801 })).toBe(true);
      const d = built({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'RUNNING' });
      const dr = { min: d.rangeMin, max: d.rangeMax };
      expect('value' in validateTarget({ trackingMode: 'CARDIO_DISTANCE', range: dr, targetDistanceKm: 100 })).toBe(true);
      expect('fields' in validateTarget({ trackingMode: 'CARDIO_DISTANCE', range: dr, targetDistanceKm: 100.01 })).toBe(true);
    });
  });

  describe('R4 field rules', () => {
    it('name is trimmed and limited to 1-80; body part trimmed 1-50', () => {
      expect(built({ name: '  Hill Walk  ' }).name).toBe('Hill Walk');
      expect(built({ name: 'a'.repeat(80) }).name).toHaveLength(80);
      expect(rejected({ name: 'a'.repeat(81) })).toEqual(['name']);
      expect(rejected({ name: '   ' })).toEqual(['name']);
      expect(built({ targetBodyPart: 'b'.repeat(50) }).targetBodyPart).toHaveLength(50);
      expect(rejected({ targetBodyPart: 'b'.repeat(51) })).toEqual(['targetBodyPart']);
      expect(rejected({ targetBodyPart: '' })).toEqual(['targetBodyPart']);
    });
    it('unknown trackingMode is rejected naming trackingMode', () => {
      expect(rejected({ trackingMode: 'SWIMMING' })).toEqual(['trackingMode']);
      expect(rejected({ trackingMode: undefined })).toEqual(['trackingMode']);
    });
    it('TEST-03d-3: CARDIO_DISTANCE needs cardioCategory; every other mode forbids it', () => {
      expect(rejected({ trackingMode: 'CARDIO_DISTANCE' })).toEqual(['cardioCategory']);
      expect(rejected({ trackingMode: 'CARDIO_DISTANCE', cardioCategory: 'ROWING' })).toEqual(['cardioCategory']);
      expect(rejected({ trackingMode: 'WEIGHT', cardioCategory: 'RUNNING' })).toEqual(['cardioCategory']);
    });
    it('TEST-16a-2 (unit part): metValue, unit, rangeMin, rangeMax and unknown fields are rejected naming the field', () => {
      expect(rejected({ metValue: 20 })).toEqual(['metValue']);
      expect(rejected({ unit: 'reps' })).toEqual(['unit']);
      expect(rejected({ rangeMin: 1, rangeMax: 10 })).toEqual(['rangeMax', 'rangeMin']);
      expect(rejected({ colour: 'red' })).toEqual(['colour']);
    });
    it('a non-object is rejected', () => {
      const result = buildCustomExercise('x');
      expect('fields' in result).toBe(true);
    });
  });
});
