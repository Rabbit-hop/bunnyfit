import type { Clock } from '../domain/clock.js';
import { appError, type FieldError } from '../domain/errors.js';
import { addDays, history, spanDays, streak } from '../domain/historyService.js';
import { isCalendarDate } from '../domain/planValidation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validationError } from '../middleware/errorHandler.js';
import type { EntryRepository } from '../repositories/entryRepository.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

const DEFAULT_WINDOW_DAYS = 30;
const MAX_SPAN_DAYS = 366;

/**
 * F-08 §4: `GET /api/history?from&to` and `GET /api/streak` (Participant, self-scoped, read-only).
 * Role and `?userId=` ownership (R1) are enforced by the registry policy before these handlers run, so
 * authorization precedes validation. Query parameters other than the documented ones are rejected (R1).
 */
export function registerHistoryRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  deps: { entries: EntryRepository; plans: PlanRepository; clock: Clock },
): void {
  const policy = (path: string): RoutePolicy => {
    const p = findRoutePolicy('GET', path, policies);
    if (!p) throw new Error(`GET ${path} has no route policy`);
    return p;
  };

  // `userId` is checked by the policy middleware (the caller's own id is accepted, anyone else's is 403).
  const rejectUnknown = (query: Record<string, unknown>, allowed: readonly string[]) => {
    const unknown = Object.keys(query).filter((k) => k !== 'userId' && !allowed.includes(k));
    if (unknown.length > 0) throw validationError(unknown.map((field) => ({ field, limit: 'is not an allowed query parameter' })));
  };

  registrar.register(
    policy('/api/history'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      rejectUnknown(req.query, ['from', 'to']);
      const today = deps.clock.today();
      const fields: FieldError[] = [];

      // R10: `to` defaults to today and is not after today; `from` defaults to `to` - 29 days and is not after `to`.
      let to = today;
      const rawTo = req.query['to'];
      if (rawTo !== undefined) {
        if (!isCalendarDate(rawTo)) fields.push({ field: 'to', limit: 'must be a date YYYY-MM-DD' });
        else if (rawTo > today) fields.push({ field: 'to', limit: `must not be after today (${today})` });
        else to = rawTo;
      }
      let from = addDays(to, -(DEFAULT_WINDOW_DAYS - 1));
      const rawFrom = req.query['from'];
      if (rawFrom !== undefined) {
        if (!isCalendarDate(rawFrom)) fields.push({ field: 'from', limit: 'must be a date YYYY-MM-DD' });
        else if (rawFrom > to) fields.push({ field: 'from', limit: `must be on or before to (${to})` });
        else if (spanDays(rawFrom, to) > MAX_SPAN_DAYS) fields.push({ field: 'from', limit: `the range may span at most ${MAX_SPAN_DAYS} days` });
        else from = rawFrom;
      }
      if (fields.length > 0) throw validationError(fields);
      res.status(200).json(await history(deps, req.auth.userId, from, to));
    }),
  );

  registrar.register(
    policy('/api/streak'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      rejectUnknown(req.query, []);
      res.status(200).json(await streak(deps, req.auth.userId, deps.clock.today()));
    }),
  );
}
