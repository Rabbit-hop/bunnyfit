import type { Clock } from '../domain/clock.js';
import { appError } from '../domain/errors.js';
import { validatePlanRequest, validateTarget } from '../domain/planValidation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validationError } from '../middleware/errorHandler.js';
import type { LibraryRepository } from '../repositories/libraryRepository.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

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
}
