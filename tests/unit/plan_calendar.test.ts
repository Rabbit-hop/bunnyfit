import { describe, expect, it } from 'vitest';
import { addDays, addMonths, formatLongDay, isoWeekday, monthGrid, weekOf } from '../../web/src/lib/dates.js';
import { itemsOn } from '../../web/src/lib/occurrence.js';

type PlanEntry = { planItem: Parameters<typeof itemsOn>[0][number]['planItem'] & { id: string } };

// Supplementary unit coverage for the Plan UI helpers (issue #9). Not an RTM test file.

describe('dates', () => {
  it('isoWeekday: Monday is 1 and Sunday is 7', () => {
    expect(isoWeekday('2026-11-09')).toBe(1); // Monday
    expect(isoWeekday('2026-11-15')).toBe(7); // Sunday
  });

  it('addDays crosses month and year ends and does not depend on the browser zone', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('weekOf returns Monday to Sunday containing the date', () => {
    expect(weekOf('2026-11-13')).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
    ]);
  });

  it('addMonths clamps to the last day of a shorter month and wraps the year', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('addMonths with an anchor day restores the 31st after a short month (no drift)', () => {
    // Without the anchor the second step starts from 28 Feb and stays on the 28th.
    expect(addMonths('2026-02-28', 1)).toBe('2026-03-28');
    let date = '2026-01-31';
    const forward: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      date = addMonths(date, 1, 31);
      forward.push(date);
    }
    expect(forward).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    const back: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      date = addMonths(date, -1, 31);
      back.push(date);
    }
    expect(back).toEqual(['2026-03-31', '2026-02-28', '2026-01-31']);
  });

  it('monthGrid has 42 Monday-first dates that include the whole month', () => {
    const grid = monthGrid('2026-11-13');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-10-26'); // 1 Nov 2026 is a Sunday, so the grid starts on Monday 26 Oct
    expect(isoWeekday(grid[0]!)).toBe(1);
    expect(grid).toContain('2026-11-01');
    expect(grid).toContain('2026-11-30');
  });

  it('formatLongDay', () => {
    expect(formatLongDay('2026-11-10')).toBe('Tuesday, 10 November');
  });
});

function entry(over: {
  id: string;
  planKey: string;
  version: number;
  effectiveFrom: string;
  endDate?: string | null;
  repeatDays?: number[];
}): PlanEntry {
  return {
    planItem: {
      id: over.id,
      planKey: over.planKey,
      version: over.version,
      effectiveFrom: over.effectiveFrom,
      endDate: over.endDate ?? null,
      repeatDays: over.repeatDays ?? [1, 2, 3, 4, 5, 6, 7],
    },
  };
}

const ids = (rows: PlanEntry[]) => rows.map((r) => r.planItem.id);

describe('itemsOn (F-03 contract R12)', () => {
  it('is empty before effectiveFrom and present from that date', () => {
    const rows = [entry({ id: 'a', planKey: 'k', version: 1, effectiveFrom: '2026-11-10' })];
    expect(ids(itemsOn(rows, '2026-11-09', 1))).toEqual([]);
    expect(ids(itemsOn(rows, '2026-11-10', 2))).toEqual(['a']);
  });

  it('picks the version with the greatest effectiveFrom <= date, so a goal change applies from its own date only', () => {
    const rows = [
      entry({ id: 'v1', planKey: 'k', version: 1, effectiveFrom: '2026-11-01' }),
      entry({ id: 'v2', planKey: 'k', version: 2, effectiveFrom: '2026-11-10' }),
    ];
    expect(ids(itemsOn(rows, '2026-11-09', 1))).toEqual(['v1']);
    expect(ids(itemsOn(rows, '2026-11-10', 2))).toEqual(['v2']);
  });

  it('breaks an effectiveFrom tie with the highest version', () => {
    const rows = [
      entry({ id: 'v1', planKey: 'k', version: 1, effectiveFrom: '2026-11-10' }),
      entry({ id: 'v2', planKey: 'k', version: 2, effectiveFrom: '2026-11-10' }),
    ];
    expect(ids(itemsOn(rows, '2026-11-10', 2))).toEqual(['v2']);
  });

  it('stops after endDate (inclusive)', () => {
    const rows = [entry({ id: 'a', planKey: 'k', version: 1, effectiveFrom: '2026-11-01', endDate: '2026-11-10' })];
    expect(ids(itemsOn(rows, '2026-11-10', 2))).toEqual(['a']);
    expect(ids(itemsOn(rows, '2026-11-11', 3))).toEqual([]);
  });

  it('only occurs on its repeat days (ISO weekday)', () => {
    const rows = [entry({ id: 'a', planKey: 'k', version: 1, effectiveFrom: '2026-11-01', repeatDays: [1, 3] })];
    expect(ids(itemsOn(rows, '2026-11-09', 1))).toEqual(['a']); // Monday
    expect(ids(itemsOn(rows, '2026-11-10', 2))).toEqual([]); // Tuesday
  });

  it('a newer version with different repeat days replaces the older one even where the old one would have matched', () => {
    const rows = [
      entry({ id: 'v1', planKey: 'k', version: 1, effectiveFrom: '2026-11-01', repeatDays: [1, 2] }),
      entry({ id: 'v2', planKey: 'k', version: 2, effectiveFrom: '2026-11-10', repeatDays: [1] }),
    ];
    expect(ids(itemsOn(rows, '2026-11-10', 2))).toEqual([]); // Tuesday: v2 applies and excludes Tuesday
  });

  it('keeps separate plan keys independent', () => {
    const rows = [
      entry({ id: 'a', planKey: 'k1', version: 1, effectiveFrom: '2026-11-01' }),
      entry({ id: 'b', planKey: 'k2', version: 1, effectiveFrom: '2026-11-01' }),
    ];
    expect(ids(itemsOn(rows, '2026-11-10', 2)).sort()).toEqual(['a', 'b']);
  });
});
