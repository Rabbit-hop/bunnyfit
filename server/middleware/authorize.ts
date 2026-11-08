import type { RequestHandler } from 'express';
import { appError } from '../domain/errors.js';
import type { RoutePolicy } from '../routes/registry.js';

/**
 * Request pipeline steps 2–3 (F-01 §3.2): role, then ownership.
 * Runs after `authenticate`; 403 bodies are the bare envelope (no private data).
 *
 * `ownerLookup(id)` returns the owner's user id, or `null` when the record does
 * not exist (→ 404 NOT_FOUND). It is mandatory for `resource-owner` policies.
 */
export type OwnerLookup = (recordId: string) => Promise<string | null>;

export function createAuthorize(policy: RoutePolicy, ownerLookup?: OwnerLookup): RequestHandler {
  if (policy.auth === 'public') {
    throw new Error(`Route ${policy.method} ${policy.path} is public; it must not use authorize`);
  }
  if (policy.ownership === 'resource-owner' && !ownerLookup) {
    throw new Error(
      `Route ${policy.method} ${policy.path} is resource-owner but has no owner lookup function`,
    );
  }

  // The record id is the policy path's last `:param`; a resource-owner path without one is rejected now.
  const idParam = /:([A-Za-z_]\w*)\??(?!.*:[A-Za-z_])/.exec(policy.path)?.[1];
  if (policy.ownership === 'resource-owner' && !idParam) {
    throw new Error(`Route ${policy.method} ${policy.path} is resource-owner but its path has no :param`);
  }

  const forbidden = () => appError('FORBIDDEN', 'You do not have access to this resource.');

  return async (req, _res, next) => {
    try {
      const auth = req.auth;
      if (!auth) throw appError('UNAUTHENTICATED', 'Authentication required.');

      // Step 2 — role
      if (!policy.roles.includes(auth.role)) throw forbidden();

      // Step 3 — ownership
      if (policy.ownership === 'self-scoped') {
        const raw = req.query['userId'];
        if (raw !== undefined) {
          const values = Array.isArray(raw) ? raw : [raw];
          if (values.some((v) => v !== auth.userId)) throw forbidden();
        }
      } else if (policy.ownership === 'resource-owner' && ownerLookup) {
        const owner = await ownerLookup(String(req.params[idParam ?? 'id'] ?? ''));
        if (owner === null) throw appError('NOT_FOUND', 'Resource not found.');
        if (owner !== auth.userId) throw forbidden();
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
