import type { Clock } from '../domain/clock.js';
import { appError } from '../domain/errors.js';
import { resolvePlan } from '../domain/planResolution.js';
import { isCalendarDate, validatePlanRequest, validateTarget } from '../domain/planValidation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validationError } from '../middleware/errorHandler.js';
import type { LibraryRepository } from '../repositories/libraryRepository.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Plan endpoints of the Participant (F-03 §4.1). */
export function registerPlanRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  deps: { plans: PlanRepository; library: LibraryRepository; clock: Clock },
): void {
  const policy = (method: string, path: string): RoutePolicy => {
    const p = findRoutePolicy(method, path, policies);
    if (!p) throw new Error(`${method} ${path} has no route policy`);
    return p;
  };

  registrar.register(
    policy('POST', '/api/plan-items'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const parsed = validatePlanRequest(req.body, deps.clock.today());
      if ('fields' in parsed) throw validationError(parsed.fields);
      const request = parsed.value;

      const template = await deps.library.findTemplate(request.templateId);
      if (!template) {
        throw appError('NOT_FOUND', 'Template not found.', [{ field: 'templateId', limit: 'no such template' }]);
      }
      const target = validateTarget({
        trackingMode: template.trackingMode,
        range: { min: template.rangeMin, max: template.rangeMax },
        ...request.target,
      });
      if ('fields' in target) throw validationError(target.fields);

      const created = await deps.plans.createFromTemplate({
        userId: req.auth.userId,
        template,
        priorityWeight: request.priorityWeight,
        target: target.value,
        effectiveFrom: request.effectiveFrom,
        endDate: request.endDate,
        repeatDays: request.repeatDays,
      });
      res.status(201).json(created);
    }),
  );
  registrar.register(
    policy('GET', '/api/plan-items'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      res.status(200).json(await deps.plans.listPlanItems(req.auth.userId));
    }),
  );

  // Owner check runs in the authorize middleware: a malformed id is 400, an unknown one 404, someone else's 403.
  registrar.register(
    policy('GET', '/api/plan-items/:id'),
    asyncHandler(async (req, res) => {
      const found = await deps.plans.findPlanItem(String(req.params['id'] ?? ''));
      if (!found) throw appError('NOT_FOUND', 'Plan item not found.');
      res.status(200).json(found);
    }),
    {
      ownerLookup: async (id) => {
        if (!UUID.test(id)) throw validationError([{ field: 'id', limit: 'must be a UUID' }]);
        return deps.plans.findPlanItemOwner(id);
      },
    },
  );

  registrar.register(
    policy('GET', '/api/user-exercises'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      res.status(200).json(await deps.plans.listUserExercises(req.auth.userId));
    }),
  );

  registrar.register(
    policy('GET', '/api/plan'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const raw = req.query['date'];
      const date = raw === undefined ? deps.clock.today() : raw;
      if (!isCalendarDate(date)) throw validationError([{ field: 'date', limit: 'must be a date YYYY-MM-DD' }]);
      const plan = await resolvePlan(deps.plans, req.auth.userId, date);
      res.status(200).json({ date, isRestDay: plan.isRestDay, items: plan.items });
    }),
  );
}
