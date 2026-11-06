import { Router } from 'express';

/**
 * `GET /api/health` — SYS-01 deployment / liveness check (SDS §5.2, §9.2).
 * Public: no Bearer token required (route policy registry).
 */
export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
