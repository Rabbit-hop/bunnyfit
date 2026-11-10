import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-04 STS §8 (docs/sprints/sprint-1/F-04-daily-logging.md): manual entry, logDate
// and day listing against a real PostgreSQL test database. Clock fixed at Thu 5 Nov
// 2026 10:00 Asia/Bangkok, the date the STS fixtures use.
// IDs written in slice 2: TEST-04a-1..4, TEST-10a-1, TEST-10b-1/3/4, TEST-11-API,
// TEST-11-neg, TEST-14a-4, one extra GET /api/entries/:id case (§3.3 ownership row)
// and TEST-24a-1 (in persistence.test.ts). Slice 3 adds the Quick Complete cases that
// live in this file: TEST-04b-1..3, TEST-10a-2, TEST-10b-2 (TEST-13* are in
// quick_complete.test.ts, TEST-24a-2 in persistence.test.ts). The deferred ACs
// (04c/04d/10c) are Sprint 2.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-04 / AC-10 / TEST-04 / TEST-10).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-05T03:00:00.000Z'); // 10:00 Asia/Bangkok, Thu 5 Nov 2026
const TODAY = '2026-11-05';
const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';

describeWithDatabase('F-04 daily logging: manual entry and day listing (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  let clock: MutableClock;
  let aliceId: string;
  let bobId: string;
  let bobExerciseId = '';
  let bobWalkId = '';
  let unplannedId = '';
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

  /**
   * POST /api/entries, then advance the fixed Clock by 1 s: consecutive entries
   * need distinct `createdAt` for the creation-order assertion of TEST-04a-3
   * (a pinned Clock would tie every row to NOW and make the order unobservable).
   */
  const postEntry = async (body: Record<string, unknown>, auth: Record<string, string>) => {
    const res = await request(app).post('/api/entries').set(auth).send(body);
    clock.set(new Date(clock.now().getTime() + 1000));
    return res;
  };

  const dayListing = async (auth: Record<string, string>) =>
    request(app).get(`/api/entries?date=${TODAY}`).set(auth);

  /** The suite's ledger rows — the "DB unchanged" snapshots of AC-10b / AC-11. */
  const dbSnapshot = () =>
    prisma.ledgerEntry.findMany({ where: { userId: { in: [aliceId, bobId] } }, orderBy: { id: 'asc' } });

  /** TEST-04a-1→3 is a chain (STS: "After 04a-1/04a-2"), so tests call this explicitly, not beforeEach. */
  const resetEntries = async () => {
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [aliceId, bobId] } } });
  };

  const cleanupRows = async () => {
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [aliceId, bobId] } } });
    await prisma.planItem.deleteMany({ where: { id: { in: createdPlanItems } } });
    await prisma.userExercise.deleteMany({ where: { id: { in: createdExercises } } });
    createdPlanItems.length = 0;
    createdExercises.length = 0;
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

    // Alice's plan through the F-03 API (F-04 §8 fixture): Squat 4x10 @ 40 kg, Plank
    // 120 s and Outdoor Run 5 km every day, custom "Walk" 1800 s on Mon/Wed/Fri, and
    // custom "Capped Squat" 5x10 for the rangeMax-50 boundary of TEST-11-API.
    await plan({
      source: 'TEMPLATE',
      templateId: templateIds['Barbell Squat'],
      priorityWeight: 3,
      targetSets: 4,
      targetRepsPerSet: 10,
      loadKg: 40,
    });
    await plan({ source: 'TEMPLATE', templateId: templateIds['Plank'], priorityWeight: 2, targetDurationSec: 120 });
    await plan({
      source: 'TEMPLATE',
      templateId: templateIds['Outdoor Run'],
      priorityWeight: 2,
      targetDistanceKm: 5,
    });
    await plan({
      source: 'CUSTOM',
      exercise: { name: 'Walk', targetBodyPart: 'Legs', trackingMode: 'CARDIO_TIME' },
      priorityWeight: 1,
      targetDurationSec: 1800,
      repeatDays: [1, 3, 5],
    });
    await plan({
      source: 'CUSTOM',
      exercise: { name: 'Capped Squat', targetBodyPart: 'Legs', trackingMode: 'WEIGHT' },
      priorityWeight: 2,
      targetSets: 5,
      targetRepsPerSet: 10,
      loadKg: 40,
    });

    // F-03 derives a custom snapshot's Valid Range from its unit and rejects an
    // explicit rangeMax (TEST-16a-2), so TEST-11-API's "rangeMax 50" is applied here.
    await prisma.userExercise.update({ where: { id: exerciseId('Capped Squat') }, data: { rangeMax: 50 } });

    // Bob's own exercise for TEST-14a-4 (direct insert; Bob has no plan in slice 2).
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
    bobExerciseId = bobExercise.id;
    createdExercises.push(bobExercise.id);

    // TEST-04b-2 Rest-Day fixture: Bob's whole plan is one custom item on Mon/Wed/Fri,
    // so Tue 2026-11-10 is a Rest Day for him. Created through the F-03 API at NOW.
    const bobAuth = bearer(await login('bob@exercise.test'));
    const bobPlan = await request(app)
      .post('/api/plan-items')
      .set(bobAuth)
      .send({
        source: 'CUSTOM',
        exercise: { name: 'Bob Walk', targetBodyPart: 'Legs', trackingMode: 'CARDIO_TIME' },
        priorityWeight: 1,
        targetDurationSec: 1800,
        repeatDays: [1, 3, 5],
      });
    if (bobPlan.status !== 201) {
      throw new Error(`fixture Bob plan item failed: ${bobPlan.status} ${JSON.stringify(bobPlan.body)}`);
    }
    createdPlanItems.push(bobPlan.body.planItem.id as string);
    createdExercises.push(bobPlan.body.userExercise.id as string);
    bobWalkId = bobPlan.body.userExercise.id as string;

    // TEST-04b-3 fixture: an exercise Alice owns that has no plan item at all (direct insert).
    const unplanned = await prisma.userExercise.create({
      data: {
        userId: aliceId,
        isCustom: true,
        name: 'Unplanned Stretch',
        targetBodyPart: 'Legs',
        unit: 'seconds',
        trackingMode: 'CARDIO_TIME',
        metValue: 3.5,
        rangeMin: 1,
        rangeMax: 10800,
      },
    });
    unplannedId = unplanned.id;
    createdExercises.push(unplanned.id);
  });

  afterAll(async () => {
    await cleanupRows();
    await prisma.$disconnect();
  });

  describe('AC-04a two manual entries accumulate (TEST-04a)', () => {
    it('TEST-04a-1: two Squat entries → 201 each, kind MANUAL, logDate today, second cumulative 3 sets / 28 reps, two rows owned by Alice', async () => {
      await resetEntries();
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');

      const first = await postEntry({ userExerciseId: squat, sets: 2, totalReps: 20 }, auth);
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      expect(first.body.entry).toMatchObject({
        userExerciseId: squat,
        logDate: TODAY,
        sets: 2,
        totalReps: 20,
        durationSec: null,
        distanceKm: null,
        kind: 'MANUAL',
      });
      expect(first.body.cumulative).toEqual({
        userExerciseId: squat,
        sets: 2,
        totalReps: 20,
        durationSec: 0,
        distanceKm: 0,
      });

      const second = await postEntry({ userExerciseId: squat, sets: 1, totalReps: 8 }, auth);
      expect(second.status, JSON.stringify(second.body)).toBe(201);
      expect(second.body.cumulative).toMatchObject({ userExerciseId: squat, sets: 3, totalReps: 28 });
      expect(second.body.entry.id).not.toBe(first.body.entry.id);
      expect(JSON.stringify(second.body)).not.toContain('userId');

      const rows = await prisma.ledgerEntry.findMany({
        where: { id: { in: [first.body.entry.id, second.body.entry.id] } },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.userId === aliceId)).toBe(true);
      expect(rows.map((r) => r.logDate.toISOString().slice(0, 10))).toEqual([TODAY, TODAY]);
    });

    it('TEST-04a-2: Plank 60 s + 30 s and Outdoor Run 2.5 + 1.25 km → 201 each; cumulative 90 s and 3.75 km', async () => {
      const auth = await aliceAuth();
      const plank = exerciseId('Plank');
      const run = exerciseId('Outdoor Run');

      const p1 = await postEntry({ userExerciseId: plank, durationSec: 60 }, auth);
      const p2 = await postEntry({ userExerciseId: plank, durationSec: 30 }, auth);
      const r1 = await postEntry({ userExerciseId: run, distanceKm: 2.5 }, auth);
      const r2 = await postEntry({ userExerciseId: run, distanceKm: 1.25 }, auth);
      expect([p1.status, p2.status, r1.status, r2.status]).toEqual([201, 201, 201, 201]);
      expect(p2.body.cumulative).toMatchObject({ userExerciseId: plank, durationSec: 90, sets: 0, totalReps: 0 });
      expect(r2.body.cumulative).toMatchObject({
        userExerciseId: run,
        distanceKm: 3.75,
        sets: 0,
        totalReps: 0,
        durationSec: 0,
      });
    });

    it('TEST-04a-3: GET /api/entries?date=2026-11-05 → 200 with every entry in creation order, per-exercise cumulative and no userId', async () => {
      const res = await dayListing(await aliceAuth());
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.date).toBe(TODAY);

      const squat = exerciseId('Barbell Squat');
      const plank = exerciseId('Plank');
      const run = exerciseId('Outdoor Run');
      // creation order: TEST-04a-1 (two Squat rows) then TEST-04a-2 (Plank, then Run)
      expect(
        res.body.entries.map((e: Record<string, unknown>) => [
          e.userExerciseId,
          e.sets,
          e.totalReps,
          e.durationSec,
          e.distanceKm,
        ]),
      ).toEqual([
        [squat, 2, 20, null, null],
        [squat, 1, 8, null, null],
        [plank, null, null, 60, null],
        [plank, null, null, 30, null],
        [run, null, null, null, 2.5],
        [run, null, null, null, 1.25],
      ]);
      expect(res.body.cumulative).toEqual([
        { userExerciseId: squat, sets: 3, totalReps: 28, durationSec: 0, distanceKm: 0 },
        { userExerciseId: plank, sets: 0, totalReps: 0, durationSec: 90, distanceKm: 0 },
        { userExerciseId: run, sets: 0, totalReps: 0, durationSec: 0, distanceKm: 3.75 },
      ]);
      expect(JSON.stringify(res.body)).not.toContain('userId');
    });

    it('TEST-04a-4: a field of another mode, the unknown field userId and missing required fields → 400 naming the field; DB unchanged', async () => {
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');
      const before = await dbSnapshot();

      const wrongMode = await postEntry({ userExerciseId: squat, durationSec: 60 }, auth);
      expect(wrongMode.status, JSON.stringify(wrongMode.body)).toBe(400);
      expect(wrongMode.body.code).toBe('VALIDATION_ERROR');
      expect(wrongMode.body.fields.map((f: { field: string }) => f.field)).toContain('durationSec');

      const unknownField = await postEntry({ userExerciseId: squat, sets: 1, totalReps: 10, userId: bobId }, auth);
      expect(unknownField.status, JSON.stringify(unknownField.body)).toBe(400);
      expect(unknownField.body.fields.map((f: { field: string }) => f.field)).toContain('userId');

      const missingValue = await postEntry({ userExerciseId: squat }, auth);
      expect(missingValue.status, JSON.stringify(missingValue.body)).toBe(400);
      expect(missingValue.body.fields.map((f: { field: string }) => f.field)).toContain('sets');

      const missingId = await postEntry({ sets: 1, totalReps: 10 }, auth);
      expect(missingId.status, JSON.stringify(missingId.body)).toBe(400);
      expect(missingId.body.fields.map((f: { field: string }) => f.field)).toContain('userExerciseId');

      expect(await dbSnapshot()).toEqual(before);
    });
  });

  describe('AC-10a / AC-10b logDate (TEST-10a, TEST-10b)', () => {
    it('TEST-10a-1: logDate equal to today and omitted → 201 each; the stored logDate is today', async () => {
      clock.set(NOW);
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');

      const withDate = await postEntry({ userExerciseId: squat, sets: 1, totalReps: 5, logDate: TODAY }, auth);
      const withoutDate = await postEntry({ userExerciseId: squat, sets: 1, totalReps: 5 }, auth);
      expect([withDate.status, withoutDate.status]).toEqual([201, 201]);
      expect(withDate.body.entry.logDate).toBe(TODAY);
      expect(withoutDate.body.entry.logDate).toBe(TODAY);

      const rows = await prisma.ledgerEntry.findMany({
        where: { id: { in: [withDate.body.entry.id, withoutDate.body.entry.id] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.logDate.toISOString().slice(0, 10))).toEqual([TODAY, TODAY]);
    });

    it('TEST-10b-1: logDate yesterday, tomorrow and 2025-01-01 → 400 LOG_DATE_MISMATCH each; DB unchanged', async () => {
      clock.set(NOW);
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');
      const before = await dbSnapshot();

      for (const logDate of ['2026-11-04', '2026-11-06', '2025-01-01']) {
        const res = await postEntry({ userExerciseId: squat, sets: 1, totalReps: 5, logDate }, auth);
        expect(res.status, `${logDate}: ${JSON.stringify(res.body)}`).toBe(400);
        expect(res.body.code).toBe('LOG_DATE_MISMATCH');
      }
      expect(await dbSnapshot()).toEqual(before);
    });

    it('TEST-10b-3: 23:59:59 Bangkok accepts logDate today, 00:00:00 rejects it (midnight boundary)', async () => {
      const squat = exerciseId('Barbell Squat');
      try {
        // 2026-11-05 23:59:59 Asia/Bangkok. Log in after moving the clock: the token
        // lives 3600 s, so one issued at NOW would already be expired here.
        clock.set(new Date('2026-11-05T16:59:59.000Z'));
        const auth = await aliceAuth();
        const late = await postEntry({ userExerciseId: squat, sets: 1, totalReps: 5, logDate: TODAY }, auth);
        expect(late.status, JSON.stringify(late.body)).toBe(201);
        expect(late.body.entry.logDate).toBe(TODAY);

        // 2026-11-06 00:00:00 Asia/Bangkok — the same logDate is no longer today.
        clock.set(new Date('2026-11-05T17:00:00.000Z'));
        const after = await postEntry({ userExerciseId: squat, sets: 1, totalReps: 5, logDate: TODAY }, auth);
        expect(after.status, JSON.stringify(after.body)).toBe(400);
        expect(after.body.code).toBe('LOG_DATE_MISMATCH');
      } finally {
        clock.set(NOW);
      }
    });

    it('TEST-10b-4: malformed logDate "2026-13-40", "today" and 20261105 → 400 VALIDATION_ERROR each; DB unchanged', async () => {
      clock.set(NOW);
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');
      const before = await dbSnapshot();

      for (const logDate of ['2026-13-40', 'today', 20261105]) {
        const res = await postEntry({ userExerciseId: squat, sets: 1, totalReps: 5, logDate }, auth);
        expect(res.status, `${String(logDate)}: ${JSON.stringify(res.body)}`).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.fields.map((f: { field: string }) => f.field)).toContain('logDate');
      }
      expect(await dbSnapshot()).toEqual(before);
    });
  });

  describe('AC-11 API boundaries (TEST-11-API, TEST-11-neg)', () => {
    it('TEST-11-API: Capped Squat rangeMax 50 → entries up to cumulative 50 reps accepted, one rep more → 400 naming totalReps and the limit; DB unchanged', async () => {
      await resetEntries();
      clock.set(NOW);
      const auth = await aliceAuth();
      const capped = exerciseId('Capped Squat');
      const snapshot = await prisma.userExercise.findUniqueOrThrow({ where: { id: capped } });
      expect(snapshot.rangeMax.toNumber()).toBe(50); // fixture sanity: the STS precondition

      const first = await postEntry({ userExerciseId: capped, sets: 2, totalReps: 20 }, auth);
      const second = await postEntry({ userExerciseId: capped, sets: 3, totalReps: 30 }, auth);
      expect([first.status, second.status]).toEqual([201, 201]);
      expect(second.body.cumulative).toMatchObject({ userExerciseId: capped, sets: 5, totalReps: 50 });

      const afterTwo = await dbSnapshot();
      const over = await postEntry({ userExerciseId: capped, sets: 1, totalReps: 1 }, auth);
      expect(over.status, JSON.stringify(over.body)).toBe(400);
      expect(over.body.code).toBe('VALIDATION_ERROR');
      const field = over.body.fields.find((f: { field: string }) => f.field === 'totalReps');
      expect(field, JSON.stringify(over.body.fields)).toBeDefined();
      expect(String(field.limit)).toContain('50');
      expect(await dbSnapshot()).toEqual(afterTwo); // nothing stored for the rejected request
    });

    it('TEST-11-neg: negative sets/durationSec/distanceKm, totalReps 0 and non-numeric strings → 400 naming the field each; DB unchanged', async () => {
      clock.set(NOW);
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');
      const plank = exerciseId('Plank');
      const run = exerciseId('Outdoor Run');
      const before = await dbSnapshot();

      const cases: Array<[Record<string, unknown>, string]> = [
        [{ userExerciseId: squat, sets: -1, totalReps: 10 }, 'sets'],
        [{ userExerciseId: plank, durationSec: -5 }, 'durationSec'],
        [{ userExerciseId: run, distanceKm: -1 }, 'distanceKm'],
        [{ userExerciseId: squat, sets: 1, totalReps: 0 }, 'totalReps'],
        [{ userExerciseId: squat, sets: 'three', totalReps: 10 }, 'sets'],
        [{ userExerciseId: plank, durationSec: 'one hour' }, 'durationSec'],
      ];
      for (const [body, field] of cases) {
        const res = await postEntry(body, auth);
        expect(res.status, `${JSON.stringify(body)} → ${JSON.stringify(res.body)}`).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.fields.map((f: { field: string }) => f.field)).toContain(field);
      }
      expect(await dbSnapshot()).toEqual(before);
    });
  });

  describe('AC-14a day sums are per owner (TEST-14a-4)', () => {
    it('TEST-14a-4: Bob has Squat entries on the same day → Alice\'s listing shows only her entries and her cumulative', async () => {
      await resetEntries();
      clock.set(NOW);
      const auth = await aliceAuth();
      const squat = exerciseId('Barbell Squat');

      const mine = await postEntry({ userExerciseId: squat, sets: 2, totalReps: 20 }, auth);
      expect(mine.status, JSON.stringify(mine.body)).toBe(201);
      const bobRow = await prisma.ledgerEntry.create({
        data: {
          userId: bobId,
          userExerciseId: bobExerciseId,
          logDate: new Date(`${TODAY}T00:00:00.000Z`),
          sets: 1,
          totalReps: 10,
          kind: 'MANUAL',
        },
      });

      const res = await dayListing(auth);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].id).toBe(mine.body.entry.id);
      expect(res.body.cumulative).toEqual([
        { userExerciseId: squat, sets: 2, totalReps: 20, durationSec: 0, distanceKm: 0 },
      ]);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(bobRow.id);
      expect(body).not.toContain(bobExerciseId);
      expect(body).not.toContain('userId');
    });
  });

  describe('AC-04b Quick Complete availability (TEST-04b)', () => {
    // 2026-11-10 10:00 Asia/Bangkok = a Tuesday (ISO weekday 2): "Walk" and "Bob Walk" are Mon/Wed/Fri only.
    const TUESDAY = new Date('2026-11-10T03:00:00.000Z');
    const quickComplete = (body: Record<string, unknown>, auth: Record<string, string>) =>
      request(app).post('/api/entries/quick-complete').set(auth).send(body);

    it('TEST-04b-1: Tue 2026-11-10, Walk planned Mon/Wed/Fri while Alice\'s other items run daily → 400 QUICK_COMPLETE_NOT_AVAILABLE; DB unchanged', async () => {
      await resetEntries();
      try {
        clock.set(TUESDAY);
        const auth = await aliceAuth(); // log in after moving the clock: tokens live 3600 s
        const plan = await request(app).get('/api/plan?date=2026-11-10').set(auth);
        expect(plan.body.isRestDay, 'fixture: Tuesday must not be a Rest Day for Alice').toBe(false);
        const before = await dbSnapshot();

        const res = await quickComplete({ userExerciseId: exerciseId('Walk') }, auth);
        expect(res.status, JSON.stringify(res.body)).toBe(400);
        expect(res.body).toEqual({ code: 'QUICK_COMPLETE_NOT_AVAILABLE', message: expect.any(String), fields: [] });
        expect(await dbSnapshot()).toEqual(before);
      } finally {
        clock.set(NOW);
      }
    });

    it('TEST-04b-2: Rest Day (Tue 2026-11-10, Bob\'s plan is Mon/Wed/Fri only) → 400 QUICK_COMPLETE_NOT_AVAILABLE; DB unchanged', async () => {
      await resetEntries();
      try {
        clock.set(TUESDAY);
        const bobAuth = bearer(await login('bob@exercise.test'));
        const plan = await request(app).get('/api/plan?date=2026-11-10').set(bobAuth);
        expect(plan.body.isRestDay, 'fixture: Tuesday must be a Rest Day for Bob').toBe(true);
        const before = await dbSnapshot();

        const res = await quickComplete({ userExerciseId: bobWalkId }, bobAuth);
        expect(res.status, JSON.stringify(res.body)).toBe(400);
        expect(res.body).toEqual({ code: 'QUICK_COMPLETE_NOT_AVAILABLE', message: expect.any(String), fields: [] });
        expect(await dbSnapshot()).toEqual(before);
      } finally {
        clock.set(NOW);
      }
    });

    it('TEST-04b-3: Alice owns an exercise with no plan item → 400 QUICK_COMPLETE_NOT_AVAILABLE; DB unchanged', async () => {
      await resetEntries();
      clock.set(NOW);
      const auth = await aliceAuth();
      const before = await dbSnapshot();

      const res = await quickComplete({ userExerciseId: unplannedId }, auth);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body).toEqual({ code: 'QUICK_COMPLETE_NOT_AVAILABLE', message: expect.any(String), fields: [] });
      expect(await dbSnapshot()).toEqual(before);
    });
  });

  describe('AC-10 logDate on Quick Complete (TEST-10a-2, TEST-10b-2)', () => {
    it('TEST-10a-2: Quick Complete without logDate → 201; the stored logDate is today', async () => {
      await resetEntries();
      clock.set(NOW);
      const auth = await aliceAuth();
      const res = await request(app)
        .post('/api/entries/quick-complete')
        .set(auth)
        .send({ userExerciseId: exerciseId('Barbell Squat') });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.entry).toMatchObject({ logDate: TODAY, kind: 'QUICK_COMPLETE' });
      const row = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: res.body.entry.id as string } });
      expect(row.logDate.toISOString().slice(0, 10)).toBe(TODAY);
    });

    it('TEST-10b-2: Quick Complete with logDate yesterday → 400 LOG_DATE_MISMATCH, checked before availability (also for Walk, which is not planned on Thu); DB unchanged', async () => {
      await resetEntries();
      clock.set(NOW);
      const auth = await aliceAuth();
      const before = await dbSnapshot();

      // Squat is available today, so the mismatch alone must reject it.
      const available = await request(app)
        .post('/api/entries/quick-complete')
        .set(auth)
        .send({ userExerciseId: exerciseId('Barbell Squat'), logDate: '2026-11-04' });
      expect(available.status, JSON.stringify(available.body)).toBe(400);
      expect(available.body.code).toBe('LOG_DATE_MISMATCH');

      // Walk is Mon/Wed/Fri and 2026-11-05 is a Thursday: it is NOT available, yet the
      // date check comes first, so the code stays LOG_DATE_MISMATCH (not QUICK_COMPLETE_NOT_AVAILABLE).
      const unavailable = await request(app)
        .post('/api/entries/quick-complete')
        .set(auth)
        .send({ userExerciseId: exerciseId('Walk'), logDate: '2026-11-04' });
      expect(unavailable.status, JSON.stringify(unavailable.body)).toBe(400);
      expect(unavailable.body.code).toBe('LOG_DATE_MISMATCH');

      expect(await dbSnapshot()).toEqual(before);
    });
  });

  it('extra (not an STS row): GET /api/entries/:id → 200 for the owner, 403 for another Participant, 404 for an unknown id, 400 for a malformed id (§3.3 / §4.1)', async () => {
    await resetEntries();
    clock.set(NOW);
    const auth = await aliceAuth();
    const squat = exerciseId('Barbell Squat');

    const mine = await postEntry({ userExerciseId: squat, sets: 1, totalReps: 5 }, auth);
    expect(mine.status, JSON.stringify(mine.body)).toBe(201);
    const bobRow = await prisma.ledgerEntry.create({
      data: {
        userId: bobId,
        userExerciseId: bobExerciseId,
        logDate: new Date(`${TODAY}T00:00:00.000Z`),
        sets: 1,
        totalReps: 10,
        kind: 'MANUAL',
      },
    });

    const own = await request(app).get(`/api/entries/${mine.body.entry.id as string}`).set(auth);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect(own.body).toMatchObject({
      id: mine.body.entry.id,
      userExerciseId: squat,
      logDate: TODAY,
      sets: 1,
      totalReps: 5,
      kind: 'MANUAL',
    });
    expect(JSON.stringify(own.body)).not.toContain('userId');

    const foreign = await request(app).get(`/api/entries/${bobRow.id}`).set(auth);
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403);
    expect(foreign.body).toEqual({ code: 'FORBIDDEN', message: expect.any(String), fields: [] });

    const missing = await request(app).get(`/api/entries/${NO_SUCH_ID}`).set(auth);
    expect(missing.status, JSON.stringify(missing.body)).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');

    const malformed = await request(app).get('/api/entries/not-a-uuid').set(auth);
    expect(malformed.status, JSON.stringify(malformed.body)).toBe(400);
    expect(malformed.body.code).toBe('VALIDATION_ERROR');
  });
});
