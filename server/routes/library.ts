import { appError } from '../domain/errors.js';
import type { LibraryRepository } from '../repositories/libraryRepository.js';
import { validationError } from '../middleware/errorHandler.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACKING_MODES = [
  'WEIGHT',
  'BODYWEIGHT_REPS',
  'BODYWEIGHT_TIME',
  'YOGA',
  'CARDIO_TIME',
  'CARDIO_DISTANCE',
] as const;
type Mode = (typeof TRACKING_MODES)[number];

/** Read endpoints of the exercise library (F-02 §4.1), open to Manager and Participant. */
export function registerLibraryRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  repo: LibraryRepository,
): void {
  const policy = (method: string, path: string): RoutePolicy => {
    const p = findRoutePolicy(method, path, policies);
    if (!p) throw new Error(`${method} ${path} has no route policy`);
    return p;
  };

  registrar.register(
    policy('GET', '/api/categories'),
    asyncHandler(async (_req, res) => {
      res.status(200).json(await repo.listCategories());
    }),
  );

  registrar.register(
    policy('GET', '/api/templates'),
    asyncHandler(async (req, res) => {
      const { categoryId, trackingMode } = req.query;
      if (categoryId !== undefined && (typeof categoryId !== 'string' || !UUID.test(categoryId))) {
        throw validationError([{ field: 'categoryId', limit: 'must be a UUID' }]);
      }
      if (
        trackingMode !== undefined &&
        (typeof trackingMode !== 'string' || !(TRACKING_MODES as readonly string[]).includes(trackingMode))
      ) {
        throw validationError([{ field: 'trackingMode', limit: `must be one of ${TRACKING_MODES.join(', ')}` }]);
      }
      res.status(200).json(
        await repo.listTemplates({
          ...(categoryId !== undefined ? { categoryId: categoryId as string } : {}),
          ...(trackingMode !== undefined ? { trackingMode: trackingMode as Mode } : {}),
        }),
      );
    }),
  );

  registrar.register(
    policy('GET', '/api/templates/:id'),
    asyncHandler(async (req, res) => {
      const id = String(req.params['id'] ?? '');
      if (!UUID.test(id)) throw validationError([{ field: 'id', limit: 'must be a UUID' }]);
      const template = await repo.findTemplate(id);
      if (!template) throw appError('NOT_FOUND', 'Template not found.');
      res.status(200).json(template);
    }),
  );
}
