import { appError } from '../domain/errors.js';
import { validateReminderCreate, validateReminderUpdate } from '../domain/reminderValidation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validationError } from '../middleware/errorHandler.js';
import type { ReminderRepository } from '../repositories/reminderRepository.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * F-09 §4.2–§4.5 reminder settings: `GET/POST /api/reminders`, `PUT/DELETE /api/reminders/:id`.
 * Participant only; the list and create are self-scoped (the owner comes from the token), PUT and
 * DELETE are resource-owner (policy order: 401, role 403, malformed id 400, unknown id 404, foreign
 * owner 403; then body validation). Display only: nothing here sends anything (R13).
 */
export function registerReminderRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  deps: { reminders: ReminderRepository },
): void {
  const policy = (method: string, path: string): RoutePolicy => {
    const found = findRoutePolicy(method, path, policies);
    if (!found) throw new Error(`${method} ${path} has no route policy`);
    return found;
  };
  const ownerLookup = async (id: string): Promise<string | null> => {
    if (!UUID.test(id)) throw validationError([{ field: 'id', limit: 'must be a UUID' }]);
    return deps.reminders.ownerOf(id);
  };
  const gone = () => appError('NOT_FOUND', 'Reminder not found.');

  registrar.register(
    policy('GET', '/api/reminders'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      res.status(200).json(await deps.reminders.list(req.auth.userId));
    }),
  );

  registrar.register(
    policy('POST', '/api/reminders'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const result = validateReminderCreate(req.body ?? {});
      if ('fields' in result) throw validationError(result.fields);
      res.status(201).json(await deps.reminders.create(req.auth.userId, result.value));
    }),
  );

  registrar.register(
    policy('PUT', '/api/reminders/:id'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const result = validateReminderUpdate(req.body ?? {});
      if ('fields' in result) throw validationError(result.fields);
      const updated = await deps.reminders.update(String(req.params['id'] ?? ''), result.value);
      if (!updated) throw gone();
      res.status(200).json(updated);
    }),
    { ownerLookup },
  );

  registrar.register(
    policy('DELETE', '/api/reminders/:id'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      if (!(await deps.reminders.remove(String(req.params['id'] ?? '')))) throw gone();
      res.status(204).end();
    }),
    { ownerLookup },
  );
}
