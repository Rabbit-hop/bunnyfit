import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-04 STS §8 (docs/sprints/sprint-1/F-04-daily-logging.md): Quick Complete against a
// real PostgreSQL test database. Clock fixed at Thu 5 Nov 2026 10:00 Asia/Bangkok.
// IDs: TEST-13a-1..7, TEST-13b-1..4, TEST-13c-1, plus one extra case (not an STS row)
// for the request-level rules of §3.2 R2/R3 that Quick Complete shares with manual entry.
// TEST-04b, TEST-10a-2 and TEST-10b-2 are in daily_logging.test.ts, TEST-24a-2 in
// persistence.test.ts.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-13 / TEST-13).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-05T03:00:00.000Z'); // 10:00 Asia/Bangkok, Thu 5 Nov 2026
const TODAY = '2026-11-05';
const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';

describeWithDatabase('F-04 Quick Complete (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  let clock: MutableClock;
  let aliceId: string;
  let bobId: string;
  const templateIds: Record<string, string> = {};
  const exerciseIds = new Map<string, string>();
  const createdPlanItems: string[] = [];
  const createdExercises: string[] = [];

  const login = async (email: string): Promise<string> =>
    (await request(app).post('/api/auth/login').send({ email, password: env.seedParticipantPassword })).body
      .token as string;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const aliceAuth = async () => bearer(await login('alice@exercise.test'));
  const exerciseId = (name: string): string => {
    const id = exerciseIds.get(name);
    if (!id) throw new Error(`fixture: no exercise snapshot named ${name}`);
    return id;
  };

  const quickComplete = (body: Record<string, unknown>, auth: Record<string, string>) =>
    request(app).post('/api/entries/quick-complete').set(auth).send(body);
  const manual = async (body: Record<string, unknown>, auth: Record<string, string>) => {
    const res = await request(app).post('/api/entries').set(auth).send(body);
    expect(res.status, `fixture manual entry: ${JSON.stringify(res.body)}`).toBe(201);
    return res;
  };

  /** Ledger rows of the exercises this suite created — the "DB unchanged" snapshot. */
  const dbSnapshot = () =>
    prisma.ledgerEntry.findMany({ where: { userExerciseId: { in: createdExercises } }, orderBy: { id: 'asc' } });
  const rowsOf = (name: string) => prisma.ledgerEntry.findMany({ where: { userExerciseId: exerciseId(name) } });
  const resetEntries = async () => {
    await prisma.ledgerEntry.deleteMany({ where: { userExerciseId: { in: createdExercises } } });
  };

  beforeAll(async () => {
    prisma = newPrisma();
    clock = new MutableClock(NOW);
    app = buildIntegrationApp(prisma, clock);
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })).id;
    bobId = (await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })).id;
    for (const t of await prisma.exerciseTemplate.findMany()) templateIds[t.name] = t.id;

    const auth = await aliceAuth();
    const plan = async (body: Record<string, unknown>): Promise<void> => {
      const res = await request(app).post('/api/plan-items').set(auth).send(body);
      if (res.status !== 201) {
        throw new Error(`fixture plan item failed: ${res.status} ${JSON.stringify(res.body)}`);
      }
      createdPlanItems.push(res.body.planItem.id as string);
      createdExercises.push(res.body.userExercise.id as string);
      exerciseIds.set(res.body.userExercise.name as string, res.body.userExercise.id as string);
    };

    // One exercise per tracking mode, planned every day (the default), through the F-03 API:
    // WEIGHT Squat 4x10 = 40 reps, BODYWEIGHT_REPS Push-up 3x10 = 30 reps, BODYWEIGHT_TIME
    // Plank 120 s, YOGA Sun Salutation 600 s, CARDIO_TIME Jump Rope 1800 s, CARDIO_DISTANCE
    // Outdoor Run 5 km (TEST-13a-1).
    await plan({
      source: 'TEMPLATE',
      templateId: templateIds['Barbell Squat'],
      priorityWeight: 3,
      targetSets: 4,
      targetRepsPerSet: 10,
      loadKg: 40,
    });
    await plan({
      source: 'TEMPLATE',
      templateId: templateIds['Push-up'],
      priorityWeight: 2,
      targetSets: 3,
      targetRepsPerSet: 10,
    });
    await plan({ source: 'TEMPLATE', templateId: templateIds['Plank'], priorityWeight: 2, targetDurationSec: 120 });
    await plan({
      source: 'TEMPLATE',
      templateId: templateIds['Sun Salutation'],
      priorityWeight: 1,
      targetDurationSec: 600,
    });
    await plan({ source: 'TEMPLATE', templateId: templateIds['Jump Rope'], priorityWeight: 1, targetDurationSec: 1800 });
    await plan({
      source: 'TEMPLATE',
      templateId: templateIds['Outdoor Run'],
      priorityWeight: 2,
      targetDistanceKm: 5,
    });
    // Boundary targets: 4 x 200 = 800 reps (TEST-13a-3) and 20 x 200 = 4000 reps (TEST-13a-7).
    await plan({
      source: 'CUSTOM',
      exercise: { name: 'QC Squat 800', targetBodyPart: 'Legs', trackingMode: 'WEIGHT' },
      priorityWeight: 2,
      targetSets: 4,
      targetRepsPerSet: 200,
      loadKg: 40,
    });
    await plan({
      source: 'CUSTOM',
      exercise: { name: 'QC Squat 4000', targetBodyPart: 'Legs', trackingMode: 'WEIGHT' },
      priorityWeight: 2,
      targetSets: 20,
      targetRepsPerSet: 200,
      loadKg: 40,
    });
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { userExerciseId: { in: createdExercises } } });
    await prisma.planItem.deleteMany({ where: { id: { in: createdPlanItems } } });
    await prisma.userExercise.deleteMany({ where: { id: { in: createdExercises } } });
    await prisma.$disconnect();
  });

  describe('AC-13a Quick Complete fills the difference (TEST-13a)', () => {
    it('TEST-13a-1: one exercise per tracking mode, nothing logged → 201 each; cumulative equals the target for every mode', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const cases: Array<[string, Record<string, number>]> = [
        ['Barbell Squat', { sets: 4, totalReps: 40, durationSec: 0, distanceKm: 0 }],
        ['Push-up', { sets: 3, totalReps: 30, durationSec: 0, distanceKm: 0 }],
        ['Plank', { sets: 0, totalReps: 0, durationSec: 120, distanceKm: 0 }],
        ['Sun Salutation', { sets: 0, totalReps: 0, durationSec: 600, distanceKm: 0 }],
        ['Jump Rope', { sets: 0, totalReps: 0, durationSec: 1800, distanceKm: 0 }],
        ['Outdoor Run', { sets: 0, totalReps: 0, durationSec: 0, distanceKm: 5 }],
      ];
      for (const [name, cumulative] of cases) {
        const res = await quickComplete({ userExerciseId: exerciseId(name) }, auth);
        expect(res.status, `${name}: ${JSON.stringify(res.body)}`).toBe(201);
        expect(res.body.entry.kind, name).toBe('QUICK_COMPLETE');
        expect(res.body.cumulative, name).toEqual({ userExerciseId: exerciseId(name), ...cumulative });
      }
    });

    it('TEST-13a-2: Plank 30 s of 120 s and Outdoor Run 1.25 km of 5 km logged → Quick Complete adds 90 s and 3.75 km; cumulative = target', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const plank = exerciseId('Plank');
      const run = exerciseId('Outdoor Run');
      await manual({ userExerciseId: plank, durationSec: 30 }, auth);
      await manual({ userExerciseId: run, distanceKm: 1.25 }, auth);

      const p = await quickComplete({ userExerciseId: plank }, auth);
      expect(p.status, JSON.stringify(p.body)).toBe(201);
      expect(p.body.entry).toMatchObject({ durationSec: 90, sets: null, totalReps: null, distanceKm: null });
      expect(p.body.cumulative).toMatchObject({ userExerciseId: plank, durationSec: 120 });

      const r = await quickComplete({ userExerciseId: run }, auth);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.entry).toMatchObject({ distanceKm: 3.75, durationSec: null, sets: null, totalReps: null });
      expect(r.body.cumulative).toMatchObject({ userExerciseId: run, distanceKm: 5 });
    });

    it('TEST-13a-3: target 4 x 200 = 800 reps with 1 set / 1 rep logged → entry sets 4 (raised from 3, R9), totalReps 799; cumulative 5 sets / 800 reps', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const big = exerciseId('QC Squat 800');
      await manual({ userExerciseId: big, sets: 1, totalReps: 1 }, auth);

      const res = await quickComplete({ userExerciseId: big }, auth);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.entry).toMatchObject({ kind: 'QUICK_COMPLETE', sets: 4, totalReps: 799 });
      expect(res.body.cumulative).toEqual({
        userExerciseId: big,
        sets: 5,
        totalReps: 800,
        durationSec: 0,
        distanceKm: 0,
      });
    });

    it('TEST-13a-4: Squat 4 x 10, nothing logged → 201; entry kind QUICK_COMPLETE, sets 4, totalReps 40; cumulative 4 / 40', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');

      const res = await quickComplete({ userExerciseId: squat }, auth);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.entry).toMatchObject({
        userExerciseId: squat,
        logDate: TODAY,
        kind: 'QUICK_COMPLETE',
        sets: 4,
        totalReps: 40,
        durationSec: null,
        distanceKm: null,
      });
      expect(res.body.cumulative).toEqual({ userExerciseId: squat, sets: 4, totalReps: 40, durationSec: 0, distanceKm: 0 });
      expect(JSON.stringify(res.body)).not.toContain('userId');
      const rows = await rowsOf('Barbell Squat');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.userId).toBe(aliceId);
    });

    it('TEST-13a-5: Squat with 1 set / 15 reps logged → entry sets 3, totalReps 25; cumulative 4 sets / 40 reps (B2)', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');
      await manual({ userExerciseId: squat, sets: 1, totalReps: 15 }, auth);

      const res = await quickComplete({ userExerciseId: squat }, auth);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.entry).toMatchObject({ kind: 'QUICK_COMPLETE', sets: 3, totalReps: 25 });
      expect(res.body.cumulative).toMatchObject({ userExerciseId: squat, sets: 4, totalReps: 40 });
    });

    it('TEST-13a-6: Squat with 4 sets / 38 reps logged → entry sets 1 (max(1, 0), ceil(2/200) = 1), totalReps 2; cumulative reps 40', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');
      await manual({ userExerciseId: squat, sets: 4, totalReps: 38 }, auth);

      const res = await quickComplete({ userExerciseId: squat }, auth);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.entry).toMatchObject({ kind: 'QUICK_COMPLETE', sets: 1, totalReps: 2 });
      expect(res.body.cumulative).toMatchObject({ userExerciseId: squat, sets: 5, totalReps: 40 });
    });

    it('TEST-13a-7: target 20 x 200 = 4000 reps with 1 set / 1 rep logged → 400 VALIDATION_ERROR naming sets (no entry fits R5 and R6, §13 item 1); DB unchanged', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const max = exerciseId('QC Squat 4000');
      await manual({ userExerciseId: max, sets: 1, totalReps: 1 }, auth);
      const before = await dbSnapshot();

      const res = await quickComplete({ userExerciseId: max }, auth);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields.map((f: { field: string }) => f.field)).toContain('sets');
      expect(await dbSnapshot()).toEqual(before);
    });
  });

  describe('AC-13b target already reached is a No-op (TEST-13b)', () => {
    it('TEST-13b-1: Plank target reached (120 s logged) → 200, entry null, no new row, cumulative 120', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const plank = exerciseId('Plank');
      await manual({ userExerciseId: plank, durationSec: 120 }, auth);
      const before = await dbSnapshot();

      const res = await quickComplete({ userExerciseId: plank }, auth);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.entry).toBeNull();
      expect(res.body.cumulative).toEqual({ userExerciseId: plank, sets: 0, totalReps: 0, durationSec: 120, distanceKm: 0 });
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-13b-2: Plank over target (150 s logged manually) → 200, entry null, rows unchanged', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const plank = exerciseId('Plank');
      await manual({ userExerciseId: plank, durationSec: 150 }, auth);
      const before = await dbSnapshot();

      const res = await quickComplete({ userExerciseId: plank }, auth);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.entry).toBeNull();
      expect(res.body.cumulative).toMatchObject({ userExerciseId: plank, durationSec: 150 });
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-13b-3: Squat with 0 logged, two simultaneous Quick Completes → exactly one 201 and one 200 entry null; one row; cumulative = target', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');

      const [a, b] = await Promise.all([
        quickComplete({ userExerciseId: squat }, auth),
        quickComplete({ userExerciseId: squat }, auth),
      ]);
      expect([a.status, b.status].sort(), JSON.stringify([a.body, b.body])).toEqual([200, 201]);
      const noop = a.status === 200 ? a : b;
      const created = a.status === 201 ? a : b;
      expect(noop.body.entry).toBeNull();
      expect(created.body.entry).toMatchObject({ kind: 'QUICK_COMPLETE', sets: 4, totalReps: 40 });
      expect(noop.body.cumulative).toMatchObject({ userExerciseId: squat, sets: 4, totalReps: 40 });
      expect(await rowsOf('Barbell Squat')).toHaveLength(1);
    });

    it('TEST-13b-4: Quick Complete twice in sequence → 201 then 200 entry null', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');

      const first = await quickComplete({ userExerciseId: squat }, auth);
      const second = await quickComplete({ userExerciseId: squat }, auth);
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      expect(second.status, JSON.stringify(second.body)).toBe(200);
      expect(second.body.entry).toBeNull();
      expect(second.body.cumulative).toMatchObject({ userExerciseId: squat, sets: 4, totalReps: 40 });
      expect(await rowsOf('Barbell Squat')).toHaveLength(1);
    });
  });

  describe('AC-13c time-based difference (TEST-13c)', () => {
    it('TEST-13c-1: Jump Rope target 1,800 s with 600 s already logged → 201; entry durationSec 1200; cumulative 1,800', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const rope = exerciseId('Jump Rope');
      await manual({ userExerciseId: rope, durationSec: 600 }, auth);

      const res = await quickComplete({ userExerciseId: rope }, auth);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.entry).toMatchObject({ kind: 'QUICK_COMPLETE', durationSec: 1200 });
      expect(res.body.cumulative).toMatchObject({ userExerciseId: rope, durationSec: 1800 });
    });
  });

  it('extra (not an STS row): request-level rules of §3.2 R2/R3 — foreign exercise → 403, unknown exercise → 404, userId in the body and a malformed logDate → 400; nothing stored', async () => {
    await resetEntries();
    const auth = await aliceAuth();
    const squat = exerciseId('Barbell Squat');
    const bobExercise = await prisma.userExercise.create({
      data: {
        userId: bobId,
        isCustom: false,
        name: 'Barbell Squat',
        targetBodyPart: 'Legs',
        unit: 'reps',
        trackingMode: 'WEIGHT',
        metValue: 3.5,
        rangeMin: 1,
        rangeMax: 4000,
      },
    });
    createdExercises.push(bobExercise.id);
    const before = await dbSnapshot();

    const foreign = await quickComplete({ userExerciseId: bobExercise.id }, auth);
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403);
    expect(foreign.body).toEqual({ code: 'FORBIDDEN', message: expect.any(String), fields: [] });

    const missing = await quickComplete({ userExerciseId: NO_SUCH_ID }, auth);
    expect(missing.status, JSON.stringify(missing.body)).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');

    const unknownField = await quickComplete({ userExerciseId: squat, userId: bobId }, auth);
    expect(unknownField.status, JSON.stringify(unknownField.body)).toBe(400);
    expect(unknownField.body.fields.map((f: { field: string }) => f.field)).toContain('userId');

    const malformedDate = await quickComplete({ userExerciseId: squat, logDate: '2026-13-40' }, auth);
    expect(malformedDate.status, JSON.stringify(malformedDate.body)).toBe(400);
    expect(malformedDate.body.code).toBe('VALIDATION_ERROR');

    const noId = await quickComplete({}, auth);
    expect(noId.status, JSON.stringify(noId.body)).toBe(400);
    expect(noId.body.fields.map((f: { field: string }) => f.field)).toContain('userExerciseId');

    expect(await dbSnapshot()).toEqual(before);
  });
});
