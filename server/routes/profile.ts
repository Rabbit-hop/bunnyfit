import type { Clock } from '../domain/clock.js';
import { appError } from '../domain/errors.js';
import { validateWeight } from '../domain/entryValidation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validationError } from '../middleware/errorHandler.js';
import type { ProfileRepository } from '../repositories/profileRepository.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

/**
 * F-04 §4.5 profile routes (Sprint 2, CHANGE-04): `GET /api/profile` and `PUT /api/profile`.
 * Role (Participant only, AC-17d) is enforced by the registry policy before these handlers run; the
 * profile is always the caller's own, taken from the token (self-scoped, no userId anywhere).
 * R16: `weightKg` 1 to 800, at most 1 decimal; each PUT appends a `WeightLog` row dated today (Clock).
 * There is deliberately no route to update or delete a row (TEST-17b-4).
 */
export function registerProfileRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  deps: { profiles: ProfileRepository; clock: Clock },
): void {
  const policy = (method: string, path: string): RoutePolicy => {
    const found = findRoutePolicy(method, path, policies);
    if (!found) throw new Error(`${method} ${path} has no route policy`);
    return found;
  };

  registrar.register(
    policy('GET', '/api/profile'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const profile = await deps.profiles.getProfile(req.auth.userId);
      if (!profile) throw appError('NOT_FOUND', 'Profile not found.');
      res.status(200).json(profile);
    }),
  );

  registrar.register(
    policy('PUT', '/api/profile'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const body = (req.body ?? {}) as Record<string, unknown>;
      const weight = validateWeight(body['weightKg']);
      if ('fields' in weight) throw validationError(weight.fields, 'weightKg must be between 1 and 800');
      await deps.profiles.appendWeight(req.auth.userId, weight.value, deps.clock.today());
      const profile = await deps.profiles.getProfile(req.auth.userId);
      if (!profile) throw appError('NOT_FOUND', 'Profile not found.');
      res.status(200).json(profile);
    }),
  );
}
