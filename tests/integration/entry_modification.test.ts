import type { EntryKind, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-05 STS §8 (docs/sprints/sprint-2/F-05-entry-modification.md): PUT and DELETE
// /api/entries/:id against a real PostgreSQL test database. Clock fixed at Thu 5 Nov
// 2026 10:00 Asia/Bangkok. Old and tomorrow entries are inserted directly with Prisma
// (POST refuses a non-today date). IDs: TEST-05a-1..6, TEST-05b-1..4, TEST-05c-1..5,
// TEST-18a-1..4, TEST-18b-1..6. Not covered here: the concurrent cases (contract §12
// item 7) and the UI cases TEST-23-5..8 (tests/e2e/validation_feedback.spec.ts).
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-05 / AC-18).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-05T03:00:00.000Z'); // 10:00 Asia/Bangkok, Thu 5 Nov 2026
const TODAY = '2026-11-05';
const YESTERDAY = '2026-11-04';
const TOMORROW = '2026-11-06';
const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';

describeWithDatabase('F-05 same-day entry modification and deletion (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  let clock: MutableClock;
  let aliceId: string;
  let bobId: string;
  let bobExerciseId = '';
  let managerAuth: Record<string, string> = {};
  const templateIds: Record<string, string> = {};
  const exerciseIds = new Map<string, string>();
  const createdPlanItems: string[] = [];
  const createdExercises: string[] = [];

  const login = async (email: string, password = env.seedParticipantPassword): Promise<string> =>
    (await request(app).post('/api/auth/login').send({ email, password })).body.token as string;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  let aliceAuth: Record<string, string> = {};
  let bobAuth: Record<string, string> = {};
  const exId = (name: string): string => {
    const id = exerciseIds.get(name);
    if (!id) throw new Error(`fixture: no exercise snapshot named ${name}`);
    return id;
  };

  /** Direct insert of a ledger row at a given date; createdAt ordered by a counter. */
  let counter = 0;
  const mk = async (
    userId: string,
    userExerciseId: string,
    logDate: string,
    values: { sets?: number; totalReps?: number; durationSec?: number; distanceKm?: number },
    kind: EntryKind = 'MANUAL',
  ): Promise<string> => {
    counter += 1;
    const row = await prisma.ledgerEntry.create({
      data: {
        userId,
        userExerciseId,
        logDate: new Date(`${logDate}T00:00:00.000Z`),
        sets: values.sets ?? null,
        totalReps: values.totalReps ?? null,
        durationSec: values.durationSec ?? null,
        distanceKm: values.distanceKm ?? null,
        kind,
        createdAt: new Date(NOW.getTime() + counter * 1000),
      },
    });
    return row.id;
  };

  const put = (id: string, body: Record<string, unknown>, auth = aliceAuth) =>
    request(app).put(`/api/entries/${id}`).set(auth).send(body);
  const del = (id: string, auth = aliceAuth) => request(app).delete(`/api/entries/${id}`).set(auth);
  const quick = (name: string) =>
    request(app).post('/api/entries/quick-complete').set(aliceAuth).send({ userExerciseId: exId(name) });
  const daily = () => request(app).get(`/api/progress/daily?date=${TODAY}`).set(aliceAuth);
  const dayEntries = () => request(app).get(`/api/entries?date=${TODAY}`).set(aliceAuth);

  /** The suite's ledger rows: the "DB unchanged" snapshot. */
  const dbSnapshot = () =>
    prisma.ledgerEntry.findMany({ where: { userId: { in: [aliceId, bobId] } }, orderBy: { id: 'asc' } });
  /** Moves the Clock and signs Alice in again: her token (1 h) would expire across the move. */
  const moveClock = async (to: Date) => {
    clock.set(to);
    aliceAuth = bearer(await login('alice@exercise.test'));
  };
  const resetEntries = async () => {
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [aliceId, bobId] } } });
    await moveClock(NOW);
  };

  beforeAll(async () => {
    prisma = newPrisma();
    clock = new MutableClock(NOW);
    app = buildIntegrationApp(prisma, clock);
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })).id;
    bobId = (await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })).id;
    for (const t of await prisma.exerciseTemplate.findMany()) templateIds[t.name] = t.id;

    aliceAuth = bearer(await login('alice@exercise.test'));
    bobAuth = bearer(await login('bob@exercise.test'));
    managerAuth = bearer(await login('manager@exercise.test', env.seedManagerPassword));

    const plan = async (body: Record<string, unknown>, auth = aliceAuth): Promise<void> => {
      const res = await request(app).post('/api/plan-items').set(auth).send(body);
      if (res.status !== 201) throw new Error(`fixture plan item failed: ${res.status} ${JSON.stringify(res.body)}`);
      createdPlanItems.push(res.body.planItem.id as string);
      createdExercises.push(res.body.userExercise.id as string);
      exerciseIds.set(res.body.userExercise.name as string, res.body.userExercise.id as string);
    };

    // Alice (F-05 §8): Squat 4x10 @ 40 kg, Plank 120 s, Outdoor Run 5 km every day, and
    // a custom "Capped Squat" whose rangeMax is lowered to 50 for TEST-18b-2.
    await plan({ source: 'TEMPLATE', templateId: templateIds['Barbell Squat'], priorityWeight: 3, targetSets: 4, targetRepsPerSet: 10, loadKg: 40 });
    await plan({ source: 'TEMPLATE', templateId: templateIds['Plank'], priorityWeight: 2, targetDurationSec: 120 });
    await plan({ source: 'TEMPLATE', templateId: templateIds['Outdoor Run'], priorityWeight: 2, targetDistanceKm: 5 });
    await plan({
      source: 'CUSTOM',
      exercise: { name: 'Capped Squat', targetBodyPart: 'Legs', trackingMode: 'WEIGHT' },
      priorityWeight: 2,
      targetSets: 5,
      targetRepsPerSet: 10,
      loadKg: 40,
    });
    await prisma.userExercise.update({ where: { id: exId('Capped Squat') }, data: { rangeMax: 50 } });

    // Bob: his own exercise for the ownership cases, and a plan on Mon/Wed/Fri only, so
    // Thu 5 Nov is a Rest Day for him (TEST-05a-6).
    const bobExercise = await prisma.userExercise.create({
      data: { userId: bobId, isCustom: false, name: 'Barbell Squat', targetBodyPart: 'Legs', unit: 'reps', trackingMode: 'WEIGHT', metValue: 3.5, rangeMin: 1, rangeMax: 4000 },
    });
    bobExerciseId = bobExercise.id;
    createdExercises.push(bobExercise.id);
    await plan(
      {
        source: 'CUSTOM',
        exercise: { name: 'Bob Walk', targetBodyPart: 'Legs', trackingMode: 'CARDIO_TIME' },
        priorityWeight: 1,
        targetDurationSec: 1800,
        repeatDays: [1, 3, 5],
      },
      bobAuth,
    );
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [aliceId, bobId] } } });
    await prisma.planItem.deleteMany({ where: { id: { in: createdPlanItems } } });
    await prisma.userExercise.deleteMany({ where: { id: { in: createdExercises } } });
    await prisma.$disconnect();
  });

  describe('AC-05a edit own entry created today (TEST-05a)', () => {
    it('TEST-05a-1: PUT replaces the values of one entry; id, logDate, kind, createdAt unchanged; other row unchanged', async () => {
      await resetEntries();
      const first = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 2, totalReps: 20 });
      const second = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 8 });
      const before = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: first } });
      const secondBefore = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: second } });

      const res = await put(first, { sets: 2, totalReps: 25 });
      expect(res.status).toBe(200);
      expect(res.body.entry).toEqual({
        id: first, userExerciseId: exId('Barbell Squat'), logDate: TODAY,
        sets: 2, totalReps: 25, durationSec: null, distanceKm: null,
        kind: 'MANUAL', createdAt: before.createdAt.toISOString(),
      });
      expect(res.body.entry).not.toHaveProperty('userId');
      expect(res.body.cumulative).toEqual({ userExerciseId: exId('Barbell Squat'), sets: 3, totalReps: 33, durationSec: 0, distanceKm: 0 });
      expect(await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: second } })).toEqual(secondBefore);
    });

    it('TEST-05a-2: one entry per mode: Plank 90 s and Outdoor Run 3.25 km (exact decimal)', async () => {
      await resetEntries();
      const plank = await mk(aliceId, exId('Plank'), TODAY, { durationSec: 60 });
      const run = await mk(aliceId, exId('Outdoor Run'), TODAY, { distanceKm: 2.5 });
      const a = await put(plank, { durationSec: 90 });
      const b = await put(run, { distanceKm: 3.25 });
      expect(a.status).toBe(200);
      expect(a.body.cumulative).toMatchObject({ durationSec: 90 });
      expect(b.status).toBe(200);
      expect(b.body.cumulative).toMatchObject({ distanceKm: 3.25 });
      expect(b.body.entry.distanceKm).toBe(3.25);
    });

    it('TEST-05a-3: score and ratio recomputed on read; the entry is the only changed row', async () => {
      await resetEntries();
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      const squat = (body: { items: { userExerciseId: string; ratio: number; actual: number }[] }) =>
        body.items.find((i) => i.userExerciseId === exId('Barbell Squat'));
      const before = await daily();
      expect(squat(before.body)?.actual).toBe(10);
      expect(squat(before.body)?.ratio).toBeCloseTo(0.25);

      const others = await prisma.ledgerEntry.count();
      const res = await put(id, { sets: 4, totalReps: 40 });
      expect(res.status).toBe(200);
      const after = await daily();
      expect(squat(after.body)?.actual).toBe(40);
      expect(squat(after.body)?.ratio).toBe(1);
      expect(await prisma.ledgerEntry.count()).toBe(others);
    });

    it('TEST-05a-4: target reached, PUT down to 1 set / 10 reps, then Quick Complete adds 3 sets / 30 reps', async () => {
      await resetEntries();
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 4, totalReps: 40 });
      expect((await put(id, { sets: 1, totalReps: 10 })).status).toBe(200);
      const qc = await quick('Barbell Squat');
      expect(qc.status).toBe(201);
      expect(qc.body.entry).toMatchObject({ sets: 3, totalReps: 30, kind: 'QUICK_COMPLETE' });
      expect(qc.body.cumulative).toMatchObject({ sets: 4, totalReps: 40 });
    });

    it('TEST-05a-5: PUT up beyond the target, then Quick Complete is a No-op 200 with entry null', async () => {
      await resetEntries();
      await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 4, totalReps: 30 });
      const small = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      const res = await put(small, { sets: 1, totalReps: 15 });
      expect(res.status).toBe(200);
      expect(res.body.cumulative).toMatchObject({ sets: 5, totalReps: 45 });
      const rows = await prisma.ledgerEntry.count({ where: { userId: aliceId } });
      const qc = await quick('Barbell Squat');
      expect(qc.status).toBe(200);
      expect(qc.body.entry).toBeNull();
      expect(await prisma.ledgerEntry.count({ where: { userId: aliceId } })).toBe(rows);
    });

    it('TEST-05a-6: a Rest Day entry is editable and stays unscored', async () => {
      await resetEntries();
      const id = await mk(bobId, bobExerciseId, TODAY, { sets: 1, totalReps: 5 });
      const res = await put(id, { sets: 2, totalReps: 12 }, bobAuth);
      expect(res.status).toBe(200);
      expect(res.body.entry).toMatchObject({ sets: 2, totalReps: 12 });
      const progress = await request(app).get(`/api/progress/daily?date=${TODAY}`).set(bobAuth);
      expect(progress.body).toMatchObject({ isRestDay: true, items: [], overallPercent: null });
    });
  });

  describe('AC-05b delete own entry created today (TEST-05b)', () => {
    it('TEST-05b-1: DELETE → 204 empty body, one row removed, cumulative reduced', async () => {
      await resetEntries();
      await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 2, totalReps: 20 });
      const second = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 8 });
      const res = await del(second);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await prisma.ledgerEntry.count({ where: { userId: aliceId } })).toBe(1);
      const list = await dayEntries();
      expect(list.body.cumulative[0]).toMatchObject({ sets: 2, totalReps: 20 });
    });

    it('TEST-05b-2: deleting the entry that reached the target resets the ratio, and Quick Complete creates the full target', async () => {
      await resetEntries();
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 4, totalReps: 40 });
      expect((await del(id)).status).toBe(204);
      const progress = await daily();
      const item = progress.body.items.find((i: { userExerciseId: string }) => i.userExerciseId === exId('Barbell Squat'));
      expect(item.ratio).toBe(0);
      const qc = await quick('Barbell Squat');
      expect(qc.status).toBe(201);
      expect(qc.body.entry).toMatchObject({ sets: 4, totalReps: 40 });
    });

    it('TEST-05b-3: deleting the same id again → 404 NOT_FOUND, no other row affected', async () => {
      await resetEntries();
      const keep = await mk(aliceId, exId('Plank'), TODAY, { durationSec: 30 });
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 4, totalReps: 40 });
      expect((await del(id)).status).toBe(204);
      const again = await del(id);
      expect(again.status).toBe(404);
      expect(again.body.code).toBe('NOT_FOUND');
      expect(await prisma.ledgerEntry.findUnique({ where: { id: keep } })).not.toBeNull();
    });

    it("TEST-05b-4: Alice's delete leaves Bob's rows and cumulative unchanged", async () => {
      await resetEntries();
      const mine = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      await mk(bobId, bobExerciseId, TODAY, { sets: 2, totalReps: 20 });
      const bobBefore = await prisma.ledgerEntry.findMany({ where: { userId: bobId } });
      expect((await del(mine)).status).toBe(204);
      expect(await prisma.ledgerEntry.findMany({ where: { userId: bobId } })).toEqual(bobBefore);
      const bobList = await request(app).get(`/api/entries?date=${TODAY}`).set(bobAuth);
      expect(bobList.body.cumulative[0]).toMatchObject({ sets: 2, totalReps: 20 });
    });
  });

  describe('AC-05c old entries are not editable (TEST-05c)', () => {
    it('TEST-05c-1: PUT of an entry from yesterday → 409 ENTRY_NOT_EDITABLE, DB unchanged', async () => {
      await resetEntries();
      const old = await mk(aliceId, exId('Barbell Squat'), YESTERDAY, { sets: 2, totalReps: 20 });
      const before = await dbSnapshot();
      const res = await put(old, { sets: 3, totalReps: 30 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ENTRY_NOT_EDITABLE');
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-05c-2: DELETE of an entry from yesterday → 409, row present, that day cumulative unchanged', async () => {
      await resetEntries();
      const old = await mk(aliceId, exId('Barbell Squat'), YESTERDAY, { sets: 2, totalReps: 20 });
      const res = await del(old);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ENTRY_NOT_EDITABLE');
      expect(await prisma.ledgerEntry.findUnique({ where: { id: old } })).not.toBeNull();
      const list = await request(app).get(`/api/entries?date=${YESTERDAY}`).set(aliceAuth);
      expect(list.body.cumulative[0]).toMatchObject({ sets: 2, totalReps: 20 });
    });

    it('TEST-05c-3: yesterday, 2025-01-01 and tomorrow entries → 409 for PUT and DELETE, DB unchanged', async () => {
      await resetEntries();
      const ids = [
        await mk(aliceId, exId('Barbell Squat'), YESTERDAY, { sets: 1, totalReps: 10 }),
        await mk(aliceId, exId('Barbell Squat'), '2025-01-01', { sets: 1, totalReps: 10 }),
        await mk(aliceId, exId('Barbell Squat'), TOMORROW, { sets: 1, totalReps: 10 }),
      ];
      const before = await dbSnapshot();
      for (const id of ids) {
        expect((await put(id, { sets: 2, totalReps: 20 })).status).toBe(409);
        expect((await del(id)).status).toBe(409);
      }
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-05c-4: access matrix: foreign owner 403, Manager 403, no token 401, unknown id 404, malformed id 400', async () => {
      await resetEntries();
      const bobToday = await mk(bobId, bobExerciseId, TODAY, { sets: 1, totalReps: 10 });
      const bobOld = await mk(bobId, bobExerciseId, YESTERDAY, { sets: 1, totalReps: 10 });
      const aliceToday = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      const before = await dbSnapshot();

      for (const id of [bobToday, bobOld]) {
        const p = await put(id, { sets: 2, totalReps: 20 });
        const d = await del(id);
        expect(p.status).toBe(403);
        expect(d.status).toBe(403);
        expect(JSON.stringify(p.body)).not.toContain(bobId);
      }
      for (const id of [aliceToday, NO_SUCH_ID]) {
        expect((await put(id, { sets: 2, totalReps: 20 }, managerAuth)).status).toBe(403);
        expect((await put(id, { bogus: 1 }, managerAuth)).status).toBe(403);
        expect((await del(id, managerAuth)).status).toBe(403);
      }
      expect((await request(app).put(`/api/entries/${aliceToday}`).send({ sets: 2, totalReps: 20 })).status).toBe(401);
      expect((await request(app).delete(`/api/entries/${aliceToday}`)).status).toBe(401);
      expect((await put(NO_SUCH_ID, { sets: 2, totalReps: 20 })).status).toBe(404);
      expect((await del(NO_SUCH_ID)).status).toBe(404);
      expect((await put('not-a-uuid', { sets: 2, totalReps: 20 })).status).toBe(400);
      expect((await del('not-a-uuid')).status).toBe(400);
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-05c-5: an old entry with an invalid body → 400 (validation before the editable check)', async () => {
      await resetEntries();
      const old = await mk(aliceId, exId('Barbell Squat'), YESTERDAY, { sets: 1, totalReps: 10 });
      const before = await dbSnapshot();
      const bad = await put(old, { sets: 21, totalReps: 30 });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
      expect((await put(old, { sets: 2, totalReps: 20 })).status).toBe(409);
      expect(await dbSnapshot()).toEqual(before);
    });
  });

  describe('AC-18a midnight boundary (TEST-18a)', () => {
    const LAST_SECOND = new Date('2026-11-05T16:59:59.000Z'); // 23:59:59 Asia/Bangkok
    const MIDNIGHT = new Date('2026-11-05T17:00:00.000Z'); // 2026-11-06 00:00:00 Asia/Bangkok

    it('TEST-18a-1: PUT at 23:59:59 → 200', async () => {
      await resetEntries();
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      await moveClock(LAST_SECOND);
      const res = await put(id, { sets: 2, totalReps: 20 });
      expect(res.status).toBe(200);
      expect(res.body.entry).toMatchObject({ sets: 2, totalReps: 20 });
    });

    it('TEST-18a-2: the same PUT at 00:00:00 of the next day → 409, DB unchanged', async () => {
      await resetEntries();
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      const before = await dbSnapshot();
      await moveClock(MIDNIGHT);
      const res = await put(id, { sets: 2, totalReps: 20 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ENTRY_NOT_EDITABLE');
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-18a-3: DELETE at 23:59:59 → 204, then DELETE of the second at 00:00:00 → 409, second row present', async () => {
      await resetEntries();
      const first = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      const second = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      await moveClock(LAST_SECOND);
      expect((await del(first)).status).toBe(204);
      await moveClock(MIDNIGHT);
      expect((await del(second)).status).toBe(409);
      expect(await prisma.ledgerEntry.findUnique({ where: { id: second } })).not.toBeNull();
    });

    it('TEST-18a-4: an entry created by POST at 23:59:50 is locked at 00:00:00, but still readable', async () => {
      await resetEntries();
      await moveClock(new Date('2026-11-05T16:59:50.000Z'));
      const created = await request(app)
        .post('/api/entries')
        .set(aliceAuth)
        .send({ userExerciseId: exId('Barbell Squat'), sets: 1, totalReps: 10 });
      expect(created.status).toBe(201);
      const id = created.body.entry.id as string;
      await moveClock(MIDNIGHT);
      expect((await put(id, { sets: 2, totalReps: 20 })).status).toBe(409);
      expect((await del(id)).status).toBe(409);
      const list = await request(app).get(`/api/entries?date=${TODAY}`).set(aliceAuth);
      expect(list.status).toBe(200);
      expect(list.body.entries).toHaveLength(1);
      expect(list.body.entries[0]).toMatchObject({ id, sets: 1, totalReps: 10 });
    });
  });

  describe('AC-18b edited values pass AC-11; immutable fields (TEST-18b)', () => {
    it('TEST-18b-1: cumulative sets 20 is accepted and 21 is rejected; totalReps above sets x 200 is rejected', async () => {
      await resetEntries();
      await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 15, totalReps: 150 });
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      expect((await put(id, { sets: 5, totalReps: 50 })).status).toBe(200);
      const before = await dbSnapshot();
      const over = await put(id, { sets: 6, totalReps: 60 });
      expect(over.status).toBe(400);
      expect(over.body.code).toBe('VALIDATION_ERROR');
      expect(over.body.fields.map((f: { field: string }) => f.field)).toContain('sets');
      const perEntry = await put(id, { sets: 1, totalReps: 201 });
      expect(perEntry.status).toBe(400);
      expect(perEntry.body.fields.map((f: { field: string }) => f.field)).toContain('totalReps');
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-18b-2: rangeMax 50: cumulative 50 → 200, 51 → 400 naming totalReps', async () => {
      await resetEntries();
      await mk(aliceId, exId('Capped Squat'), TODAY, { sets: 3, totalReps: 30 });
      const id = await mk(aliceId, exId('Capped Squat'), TODAY, { sets: 1, totalReps: 10 });
      expect((await put(id, { sets: 1, totalReps: 20 })).status).toBe(200);
      const before = await dbSnapshot();
      const res = await put(id, { sets: 1, totalReps: 21 });
      expect(res.status).toBe(400);
      expect(res.body.fields.map((f: { field: string }) => f.field)).toContain('totalReps');
      expect(await dbSnapshot()).toEqual(before);
    });

    it("TEST-18b-3: the entry's own old value is replaced, not added to the sum", async () => {
      await resetEntries();
      const id = await mk(aliceId, exId('Capped Squat'), TODAY, { sets: 2, totalReps: 50 });
      expect((await put(id, { sets: 2, totalReps: 50 })).status).toBe(200);
      const res = await put(id, { sets: 3, totalReps: 49 });
      expect(res.status).toBe(200);
      expect(res.body.cumulative).toMatchObject({ sets: 3, totalReps: 49 });
    });

    it('TEST-18b-4: userId, logDate, userExerciseId, kind, id, createdAt in the body → 400 naming the field; stored row unchanged', async () => {
      await resetEntries();
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      const before = await dbSnapshot();
      const forbidden: Record<string, unknown> = {
        userId: bobId,
        logDate: YESTERDAY,
        userExerciseId: exId('Plank'),
        kind: 'QUICK_COMPLETE',
        id: NO_SUCH_ID,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      for (const [field, value] of Object.entries(forbidden)) {
        const res = await put(id, { sets: 2, totalReps: 20, [field]: value });
        expect(res.status, field).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.fields.map((f: { field: string }) => f.field), field).toContain(field);
      }
      const sameDate = await put(id, { sets: 2, totalReps: 20, logDate: TODAY });
      expect(sameDate.status).toBe(400);
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-18b-5: another mode, unknown field, invalid or missing values, empty body → 400 each, DB unchanged', async () => {
      await resetEntries();
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 1, totalReps: 10 });
      const before = await dbSnapshot();
      const bodies: Record<string, unknown>[] = [
        { sets: 2, totalReps: 20, durationSec: 30 },
        { sets: 2, totalReps: 20, colour: 'red' },
        { sets: 0, totalReps: 10 },
        { sets: -1, totalReps: 10 },
        { sets: '2', totalReps: 20 },
        { sets: 2 },
        {},
      ];
      for (const body of bodies) {
        const res = await put(id, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-18b-6: editing a Quick Complete entry keeps kind QUICK_COMPLETE', async () => {
      await resetEntries();
      const id = await mk(aliceId, exId('Barbell Squat'), TODAY, { sets: 4, totalReps: 40 }, 'QUICK_COMPLETE');
      const res = await put(id, { sets: 3, totalReps: 30 });
      expect(res.status).toBe(200);
      expect(res.body.entry).toMatchObject({ kind: 'QUICK_COMPLETE', sets: 3, totalReps: 30 });
    });
  });
});
