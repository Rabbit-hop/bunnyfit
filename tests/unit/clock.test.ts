import { describe, expect, it } from 'vitest';
import { FixedClock, SystemClock, toDateString } from '../../server/domain/clock.js';

describe('toDateString', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(toDateString(new Date('2026-11-04T12:00:00Z'), 'Asia/Bangkok')).toBe('2026-11-04');
  });

  it('uses the calendar date of the requested timezone, not UTC', () => {
    // 18:30 UTC = 01:30 next day in Asia/Bangkok (UTC+7)
    expect(toDateString(new Date('2026-11-04T18:30:00Z'), 'Asia/Bangkok')).toBe('2026-11-05');
    // Same instant is still 2026-11-04 in UTC
    expect(toDateString(new Date('2026-11-04T18:30:00Z'), 'UTC')).toBe('2026-11-04');
  });
});

describe('FixedClock (midnight boundary — AC-10c conditions)', () => {
  it('at 2026-11-04T18:30Z (Bangkok 5 Nov 01:30) today() is 2026-11-05', () => {
    const clock = new FixedClock(new Date('2026-11-04T18:30:00Z'));
    expect(clock.today()).toBe('2026-11-05');
  });

  it('at 23:59:59 Bangkok today() is still the same date', () => {
    const clock = new FixedClock(new Date('2026-11-04T16:59:59Z'));
    expect(clock.today()).toBe('2026-11-04');
  });

  it('at 00:00:00 Bangkok today() rolls to the next date', () => {
    const clock = new FixedClock(new Date('2026-11-04T17:00:00Z'));
    expect(clock.today()).toBe('2026-11-05');
  });

  it('now() returns a copy — mutating it cannot corrupt the clock', () => {
    const clock = new FixedClock(new Date('2026-11-04T12:00:00Z'));
    clock.now().setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-11-04T12:00:00.000Z');
    expect(clock.today()).toBe('2026-11-04');
  });
});

describe('SystemClock', () => {
  it('reads time through the injected source (deterministic in tests)', () => {
    const clock = new SystemClock('Asia/Bangkok', () => new Date('2026-11-04T18:30:00Z'));
    expect(clock.now().toISOString()).toBe('2026-11-04T18:30:00.000Z');
    expect(clock.today()).toBe('2026-11-05');
  });

  it('defaults to Asia/Bangkok and a valid YYYY-MM-DD today()', () => {
    // No timezone argument: 18:30Z must roll to the next date only if the default is Bangkok.
    const clock = new SystemClock(undefined, () => new Date('2026-11-04T18:30:00Z'));
    expect(clock.today()).toBe('2026-11-05');
    expect(new SystemClock().today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
