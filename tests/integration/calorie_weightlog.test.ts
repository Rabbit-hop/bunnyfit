import { randomUUID } from 'node:crypto';
import type { PrismaClient, TrackingMode, CardioCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { isoDaysToMask } from '../../server/domain/planValidation.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-11 STS §8 (docs/sprints/sprint-2/F-11-calories.md 0.1.2), API/DB tests TEST-28a-1 to
// TEST-28c-8 (AC-28a-c) against a real PostgreSQL test database. Clock fixed at Thu 12 Nov
// 2026 10:00 Asia/Bangkok. Each test creates its own fresh Participant ("Dana" in the STS;
// the no-weight cases named "Bob" in the STS also use a fresh Participant without a WeightLog
// row, so the seeded Bob's plan cannot change the expected values). WeightLog rows, past plan
// items and past entries are inserted directly with explicit dates (contract §5: the API only
// writes today's rows). Plan items repeat every day from 1 Nov 2026 unless stated.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-28 / TEST-28).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-12T03:00:00.000Z'); // 10:00 Asia/Bangkok, Thu 12 Nov 2026
const TODAY = '2026-11-12';
const PASSWORD = 'calorie-test-password-1';
const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

type Auth = Record<string, string>;
interface Exercise {
  name: string;
  trackingMode: TrackingMode;
  unit: 'reps' | 'seconds' | 'km';
  metValue: number;
  cardioCategory?: CardioCategory;
}

const SQUAT: Exercise = { name: 'Barbell Squat', trackingMode: 'WEIGHT', unit: 'reps', metValue: 3.5 };
const PLANK: Exercise = { name: 'Plank', trackingMode: 'BODYWEIGHT_TIME', unit: 'seconds', metValue: 3.8 };
const RUN: Exercise = { name: 'Outdoor Run', trackingMode: 'CARDIO_DISTANCE', unit: 'km', metValue: 9.8, cardioCategory: 'RUNNING' };
const JUMP_ROPE: Exercise = { name: 'Jump Rope', trackingMode: 'CARDIO_TIME', unit: 'seconds', metValue: 7 };
const YOGA: Exercise = { name: 'Morning Yoga', trackingMode: 'YOGA', unit: 'seconds', metValue: 2.5 };
const WALK: Exercise = { name: 'Easy Walk', trackingMode: 'CARDIO_DISTANCE', unit: 'km', metValue: 4.3, cardioCategory: 'WALKING' };

describeWithDatabase('F-11 calories and WeightLog lookup on GET /api/progress/daily (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  const createdUsers: string[] = [];

  const login = async (email: string, password: string): Promise<Auth> => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
    return { Authorization: `Bearer ${res.body.token as string}` };
  };

  /** A fresh Participant with no WeightLog, plan or entry. */
  const participant = async (label = 'dana'): Promise<{ id: string; auth: Auth }> => {
    const email = `${label}-${randomUUID()}@exercise.test`;
    const user = await prisma.user.create({
      data: { email, passwordHash: bcrypt.hashSync(PASSWORD, 4), role: 'PARTICIPANT', displayName: label },
    });
    createdUsers.push(user.id);
    return { id: user.id, auth: await login(email, PASSWORD) };
  };

  const weight = (userId: string, weightKg: number, effectiveDate: string, createdAt?: Date) =>
    prisma.weightLog.create({ data: { userId, weightKg, effectiveDate: day(effectiveDate), ...(createdAt ? { createdAt } : {}) } });

  const exercise = async (userId: string, spec: Exercise): Promise<string> => {
    const range = { reps: { min: 1, max: 4000 }, seconds: { min: 1, max: 10800 }, km: { min: 0.01, max: 100 } }[spec.unit];
    const row = await prisma.userExercise.create({
      data: {
        userId,
        isCustom: true,
        name: spec.name,
        targetBodyPart: 'Full Body',
        unit: spec.unit,
        trackingMode: spec.trackingMode,
        cardioCategory: spec.cardioCategory ?? null,
        metValue: spec.metValue,
        rangeMin: range.min,
        rangeMax: range.max,
      },
    });
    return row.id;
  };

  /** A plan item from 1 Nov 2026; the target fields follow the exercise's measurement group. */
  const planItem = async (
    userId: string,
    userExerciseId: string,
    spec: Exercise,
    options: { repeatDays?: number[]; priorityWeight?: number; targetSets?: number; targetRepsPerSet?: number } = {},
  ) => {
    const target =
      spec.unit === 'reps'
        ? { targetSets: options.targetSets ?? 4, targetRepsPerSet: options.targetRepsPerSet ?? 10, loadKg: spec.trackingMode === 'WEIGHT' ? 40 : null }
        : spec.unit === 'seconds'
          ? { targetDurationSec: 120 }
          : { targetDistanceKm: 5 };
    return prisma.planItem.create({
      data: {
        userId,
        userExerciseId,
        version: 1,
        priorityWeight: options.priorityWeight ?? 3,
        effectiveFrom: day('2026-11-01'),
        repeatDays: isoDaysToMask(options.repeatDays ?? [1, 2, 3, 4, 5, 6, 7]),
        ...target,
      },
    });
  };

  /** An exercise and its daily plan item. */
  const planned = async (userId: string, spec: Exercise, options: Parameters<typeof planItem>[3] = {}) => {
    const id = await exercise(userId, spec);
    await planItem(userId, id, spec, options);
    return id;
  };

  /** A ledger row on any date (past dates cannot be written through the API, F-04 R3). */
  const logged = (
    userId: string,
    userExerciseId: string,
    logDate: string,
    values: { sets?: number; totalReps?: number; durationSec?: number; distanceKm?: number },
  ) =>
    prisma.ledgerEntry.create({
      data: {
        userId,
        userExerciseId,
        logDate: day(logDate),
        sets: values.sets ?? null,
        totalReps: values.totalReps ?? null,
        durationSec: values.durationSec ?? null,
        distanceKm: values.distanceKm ?? null,
        kind: 'MANUAL',
      },
    });

  const daily = (auth: Auth, date?: string) =>
    request(app).get(`/api/progress/daily${date ? `?date=${date}` : ''}`).set(auth);

  const item = (body: { items: Array<{ userExerciseId: string }> }, userExerciseId: string) =>
    body.items.find((i) => i.userExerciseId === userExerciseId) as Record<string, unknown>;

  beforeAll(async () => {
    prisma = newPrisma();
    app = buildIntegrationApp(prisma, new MutableClock(NOW));
  });

  afterEach(async () => {
    const where = { userId: { in: createdUsers } };
    await prisma.ledgerEntry.deleteMany({ where });
    await prisma.weightLog.deleteMany({ where });
    await prisma.planItem.deleteMany({ where });
    await prisma.userExercise.deleteMany({ where });
    await prisma.revokedToken.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    createdUsers.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('AC-28a: the weight valid on the activity date', () => {
    it('TEST-28a-1: 70 kg from 1 Nov, Squat 2 sets on 5 Nov -> 3 min, 12.25 -> 12.3 kcal', async () => {
      const dana = await participant();
      await weight(dana.id, 70, '2026-11-01');
      const squat = await planned(dana.id, SQUAT);
      await logged(dana.id, squat, '2026-11-05', { sets: 2, totalReps: 20 });

      const res = await daily(dana.auth, '2026-11-05');

      expect(res.status).toBe(200);
      expect(item(res.body, squat)).toMatchObject({ estimatedMinutes: 3, calories: 12.3, calorieError: null });
    });

    it('TEST-28a-2: after a 68 kg row from 10 Nov, 5 Nov still 12.3; 12 Nov uses 68 -> 11.9', async () => {
      const dana = await participant();
      await weight(dana.id, 70, '2026-11-01');
      const squat = await planned(dana.id, SQUAT);
      await logged(dana.id, squat, '2026-11-05', { sets: 2, totalReps: 20 });
      expect(item((await daily(dana.auth, '2026-11-05')).body, squat).calories).toBe(12.3);

      await weight(dana.id, 68, '2026-11-10');
      await logged(dana.id, squat, '2026-11-12', { sets: 2, totalReps: 20 });

      expect(item((await daily(dana.auth, '2026-11-05')).body, squat).calories).toBe(12.3);
      expect(item((await daily(dana.auth, '2026-11-12')).body, squat).calories).toBe(11.9);
    });

    it('TEST-28a-3: mid-month change: 9 Nov uses 70 (12.3), 10 Nov uses the row dated that day (11.9)', async () => {
      const dana = await participant();
      await weight(dana.id, 70, '2026-11-01');
      await weight(dana.id, 68, '2026-11-10');
      const squat = await planned(dana.id, SQUAT);
      await logged(dana.id, squat, '2026-11-09', { sets: 2, totalReps: 20 });
      await logged(dana.id, squat, '2026-11-10', { sets: 2, totalReps: 20 });

      expect(item((await daily(dana.auth, '2026-11-09')).body, squat).calories).toBe(12.3);
      expect(item((await daily(dana.auth, '2026-11-10')).body, squat).calories).toBe(11.9);
    });

    it('TEST-28a-4: two rows on 10 Nov, the newer createdAt (66 kg) wins -> 11.55 -> 11.6; a 13 Nov row is ignored', async () => {
      const dana = await participant();
      await weight(dana.id, 68, '2026-11-10', new Date('2026-11-10T01:00:00.000Z'));
      await weight(dana.id, 66, '2026-11-10', new Date('2026-11-10T05:00:00.000Z'));
      await weight(dana.id, 67, '2026-11-13', new Date('2026-11-10T09:00:00.000Z'));
      const squat = await planned(dana.id, SQUAT);
      await logged(dana.id, squat, '2026-11-12', { sets: 2, totalReps: 20 });

      expect(item((await daily(dana.auth, '2026-11-12')).body, squat).calories).toBe(11.6);
    });

    it('TEST-28a-5: boundary weights, CARDIO_TIME 7.0 METs 1,800 s: 1.0 kg -> 3.5; 800.0 kg -> 2800', async () => {
      for (const [kg, kcal] of [
        [1, 3.5],
        [800, 2800],
      ] as const) {
        const user = await participant(`w${kg}`);
        await weight(user.id, kg, '2026-11-01');
        const rope = await planned(user.id, JUMP_ROPE);
        await logged(user.id, rope, TODAY, { durationSec: 1800 });

        const res = await daily(user.auth, TODAY);
        expect(res.status).toBe(200);
        expect(item(res.body, rope)).toMatchObject({ estimatedMinutes: 30, calories: kcal, calorieError: null });
        expect(res.body.totalCalories).toBe(kcal);
      }
    });
  });

  describe('AC-28b: no weight on or before the date -> 200 with calories null; logging not blocked', () => {
    it('TEST-28b-1: no WeightLog row: POST /api/entries is 201, GET is 200 with calories null and BODY_WEIGHT_REQUIRED', async () => {
      const bob = await participant('bob');
      const squat = await planned(bob.id, SQUAT);

      const post = await request(app).post('/api/entries').set(bob.auth).send({ userExerciseId: squat, sets: 2, totalReps: 20 });
      expect(post.status).toBe(201);

      const res = await daily(bob.auth);
      expect(res.status).toBe(200);
      expect(item(res.body, squat)).toMatchObject({ estimatedMinutes: 3, calories: null, calorieError: 'BODY_WEIGHT_REQUIRED' });
      expect(res.body).toMatchObject({ totalCalories: null, calorieError: 'BODY_WEIGHT_REQUIRED' });
    });

    it('TEST-28b-2: only row is 68 kg from 10 Nov: 5 Nov null + error; 12 Nov 11.9 with calorieError null', async () => {
      const dana = await participant();
      await weight(dana.id, 68, '2026-11-10');
      const squat = await planned(dana.id, SQUAT);
      await logged(dana.id, squat, '2026-11-05', { sets: 2, totalReps: 20 });
      await logged(dana.id, squat, '2026-11-12', { sets: 2, totalReps: 20 });

      expect(item((await daily(dana.auth, '2026-11-05')).body, squat)).toMatchObject({ calories: null, calorieError: 'BODY_WEIGHT_REQUIRED' });
      expect(item((await daily(dana.auth, '2026-11-12')).body, squat)).toMatchObject({ calories: 11.9, calorieError: null });
    });

    it('TEST-28b-3: the no-weight response is not an error envelope and its scores equal the with-weight scores', async () => {
      const bob = await participant('bob');
      const squat = await planned(bob.id, SQUAT);
      await logged(bob.id, squat, TODAY, { sets: 2, totalReps: 20 });
      const withWeight = await participant('dana');
      const squat2 = await planned(withWeight.id, SQUAT);
      await weight(withWeight.id, 70, '2026-11-01');
      await logged(withWeight.id, squat2, TODAY, { sets: 2, totalReps: 20 });

      const res = await daily(bob.auth);
      const ref = await daily(withWeight.auth);

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('message');
      expect(res.body).not.toHaveProperty('fields');
      const scores = (body: Record<string, unknown>) => ({
        totalScore: body['totalScore'],
        totalWeight: body['totalWeight'],
        overallPercent: body['overallPercent'],
        items: (body['items'] as Array<Record<string, unknown>>).map((i) => ({ ratio: i['ratio'], itemScore: i['itemScore'] })),
      });
      expect(scores(res.body)).toEqual(scores(ref.body));
      expect(res.body.overallPercent).toBe(50); // 20 of 40 reps
    });

    it('TEST-28b-4: Rest Day without a weight: items [], overallPercent null, totalCalories null + BODY_WEIGHT_REQUIRED', async () => {
      const bob = await participant('bob');
      await planned(bob.id, SQUAT, { repeatDays: [1, 3, 5] }); // 10 Nov 2026 is a Tuesday

      const res = await daily(bob.auth, '2026-11-10');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        date: '2026-11-10',
        isRestDay: true,
        items: [],
        totalScore: 0,
        totalWeight: 0,
        overallPercent: null,
        otherActivity: [],
        totalCalories: null,
        calorieError: 'BODY_WEIGHT_REQUIRED',
      });
    });

    it('TEST-28b-5: a first weight row for today makes today a number (11.9 at 68 kg); an earlier date stays null', async () => {
      const bob = await participant('bob');
      const squat = await planned(bob.id, SQUAT);
      await logged(bob.id, squat, '2026-11-05', { sets: 2, totalReps: 20 });
      await logged(bob.id, squat, TODAY, { sets: 2, totalReps: 20 });
      expect(item((await daily(bob.auth)).body, squat).calories).toBeNull();

      await weight(bob.id, 68, TODAY);

      expect(item((await daily(bob.auth)).body, squat)).toMatchObject({ calories: 11.9, calorieError: null });
      expect(item((await daily(bob.auth, '2026-11-05')).body, squat)).toMatchObject({ calories: null, calorieError: 'BODY_WEIGHT_REQUIRED' });
    });
  });

  describe('AC-28c: kcal per exercise and the daily total', () => {
    it('TEST-28c-1: Squat 3 sets, Plank 90 s, Run 5 km at 70 kg -> 18.4, 6.7, 343; total 368.025 -> 368.0 (not 368.1)', async () => {
      const dana = await participant();
      await weight(dana.id, 70, '2026-11-01');
      const squat = await planned(dana.id, SQUAT);
      const plank = await planned(dana.id, PLANK, { priorityWeight: 2 });
      const run = await planned(dana.id, RUN, { priorityWeight: 5 });
      await logged(dana.id, squat, '2026-11-05', { sets: 3, totalReps: 30 });
      await logged(dana.id, plank, '2026-11-05', { durationSec: 90 });
      await logged(dana.id, run, '2026-11-05', { distanceKm: 5 });

      const res = await daily(dana.auth, '2026-11-05');

      expect(res.status).toBe(200);
      expect(item(res.body, squat)).toMatchObject({ estimatedMinutes: 4.5, calories: 18.4, calorieError: null });
      expect(item(res.body, plank)).toMatchObject({ estimatedMinutes: 1.5, calories: 6.7, calorieError: null });
      expect(item(res.body, run)).toMatchObject({ estimatedMinutes: 30, calories: 343, calorieError: null });
      expect(res.body.otherActivity).toEqual([]);
      expect(res.body.totalCalories).toBe(368);
      expect(res.body.totalCalories).not.toBe(368.1);
      expect(res.body.calorieError).toBeNull();
    });

    it('TEST-28c-2: no entry -> 0 min, 0 kcal, total 0; after Quick Complete (4 sets / 40 reps) 6 min at 68 kg -> 23.8', async () => {
      const dana = await participant();
      await weight(dana.id, 68, '2026-11-01');
      const squat = await planned(dana.id, SQUAT, { targetSets: 4, targetRepsPerSet: 10 });

      const before = await daily(dana.auth);
      expect(item(before.body, squat)).toMatchObject({ estimatedMinutes: 0, calories: 0, calorieError: null });
      expect(before.body.totalCalories).toBe(0);

      const qc = await request(app).post('/api/entries/quick-complete').set(dana.auth).send({ userExerciseId: squat });
      expect(qc.status).toBe(201);

      const after = await daily(dana.auth);
      expect(item(after.body, squat)).toMatchObject({ estimatedMinutes: 6, calories: 23.8, calorieError: null });
      expect(after.body.totalCalories).toBe(23.8);
    });

    it('TEST-28c-3: the same entries at 70 kg and 40 kg give identical scores; only calories differ', async () => {
      const results = [];
      for (const kg of [70, 40]) {
        const user = await participant(`w${kg}`);
        await weight(user.id, kg, '2026-11-01');
        const squat = await planned(user.id, SQUAT);
        const plank = await planned(user.id, PLANK, { priorityWeight: 2 });
        const run = await planned(user.id, RUN, { priorityWeight: 5 });
        await logged(user.id, squat, '2026-11-05', { sets: 3, totalReps: 30 });
        await logged(user.id, plank, '2026-11-05', { durationSec: 90 });
        await logged(user.id, run, '2026-11-05', { distanceKm: 5 });
        results.push((await daily(user.auth, '2026-11-05')).body);
      }
      const [heavy, light] = results;
      const scores = (body: Record<string, unknown>) => ({
        totalScore: body['totalScore'],
        overallPercent: body['overallPercent'],
        items: (body['items'] as Array<Record<string, unknown>>).map((i) => [i['name'], i['itemScore']]).sort(),
      });
      expect(scores(light)).toEqual(scores(heavy));
      expect(heavy.overallPercent).toBe(87.5);
      expect(heavy.totalCalories).toBe(368);
      expect(light.totalCalories).toBe(210.3); // 3.5×40×0.075 + 3.8×40×0.025 + 9.8×40×0.5 = 10.5 + 3.8 + 196 = 210.3
    });

    it('TEST-28c-4: Manager 403; foreign ?userId= 403 without calorie data; no token 401; own request 200', async () => {
      const alice = await login('alice@exercise.test', env.seedParticipantPassword);
      const manager = await login('manager@exercise.test', env.seedManagerPassword);
      const bobId = (await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })).id;

      const asManager = await daily(manager);
      expect(asManager.status).toBe(403);
      expect(asManager.body).not.toHaveProperty('totalCalories');

      const foreign = await request(app).get(`/api/progress/daily?userId=${bobId}`).set(alice);
      expect(foreign.status).toBe(403);
      expect(foreign.body).not.toHaveProperty('totalCalories');
      expect(foreign.body).not.toHaveProperty('items');

      expect((await request(app).get('/api/progress/daily')).status).toBe(401);

      const own = await daily(alice);
      expect(own.status).toBe(200);
      expect(own.body).toHaveProperty('totalCalories');
      expect(own.body).toHaveProperty('otherActivity');
    });

    it('TEST-28c-5: an unplanned Jump Rope (300 + 240 s) is in otherActivity, 73.5 kcal; total 91.9; scores unchanged', async () => {
      const dana = await participant();
      await weight(dana.id, 70, '2026-11-01');
      const squat = await planned(dana.id, SQUAT);
      await logged(dana.id, squat, '2026-11-05', { sets: 3, totalReps: 30 });
      const without = (await daily(dana.auth, '2026-11-05')).body;

      const rope = await exercise(dana.id, JUMP_ROPE); // no plan item
      await logged(dana.id, rope, '2026-11-05', { durationSec: 300 });
      await logged(dana.id, rope, '2026-11-05', { durationSec: 240 });

      const res = await daily(dana.auth, '2026-11-05');

      expect(res.status).toBe(200);
      expect(res.body.items.map((i: { userExerciseId: string }) => i.userExerciseId)).toEqual([squat]);
      expect(item(res.body, squat).calories).toBe(18.4);
      expect(res.body.otherActivity).toEqual([
        { userExerciseId: rope, name: 'Jump Rope', trackingMode: 'CARDIO_TIME', unit: 'seconds', actual: 540, estimatedMinutes: 9, calories: 73.5, calorieError: null },
      ]);
      expect(res.body.totalCalories).toBe(91.9);
      expect({ s: res.body.totalScore, w: res.body.totalWeight, p: res.body.overallPercent }).toEqual({
        s: without.totalScore,
        w: without.totalWeight,
        p: without.overallPercent,
      });
    });

    it('TEST-28c-6: Rest Day (Tue 10 Nov) with free-form Yoga 1,800 s and Walking 3 km -> 87.5 and 150.5, total 238', async () => {
      const dana = await participant();
      await weight(dana.id, 70, '2026-11-01');
      await planned(dana.id, SQUAT, { repeatDays: [1, 3, 5] });
      const yoga = await exercise(dana.id, YOGA);
      const walk = await exercise(dana.id, WALK);
      await logged(dana.id, yoga, '2026-11-10', { durationSec: 1800 });
      await logged(dana.id, walk, '2026-11-10', { distanceKm: 3 });

      const res = await daily(dana.auth, '2026-11-10');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ isRestDay: true, items: [], overallPercent: null, totalCalories: 238, calorieError: null });
      expect(res.body.otherActivity).toEqual([
        { userExerciseId: walk, name: 'Easy Walk', trackingMode: 'CARDIO_DISTANCE', unit: 'km', actual: 3, estimatedMinutes: 30, calories: 150.5, calorieError: null },
        { userExerciseId: yoga, name: 'Morning Yoga', trackingMode: 'YOGA', unit: 'seconds', actual: 1800, estimatedMinutes: 30, calories: 87.5, calorieError: null },
      ]);
    });

    it('TEST-28c-7: no weight, an unplanned exercise with a manual entry: element null + error; total null; entry accepted', async () => {
      const bob = await participant('bob');
      await planned(bob.id, SQUAT);
      const rope = await exercise(bob.id, JUMP_ROPE);

      const post = await request(app).post('/api/entries').set(bob.auth).send({ userExerciseId: rope, durationSec: 300 });
      expect(post.status).toBe(201);

      const res = await daily(bob.auth);
      expect(res.status).toBe(200);
      expect(res.body.otherActivity).toEqual([
        { userExerciseId: rope, name: 'Jump Rope', trackingMode: 'CARDIO_TIME', unit: 'seconds', actual: 300, estimatedMinutes: 5, calories: null, calorieError: 'BODY_WEIGHT_REQUIRED' },
      ]);
      expect(res.body).toMatchObject({ totalCalories: null, calorieError: 'BODY_WEIGHT_REQUIRED' });
    });

    it('TEST-28c-8: Walk planned Mon/Wed/Fri and logged 3 km on Tue 10 Nov is otherActivity (150.5), counted; scores unchanged', async () => {
      const dana = await participant();
      await weight(dana.id, 70, '2026-11-01');
      const squat = await planned(dana.id, SQUAT); // every day, so Tuesday is not a Rest Day
      const walk = await planned(dana.id, WALK, { repeatDays: [1, 3, 5] });
      await logged(dana.id, squat, '2026-11-10', { sets: 2, totalReps: 20 });
      const without = (await daily(dana.auth, '2026-11-10')).body;
      await logged(dana.id, walk, '2026-11-10', { distanceKm: 3 });

      const res = await daily(dana.auth, '2026-11-10');

      expect(res.status).toBe(200);
      expect(res.body.isRestDay).toBe(false);
      expect(res.body.items.map((i: { userExerciseId: string }) => i.userExerciseId)).toEqual([squat]);
      expect(res.body.otherActivity).toEqual([
        { userExerciseId: walk, name: 'Easy Walk', trackingMode: 'CARDIO_DISTANCE', unit: 'km', actual: 3, estimatedMinutes: 30, calories: 150.5, calorieError: null },
      ]);
      expect(res.body.totalCalories).toBe(162.8); // 12.25 (squat 2 sets) + 150.5 = 162.75 -> 162.8
      expect({ s: res.body.totalScore, p: res.body.overallPercent }).toEqual({ s: without.totalScore, p: without.overallPercent });
    });
  });
});
