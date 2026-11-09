import { describe, expect, it } from 'vitest';
import { validateTemplate } from '../../server/domain/templateValidation.js';

// TEST-11 (F-02 cases) — F-02 STS §8: `validateTemplate` boundary pairs and unit/mode
// derivation, asserted without HTTP. The F-03 / F-04 cases of AC-11 join this file later.

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
