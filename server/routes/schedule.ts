import type { Clock } from '../domain/clock.js';
import { appError } from '../domain/errors.js';
import { isCalendarDate } from '../domain/planValidation.js';
import { buildSchedule, type ScheduleView } from '../domain/schedule.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validationError } from '../middleware/errorHandler.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

const VIEWS: readonly ScheduleView[] = ['week', 'month'];

/**
 * F-09 §4.1 `GET /api/schedule?view=week|month&date=YYYY-MM-DD` (Participant, self-scoped).
 * R1: `view` defaults to `week`, `date` to the Clock's Asia/Bangkok today. Reads only the caller's plan
 * items and stores nothing (R4).
 */
export function registerScheduleRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  deps: { plans: PlanRepository; clock: Clock },
): void {
  const found = findRoutePolicy('GET', '/api/schedule', policies);
  if (!found) throw new Error('GET /api/schedule has no route policy');

  registrar.register(
    found,
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const today = deps.clock.today();
      const rawView = req.query['view'];
      const rawDate = req.query['date'];
      const fields = [];
      const view = rawView === undefined ? 'week' : rawView;
      if (typeof view !== 'string' || !(VIEWS as readonly string[]).includes(view)) {
        fields.push({ field: 'view', limit: 'must be week or month' });
      }
      const date = rawDate === undefined ? today : rawDate;
      if (!isCalendarDate(date)) fields.push({ field: 'date', limit: 'must be a date YYYY-MM-DD' });
      if (fields.length > 0) throw validationError(fields);

      const items = await deps.plans.listPlanItems(req.auth.userId);
      res.status(200).json(buildSchedule(items, view as ScheduleView, date as string, today));
    }),
  );
}
