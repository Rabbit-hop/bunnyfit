import { asyncHandler } from '../middleware/asyncHandler.js';
import type { AuthService } from '../domain/authService.js';
import { appError } from '../domain/errors.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

/** Mounts POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout (F-01 §4). */
export function registerAuthRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  service: AuthService,
): void {
  const policy = (method: string, path: string): RoutePolicy => {
    const p = findRoutePolicy(method, path, policies);
    if (!p) throw new Error(`${method} ${path} has no route policy`);
    return p;
  };

  registrar.register(
    policy('POST', '/api/auth/login'),
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.login(req.body));
    }),
  );

  registrar.register(
    policy('GET', '/api/auth/me'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      res.status(200).json(await service.me(req.auth.userId));
    }),
  );

  registrar.register(
    policy('POST', '/api/auth/logout'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      await service.logout(req.auth);
      res.status(204).end();
    }),
  );
}
