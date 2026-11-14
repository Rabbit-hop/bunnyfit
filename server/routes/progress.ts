import type { Clock } from '../domain/clock.js';
import { appError } from '../domain/errors.js';
import { isCalendarDate } from '../domain/planValidation.js';
import { dailyProgress } from '../domain/progressService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validationError } from '../middleware/errorHandler.js';
import type { EntryRepository } from '../repositories/entryRepository.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

/**
 * F-06 §4.1 `GET /api/progress/daily?date=YYYY-MM-DD` (Participant, self-scoped, read-only).
 * Role and `?userId=` ownership (R1, §3.4) are enforced by the registry policy before this
 * handler runs, so authorization precedes validation. R13: `date` must be a real calendar
 * date and not after today (Clock). `/monthly` is Sprint 2 (CHANGE-06).
 */
export function registerProgressRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  deps: { entries: EntryRepository; plans: PlanRepository; clock: Clock },
): void {
  const policy = findRoutePolicy('GET', '/api/progress/daily', policies);
  if (!policy) throw new Error('GET /api/progress/daily has no route policy');

  registrar.register(
    policy,
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const today = deps.clock.today();
      const raw = req.query['date'];
      const date = raw === undefined ? today : raw;
      if (!isCalendarDate(date)) {
        throw validationError([{ field: 'date', limit: 'must be a date YYYY-MM-DD' }]);
      }
      if (date > today) {
        throw validationError([{ field: 'date', limit: `must not be after today (${today})` }]);
      }
      res.status(200).json(await dailyProgress(deps, req.auth.userId, date));
    }),
  );
}
