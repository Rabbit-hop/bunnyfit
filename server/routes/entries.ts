import type { Clock } from '../domain/clock.js';
import { appError } from '../domain/errors.js';
import { cumulativeFor, type CumulativeEntry } from '../domain/entryCalc.js';
import { validateEntry } from '../domain/entryValidation.js';
import { isCalendarDate } from '../domain/planValidation.js';
import { resolvePlan } from '../domain/planResolution.js';
import { quickCompleteDifference } from '../domain/quickComplete.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validationError } from '../middleware/errorHandler.js';
import type { EntryRecord, EntryRepository } from '../repositories/entryRepository.js';
import type { PlanRepository } from '../repositories/planRepository.js';
import type { RouteRegistrar } from './register.js';
import { findRoutePolicy, type RoutePolicy } from './registry.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The LedgerEntry value columns an entry body may carry (F-04 R4). */
const VALUE_KEYS = ['sets', 'totalReps', 'durationSec', 'distanceKm'] as const;
/** Everything a manual-entry body may contain; any other key is rejected (R2, §4.2). */
const BODY_KEYS: ReadonlySet<string> = new Set(['userExerciseId', 'logDate', ...VALUE_KEYS]);

/** F-05 R6: fields a PUT body must never carry, not even with an unchanged value. */
const IMMUTABLE_KEYS: ReadonlySet<string> = new Set(['id', 'userId', 'userExerciseId', 'logDate', 'kind', 'createdAt']);

/** Everything a Quick Complete body may contain (R2, §4.3). */
const QUICK_COMPLETE_KEYS: ReadonlySet<string> = new Set(['userExerciseId', 'logDate']);

/** R2: a key outside `allowed` (a body `userId` among them) is rejected before anything is read. */
function rejectUnknownFields(body: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw validationError([{ field: key, limit: 'unknown field' }]);
  }
}

function parseExerciseId(body: Record<string, unknown>): string {
  const userExerciseId = body['userExerciseId'];
  if (typeof userExerciseId !== 'string' || !UUID.test(userExerciseId)) {
    throw validationError([{ field: 'userExerciseId', limit: 'must be a UUID' }]);
  }
  return userExerciseId;
}

/** R3: `logDate` is optional; malformed → VALIDATION_ERROR, not today → LOG_DATE_MISMATCH. */
function checkLogDate(logDate: unknown, today: string): void {
  if (logDate === undefined || logDate === null) return;
  if (!isCalendarDate(logDate)) {
    throw validationError([{ field: 'logDate', limit: 'must be a date YYYY-MM-DD' }]);
  }
  if (logDate !== today) {
    throw appError('LOG_DATE_MISMATCH', `This entry is not for today (${today}).`, [
      { field: 'logDate', limit: `today (${today})` },
    ]);
  }
}

/** One cumulative item per exercise that has at least one entry, first-appearance order (§4.4). */
function exerciseOrder(entries: readonly EntryRecord[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const entry of entries) {
    if (!seen.has(entry.userExerciseId)) {
      seen.add(entry.userExerciseId);
      order.push(entry.userExerciseId);
    }
  }
  return order;
}

/**
 * F-04 §4.1 entry routes of the Participant: manual entry, day listing and the
 * owner-scoped single entry, and Quick Complete (`POST /api/entries/quick-complete`).
 *
 * Rules composed here: R2 (ownership of `userExerciseId`, unknown body fields),
 * R3 (`logDate`), R4–R6 via `validateEntry`, R7 via `cumulativeFor` (derived on
 * read — nothing aggregate is ever stored), R14 (row lock, manual entry too); Quick Complete adds R8 (availability via
 * `resolvePlan`), R9–R12 (`quickCompleteDifference` then `validateEntry`) and R14 (row lock).
 */
export function registerEntryRoutes(
  registrar: RouteRegistrar,
  policies: readonly RoutePolicy[],
  deps: { entries: EntryRepository; plans: PlanRepository; clock: Clock },
): void {
  const policy = (method: string, path: string): RoutePolicy => {
    const p = findRoutePolicy(method, path, policies);
    if (!p) throw new Error(`${method} ${path} has no route policy`);
    return p;
  };

  registrar.register(
    policy('POST', '/api/entries'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const userId = req.auth.userId;
      const body = (req.body ?? {}) as Record<string, unknown>;

      rejectUnknownFields(body, BODY_KEYS);
      const userExerciseId = parseExerciseId(body);
      const today = deps.clock.today();
      checkLogDate(body['logDate'], today);

      // R2: the exercise must exist (404) and belong to the caller (403) — checked
      // after the request shape so a bad body never probes other users' rows.
      const exercise = await deps.plans.findUserExerciseContext(userExerciseId);
      if (!exercise) {
        throw appError('NOT_FOUND', 'Exercise not found.', [
          { field: 'userExerciseId', limit: 'no such exercise' },
        ]);
      }
      if (exercise.userId !== userId) {
        throw appError('FORBIDDEN', 'You do not have access to this resource.');
      }

      // Only the value columns present in the body are validated: a field of another
      // mode fails R4, a missing required field fails the per-mode requirement.
      const values: Record<string, unknown> = {};
      for (const key of VALUE_KEYS) {
        if (key in body) values[key] = body[key];
      }

      // R14: entries and Quick Complete share one row lock, so the sums are read after it is held.
      const outcome = await deps.entries.withExerciseLock(userExerciseId, async (scope) => {
        const dayEntries = await scope.listDayEntries(userId, today);
        const totals = cumulativeFor(dayEntries, userExerciseId, today);
        const validated = validateEntry(values, exercise.trackingMode, totals, exercise.rangeMax);
        if ('fields' in validated) throw validationError(validated.fields);

        const entry = await scope.insert({
          userId,
          userExerciseId,
          logDate: today,
          ...validated.value,
          kind: 'MANUAL',
          createdAt: deps.clock.now(),
        });
        return { entry, cumulative: cumulativeFor([...dayEntries, entry], userExerciseId, today) };
      });

      res.status(201).json(outcome);
    }),
  );

  registrar.register(
    policy('POST', '/api/entries/quick-complete'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const userId = req.auth.userId;
      const body = (req.body ?? {}) as Record<string, unknown>;

      rejectUnknownFields(body, QUICK_COMPLETE_KEYS);
      const userExerciseId = parseExerciseId(body);
      const today = deps.clock.today();
      // §3.3: a wrong logDate is reported before availability, so it wins over R8.
      checkLogDate(body['logDate'], today);

      const exercise = await deps.plans.findUserExerciseContext(userExerciseId);
      if (!exercise) {
        throw appError('NOT_FOUND', 'Exercise not found.', [
          { field: 'userExerciseId', limit: 'no such exercise' },
        ]);
      }
      if (exercise.userId !== userId) {
        throw appError('FORBIDDEN', 'You do not have access to this resource.');
      }

      // R8: only an exercise that occurs today per F-03's resolvePlan (Rest Day and
      // non-planned exercises alike → 400, nothing stored).
      const plan = await resolvePlan(deps.plans, userId, today);
      const planned = plan.items.find((item) => item.userExercise.id === userExerciseId);
      if (!planned) {
        throw appError(
          'QUICK_COMPLETE_NOT_AVAILABLE',
          'Quick Complete is not available on a rest day or for an exercise that is not planned today',
        );
      }

      // R14: the row lock serializes concurrent requests; the sums are read after it is held.
      const outcome = await deps.entries.withExerciseLock(userExerciseId, async (scope) => {
        const dayEntries = await scope.listDayEntries(userId, today);
        const totals = cumulativeFor(dayEntries, userExerciseId, today);

        // R9 / R10: nothing remaining → No-op, nothing stored.
        const difference = quickCompleteDifference(exercise.trackingMode, planned.planItem, totals);
        if (!difference.remaining) return { entry: null, cumulative: totals };

        // R12: the differential entry obeys R5 and R6 like any other; if none fits, the
        // validator's error (naming `sets`) is the response and nothing is stored.
        const validated = validateEntry(difference.values, exercise.trackingMode, totals, exercise.rangeMax);
        if ('fields' in validated) throw validationError(validated.fields);

        const entry = await scope.insert({
          userId,
          userExerciseId,
          logDate: today,
          ...validated.value,
          kind: 'QUICK_COMPLETE',
          createdAt: deps.clock.now(),
        });
        return { entry, cumulative: cumulativeFor([...dayEntries, entry], userExerciseId, today) };
      });

      res.status(outcome.entry ? 201 : 200).json(outcome);
    }),
  );

  registrar.register(
    policy('GET', '/api/entries'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const raw = req.query['date'];
      const date = raw === undefined ? deps.clock.today() : raw;
      if (!isCalendarDate(date)) {
        throw validationError([{ field: 'date', limit: 'must be a date YYYY-MM-DD' }]);
      }
      const entries = await deps.entries.listDayEntries(req.auth.userId, date);
      const cumulative = exerciseOrder(entries).map((id) => cumulativeFor(entries, id, date));
      res.status(200).json({ date, entries, cumulative });
    }),
  );

  // Owner check runs in the authorize middleware: a malformed id is 400, an unknown
  // one 404, another Participant's entry 403 (§3.3); the handler then loads the row.
  registrar.register(
    policy('GET', '/api/entries/:id'),
    asyncHandler(async (req, res) => {
      const found = await deps.entries.findEntry(String(req.params['id'] ?? ''));
      if (!found) throw appError('NOT_FOUND', 'Entry not found.');
      res.status(200).json(found);
    }),
    {
      ownerLookup: async (id) => {
        if (!UUID.test(id)) throw validationError([{ field: 'id', limit: 'must be a UUID' }]);
        return deps.entries.findEntryOwner(id);
      },
    },
  );
  // F-05 PUT/DELETE: the registry policy (resource-owner) runs first, so the order of
  // R2 holds: 401, role 403, malformed id 400, unknown id 404, foreign owner 403. The
  // handlers then validate the body (PUT), and inside the row lock re-read the entry (R8),
  // check "created today" (R3, 409) and the cumulative limits (R5).
  const ownerLookup = async (id: string): Promise<string | null> => {
    if (!UUID.test(id)) throw validationError([{ field: 'id', limit: 'must be a UUID' }]);
    return deps.entries.findEntryOwner(id);
  };
  const notEditable = () =>
    appError('ENTRY_NOT_EDITABLE', 'Only entries dated today can be edited or deleted.');
  const gone = () => appError('NOT_FOUND', 'Entry not found.');

  registrar.register(
    policy('PUT', '/api/entries/:id'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const id = String(req.params['id'] ?? '');
      const body = (req.body ?? {}) as Record<string, unknown>;

      // R6: the immutable fields are named in the rejection; any other extra key is unknown (R4).
      for (const key of Object.keys(body)) {
        if (IMMUTABLE_KEYS.has(key)) throw validationError([{ field: key, limit: 'cannot be changed' }]);
        if (!VALUE_KEYS.some((k) => k === key)) throw validationError([{ field: key, limit: 'unknown field' }]);
      }

      const entry = await deps.entries.findEntry(id);
      if (!entry) throw gone();
      const exercise = await deps.plans.findUserExerciseContext(entry.userExerciseId);
      if (!exercise) throw gone();

      // R2: body validation precedes the editable check. Field-level rules (R4, R5) do not
      // depend on the day's sums, so they run here with empty totals; the cumulative rule runs
      // under the lock below.
      const fieldCheck = validateEntry(body, exercise.trackingMode, {}, exercise.rangeMax);
      if ('fields' in fieldCheck) throw validationError(fieldCheck.fields);

      const outcome = await deps.entries.withExerciseLock(entry.userExerciseId, async (scope) => {
        const current = await scope.findEntry(id); // R8: re-read inside the lock
        if (!current) throw gone();
        if (current.logDate !== deps.clock.today()) throw notEditable(); // R3
        const others = (await scope.listDayEntries(req.auth!.userId, current.logDate)).filter(
          (e) => e.id !== id,
        );
        // R5: the sum of the day's OTHER entries; the old values of this entry are replaced.
        const totals = cumulativeFor(others, current.userExerciseId, current.logDate);
        const validated = validateEntry(body, exercise.trackingMode, totals, exercise.rangeMax);
        if ('fields' in validated) throw validationError(validated.fields);
        const updated = await scope.updateValues(id, validated.value);
        return {
          entry: updated,
          cumulative: cumulativeFor([...others, updated], updated.userExerciseId, updated.logDate),
        };
      });
      res.status(200).json(outcome);
    }),
    { ownerLookup },
  );

  registrar.register(
    policy('DELETE', '/api/entries/:id'),
    asyncHandler(async (req, res) => {
      if (!req.auth) throw appError('UNAUTHENTICATED', 'Authentication required.');
      const id = String(req.params['id'] ?? '');
      const entry = await deps.entries.findEntry(id);
      if (!entry) throw gone();
      await deps.entries.withExerciseLock(entry.userExerciseId, async (scope) => {
        const current = await scope.findEntry(id); // R8
        if (!current) throw gone();
        if (current.logDate !== deps.clock.today()) throw notEditable(); // R3
        await scope.remove(id);
      });
      res.status(204).end();
    }),
    { ownerLookup },
  );
}

/** Exported for the day-listing tests' expectations (re-exported shape of §4.4). */
export type { CumulativeEntry };
