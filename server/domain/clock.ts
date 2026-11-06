/**
 * Injectable Clock (SDS §2.6) — the only source of time for the server.
 *
 * All business "today" decisions use the Asia/Bangkok calendar date.
 * Tests replace the clock (FixedClock) to cover midnight boundaries
 * (AC-10c, AC-18a, AC-19d) without touching the system clock.
 */
export interface Clock {
  /** Current instant (UTC). Always read through this — never `new Date()` in business code. */
  now(): Date;
  /** Business date of `now()` in the clock's timezone, formatted `YYYY-MM-DD`. */
  today(): string;
}

/** Format a date as `YYYY-MM-DD` in the given IANA timezone (calendar date, not UTC). */
export function toDateString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Default clock: system time converted to the configured business timezone. */
export class SystemClock implements Clock {
  constructor(
    private readonly timeZone: string = 'Asia/Bangkok',
    private readonly read: () => Date = () => new Date(),
  ) {}

  now(): Date {
    return new Date(this.read().getTime());
  }

  today(): string {
    return toDateString(this.now(), this.timeZone);
  }
}

/** Test clock pinned to an exact instant (SDS §10 testability design). */
export class FixedClock implements Clock {
  constructor(
    private readonly fixed: Date,
    private readonly timeZone: string = 'Asia/Bangkok',
  ) {}

  now(): Date {
    return new Date(this.fixed.getTime());
  }

  today(): string {
    return toDateString(this.now(), this.timeZone);
  }
}
