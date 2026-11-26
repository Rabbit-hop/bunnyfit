import type { Clock } from '../domain/clock.js';
import { appError } from '../domain/errors.js';
import { isCalendarDate } from '../domain/planValidation.js';
import { dailyProgress, monthlyProgress } from '../domain/progressService.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validationError } from '../middleware/errorHandler.js';
import type { EntryRepository } from '../repositories/entryRepository.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import type { ProfileRepository } from '../repositories/profileRepository.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

/**
 * F-06 §4.1 `GET /api/progress/daily?date=YYYY-MM-DD` (Participant, self-scoped, read-only).
 * Role and `?userId=` ownership (R1, §3.4) are enforced by the registry policy before this
 * handler runs, so authorization precedes validation. R13: `date` must be a real calendar
 * date and not after today (Clock). F-11 §4.1 adds the calorie fields to the same response
 * (no new route, same policy).
 *
 * F-06 §4.2 `GET /api/progress/monthly?month=YYYY-MM` (CHANGE-06): same policy shape; `month`
 * defaults to the current month and must be `YYYY-MM` and not after the current month (R13).
 */
export function registerProgressRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  deps: { entries: EntryRepository; plans: PlanRepository; weights: Pick<ProfileRepository, 'listWeightsUpTo'>; clock: Clock },
): void {
  const policy = findRoutePolicy('GET', '/api/progress/daily', policies);
  if (!policy) throw new Error('GET /api/progress/daily has no route policy');
  const monthlyPolicy = findRoutePolicy('GET', '/api/progress/monthly', policies);
  if (!monthlyPolicy) throw new Error('GET /api/progress/monthly has no route policy');

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
  registrar.register(
    monthlyPolicy,
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const today = deps.clock.today();
      const currentMonth = today.slice(0, 7);
      const raw = req.query['month'];
      const month = raw === undefined ? currentMonth : raw;
      if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        throw validationError([{ field: 'month', limit: 'must be a month YYYY-MM' }]);
      }
      if (month > currentMonth) {
        throw validationError([{ field: 'month', limit: `must not be after the current month (${currentMonth})` }]);
      }
      res.status(200).json(await monthlyProgress(deps, req.auth.userId, month, today));
    }),
  );
}
