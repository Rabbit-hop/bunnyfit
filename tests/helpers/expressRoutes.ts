import type { Express } from 'express';
import { SPA_FALLBACK_ROUTE } from '../../server/app.js';
import { findRoutePolicy, type RoutePolicy } from '../../server/routes/registry.js';

interface Layer {
  route?: { path: string | RegExp; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: Layer[] };
  regexp?: RegExp;
}

/** Mount prefix of a sub-Router layer, rebuilt from the `app.use` path regexp (Express 4 keeps no plain string). */
function mountPrefix(layer: Layer): string {
  const src = layer.regexp?.source ?? '';
  if (src === '^\\/?(?=\\/|$)') return '';
  return src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/');
}

function collect(stack: Layer[], prefix: string, out: { method: string; path: string | RegExp }[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const path = layer.route.path;
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ method: method.toUpperCase(), path: typeof path === 'string' && prefix ? prefix + path : path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      collect(layer.handle.stack, prefix + mountPrefix(layer), out);
    }
  }
}

/**
 * Every `METHOD path` in the running app, including routes inside sub-Routers
 * (TEST-22c-2). Plain `app.use(fn)` middleware is not a route and is not listed.
 */
export function listExpressRoutes(app: Express): { method: string; path: string | RegExp }[] {
  // Express 4 keeps the route table on the private `_router`; there is no public API.
  const stack = ((app as unknown as { _router?: { stack: Layer[] } })._router?.stack ?? []);
  const out: { method: string; path: string | RegExp }[] = [];
  collect(stack, '', out);
  return out;
}

/** Routes in the running app that have no policy in `policies` (TEST-22c-2). */
export function routesMissingPolicy(
  app: Express,
  policies: readonly RoutePolicy[],
): string[] {
  return listExpressRoutes(app)
    // Only the exact SPA fallback RegExp is exempt; every other route, string or
    // regex, must have a policy.
    .filter((r) => r.path !== SPA_FALLBACK_ROUTE)
    .filter((r) => !policies.some((p) => p.method === r.method && p.path === r.path))
    .map((r) => `${r.method} ${String(r.path)}`);
}

export { findRoutePolicy };
