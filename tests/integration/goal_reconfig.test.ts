import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { createHistoricalEntry } from '../helpers/historicalEntry.js';
import { createHistoricalPlanItem } from '../helpers/historicalPlan.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-07 STS §8 (docs/sprints/sprint-2/F-07-goal-reconfiguration.md): AC-07a, AC-07b and AC-07c against a real
// PostgreSQL test database. Clock fixed at Thu 12 Nov 2026 10:00 Asia/Bangkok unless a test moves it.
// TEST-07b-2 and TEST-07b-3 need F-08's `GET /api/streak`; the F-08 PR (issue #74) adds them to this file.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-07 / TEST-07).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-12T03:00:00.000Z'); // 10:00 Asia/Bangkok
const TODAY = '2026-11-12';
const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';

describeWithDatabase('F-07 plan versioning (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let clock: MutableClock;
  let app: ReturnType<typeof buildIntegrationApp>;
  let aliceId: string;
  let bobId: string;
  const templateIds: Record<string, string> = {};

  const login = async (email: string, password: string): Promise<string> =>
    (await request(app).post('/api/auth/login').send({ email, password })).body.token as string;
  const aliceToken = () => login('alice@exercise.test', env.seedParticipantPassword);
  const bobToken = () => login('bob@exercise.test', env.seedParticipantPassword);
  const managerToken = () => login('manager@exercise.test', env.seedManagerPassword);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const put = async (id: string, body: unknown, token?: string) =>
    request(app).put(`/api/plan-items/${id}`).set(bearer(token ?? (await aliceToken()))).send(body as object);
  const getPlan = async (date: string) => (await request(app).get(`/api/plan?date=${date}`).set(bearer(await aliceToken()))).body;
  const getDaily = async (date: string) =>
    (await request(app).get(`/api/progress/daily?date=${date}`).set(bearer(await aliceToken()))).body;
  const rowsOf = (planKey: string) => prisma.planItem.findMany({ where: { planKey }, orderBy: { version: 'asc' } });

  const cleanup = async () => {
    // E2E runs share this database and leave ledger rows behind; they reference user exercises.
    await prisma.ledgerEntry.deleteMany();
    await prisma.planItem.deleteMany();
    await prisma.userExercise.deleteMany();
  };
  /** Base fixture B (STS §8): Alice's "Barbell Squat", version 1 from 2 Nov, 4 x 10 reps (40), 40 kg, weight 3. */
  const fixtureB = async () => {
    await cleanup();
    clock.set(NOW);
    return createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-11-02', priorityWeight: 3 });
  };
  const expectRejected = async (id: string, body: unknown, field: string, planKey: string) => {
    const before = await rowsOf(planKey);
    const res = await put(id, body);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.fields.map((f: { field: string }) => f.field)).toContain(field);
    expect(await rowsOf(planKey)).toEqual(before);
  };
  /** An item of one mode, created through the API with the Clock at today (STS §8, TEST-07a-6/10). */
  const createViaApi = async (templateName: string, target: Record<string, unknown>) => {
    const res = await request(app)
      .post('/api/plan-items')
      .set(bearer(await aliceToken()))
      .send({ source: 'TEMPLATE', templateId: templateIds[templateName], priorityWeight: 3, ...target });
    expect(res.status, `fixture: ${JSON.stringify(res.body)}`).toBe(201);
    return res.body.planItem as { id: string; planKey: string };
  };

  beforeAll(async () => {
    prisma = newPrisma();
    clock = new MutableClock(NOW);
    app = buildIntegrationApp(prisma, clock);
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })).id;
    bobId = (await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })).id;
    for (const t of await prisma.exerciseTemplate.findMany()) templateIds[t.name] = t.id;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe('AC-07a a change inserts a new version that applies from today', () => {
    it('TEST-07a-1: PUT {targetSets 5, targetRepsPerSet 10} → 200, version 2 of the same planKey from today; v1 row unchanged', async () => {
      const v1 = await fixtureB();
      const res = await put(v1.id, { targetSets: 5, targetRepsPerSet: 10 });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const item = res.body.planItem;
      expect(item).toMatchObject({
        planKey: v1.planKey,
        version: 2,
        effectiveFrom: TODAY,
        targetSets: 5,
        targetRepsPerSet: 10,
        loadKg: 40,
        priorityWeight: 3,
      });
      expect(item.id).not.toBe(v1.id);
      expect(JSON.stringify(res.body)).not.toContain('userId');
      expect(res.body.userExercise.name).toBe('Barbell Squat');
      const rows = await rowsOf(v1.planKey);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(v1);
    });

    it("TEST-07a-2: today's 25 reps are kept and rescored against the new target (62.5% → 50%)", async () => {
      const v1 = await fixtureB();
      await createHistoricalEntry(prisma, { userId: aliceId, userExerciseId: v1.userExerciseId, logDate: TODAY, totalReps: 25 });
      const before = await getDaily(TODAY);
      expect(before.items[0]).toMatchObject({ target: 40, ratio: 0.625, itemScore: 1.875 });
      expect(before.overallPercent).toBe(62.5);
      expect((await put(v1.id, { targetSets: 5, targetRepsPerSet: 10 })).status).toBe(200);
      const after = await getDaily(TODAY);
      expect(after.items[0]).toMatchObject({ target: 50, ratio: 0.5, itemScore: 1.5 });
      expect(after.overallPercent).toBe(50);
      const entries = await request(app).get(`/api/entries?date=${TODAY}`).set(bearer(await aliceToken()));
      expect(JSON.stringify(entries.body)).toContain('"totalReps":25');
    });

    it('TEST-07a-3: Quick Complete after the change fills the difference to the new target', async () => {
      const v1 = await fixtureB();
      await createHistoricalEntry(prisma, { userId: aliceId, userExerciseId: v1.userExerciseId, logDate: TODAY, totalReps: 25 });
      expect((await put(v1.id, { targetSets: 5, targetRepsPerSet: 10 })).status).toBe(200);
      const qc = await request(app)
        .post('/api/entries/quick-complete')
        .set(bearer(await aliceToken()))
        .send({ userExerciseId: v1.userExerciseId });
      expect(qc.status, JSON.stringify(qc.body)).toBe(201);
      const rows = await prisma.ledgerEntry.findMany({ where: { userExerciseId: v1.userExerciseId } });
      expect(rows.reduce((sum, r) => sum + (r.totalReps ?? 0), 0)).toBe(50);
    });

    it('TEST-07a-4: 11 Nov still resolves to version 1; 12 Nov, 13 Nov and 1 Dec to version 2', async () => {
      const v1 = await fixtureB();
      expect((await put(v1.id, { targetSets: 5, targetRepsPerSet: 10 })).status).toBe(200);
      const at = async (d: string) => (await getPlan(d)).items[0].planItem;
      expect(await at('2026-11-11')).toMatchObject({ version: 1, targetSets: 4, targetRepsPerSet: 10 });
      for (const d of ['2026-11-12', '2026-11-13', '2026-12-01']) {
        expect(await at(d)).toMatchObject({ version: 2, targetSets: 5, targetRepsPerSet: 10 });
      }
    });

    it('TEST-07a-5: weight, repeat days and load changes carry every other field; [1,3,5] makes Thursday a Rest Day', async () => {
      for (const [patch, check] of [
        [{ priorityWeight: 5 }, { priorityWeight: 5, targetSets: 4, loadKg: 40 }],
        [{ repeatDays: [1, 3, 5] }, { priorityWeight: 3, repeatDays: [1, 3, 5], loadKg: 40 }],
        [{ loadKg: 60 }, { loadKg: 60, targetSets: 4, targetRepsPerSet: 10, priorityWeight: 3 }],
      ] as const) {
        const v1 = await fixtureB();
        const res = await put(v1.id, patch);
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.planItem).toMatchObject({ version: 2, ...check });
        if ('repeatDays' in patch) {
          expect((await getPlan(TODAY)).isRestDay).toBe(true);
          expect((await getPlan('2026-11-11')).items[0].planItem.version).toBe(1);
        }
      }
    });

    it('TEST-07a-6: each tracking mode changes its own target field and nulls the other modes', async () => {
      await fixtureB();
      const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
        ['Push-up', { targetSets: 3, targetRepsPerSet: 10 }, { targetSets: 5 }],
        ['Plank', { targetDurationSec: 60 }, { targetDurationSec: 90 }],
        ['Sun Salutation', { targetDurationSec: 600 }, { targetDurationSec: 900 }],
        ['Jump Rope', { targetDurationSec: 1200 }, { targetDurationSec: 1500 }],
        ['Outdoor Run', { targetDistanceKm: 5 }, { targetDistanceKm: 7.5 }],
      ];
      for (const [name, target, patch] of cases) {
        const item = await createViaApi(name, target);
        const before = await rowsOf(item.planKey);
        const res = await put(item.id, patch);
        expect(res.status, `${name}: ${JSON.stringify(res.body)}`).toBe(200);
        expect(res.body.planItem).toMatchObject({ planKey: item.planKey, version: 2, effectiveFrom: TODAY, ...patch });
        expect(res.body.planItem.loadKg).toBeNull();
        expect(await rowsOf(item.planKey)).toHaveLength(2);
        expect((await rowsOf(item.planKey))[0]).toEqual(before[0]);
      }
    });

    it('TEST-07a-7: effectiveFrom is the Bangkok date, not the UTC date (23:30 on 12 Nov, 00:30 on 13 Nov)', async () => {
      let v1 = await fixtureB();
      clock.set(new Date('2026-11-12T16:30:00.000Z'));
      expect((await put(v1.id, { targetSets: 5 })).body.planItem.effectiveFrom).toBe('2026-11-12');
      v1 = await fixtureB();
      clock.set(new Date('2026-11-12T17:30:00.000Z'));
      expect((await put(v1.id, { targetSets: 5 })).body.planItem.effectiveFrom).toBe('2026-11-13');
    });

    it('TEST-07a-8: End sets endDate on a new version; a later date or null extends or removes it', async () => {
      const v1 = await fixtureB();
      const ended = await put(v1.id, { endDate: TODAY });
      expect(ended.status, JSON.stringify(ended.body)).toBe(200);
      expect(ended.body.planItem).toMatchObject({ version: 2, endDate: TODAY, effectiveFrom: TODAY });
      expect((await getPlan(TODAY)).items).toHaveLength(1);
      expect((await getPlan('2026-11-13')).isRestDay).toBe(true);
      expect((await getPlan('2026-11-11')).items[0].planItem.version).toBe(1);

      const later = await put(v1.id, { endDate: '2026-11-20' });
      expect(later.body.planItem).toMatchObject({ version: 3, endDate: '2026-11-20' });
      expect((await getPlan('2026-11-18')).items).toHaveLength(1);

      const cleared = await put(v1.id, { endDate: null });
      expect(cleared.body.planItem).toMatchObject({ version: 4, endDate: null });
      expect((await getPlan('2026-12-01')).items).toHaveLength(1);
      const rows = await rowsOf(v1.planKey);
      expect(rows.map((r) => r.version)).toEqual([1, 2, 3, 4]);
      expect(rows[0]).toEqual(v1);
    });

    it('TEST-07a-9: targetSets 20/21/0, targetRepsPerSet 200/201/0, loadKg 500/500.01/60.123/0', async () => {
      for (const patch of [{ targetSets: 20 }, { targetSets: 20, targetRepsPerSet: 200 }, { loadKg: 500 }]) {
        const v1 = await fixtureB();
        const res = await put(v1.id, patch);
        expect(res.status, JSON.stringify(patch)).toBe(200);
      }
      const v1 = await fixtureB();
      for (const [field, values] of [
        ['targetSets', [21, 0]],
        ['targetRepsPerSet', [201, 0]],
        ['loadKg', [500.01, 60.123, 0]],
      ] as const) {
        for (const value of values) await expectRejected(v1.id, { [field]: value }, field, v1.planKey);
      }
    });

    it('TEST-07a-10: time 10,800/10,801/0/59.5 and distance 100/100.01/0/5.123 (custom exercises, default range)', async () => {
      await fixtureB();
      const create = async (name: string, trackingMode: string, cardioCategory: string | null, target: Record<string, unknown>) => {
        const res = await request(app)
          .post('/api/plan-items')
          .set(bearer(await aliceToken()))
          .send({ source: 'CUSTOM', exercise: { name, targetBodyPart: 'Legs', trackingMode, ...(cardioCategory ? { cardioCategory } : {}) }, priorityWeight: 2, ...target });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        return res.body.planItem as { id: string; planKey: string };
      };
      const time = await create('F07 time', 'CARDIO_TIME', null, { targetDurationSec: 600 });
      expect((await put(time.id, { targetDurationSec: 10800 })).status).toBe(200);
      for (const v of [10801, 0, 59.5]) await expectRejected(time.id, { targetDurationSec: v }, 'targetDurationSec', time.planKey);
      const dist = await create('F07 dist', 'CARDIO_DISTANCE', 'RUNNING', { targetDistanceKm: 5 });
      expect((await put(dist.id, { targetDistanceKm: 100 })).status).toBe(200);
      for (const v of [100.01, 0, 5.123]) await expectRejected(dist.id, { targetDistanceKm: v }, 'targetDistanceKm', dist.planKey);
    });

    it('TEST-07a-11: the merged total reps must fit the snapshot Valid Range (rangeMax 100)', async () => {
      const v1 = await fixtureB();
      await prisma.userExercise.update({ where: { id: v1.userExerciseId }, data: { rangeMax: 100 } });
      await prisma.planItem.update({ where: { id: v1.id }, data: { targetSets: 10, targetRepsPerSet: 5 } });
      await expectRejected(v1.id, { targetRepsPerSet: 21 }, 'targetRepsPerSet', v1.planKey);
      expect((await put(v1.id, { targetRepsPerSet: 10 })).status).toBe(200);
    });

    it('TEST-07a-12: priority weight, repeat days and a field of another mode', async () => {
      for (const w of [1, 5]) {
        const v1 = await fixtureB();
        expect((await put(v1.id, { priorityWeight: w })).status).toBe(200);
      }
      const v1 = await fixtureB();
      for (const w of [0, 6, 2.5, '3']) await expectRejected(v1.id, { priorityWeight: w }, 'priorityWeight', v1.planKey);
      for (const d of [[], [0], [8], [1, 1], 'Mon']) await expectRejected(v1.id, { repeatDays: d }, 'repeatDays', v1.planKey);
      await expectRejected(v1.id, { targetDistanceKm: 3 }, 'targetDistanceKm', v1.planKey);
    });

    it('TEST-07a-13: effectiveFrom must be today; endDate not before today and a real date', async () => {
      let v1 = await fixtureB();
      expect((await put(v1.id, { effectiveFrom: TODAY, targetSets: 5 })).status).toBe(200);
      v1 = await fixtureB();
      for (const d of ['2026-11-11', '2026-11-13']) await expectRejected(v1.id, { effectiveFrom: d }, 'effectiveFrom', v1.planKey);
      await expectRejected(v1.id, { endDate: '2026-11-11' }, 'endDate', v1.planKey);
      await expectRejected(v1.id, { endDate: '2026-13-45' }, 'endDate', v1.planKey);
      expect((await put(v1.id, { endDate: TODAY })).status).toBe(200);
    });

    it('TEST-07a-14: empty, non-JSON and array bodies name "body"; unknown or non-editable fields name themselves', async () => {
      const v1 = await fixtureB();
      const before = await rowsOf(v1.planKey);
      const token = await aliceToken();
      const url = `/api/plan-items/${v1.id}`;
      const bodies = [
        request(app).put(url).set(bearer(token)).send({}),
        request(app).put(url).set(bearer(token)).set('Content-Type', 'application/json').send('{not json'),
        request(app).put(url).set(bearer(token)).send([1, 2]),
      ];
      for (const pending of bodies) {
        const res = await pending;
        expect(res.status).toBe(400);
        expect(res.body.fields).toEqual([expect.objectContaining({ field: 'body' })]);
      }
      for (const field of ['userId', 'userExerciseId', 'planKey', 'version', 'source', 'exercise', 'id']) {
        const res = await put(v1.id, { [field]: 'x', targetSets: 5 });
        expect(res.status, field).toBe(400);
        expect(res.body.fields.map((f: { field: string }) => f.field)).toContain(field);
      }
      expect(await rowsOf(v1.planKey)).toEqual(before);
    });

    it('TEST-07a-15: an ended item and a not-yet-started item are rejected naming id', async () => {
      await fixtureB();
      const ended = await createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-11-02', endDate: '2026-11-10' });
      const future = await createHistoricalPlanItem(prisma, {
        userId: aliceId,
        templateName: 'Bench Press',
        effectiveFrom: '2026-11-20',
      });
      await expectRejected(ended.id, { priorityWeight: 4 }, 'id', ended.planKey);
      await expectRejected(future.id, { priorityWeight: 4 }, 'id', future.planKey);
    });

    it("TEST-07a-16: a stale id (version 1) builds version 3 from version 2's values", async () => {
      const v1 = await fixtureB();
      expect((await put(v1.id, { targetSets: 5 })).status).toBe(200);
      const res = await put(v1.id, { priorityWeight: 5 });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.planItem).toMatchObject({ planKey: v1.planKey, version: 3, targetSets: 5, priorityWeight: 5 });
    });

    it('TEST-07a-17: 401 without a token; Manager and another Participant 403; unknown id 404; malformed id 400; owner 200', async () => {
      const v1 = await fixtureB();
      const bobs = await createHistoricalPlanItem(prisma, { userId: bobId, effectiveFrom: '2026-11-02' });
      const bobBefore = await rowsOf(bobs.planKey);
      expect((await request(app).put(`/api/plan-items/${v1.id}`).send({ targetSets: 5 })).status).toBe(401);
      const manager = await managerToken();
      for (const [id, body] of [[v1.id, { targetSets: 5 }], [v1.id, {}], [NO_SUCH_ID, { targetSets: 5 }]] as const) {
        const res = await put(id, body, manager);
        expect(res.status, `manager ${id} ${JSON.stringify(body)}`).toBe(403);
      }
      for (const body of [{ targetSets: 5 }, { targetSets: 99 }, {}]) {
        expect((await put(bobs.id, body)).status).toBe(403);
      }
      expect(await rowsOf(bobs.planKey)).toEqual(bobBefore);
      const unknown = await put(NO_SUCH_ID, { targetSets: 5 });
      expect([unknown.status, unknown.body.code]).toEqual([404, 'NOT_FOUND']);
      const malformed = await put('not-a-uuid', { targetSets: 5 });
      expect(malformed.status).toBe(400);
      expect(malformed.body.fields.map((f: { field: string }) => f.field)).toContain('id');
      expect((await put(bobs.id, { targetSets: 5 }, await bobToken())).status).toBe(200);
    });

    it('TEST-07a-18: body shape is answered before the ended-item check, which comes before merged-value validation', async () => {
      await fixtureB();
      const ended = await createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-11-02', endDate: '2026-11-10' });
      await expectRejected(ended.id, { foo: 1 }, 'foo', ended.planKey);
      const res = await put(ended.id, { targetSets: 99 });
      expect(res.status).toBe(400);
      expect(res.body.fields.map((f: { field: string }) => f.field)).toEqual(['id']);
    });
  });

  describe('AC-07b past days are untouched', () => {
    it('TEST-07b-1: Daily Overall % of every closed day is deep-equal before and after; today uses the new target', async () => {
      const v1 = await fixtureB();
      for (const [logDate, totalReps] of [['2026-11-09', 40], ['2026-11-10', 20]] as const) {
        await createHistoricalEntry(prisma, { userId: aliceId, userExerciseId: v1.userExerciseId, logDate, totalReps });
      }
      const closed = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 2).padStart(2, '0')}`);
      const read = async () => Promise.all(closed.map((d) => getDaily(d)));
      const before = await read();
      expect(before[7].overallPercent).toBe(100); // 9 Nov
      expect(before[8].overallPercent).toBe(50); // 10 Nov
      expect(before[9].overallPercent).toBe(0); // 11 Nov
      expect((await put(v1.id, { targetSets: 8 })).status).toBe(200);
      expect(await read()).toEqual(before);
      expect((await getDaily(TODAY)).items[0].target).toBe(80);
    });

    it('TEST-07b-4: earlier versions keep their own target for their dates (v1 40 reps, v2 50 reps from 9 Nov)', async () => {
      const v1 = await fixtureB();
      await createHistoricalPlanItem(prisma, {
        userId: aliceId,
        userExerciseId: v1.userExerciseId,
        planKey: v1.planKey,
        version: 2,
        effectiveFrom: '2026-11-09',
        target: { targetSets: 5, targetRepsPerSet: 10 },
      });
      await createHistoricalEntry(prisma, { userId: aliceId, userExerciseId: v1.userExerciseId, logDate: '2026-11-05', totalReps: 40 });
      await createHistoricalEntry(prisma, { userId: aliceId, userExerciseId: v1.userExerciseId, logDate: '2026-11-10', totalReps: 50 });
      const before = [await getDaily('2026-11-05'), await getDaily('2026-11-10')];
      expect(before[0]).toMatchObject({ overallPercent: 100 });
      expect(before[0].items[0].target).toBe(40);
      expect(before[1]).toMatchObject({ overallPercent: 100 });
      expect(before[1].items[0].target).toBe(50);
      const res = await put(v1.id, { targetSets: 6 });
      expect(res.body.planItem).toMatchObject({ version: 3, effectiveFrom: TODAY });
      expect([await getDaily('2026-11-05'), await getDaily('2026-11-10')]).toEqual(before);
    });

    it('TEST-07b-5: GET /api/plan of every closed day is identical after a change and after an End', async () => {
      const v1 = await fixtureB();
      const closed = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 2).padStart(2, '0')}`);
      const read = async () => Promise.all(closed.map((d) => getPlan(d)));
      const before = await read();
      expect((await put(v1.id, { priorityWeight: 5 })).status).toBe(200);
      expect((await put(v1.id, { endDate: TODAY })).status).toBe(200);
      expect(await read()).toEqual(before);
    });
  });

  describe('AC-07b the closed-day Streak is unchanged by a goal change (cross-tests with F-08, GET /api/streak)', () => {
    const streak = async () => (await request(app).get('/api/streak').set(bearer(await aliceToken()))).body as { streak: number; todayPending: boolean; todayPercent: number | null };
    /** Fixture B with 100% on 9, 10 and 11 Nov (yesterday's streak is 3) and `todayReps` entered today. */
    const withClosedDays = async (todayReps: number) => {
      const v1 = await fixtureB();
      for (const d of ['2026-11-09', '2026-11-10', '2026-11-11']) await createHistoricalEntry(prisma, { userId: aliceId, userExerciseId: v1.userExerciseId, logDate: d, totalReps: 40 });
      await createHistoricalEntry(prisma, { userId: aliceId, userExerciseId: v1.userExerciseId, logDate: TODAY, totalReps: todayReps });
      return v1;
    };

    it('TEST-07b-2: today 25 reps (62.5%): streak 3 and pending before and after raising the target to 50', async () => {
      const v1 = await withClosedDays(25);
      expect(await streak()).toMatchObject({ streak: 3, todayPending: true });
      expect((await put(v1.id, { targetSets: 5 })).status).toBe(200);
      expect(await streak()).toMatchObject({ streak: 3, todayPending: true });
    });

    it("TEST-07b-3: today 36 reps (90%): streak 4; a goal change to 100 reps (36%) drops only today's contribution: 3, pending", async () => {
      const v1 = await withClosedDays(36);
      expect(await streak()).toMatchObject({ streak: 4, todayPending: false });
      expect((await put(v1.id, { targetSets: 10 })).status).toBe(200);
      expect(await streak()).toMatchObject({ streak: 3, todayPending: true });
    });

    it('TEST-07b-6: ending the item today keeps it counted today: streak 3 and pending', async () => {
      const v1 = await withClosedDays(25);
      expect((await put(v1.id, { endDate: TODAY })).status).toBe(200);
      expect(await streak()).toMatchObject({ streak: 3, todayPending: true });
    });

    it('TEST-07b-7: making Thursday a Rest Day removes only today\'s contribution: 3, not pending, todayPercent null', async () => {
      const v1 = await withClosedDays(36);
      expect((await put(v1.id, { repeatDays: [1, 2, 3, 5, 6, 7] })).status).toBe(200);
      expect(await streak()).toEqual({ date: TODAY, streak: 3, todayPending: false, todayPercent: null });
    });
  });

  describe('AC-07c the same goal changed twice on one day', () => {
    it('TEST-07c-1: versions 2 and 3 share effectiveFrom; the plan returns version 3; v1 and v2 stay unchanged', async () => {
      const v1 = await fixtureB();
      const first = await put(v1.id, { targetSets: 5 });
      const rowsAfterFirst = await rowsOf(v1.planKey);
      const second = await put(v1.id, { targetSets: 6 });
      expect([first.body.planItem.version, second.body.planItem.version]).toEqual([2, 3]);
      expect(second.body.planItem.effectiveFrom).toBe(first.body.planItem.effectiveFrom);
      for (const d of [TODAY, '2026-11-13']) expect((await getPlan(d)).items[0].planItem).toMatchObject({ version: 3, targetSets: 6 });
      const list = await request(app).get('/api/plan-items').set(bearer(await aliceToken()));
      expect(list.body.map((r: { planItem: { version: number } }) => r.planItem.version)).toEqual([1, 2, 3]);
      expect((await rowsOf(v1.planKey)).slice(0, 2)).toEqual(rowsAfterFirst);
    });

    it('TEST-07c-2: rows inserted version 3 first, then version 2: the plan still returns version 3 (tie broken by version)', async () => {
      await cleanup();
      clock.set(NOW);
      const planKey = randomUUID();
      const v3 = await createHistoricalPlanItem(prisma, {
        userId: aliceId, planKey, version: 3, effectiveFrom: TODAY, target: { targetSets: 6, targetRepsPerSet: 10 },
      });
      await createHistoricalPlanItem(prisma, {
        userId: aliceId, userExerciseId: v3.userExerciseId, planKey, version: 2, effectiveFrom: TODAY, target: { targetSets: 5, targetRepsPerSet: 10 },
      });
      const items = (await getPlan(TODAY)).items;
      expect(items).toHaveLength(1);
      expect(items[0].planItem).toMatchObject({ version: 3, targetSets: 6 });
    });

    it('TEST-07c-3: three changes on one day give versions 2, 3, 4 with no gap; 4 rows kept', async () => {
      const v1 = await fixtureB();
      const versions: number[] = [];
      for (const sets of [5, 6, 7]) versions.push((await put(v1.id, { targetSets: sets })).body.planItem.version);
      expect(versions).toEqual([2, 3, 4]);
      expect(await rowsOf(v1.planKey)).toHaveLength(4);
      expect((await getPlan(TODAY)).items[0].planItem).toMatchObject({ version: 4, targetSets: 7 });
    });

    it('TEST-07c-4: two concurrent changes both succeed with distinct consecutive versions', async () => {
      const v1 = await fixtureB();
      const token = await aliceToken();
      const [a, b] = await Promise.all([put(v1.id, { targetSets: 5 }, token), put(v1.id, { targetSets: 6 }, token)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect([a.body.planItem.version, b.body.planItem.version].sort()).toEqual([2, 3]);
      expect(await rowsOf(v1.planKey)).toHaveLength(3);
      expect((await getPlan(TODAY)).items[0].planItem.version).toBe(3);
    });

    it('TEST-07c-5: a change on the next day is version 4 from that day; the 12th still resolves to version 3', async () => {
      const v1 = await fixtureB();
      expect((await put(v1.id, { targetSets: 5 })).status).toBe(200);
      expect((await put(v1.id, { targetSets: 6 })).status).toBe(200);
      clock.set(new Date('2026-11-13T03:00:00.000Z'));
      const res = await put(v1.id, { targetSets: 7 });
      expect(res.body.planItem).toMatchObject({ version: 4, effectiveFrom: '2026-11-13' });
      expect((await getPlan('2026-11-12')).items[0].planItem.version).toBe(3);
      expect((await getPlan('2026-11-13')).items[0].planItem.version).toBe(4);
    });
  });
});
