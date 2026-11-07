import type { Express } from 'express';
import { findRoutePolicy, type RoutePolicy } from '../../server/routes/registry.js';

/** Every `METHOD path` mounted directly on the Express app (route layers only). */
export function listExpressRoutes(app: Express): { method: string; path: string }[] {
  // Express 4 keeps the route table on the private `_router`; there is no public API.
  const stack = ((app as unknown as { _router?: { stack: unknown[] } })._router?.stack ?? []) as {
    route?: { path: string; methods: Record<string, boolean> };
  }[];
  const out: { method: string; path: string }[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      out.push({ method: method.toUpperCase(), path: layer.route.path });
    }
  }
  return out;
}

/** Routes in the running app that have no policy in `policies` (TEST-22c-2). */
export function routesMissingPolicy(
  app: Express,
  policies: readonly RoutePolicy[],
): string[] {
  return listExpressRoutes(app)
    .filter((r) => !policies.some((p) => p.method === r.method && p.path === r.path))
    .map((r) => `${r.method} ${r.path}`);
}

export { findRoutePolicy };
