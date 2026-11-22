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
// Sprint 2 (issue #75, CHANGE-06 / CHANGE-08) adds TEST-06g-1..4 and TEST-15-3, 15-4, 15-6..15-9
// (the monthly endpoint). Out of scope here: TEST-21a-* and the stage-2 policy matrix.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-06 / TEST-06).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-05T03:00:00.000Z'); // 10:00 Asia/Bangkok, Thu 5 Nov 2026
const TODAY = '2026-11-05';

describeWithDatabase('F-06 daily progress API (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  let clock: MutableClock;
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
    clock.set(NOW);
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
    clock = new MutableClock(NOW);
    app = buildIntegrationApp(prisma, clock);
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
  // ---- Sprint 2 (issue #75): AC-06g and AC-15 -------------------------------------------------

  const monthly = (auth: Record<string, string>, query = '') =>
    request(app).get(`/api/progress/monthly${query}`).set(auth);
  const dayStart = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
  /** A ledger row straight through Prisma (the API only accepts today as logDate). */
  const ledger = (userId: string, userExerciseId: string, date: string, totalReps: number, sets = 1) =>
    prisma.ledgerEntry.create({
      data: { userId, userExerciseId, logDate: dayStart(date), sets, totalReps, kind: 'MANUAL' },
    });
  /** Alice's Squat 4x10 (target 40 reps, weight 3), Mon-Fri unless told otherwise, from a past date. */
  const historicalSquat = async (effectiveFrom: string, repeatDays = [1, 2, 3, 4, 5]) => {
    const item = await createHistoricalPlanItem(prisma, {
      userId: aliceId,
      templateName: 'Barbell Squat',
      effectiveFrom,
      repeatDays,
    });
    createdPlanItems.push(item.id);
    createdExercises.push(item.userExerciseId);
    return item;
  };
  const moveClock = (iso: string) => clock.set(new Date(iso));

  it('TEST-06g-1: Squat 4x10 with nothing logged is 0%; after Quick Complete the next GET /daily is 100%', async () => {
    const auth = await aliceAuth();
    const squat = await plan(auth, {
      source: 'TEMPLATE',
      templateId: templateIds['Barbell Squat'],
      priorityWeight: 3,
      targetSets: 4,
      targetRepsPerSet: 10,
      loadKg: 40,
    });
    const before = await daily(auth, `?date=${TODAY}`);
    expect(before.body.overallPercent).toBe(0);

    const qc = await request(app)
      .post('/api/entries/quick-complete')
      .set(auth)
      .send({ userExerciseId: squat.userExercise.id });
    expect(qc.status, JSON.stringify(qc.body)).toBe(201);
    const after = await daily(auth, `?date=${TODAY}`);
    expect(after.body.overallPercent).toBe(100);
  });

  it('TEST-06g-2: a free-form entry for an exercise not planned today is not in items and does not change overallPercent', async () => {
    const auth = await aliceAuth();
    const { squat } = await squatAndPlank(auth);
    await entry(auth, { userExerciseId: squat.userExercise.id, sets: 2, totalReps: 20 });
    const before = await daily(auth, `?date=${TODAY}`);

    const stray = await prisma.userExercise.create({
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
    createdExercises.push(stray.id);
    await entry(auth, { userExerciseId: stray.id, durationSec: 3600 });
    const after = await daily(auth, `?date=${TODAY}`);

    expect(after.body.items.map((i: { name: string }) => i.name)).not.toContain('Unplanned Stretch');
    expect(after.body.overallPercent).toBe(before.body.overallPercent);
    expect(after.body.items).toEqual(before.body.items);
  });

  it('TEST-06g-3: Bob has his own plan and entries; GET /daily as Alice shows only her items and percentages', async () => {
    const alice = await aliceAuth();
    const bob = await bobAuth();
    const { squat } = await squatAndPlank(alice);
    await entry(alice, { userExerciseId: squat.userExercise.id, sets: 2, totalReps: 20 });
    const bobWalk = await plan(bob, {
      source: 'CUSTOM',
      exercise: { name: 'Bob Only Walk', targetBodyPart: 'Legs', trackingMode: 'CARDIO_TIME' },
      priorityWeight: 5,
      targetDurationSec: 600,
    });
    await entry(bob, { userExerciseId: bobWalk.userExercise.id, durationSec: 600 });

    const res = await daily(alice, `?date=${TODAY}`);
    expect(res.status).toBe(200);
    expect((res.body.items as Array<{ name: string }>).map((i) => i.name).sort()).toEqual(['Barbell Squat', 'Plank']);
    expect(res.body.totalWeight).toBe(5);
    expect(res.body.overallPercent).toBe(30); // squat 20/40 x 3 = 1.5 of 5
    const bobRes = await daily(bob, `?date=${TODAY}`);
    expect(bobRes.body.overallPercent).toBe(100);
  });

  it('TEST-06g-4: future or malformed date on /daily and a future, malformed or day-level month on /monthly → 400 VALIDATION_ERROR; no rows written', async () => {
    const auth = await aliceAuth();
    await squatAndPlank(auth);
    const before = await dbCounts();
    const urls = [
      '/api/progress/daily?date=2026-11-06',
      '/api/progress/daily?date=2026-13-40',
      '/api/progress/monthly?month=2026-12',
      '/api/progress/monthly?month=2026-13',
      '/api/progress/monthly?month=2026-11-05',
    ];
    for (const url of urls) {
      const res = await request(app).get(url).set(auth);
      expect(res.status, url).toBe(400);
      expect(res.body.code, url).toBe('VALIDATION_ERROR');
    }
    expect(await dbCounts()).toEqual(before);
  });

  it('TEST-15-3: a Rest Day (Tue 2026-11-10) with a large free-form entry has no effect; targeted days 100 and 50 → average 75', async () => {
    moveClock('2026-11-11T03:00:00.000Z'); // Wed 11 Nov 10:00 Bangkok
    const auth = await aliceAuth();
    const squat = await historicalSquat('2026-11-09', [1, 3]); // Mon and Wed only
    await ledger(aliceId, squat.userExerciseId, '2026-11-09', 40); // Mon: 100%
    await ledger(aliceId, squat.userExerciseId, '2026-11-10', 500, 10); // Tue: Rest Day, large entry (50 reps per set)
    await ledger(aliceId, squat.userExerciseId, '2026-11-11', 20); // Wed (today): 50%

    const res = await monthly(auth, '?month=2026-11');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      month: '2026-11',
      from: '2026-11-09',
      to: '2026-11-11',
      targetedDays: 2,
      restDaysExcluded: 1,
      averagePercent: 75,
    });
    expect(res.body.days).toEqual([
      { date: '2026-11-09', isRestDay: false, overallPercent: 100 },
      { date: '2026-11-10', isRestDay: true, overallPercent: null },
      { date: '2026-11-11', isRestDay: false, overallPercent: 50 },
    ]);
  });

  it('TEST-15-4: a Participant with no plan → 200, targetedDays 0, averagePercent null', async () => {
    const bob = await bobAuth();
    expect(await prisma.planItem.count({ where: { userId: bobId } }), 'fixture: Bob has no plan').toBe(0);

    const res = await monthly(bob, '?month=2026-11');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ month: '2026-11', targetedDays: 0, averagePercent: null });
  });

  describe('TEST-15-6 / 15-7 Alice targeted Mon-Fri from 2026-11-02', () => {
    const fixture = async () => {
      const squat = await historicalSquat('2026-11-02');
      await ledger(aliceId, squat.userExerciseId, '2026-11-02', 40); // 100%
      await ledger(aliceId, squat.userExerciseId, '2026-11-03', 20); // 50%
      // Wed 2026-11-04: no log -> 0%
      await ledger(aliceId, squat.userExerciseId, '2026-11-05', 12); // Thu (today): 30%
    };

    it('TEST-15-6: today Thu with 30% → from 2026-11-02, to 2026-11-05, targetedDays 4, average (100+50+0+30)/4 = 45; future days absent', async () => {
      await fixture();
      const res = await monthly(await aliceAuth(), '?month=2026-11');

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({
        from: '2026-11-02',
        to: '2026-11-05',
        targetedDays: 4,
        restDaysExcluded: 0,
        averagePercent: 45,
      });
      expect(res.body.days.map((d: { date: string }) => d.date)).toEqual([
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
      ]);
    });

    it('TEST-15-7: at 23:59 Thu is the last day; at 00:00 Fri it is a closed day with its final 30% and Fri is a new targeted day at 0%', async () => {
      await fixture();
      moveClock('2026-11-05T16:59:00.000Z'); // Thu 23:59 Bangkok
      const late = await monthly(await aliceAuth(), '?month=2026-11');
      expect(late.body).toMatchObject({ to: '2026-11-05', targetedDays: 4, averagePercent: 45 });

      moveClock('2026-11-05T17:00:00.000Z'); // Fri 00:00 Bangkok
      const next = await monthly(await aliceAuth(), '?month=2026-11');
      expect(next.body).toMatchObject({ to: '2026-11-06', targetedDays: 5, averagePercent: 36 }); // (100+50+0+30+0)/5
      expect(next.body.days).toContainEqual({ date: '2026-11-05', isRestDay: false, overallPercent: 30 });
      expect(next.body.days).toContainEqual({ date: '2026-11-06', isRestDay: false, overallPercent: 0 });
    });
  });

  it('TEST-15-8: first effectiveFrom 2026-11-04 → from 2026-11-04; Nov 1-3 are not counted', async () => {
    const squat = await historicalSquat('2026-11-04');
    await ledger(aliceId, squat.userExerciseId, '2026-11-03', 40); // before the plan: ignored
    await ledger(aliceId, squat.userExerciseId, '2026-11-04', 40); // 100%

    const res = await monthly(await aliceAuth(), '?month=2026-11');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ from: '2026-11-04', to: '2026-11-05', targetedDays: 2, averagePercent: 50 });
    expect(res.body.days.map((d: { date: string }) => d.date)).toEqual(['2026-11-04', '2026-11-05']);
  });

  it('TEST-15-9: past month 2026-10 (31 days, Mon/Wed/Fri plan) → from 2026-10-01, to 2026-10-31, 13 targeted days and 18 Rest Days, average over the whole month', async () => {
    const squat = await historicalSquat('2026-10-01', [1, 3, 5]);
    await ledger(aliceId, squat.userExerciseId, '2026-10-02', 40); // Fri: 100%
    await ledger(aliceId, squat.userExerciseId, '2026-10-05', 20); // Mon: 50%

    const res = await monthly(await aliceAuth(), '?month=2026-10');

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      month: '2026-10',
      from: '2026-10-01',
      to: '2026-10-31',
      targetedDays: 13,
      restDaysExcluded: 18,
    });
    expect(res.body.averagePercent).toBeCloseTo(150 / 13, 6);
    expect(res.body.days).toHaveLength(31);
  });
});
