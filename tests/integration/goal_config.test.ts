import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { createHistoricalPlanItem } from '../helpers/historicalPlan.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-03 STS §8 (docs/sprints/sprint-1/F-03-goal-setting.md): AC-03a / AC-03b with the template source,
// against a real PostgreSQL test database. Clock fixed at Thu 5 Nov 2026 10:00 Asia/Bangkok.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-03 / TEST-03).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-05T03:00:00.000Z'); // 10:00 Asia/Bangkok
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';

describeWithDatabase('F-03 goal configuration (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  let aliceId: string;
  const templateIds: Record<string, string> = {};

  const login = async (a: ReturnType<typeof buildIntegrationApp>, email: string, password: string): Promise<string> =>
    (await request(a).post('/api/auth/login').send({ email, password })).body.token as string;
  const aliceToken = () => login(app, 'alice@exercise.test', env.seedParticipantPassword);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = async (body: unknown, a = app) =>
    request(a).post('/api/plan-items').set(bearer(await login(a, 'alice@exercise.test', env.seedParticipantPassword))).send(body as object);
  const squat = (extra: Record<string, unknown> = {}) => ({
    source: 'TEMPLATE',
    templateId: templateIds['Barbell Squat'],
    priorityWeight: 3,
    targetSets: 4,
    targetRepsPerSet: 10,
    loadKg: 40,
    ...extra,
  });
  const snapshot = async () => ({
    exercises: await prisma.userExercise.findMany({ orderBy: { id: 'asc' } }),
    items: await prisma.planItem.findMany({ orderBy: { id: 'asc' } }),
  });
  const cleanup = async () => {
    await prisma.planItem.deleteMany();
    await prisma.userExercise.deleteMany();
    await prisma.exerciseTemplate.deleteMany({ where: { category: { name: 'F03 Range' } } });
    await prisma.category.deleteMany({ where: { name: 'F03 Range' } });
  };

  beforeAll(async () => {
    prisma = newPrisma();
    app = buildIntegrationApp(prisma, new MutableClock(NOW));
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })).id;
    for (const t of await prisma.exerciseTemplate.findMany()) templateIds[t.name] = t.id;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe('AC-03a template becomes a snapshot and a plan item', () => {
    it('TEST-03a-1: Barbell Squat → 201; snapshot copies the template; plan item as sent; one new row each, owned by Alice', async () => {
      const before = await snapshot();
      const template = await prisma.exerciseTemplate.findUniqueOrThrow({ where: { id: templateIds['Barbell Squat'] ?? '' } });
      const res = await post(squat({ effectiveFrom: '2026-11-05', endDate: '2026-11-30', repeatDays: [1, 3, 5] }));
      expect(res.status).toBe(201);
      expect(res.body.userExercise).toMatchObject({
        sourceTemplateId: template.id,
        isCustom: false,
        name: 'Barbell Squat',
        targetBodyPart: template.targetBodyPart,
        trackingMode: 'WEIGHT',
        unit: 'reps',
        cardioCategory: null,
        metValue: template.metValue.toNumber(),
        rangeMin: template.rangeMin.toNumber(),
        rangeMax: template.rangeMax.toNumber(),
      });
      expect(res.body.planItem).toMatchObject({
        userExerciseId: res.body.userExercise.id,
        version: 1,
        priorityWeight: 3,
        targetSets: 4,
        targetRepsPerSet: 10,
        loadKg: 40,
        targetDurationSec: null,
        targetDistanceKm: null,
        effectiveFrom: '2026-11-05',
        endDate: '2026-11-30',
        repeatDays: [1, 3, 5],
      });
      expect(res.body.planItem.planKey).toMatch(UUID);
      expect(JSON.stringify(res.body)).not.toContain('userId');

      const after = await snapshot();
      expect(after.exercises).toHaveLength(before.exercises.length + 1);
      expect(after.items).toHaveLength(before.items.length + 1);
      const exercise = await prisma.userExercise.findUniqueOrThrow({ where: { id: res.body.userExercise.id } });
      const item = await prisma.planItem.findUniqueOrThrow({ where: { id: res.body.planItem.id } });
      expect([exercise.userId, item.userId]).toEqual([aliceId, aliceId]);
      expect(exercise.sourceTemplateId).toBe(template.id);
      expect(item.repeatDays).toBe(1 + 4 + 16); // Mon, Wed, Fri bitmask (SDS §3.2)
    });

    it('TEST-03a-2: one plan item per other mode → 201 each; target fields match the mode, the rest are null', async () => {
      const cases = [
        { template: 'Push-up', target: { targetSets: 3, targetRepsPerSet: 12 }, stored: { targetSets: 3, targetRepsPerSet: 12 } },
        { template: 'Plank', target: { targetDurationSec: 60 }, stored: { targetDurationSec: 60 } },
        { template: 'Sun Salutation', target: { targetDurationSec: 600 }, stored: { targetDurationSec: 600 } },
        { template: 'Jump Rope', target: { targetDurationSec: 900 }, stored: { targetDurationSec: 900 } },
        { template: 'Outdoor Run', target: { targetDistanceKm: 5 }, stored: { targetDistanceKm: 5 } },
      ];
      for (const c of cases) {
        const res = await post({ source: 'TEMPLATE', templateId: templateIds[c.template], priorityWeight: 2, ...c.target });
        expect(res.status).toBe(201);
        expect(res.body.planItem).toMatchObject({
          targetSets: null,
          targetRepsPerSet: null,
          loadKg: null,
          targetDurationSec: null,
          targetDistanceKm: null,
          ...c.stored,
        });
        const row = await prisma.planItem.findUniqueOrThrow({ where: { id: res.body.planItem.id } });
        expect(row.loadKg).toBeNull();
        expect(res.body.userExercise.name).toBe(c.template);
      }
    });

    it('TEST-03a-3: without effectiveFrom, repeatDays and endDate → defaults (today, every day, no end)', async () => {
      const res = await post(squat());
      expect(res.status).toBe(201);
      expect(res.body.planItem.effectiveFrom).toBe('2026-11-05');
      expect(res.body.planItem.repeatDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(res.body.planItem.endDate).toBeNull();
    });

    it('TEST-03a-4: selecting the same template twice → two independent UserExercise rows', async () => {
      const first = await post(squat());
      const second = await post(squat());
      expect([first.status, second.status]).toEqual([201, 201]);
      expect(first.body.userExercise.id).not.toBe(second.body.userExercise.id);
      expect(first.body.planItem.planKey).not.toBe(second.body.planItem.planKey);
    });

    it('TEST-03a-5: failure while inserting the PlanItem → 500 INTERNAL_ERROR without stack trace; the UserExercise is rolled back', async () => {
      const failing = prisma.$extends({
        query: {
          planItem: {
            create() {
              throw new Error('forced failure on PlanItem insert');
            },
          },
        },
      });
      const failingApp = buildIntegrationApp(failing as unknown as PrismaClient, new MutableClock(NOW));
      const before = await snapshot();
      const res = await post(squat(), failingApp);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toMatch(/forced failure|\bat .*\(|\.ts:/);
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('AC-03b invalid goal data is rejected and nothing is stored', () => {
    const expectRejected = async (body: unknown, field: string, status = 400) => {
      const before = await snapshot();
      const res = await post(body);
      expect(res.status, JSON.stringify(res.body)).toBe(status);
      expect(res.body.code).toBe(status === 400 ? 'VALIDATION_ERROR' : 'NOT_FOUND');
      expect(res.body.fields.map((f: { field: string }) => f.field)).toContain(field);
      expect(await snapshot()).toEqual(before);
    };
    const without = (body: Record<string, unknown>, key: string) => {
      const copy = { ...body };
      delete copy[key];
      return copy;
    };

    it('TEST-03b-1: WEIGHT variations (sets 0/21, reps 0/201, loadKg missing/0/500.01, duration supplied) → 400 naming the field', async () => {
      await expectRejected(squat({ targetSets: 0 }), 'targetSets');
      await expectRejected(squat({ targetSets: 21 }), 'targetSets');
      await expectRejected(squat({ targetRepsPerSet: 0 }), 'targetRepsPerSet');
      await expectRejected(squat({ targetRepsPerSet: 201 }), 'targetRepsPerSet');
      await expectRejected(without(squat(), 'loadKg'), 'loadKg');
      await expectRejected(squat({ loadKg: 0 }), 'loadKg');
      await expectRejected(squat({ loadKg: 500.01 }), 'loadKg');
      await expectRejected(squat({ targetDurationSec: 60 }), 'targetDurationSec');
    });

    it('TEST-03b-2: seconds mode (0, 10,801, 59.5) and km mode (0, 100.01, 5.123) → 400 naming the field', async () => {
      const plank = (extra: Record<string, unknown>) => ({ source: 'TEMPLATE', templateId: templateIds['Plank'], priorityWeight: 2, ...extra });
      const run = (extra: Record<string, unknown>) => ({ source: 'TEMPLATE', templateId: templateIds['Outdoor Run'], priorityWeight: 2, ...extra });
      for (const bad of [0, 10801, 59.5]) await expectRejected(plank({ targetDurationSec: bad }), 'targetDurationSec');
      for (const bad of [0, 100.01, 5.123]) await expectRejected(run({ targetDistanceKm: bad }), 'targetDistanceKm');
    });

    it('TEST-03b-3: template Valid Range max 100: 10 x 11 = 110 → 400 naming targetRepsPerSet; 10 x 10 = 100 → 201', async () => {
      const manager = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@exercise.test' } });
      const category = await prisma.category.create({ data: { name: 'F03 Range' } });
      const template = await prisma.exerciseTemplate.create({
        data: {
          categoryId: category.id,
          name: 'Capped Curl',
          targetBodyPart: 'Arms',
          unit: 'reps',
          trackingMode: 'WEIGHT',
          metValue: 3.5,
          rangeMin: 1,
          rangeMax: 100,
          createdById: manager.id,
        },
      });
      const body = (reps: number) => ({ source: 'TEMPLATE', templateId: template.id, priorityWeight: 1, targetSets: 10, targetRepsPerSet: reps, loadKg: 10 });
      await expectRejected(body(11), 'targetRepsPerSet');
      const ok = await post(body(10));
      expect(ok.status).toBe(201);
    });

    it('TEST-03b-4: priorityWeight 0, 6, 2.5 and missing → 400 naming priorityWeight', async () => {
      for (const bad of [0, 6, 2.5]) await expectRejected(squat({ priorityWeight: bad }), 'priorityWeight');
      await expectRejected(without(squat(), 'priorityWeight'), 'priorityWeight');
    });

    it('TEST-03b-5: effectiveFrom yesterday → 400; today and tomorrow → 201', async () => {
      await expectRejected(squat({ effectiveFrom: '2026-11-04' }), 'effectiveFrom');
      expect((await post(squat({ effectiveFrom: '2026-11-05' }))).status).toBe(201);
      expect((await post(squat({ effectiveFrom: '2026-11-06' }))).status).toBe(201);
    });

    it('TEST-03b-6: endDate before effectiveFrom → 400 naming endDate; equal to effectiveFrom → 201', async () => {
      await expectRejected(squat({ effectiveFrom: '2026-11-05', endDate: '2026-11-04' }), 'endDate');
      expect((await post(squat({ effectiveFrom: '2026-11-05', endDate: '2026-11-05' }))).status).toBe(201);
    });

    it('TEST-03b-7: repeatDays [], [0], [8], [1,1], "Mon" → 400 naming repeatDays', async () => {
      for (const bad of [[], [0], [8], [1, 1], 'Mon']) await expectRejected(squat({ repeatDays: bad }), 'repeatDays');
    });

    it('TEST-03b-8: non-UUID templateId, non-JSON body and an unknown extra field → 400; nothing stored', async () => {
      await expectRejected(squat({ templateId: 'not-a-uuid' }), 'templateId');
      await expectRejected(squat({ userId: aliceId }), 'userId');
      const before = await snapshot();
      const token = await aliceToken();
      const res = await request(app).post('/api/plan-items').set(bearer(token)).set('Content-Type', 'application/json').send('{not json');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await snapshot()).toEqual(before);
    });

    it('TEST-03b-9: a well-formed templateId that does not exist → 404 NOT_FOUND naming templateId; nothing stored', async () => {
      await expectRejected(squat({ templateId: NO_SUCH_ID }), 'templateId', 404);
    });
  });

  describe('AC-03c plan resolution (R12) and read endpoints', () => {
    const bobToken = () => login(app, 'bob@exercise.test', env.seedParticipantPassword);
    const planFor = async (date?: string, token?: string) =>
      request(app)
        .get(`/api/plan${date ? `?date=${date}` : ''}`)
        .set(bearer(token ?? (await aliceToken())));
    const clearPlans = async () => {
      await prisma.planItem.deleteMany();
      await prisma.userExercise.deleteMany();
    };

    beforeAll(clearPlans);

    it('TEST-03c-1: one item from 5 Nov to 30 Nov on Mon/Wed/Fri → Mon has it, Tue is a Rest Day, Wed has it', async () => {
      const created = await post(squat({ effectiveFrom: '2026-11-05', endDate: '2026-11-30', repeatDays: [1, 3, 5] }));
      expect(created.status).toBe(201);
      const mon = await planFor('2026-11-09');
      expect(mon.status).toBe(200);
      expect(mon.body.date).toBe('2026-11-09');
      expect(mon.body.isRestDay).toBe(false);
      expect(mon.body.items).toHaveLength(1);
      expect(mon.body.items[0].planItem.id).toBe(created.body.planItem.id);
      expect(mon.body.items[0].userExercise.name).toBe('Barbell Squat');
      const tue = await planFor('2026-11-10');
      expect(tue.body).toEqual({ date: '2026-11-10', isRestDay: true, items: [] });
      const wed = await planFor('2026-11-11');
      expect(wed.body.isRestDay).toBe(false);
      expect(wed.body.items).toHaveLength(1);
    });

    it('TEST-03c-2: before effectiveFrom → Rest Day; on the end date (a Monday) → item; after the end date → Rest Day', async () => {
      const before = await planFor('2026-11-04');
      expect([before.body.isRestDay, before.body.items]).toEqual([true, []]);
      const onEnd = await planFor('2026-11-30');
      expect(onEnd.body.isRestDay).toBe(false);
      expect(onEnd.body.items).toHaveLength(1);
      const after = await planFor('2026-12-07');
      expect([after.body.isRestDay, after.body.items]).toEqual([true, []]);
    });

    it('TEST-03c-3: two items with different repeat days, one ending earlier → only the matching item per day', async () => {
      await clearPlans();
      const a = await post(squat({ repeatDays: [1, 3] }));
      const b = await post({ source: 'TEMPLATE', templateId: templateIds['Plank'], priorityWeight: 2, targetDurationSec: 60, repeatDays: [2, 4], endDate: '2026-11-12' });
      const idsOn = async (date: string) => (await planFor(date)).body.items.map((i: { planItem: { id: string } }) => i.planItem.id);
      expect(await idsOn('2026-11-09')).toEqual([a.body.planItem.id]); // Mon
      expect(await idsOn('2026-11-10')).toEqual([b.body.planItem.id]); // Tue
      expect(await idsOn('2026-11-11')).toEqual([a.body.planItem.id]); // Wed
      expect(await idsOn('2026-11-12')).toEqual([b.body.planItem.id]); // Thu, last day of B
      expect(await idsOn('2026-11-17')).toEqual([]); // Tue after B ended
    });

    it('TEST-03c-4: a later version of the same planKey wins from its effectiveFrom (greatest effectiveFrom <= date)', async () => {
      await clearPlans();
      const v1 = await createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-10-20', target: { targetSets: 3 } });
      await createHistoricalPlanItem(prisma, {
        userId: aliceId,
        userExerciseId: v1.userExerciseId,
        planKey: v1.planKey,
        version: 2,
        effectiveFrom: '2026-11-10',
        target: { targetSets: 5 },
      });
      const sets = async (date: string) => (await planFor(date)).body.items.map((i: { planItem: { targetSets: number; version: number } }) => [i.planItem.version, i.planItem.targetSets]);
      expect(await sets('2026-11-09')).toEqual([[1, 3]]);
      expect(await sets('2026-11-10')).toEqual([[2, 5]]);
      expect(await sets('2026-11-20')).toEqual([[2, 5]]);
    });

    it('TEST-03c-5: Alice sees only her items; a malformed date → 400; no date → today\'s plan', async () => {
      await clearPlans();
      const mine = await post(squat());
      const bobsToken = await bobToken();
      const bobs = await request(app).post('/api/plan-items').set(bearer(bobsToken)).send({ source: 'TEMPLATE', templateId: templateIds['Plank'], priorityWeight: 1, targetDurationSec: 30 });
      expect(bobs.status).toBe(201);
      const today = await planFor();
      expect(today.status).toBe(200);
      expect(today.body.date).toBe('2026-11-05');
      expect(today.body.items.map((i: { planItem: { id: string } }) => i.planItem.id)).toEqual([mine.body.planItem.id]);
      const bad = await planFor('2026-13-45');
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
      expect(bad.body.fields.map((f: { field: string }) => f.field)).toContain('date');
    });

    it('extra (not an STS row): list endpoints return only own data, ordered; GET /api/plan-items/:id returns the item with its snapshot', async () => {
      await clearPlans();
      const first = await post(squat({ effectiveFrom: '2026-11-06' }));
      const second = await post({ source: 'TEMPLATE', templateId: templateIds['Plank'], priorityWeight: 1, targetDurationSec: 30 });
      const token = await aliceToken();
      const items = await request(app).get('/api/plan-items').set(bearer(token));
      expect(items.status).toBe(200);
      // ordered by effectiveFrom (5 Nov Plank before 6 Nov squat), each with its snapshot
      expect(items.body.map((i: { planItem: { id: string } }) => i.planItem.id)).toEqual([second.body.planItem.id, first.body.planItem.id]);
      expect(items.body[0].userExercise.name).toBe('Plank');
      expect(JSON.stringify(items.body)).not.toContain('userId');
      const exercises = await request(app).get('/api/user-exercises').set(bearer(token));
      expect(exercises.status).toBe(200);
      expect(exercises.body.map((e: { name: string }) => e.name)).toEqual(['Barbell Squat', 'Plank']);
      const one = await request(app).get(`/api/plan-items/${first.body.planItem.id}`).set(bearer(token));
      expect(one.status).toBe(200);
      expect(one.body.planItem.id).toBe(first.body.planItem.id);
      expect(one.body.userExercise.name).toBe('Barbell Squat');
    });
  });
});
