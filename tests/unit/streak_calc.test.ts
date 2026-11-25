import { describe, expect, it } from 'vitest';
import { calcStreak, type DayPercent } from '../../server/domain/streakCalc.js';

// F-08 §8 SUP-19-1 … SUP-19-6 (supplementary, not an RTM test): `calcStreak` with hand-built
// per-date percentages. Pure: no Clock, no storage (R14). 12 Nov 2026 is "today" unless stated.
const day = (d: number, overallPercent: number | null): DayPercent => ({ date: `2026-11-${String(d).padStart(2, '0')}`, overallPercent });
const TODAY = '2026-11-12';

describe('calcStreak (F-08 R2-R8, AC-19a-d)', () => {
  it('SUP-19-1: three closed days at 100% and today 0% → 3, today pending, todayPercent 0', () => {
    expect(calcStreak([day(9, 100), day(10, 100), day(11, 100), day(12, 0)], TODAY)).toEqual({ streak: 3, todayPending: true, todayPercent: 0 });
  });

  it('SUP-19-2: the 70% boundary is compared unrounded: 70 counts; 69.8 and 69.999999999999 do not', () => {
    expect(calcStreak([day(11, 70), day(12, 0)], TODAY).streak).toBe(1);
    expect(calcStreak([day(11, 69.8), day(12, 0)], TODAY).streak).toBe(0);
    expect(calcStreak([day(11, 69.999999999999), day(12, 0)], TODAY).streak).toBe(0);
  });

  it('today counts as soon as it reaches 70 (T = 1, not pending) and is pending below that', () => {
    expect(calcStreak([day(11, 100), day(12, 70)], TODAY)).toEqual({ streak: 2, todayPending: false, todayPercent: 70 });
    expect(calcStreak([day(11, 100), day(12, 69.8)], TODAY)).toEqual({ streak: 1, todayPending: true, todayPercent: 69.8 });
  });

  it('SUP-19-3: Rest Days (null) between qualifying days are skipped; a closed day below 70 stops the walk and restarts later', () => {
    expect(calcStreak([day(8, 100), day(9, null), day(10, null), day(11, 100), day(12, 0)], TODAY).streak).toBe(2);
    expect(calcStreak([day(8, 100), day(9, 0), day(10, 100), day(11, 100), day(12, 0)], TODAY).streak).toBe(2);
    expect(calcStreak([day(9, 100), day(10, 0), day(11, null), day(12, 0)], TODAY).streak).toBe(0);
  });

  it('SUP-19-4: a Rest Day today is not pending and todayPercent is null; the closed-day count stays', () => {
    expect(calcStreak([day(10, 100), day(11, 100), day(12, null)], TODAY)).toEqual({ streak: 2, todayPending: false, todayPercent: null });
  });

  it('SUP-19-5: the order of the input does not matter', () => {
    const ordered = [day(9, 100), day(10, 100), day(11, 100), day(12, 28 / 40 * 100)];
    const shuffled = [ordered[2]!, ordered[0]!, ordered[3]!, ordered[1]!];
    expect(calcStreak(shuffled, TODAY)).toEqual(calcStreak(ordered, TODAY));
  });

  it('SUP-19-6: a gap, a duplicate date or a missing today throws; dates after today are ignored', () => {
    expect(() => calcStreak([day(9, 100), day(11, 100), day(12, 0)], TODAY)).toThrow();
    expect(() => calcStreak([day(10, 100), day(10, 100), day(11, 100), day(12, 0)], TODAY)).toThrow();
    expect(() => calcStreak([day(10, 100), day(11, 100)], TODAY)).toThrow();
    expect(calcStreak([day(11, 100), day(12, 0), day(13, 100), day(14, 100)], TODAY).streak).toBe(1);
  });

  it('a user with only today (no plan): streak 0, not pending', () => {
    expect(calcStreak([day(12, null)], TODAY)).toEqual({ streak: 0, todayPending: false, todayPercent: null });
  });
});
