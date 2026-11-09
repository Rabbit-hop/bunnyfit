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
  { method: 'POST', path: '/api/auth/login', featureId: 'F-01', auth: 'public', roles: [], ownership: 'none' },
  { method: 'GET', path: '/api/auth/me', featureId: 'F-01', auth: 'required', roles: ['MANAGER', 'PARTICIPANT'], ownership: 'none' },
  { method: 'POST', path: '/api/auth/logout', featureId: 'F-01', auth: 'required', roles: ['MANAGER', 'PARTICIPANT'], ownership: 'none' },
  // F-02 exercise library — read side (write routes are added with their handlers).
  { method: 'GET', path: '/api/categories', featureId: 'F-02', auth: 'required', roles: ['MANAGER', 'PARTICIPANT'], ownership: 'none' },
  { method: 'GET', path: '/api/templates', featureId: 'F-02', auth: 'required', roles: ['MANAGER', 'PARTICIPANT'], ownership: 'none' },
  { method: 'GET', path: '/api/templates/:id', featureId: 'F-02', auth: 'required', roles: ['MANAGER', 'PARTICIPANT'], ownership: 'none' },
];

/**
 * Test-only probe routes (F-01 §4.5). They let F-01 verify role and ownership
 * enforcement before the real features exist; mounted only when NODE_ENV=test.
 */
export const PROBE_ROUTE_POLICIES: readonly RoutePolicy[] = [
  { method: 'GET', path: '/__test/manager-only', featureId: 'F-01', auth: 'required', roles: ['MANAGER'], ownership: 'none' },
  { method: 'GET', path: '/__test/participant-only', featureId: 'F-01', auth: 'required', roles: ['PARTICIPANT'], ownership: 'self-scoped' },
  { method: 'GET', path: '/__test/owned/:id', featureId: 'F-01', auth: 'required', roles: ['PARTICIPANT'], ownership: 'resource-owner' },
  { method: 'PUT', path: '/__test/owned/:id', featureId: 'F-01', auth: 'required', roles: ['PARTICIPANT'], ownership: 'resource-owner' },
  { method: 'DELETE', path: '/__test/owned/:id', featureId: 'F-01', auth: 'required', roles: ['PARTICIPANT'], ownership: 'resource-owner' },
];

/** The policies in force for an environment: production list, plus probes under test. */
export function activePolicies(nodeEnv: string): readonly RoutePolicy[] {
  return nodeEnv === 'test' ? [...ROUTE_POLICIES, ...PROBE_ROUTE_POLICIES] : ROUTE_POLICIES;
}

function segments(path: string): string[] {
  const clean = (path.split('?')[0] ?? '').replace(/\/+$/, '');
  return clean.split('/').slice(1);
}

/** Number of literal (non-param) segments if `pattern` matches `path`, else -1. */
function matchScore(pattern: string, path: string): number {
  const p = segments(pattern);
  const a = segments(path);
  if (p.length !== a.length) return -1;
  let literals = 0;
  for (let i = 0; i < p.length; i++) {
    const seg = p[i] ?? '';
    const actual = a[i] ?? '';
    if (seg.startsWith(':')) {
      if (actual === '') return -1;
    } else if (seg === actual) {
      literals++;
    } else {
      return -1;
    }
  }
  return literals;
}

/**
 * Policy lookup with `:param` matching. A literal route (`/api/entries/today`)
 * wins over a parametrised one (`/api/entries/:id`). Query string and trailing
 * slash are ignored.
 */
export function findRoutePolicy(
  method: string,
  path: string,
  policies: readonly RoutePolicy[] = ROUTE_POLICIES,
): RoutePolicy | undefined {
  let best: RoutePolicy | undefined;
  let bestScore = -1;
  for (const policy of policies) {
    if (policy.method !== method) continue;
    const score = matchScore(policy.path, path);
    if (score > bestScore) {
      best = policy;
      bestScore = score;
    }
  }
  return best;
}
