import { describe, expect, it } from 'vitest';
import type { ResolvedItem } from '../../server/domain/planResolution.js';
import { buildSchedule, scheduleRange } from '../../server/domain/schedule.js';

// Supplementary unit coverage for F-09 §3.1 R2/R3 (`buildSchedule`). Not an RTM test file;
// AC-09a evidence is TEST-09a-n in tests/integration/reminder.test.ts.

function item(id: string, planKey: string, version: number, effectiveFrom: string, repeatDays: number[], endDate: string | null = null): ResolvedItem {
  return {
    planItem: {
      id, planKey, version, effectiveFrom, endDate, repeatDays,
      userExerciseId: `ue-${planKey}`, priorityWeight: 3, createdAt: '2026-11-01T00:00:00.000Z',
      targetSets: 3, targetRepsPerSet: 10, loadKg: 20, targetDurationSec: null, targetDistanceKm: null,
    },
    userExercise: {
      id: `ue-${planKey}`, sourceTemplateId: null, isCustom: true, name: `Exercise ${planKey}`, targetBodyPart: 'Legs',
      trackingMode: 'WEIGHT', unit: 'reps', cardioCategory: null, metValue: 5, rangeMin: 1, rangeMax: 100,
    },
  };
}

describe('scheduleRange (R2)', () => {
  it('week: Monday to Sunday containing the date, across a year end', () => {
    expect(scheduleRange('week', '2026-11-26')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(scheduleRange('week', '2026-11-23')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(scheduleRange('week', '2026-11-29')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(scheduleRange('week', '2026-12-31')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('month: the 1st to the last day of the calendar month (leap year included)', () => {
    expect(scheduleRange('month', '2026-11-10')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(scheduleRange('month', '2027-02-14')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    expect(scheduleRange('month', '2028-02-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(scheduleRange('month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('buildSchedule (R3)', () => {
  const A = item('a1', 'A', 1, '2026-11-02', [1, 3, 5]);
  const B = item('b1', 'B', 1, '2026-11-02', [1, 2, 3, 4, 5, 6, 7], '2026-11-25');
  const C1 = item('c1', 'C', 1, '2026-11-02', [1, 2, 3, 4, 5, 6, 7]);
  const C2 = item('c2', 'C', 2, '2026-11-26', [6]);

  it('resolves each day of the week with the version valid on that day; empty days are Rest Days', () => {
    const s = buildSchedule([A, B, C1, C2], 'week', '2026-11-26', '2026-11-26');
    expect(s.view).toBe('week');
    expect(s.from).toBe('2026-11-23');
    expect(s.to).toBe('2026-11-29');
    expect(s.today).toBe('2026-11-26');
    expect(s.days.map((d) => [d.date, d.isRestDay, d.items.map((i) => i.planItemId)])).toEqual([
      ['2026-11-23', false, ['a1', 'b1', 'c1']],
      ['2026-11-24', false, ['b1', 'c1']],
      ['2026-11-25', false, ['a1', 'b1', 'c1']],
      ['2026-11-26', true, []],
      ['2026-11-27', false, ['a1']],
      ['2026-11-28', false, ['c2']],
      ['2026-11-29', true, []],
    ]);
  });

  it('day items carry plan and exercise identifiers only', () => {
    const s = buildSchedule([A], 'week', '2026-11-23', '2026-11-26');
    expect(s.days[0]?.items[0]).toEqual({
      planItemId: 'a1', planKey: 'A', version: 1, userExerciseId: 'ue-A', name: 'Exercise A', trackingMode: 'WEIGHT',
    });
  });

  it('a month has one entry per calendar day; no items → every day is a Rest Day', () => {
    const s = buildSchedule([], 'month', '2027-02-14', '2026-11-26');
    expect(s.days).toHaveLength(28);
    expect(s.days.every((d) => d.isRestDay && d.items.length === 0)).toBe(true);
    expect(s.days[0]?.date).toBe('2027-02-01');
    expect(s.days[27]?.date).toBe('2027-02-28');
  });
});
