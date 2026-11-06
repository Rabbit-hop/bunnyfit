/**
 * Declarative route policy registry (SDS §6.3).
 *
 * Every route is registered here with `{ method, path, allowed roles, ownership,
 * feature ID }`. It is intended to drive (a) the auth/role/ownership middleware
 * and (b) the Endpoint Access Matrix tests AC-12c / AC-22c (both land with F-01;
 * for now this is a lookup table only). A new endpoint cannot ship without declaring
 * who may call it — add the policy here in the same commit as the route.
 *
 * Paths are stored exactly as mounted (with `:params`), matching the Express
 * route table.
 */
export type Role = 'MANAGER' | 'PARTICIPANT';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Policy shape fixed by the F-01 contract (§4.5) — every feature registers routes with it.
 * Ownership dimension of the access matrix:
 * - `none`           — any caller with an allowed role (public routes, read-only catalog)
 * - `self-scoped`    — data is always the caller's own; a foreign `userId` query param → 403
 * - `resource-owner` — a `:id` record whose owner must equal the caller
 */
export interface RoutePolicy {
  method: HttpMethod;
  /** Path as mounted in Express, e.g. `/api/entries/:id`. */
  path: string;
  /** Feature that owns the endpoint (`SYS-01`, `F-01`, …). */
  featureId: string;
  /** `public` = callable without a Bearer token (SDS §5.1: only login and health). */
  auth: 'public' | 'required';
  /** Allowed roles; empty for public routes. */
  roles: Role[];
  ownership: 'none' | 'self-scoped' | 'resource-owner';
}

export const ROUTE_POLICIES: readonly RoutePolicy[] = [
  {
    method: 'GET',
    path: '/api/health',
    featureId: 'SYS-01',
    auth: 'public',
    roles: [],
    ownership: 'none',
  },
];

/** Exact-match lookup used by tests; middleware matching for `:params` lands with F-01. */
export function findRoutePolicy(method: string, path: string): RoutePolicy | undefined {
  return ROUTE_POLICIES.find((policy) => policy.method === method && policy.path === path);
}
