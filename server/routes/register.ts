import type { Express, RequestHandler } from 'express';
import { createAuthorize, type OwnerLookup } from '../middleware/authorize.js';
import type { RoutePolicy } from './registry.js';

/**
 * The only way to mount a route (F-01 R11): the route must already have a
 * policy in the registry, and the matching authenticate → authorize chain is
 * applied from that policy. A route without a policy cannot be registered.
 */
export interface RouteRegistrar {
  register(
    policy: RoutePolicy,
    handler: RequestHandler,
    options?: { ownerLookup?: OwnerLookup },
  ): void;
}

export function createRouteRegistrar(
  app: Express,
  policies: readonly RoutePolicy[],
  authenticate?: RequestHandler,
): RouteRegistrar {
  return {
    register(policy, handler, options = {}) {
      const registered = policies.find(
        (p) => p.method === policy.method && p.path === policy.path,
      );
      if (!registered) {
        throw new Error(`No route policy registered for ${policy.method} ${policy.path}`);
      }
      const method = registered.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
      if (registered.auth === 'public') {
        app[method](registered.path, handler);
        return;
      }
      if (!authenticate) {
        throw new Error(`Cannot mount ${policy.method} ${policy.path}: no authentication configured`);
      }
      app[method](
        registered.path,
        authenticate,
        createAuthorize(registered, options.ownerLookup),
        handler,
      );
    },
  };
}
