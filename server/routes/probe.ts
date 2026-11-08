import type { RequestHandler } from 'express';
import type { OwnerLookup } from '../middleware/authorize.js';
import { PROBE_ROUTE_POLICIES } from './registry.js';
import type { RouteRegistrar } from './register.js';

/** Test-only probe routes (F-01 §4.5); never mounted outside NODE_ENV=test. */
export function registerProbeRoutes(registrar: RouteRegistrar, ownerLookup: OwnerLookup): void {
  const ok: RequestHandler = (req, res) => {
    res.status(200).json({ ok: true, userId: req.auth?.userId });
  };
  for (const policy of PROBE_ROUTE_POLICIES) {
    registrar.register(policy, ok, policy.ownership === 'resource-owner' ? { ownerLookup } : {});
  }
}
