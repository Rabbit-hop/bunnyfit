import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';
import { createHistoricalPlanItem } from '../helpers/historicalPlan.js';

// F-06 STS §8 (docs/sprints/sprint-1/F-06-progress-display.md), Sprint 1 API cases against a
// real PostgreSQL test database: TEST-06d-4, 06d-5, 06e-3, 06f-1, 06f-2. Clock fixed at Thu
// 5 Nov 2026 10:00 Asia/Bangkok. Extras (NOT STS rows): R13 future/malformed date -> 400 with
// R14 (no row written), and the `date` default (= today from the Clock, §4.1).
// Out of scope here: TEST-06g-*, TEST-15-*, TEST-21a-* (Sprint 2) and the stage-2 policy
// matrix TEST-22c / 12a / 12b for the F-06 route (issue #18).
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-06 / TEST-06).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-05T03:00:00.000Z'); // 10:00 Asia/Bangkok, Thu 5 Nov 2026
const TODAY = '2026-11-05';

describeWithDatabase('F-06 daily progress API (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  let aliceId: string;
  let bobId: string;
  const templateIds: Record<string, string> = {};
  const createdPlanItems: string[] = [];
  const createdExercises: string[] = [];
  const createdWeightLogs: string[] = [];

  const aliceAuth = async (): Promise<Record<string, string>> => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@exercise.test', password: env.seedParticipantPassword });
    return { Authorization: `Bearer ${res.body.token as string}` };
  };
  const bobAuth = async (): Promise<Record<string, string>> => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bob@exercise.test', password: env.seedParticipantPassword });
    return { Authorization: `Bearer ${res.body.token as string}` };
  };

  /** A plan item through the F-03 API (effectiveFrom defaults to today). */
  const plan = async (auth: Record<string, string>, body: Record<string, unknown>) => {
    const res = await request(app).post('/api/plan-items').set(auth).send(body);
    if (res.status !== 201) throw new Error(`fixture plan item failed: ${res.status} ${JSON.stringify(res.body)}`);
    createdPlanItems.push(res.body.planItem.id as string);
    createdExercises.push(res.body.userExercise.id as string);
    return res.body as { planItem: { id: string }; userExercise: { id: string } };
  };

  const entry = async (auth: Record<string, string>, body: Record<string, unknown>) => {
    const res = await request(app).post('/api/entries').set(auth).send(body);
    if (res.status !== 201) throw new Error(`fixture entry failed: ${res.status} ${JSON.stringify(res.body)}`);
  };

  const daily = (auth: Record<string, string>, query = '') => request(app).get(`/api/progress/daily${query}`).set(auth);

  /** Every table F-06 could touch, for the R14 "no row written" snapshot. */
  const dbCounts = async () => ({
    ledger: await prisma.ledgerEntry.count(),
    planItems: await prisma.planItem.count(),
    exercises: await prisma.userExercise.count(),
    weights: await prisma.weightLog.count(),
  });

  afterEach(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [aliceId, bobId] } } });
    await prisma.weightLog.deleteMany({ where: { id: { in: createdWeightLogs } } });
    await prisma.planItem.deleteMany({ where: { id: { in: createdPlanItems } } });
    await prisma.userExercise.deleteMany({ where: { id: { in: createdExercises } } });
    createdWeightLogs.length = 0;
    createdPlanItems.length = 0;
    createdExercises.length = 0;
  });

  beforeAll(async () => {
    prisma = newPrisma();
    app = buildIntegrationApp(prisma, new MutableClock(NOW));
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })).id;
    bobId = (await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })).id;
    for (const t of await prisma.exerciseTemplate.findMany()) templateIds[t.name] = t.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** STS fixture of TEST-06d-4: Squat 4x10 weight 3 and Plank 120 s weight 2, every day. */
  const squatAndPlank = async (auth: Record<string, string>) => {
    const squat = await plan(auth, {
      source: 'TEMPLATE',
      templateId: templateIds['Barbell Squat'],
      priorityWeight: 3,
      targetSets: 4,
      targetRepsPerSet: 10,
      loadKg: 40,
    });
    const plank = await plan(auth, {
      source: 'TEMPLATE',
      templateId: templateIds['Plank'],
      priorityWeight: 2,
      targetDurationSec: 120,
    });
    return { squat, plank };
  };

  it('TEST-06d-4: Squat 28/40 reps and Plank 120/120 s give ratios 0.7 and 1, scores 2.1 and 2, overall 82', async () => {
    const auth = await aliceAuth();
    const { squat, plank } = await squatAndPlank(auth);
    await entry(auth, { userExerciseId: squat.userExercise.id, sets: 3, totalReps: 28 });
    await entry(auth, { userExerciseId: plank.userExercise.id, durationSec: 120 });

    const res = await daily(auth, `?date=${TODAY}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: TODAY, isRestDay: false, totalScore: 4.1, totalWeight: 5, overallPercent: 82 });
    expect(res.body.items).toHaveLength(2);
    const byName = Object.fromEntries((res.body.items as Array<{ name: string }>).map((i) => [i.name, i]));
    expect(byName['Barbell Squat']).toMatchObject({
      planItemId: squat.planItem.id,
      userExerciseId: squat.userExercise.id,
      trackingMode: 'WEIGHT',
      priorityWeight: 3,
      target: 40,
      actual: 28,
      ratio: 0.7,
      itemScore: 2.1,
    });
    expect(byName['Plank']).toMatchObject({ trackingMode: 'BODYWEIGHT_TIME', target: 120, actual: 120, ratio: 1, itemScore: 2 });
  });

  it('TEST-06d-5: an item starting tomorrow and one that ended yesterday are absent and not in the denominator', async () => {
    const auth = await aliceAuth();
    const { squat } = await squatAndPlank(auth); // weight 3 + 2 occur today
    // Starts tomorrow (the API accepts a future effectiveFrom) ...
    await plan(auth, {
      source: 'TEMPLATE',
      templateId: templateIds['Outdoor Run'],
      priorityWeight: 5,
      targetDistanceKm: 5,
      effectiveFrom: '2026-11-06',
    });
    // ... and one that ended yesterday (a past endDate needs the direct-insert helper).
    const ended = await createHistoricalPlanItem(prisma, {
      userId: aliceId,
      templateName: 'Barbell Squat',
      effectiveFrom: '2026-10-01',
      endDate: '2026-11-04',
      priorityWeight: 4,
    });
    createdPlanItems.push(ended.id);
    createdExercises.push(ended.userExerciseId);
    await entry(auth, { userExerciseId: squat.userExercise.id, sets: 4, totalReps: 40 });

    const res = await daily(auth, `?date=${TODAY}`);

    expect(res.status).toBe(200);
    expect((res.body.items as Array<{ name: string }>).map((i) => i.name).sort()).toEqual(['Barbell Squat', 'Plank']);
    expect(res.body.items.map((i: { planItemId: string }) => i.planItemId)).not.toContain(ended.id);
    expect(res.body.totalWeight).toBe(5); // 5 (tomorrow) and 4 (ended) are not counted
    expect(res.body.overallPercent).toBe(60); // squat 3 of 5
  });

  it('TEST-06e-3: a past Tuesday with no occurring item is a Rest Day with overallPercent null and no items', async () => {
    const auth = await aliceAuth();
    const only = await createHistoricalPlanItem(prisma, {
      userId: aliceId,
      templateName: 'Barbell Squat',
      effectiveFrom: '2026-11-02',
      repeatDays: [1, 3, 5], // Mon, Wed, Fri: not Tuesday
    });
    createdPlanItems.push(only.id);
    createdExercises.push(only.userExerciseId);

    const res = await daily(auth, '?date=2026-11-03');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: '2026-11-03',
      isRestDay: true,
      items: [],
      totalScore: 0,
      totalWeight: 0,
      overallPercent: null,
    });
  });

  it('TEST-06f-1: a new WeightLog row (120 kg) does not change the percentage', async () => {
    const auth = await aliceAuth();
    const squat = await plan(auth, {
      source: 'TEMPLATE',
      templateId: templateIds['Barbell Squat'],
      priorityWeight: 3,
      targetSets: 4,
      targetRepsPerSet: 10,
      loadKg: 40,
    });
    await entry(auth, { userExerciseId: squat.userExercise.id, sets: 2, totalReps: 20 });

    const before = await daily(auth, `?date=${TODAY}`);
    const log = await prisma.weightLog.create({
      data: { userId: aliceId, weightKg: 120, effectiveDate: new Date(`${TODAY}T00:00:00.000Z`) },
    });
    createdWeightLogs.push(log.id);
    const after = await daily(auth, `?date=${TODAY}`);

    expect(before.status).toBe(200);
    expect(before.body.overallPercent).toBe(50);
    expect(after.status).toBe(200);
    expect(after.body.overallPercent).toBe(before.body.overallPercent);
    expect(after.body.items).toEqual(before.body.items);
  });

  it('TEST-06f-2: a second plan with a different loadKg for the same template leaves the first ratio unchanged', async () => {
    const auth = await aliceAuth();
    const first = await plan(auth, {
      source: 'TEMPLATE',
      templateId: templateIds['Barbell Squat'],
      priorityWeight: 3,
      targetSets: 4,
      targetRepsPerSet: 10,
      loadKg: 40,
    });
    await entry(auth, { userExerciseId: first.userExercise.id, sets: 2, totalReps: 20 });
    const ratioOf = async () => {
      const res = await daily(auth, `?date=${TODAY}`);
      const item = (res.body.items as Array<{ planItemId: string; ratio: number }>).find(
        (i) => i.planItemId === first.planItem.id,
      );
      return item?.ratio;
    };
    const before = await ratioOf();

    await plan(auth, {
      source: 'TEMPLATE',
      templateId: templateIds['Barbell Squat'],
      priorityWeight: 3,
      targetSets: 4,
      targetRepsPerSet: 10,
      loadKg: 80,
    });

    expect(before).toBe(0.5);
    expect(await ratioOf()).toBe(before);
  });

  it('extra (not an STS row): without `date` the result is for today from the Clock', async () => {
    const auth = await aliceAuth();
    await squatAndPlank(auth);

    const res = await daily(auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: TODAY, isRestDay: false, overallPercent: 0, totalWeight: 5 });
  });

  it('extra (R13 / R14, not an STS row): a future or malformed date is 400 VALIDATION_ERROR and writes nothing', async () => {
    const auth = await aliceAuth();
    await squatAndPlank(auth);
    const before = await dbCounts();

    for (const date of ['2026-11-06', '2026-13-40', '2026-11-5', 'today', '']) {
      const res = await daily(auth, `?date=${date}`);
      expect(res.status, `date=${date}`).toBe(400);
      expect(res.body.code, `date=${date}`).toBe('VALIDATION_ERROR');
      expect(res.body.fields[0]?.field, `date=${date}`).toBe('date');
    }
    expect(await dbCounts()).toEqual(before);
  });

  it("extra (not an STS row): another Participant's data never appears (identity from the token only)", async () => {
    const alice = await aliceAuth();
    const bob = await bobAuth();
    await squatAndPlank(alice);

    const res = await daily(bob, `?date=${TODAY}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isRestDay: true, items: [], overallPercent: null });
  });
});
