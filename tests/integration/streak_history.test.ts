import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { createHistoricalEntry } from '../helpers/historicalEntry.js';
import { createHistoricalPlanItem } from '../helpers/historicalPlan.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-08 STS §8 (docs/sprints/sprint-2/F-08-history-streak.md): AC-08a, AC-19a-d against a real PostgreSQL
// test database. AC-08b is the Playwright file tests/e2e/streak_history.spec.ts. TEST-07b-2/3/6/7 are in
// goal_reconfig.test.ts. Clock fixed at Thu 12 Nov 2026 10:00 Asia/Bangkok unless a test moves it.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-08 / AC-19).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-12T03:00:00.000Z'); // 10:00 Asia/Bangkok
const TODAY = '2026-11-12';

describeWithDatabase('F-08 history and streak (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let clock: MutableClock;
  let app: ReturnType<typeof buildIntegrationApp>;
  let aliceId: string;
  let bobId: string;

  const login = async (email: string, password: string): Promise<string> =>
    (await request(app).post('/api/auth/login').send({ email, password })).body.token as string;
  const aliceToken = () => login('alice@exercise.test', env.seedParticipantPassword);
  const bobToken = () => login('bob@exercise.test', env.seedParticipantPassword);
  const managerToken = () => login('manager@exercise.test', env.seedManagerPassword);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = async (path: string, token?: string) => request(app).get(path).set(bearer(token ?? (await aliceToken())));
  const streak = async () => (await get('/api/streak')).body as { date: string; streak: number; todayPending: boolean; todayPercent: number | null };
  const history = async (qs = '') => get(`/api/history${qs}`);

  const cleanup = async () => {
    await prisma.ledgerEntry.deleteMany();
    await prisma.planItem.deleteMany();
    await prisma.userExercise.deleteMany();
  };
  const reset = async (at: Date = NOW) => {
    await cleanup();
    clock.set(at);
  };
  /** Base fixture S: Alice's "Barbell Squat", every day from 2 Nov, 4 x 10 reps (40), weight 3. */
  const fixtureS = async (at: Date = NOW) => {
    await reset(at);
    return createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-11-02', priorityWeight: 3 });
  };
  const reps = (item: { userExerciseId: string }, logDate: string, totalReps: number, userId = aliceId) =>
    createHistoricalEntry(prisma, { userId, userExerciseId: item.userExerciseId, logDate, totalReps });

  beforeAll(async () => {
    prisma = newPrisma();
    clock = new MutableClock(NOW);
    app = buildIntegrationApp(prisma, clock);
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })).id;
    bobId = (await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })).id;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe('AC-08a history of the own days, newest first', () => {
    it('TEST-08a-1: default window is 30 days ending today, newest first, with percentages and entries; Rest Days before the plan', async () => {
      const item = await fixtureS();
      await reps(item, '2026-11-09', 40);
      await reps(item, '2026-11-10', 20);
      await reps(item, TODAY, 28);
      const res = await history();
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.from).toBe('2026-10-14');
      expect(res.body.to).toBe(TODAY);
      const days = res.body.days as Array<{ date: string; isRestDay: boolean; overallPercent: number | null; entries: Array<Record<string, unknown>> }>;
      expect(days).toHaveLength(30);
      expect(days[0]!.date).toBe(TODAY);
      const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
      expect(byDate['2026-11-12']!.overallPercent).toBe(70);
      expect(byDate['2026-11-11']!.overallPercent).toBe(0);
      expect(byDate['2026-11-10']!.overallPercent).toBe(50);
      expect(byDate['2026-11-09']!.overallPercent).toBe(100);
      expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort().reverse());
      for (const d of days.filter((x) => x.date < '2026-11-02')) {
        expect([d.isRestDay, d.overallPercent, d.entries]).toEqual([true, null, []]);
      }
      const row = await prisma.ledgerEntry.findFirstOrThrow({ where: { userId: aliceId, logDate: new Date('2026-11-09T00:00:00.000Z') } });
      expect(byDate['2026-11-09']!.entries).toEqual([
        expect.objectContaining({ id: row.id, exerciseName: 'Barbell Squat', logDate: '2026-11-09', totalReps: 40, kind: 'MANUAL', scored: true }),
      ]);
      expect(JSON.stringify(res.body)).not.toContain('userId');
    });

    it('TEST-08a-2: each day equals GET /api/progress/daily for the same date (R12)', async () => {
      const item = await fixtureS();
      await reps(item, '2026-11-09', 40);
      await reps(item, '2026-11-10', 20);
      const res = await history('?from=2026-11-09&to=2026-11-11');
      expect(res.body.days.map((d: { date: string }) => d.date)).toEqual(['2026-11-11', '2026-11-10', '2026-11-09']);
      for (const d of res.body.days) {
        const daily = (await get(`/api/progress/daily?date=${d.date}`)).body;
        expect([d.overallPercent, d.totalScore, d.totalWeight]).toEqual([daily.overallPercent, daily.totalScore, daily.totalWeight]);
      }
    });

    it("TEST-08a-3: each Participant sees only their own entries; foreign ?userId 403, own 200; Manager 403; no token 401", async () => {
      const alice = await fixtureS();
      const bob = await createHistoricalPlanItem(prisma, { userId: bobId, effectiveFrom: '2026-11-02' });
      await reps(alice, '2026-11-10', 40);
      await reps(bob, '2026-11-10', 10, bobId);
      const own = async (token: string) =>
        (await get('/api/history?from=2026-11-10&to=2026-11-10', token)).body.days[0].entries.map((e: { userExerciseId: string }) => e.userExerciseId);
      expect(await own(await aliceToken())).toEqual([alice.userExerciseId]);
      expect(await own(await bobToken())).toEqual([bob.userExerciseId]);
      expect((await get(`/api/history?userId=${bobId}`)).status).toBe(403);
      expect((await get(`/api/history?userId=${aliceId}`)).status).toBe(200);
      const manager = await managerToken();
      expect((await get('/api/history', manager)).status).toBe(403);
      expect((await get('/api/history?from=garbage', manager)).status).toBe(403);
      expect((await request(app).get('/api/history')).status).toBe(401);
    });

    it('TEST-08a-4: a Rest Day entry is listed unscored with a null percent; an entry of an exercise not planned that day is listed unscored and not counted', async () => {
      await reset();
      const main = await createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-11-02', repeatDays: [1, 2, 3, 4, 5] });
      const monday = await createHistoricalPlanItem(prisma, { userId: aliceId, templateName: 'Bench Press', effectiveFrom: '2026-11-02', repeatDays: [1] });
      await reps(main, '2026-11-07', 10); // Saturday: Rest Day
      await reps(monday, '2026-11-10', 30); // Tuesday: this exercise is planned on Mondays only
      const res = await history('?from=2026-11-06&to=2026-11-10');
      const byDate = Object.fromEntries(res.body.days.map((d: { date: string }) => [d.date, d]));
      expect(byDate['2026-11-07']).toMatchObject({ isRestDay: true, overallPercent: null });
      expect(byDate['2026-11-07'].entries).toEqual([expect.objectContaining({ scored: false })]);
      expect(byDate['2026-11-10'].overallPercent).toBe(0);
      expect(byDate['2026-11-10'].entries).toEqual([expect.objectContaining({ userExerciseId: monday.userExerciseId, scored: false })]);
    });

    it('TEST-08a-5: entries of a day are ordered by createdAt ascending; the percent uses both items', async () => {
      const a = await fixtureS();
      const b = await createHistoricalPlanItem(prisma, { userId: aliceId, templateName: 'Bench Press', effectiveFrom: '2026-11-02', priorityWeight: 2 });
      for (const [item, n] of [[a, 10], [b, 20], [a, 10], [b, 20]] as const) await reps(item, '2026-11-11', n);
      const res = await history('?from=2026-11-11&to=2026-11-11');
      expect(res.body.days).toHaveLength(1);
      const day = res.body.days[0];
      const created = day.entries.map((e: { createdAt: string }) => e.createdAt);
      expect(created).toEqual([...created].sort());
      expect(day.entries).toHaveLength(4);
      expect(day.totalWeight).toBe(5);
      expect(day.overallPercent).toBe(70); // (20/40 x 3 + 40/40 x 2) / 5
    });

    it('TEST-08a-6: the plan version in force on each date is used (version 2 from 9 Nov targets 50 reps)', async () => {
      const v1 = await fixtureS();
      await createHistoricalPlanItem(prisma, {
        userId: aliceId, userExerciseId: v1.userExerciseId, planKey: v1.planKey, version: 2, effectiveFrom: '2026-11-09', target: { targetSets: 5, targetRepsPerSet: 10 },
      });
      await reps(v1, '2026-11-08', 40);
      await reps(v1, '2026-11-09', 40);
      const days = (await history('?from=2026-11-08&to=2026-11-09')).body.days;
      expect(days.map((d: { date: string; overallPercent: number }) => [d.date, d.overallPercent])).toEqual([['2026-11-09', 80], ['2026-11-08', 100]]);
    });

    it('TEST-08a-7: today is recomputed on read: 0% before Quick Complete, 100% with one QUICK_COMPLETE entry after', async () => {
      const item = await fixtureS();
      expect((await history('?from=2026-11-12&to=2026-11-12')).body.days[0].overallPercent).toBe(0);
      const qc = await request(app).post('/api/entries/quick-complete').set(bearer(await aliceToken())).send({ userExerciseId: item.userExerciseId });
      expect(qc.status, JSON.stringify(qc.body)).toBe(201);
      const today = (await history('?from=2026-11-12&to=2026-11-12')).body.days[0];
      expect(today.overallPercent).toBe(100);
      expect(today.entries).toEqual([expect.objectContaining({ kind: 'QUICK_COMPLETE' })]);
    });

    it('TEST-08a-8: range rules: from after to, future to, malformed dates, unknown parameter, 366/367 days, single bounds', async () => {
      await fixtureS();
      const fieldsOf = (res: { body: { fields: Array<{ field: string }> } }) => res.body.fields.map((f) => f.field);
      for (const [qs, field] of [
        ['?from=2026-11-12&to=2026-11-10', 'from'],
        ['?to=2026-11-13', 'to'],
        ['?from=2026-11-13', 'from'],
        ['?from=2026-13-45', 'from'],
        ['?to=12/11/2026', 'to'],
        ['?foo=1', 'foo'],
        ['?from=2025-11-11&to=2026-11-12', 'from'],
      ] as const) {
        const res = await history(qs);
        expect(res.status, qs).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(fieldsOf(res), qs).toContain(field);
      }
      const max = await history('?from=2025-11-12&to=2026-11-12');
      expect([max.status, max.body.days.length]).toEqual([200, 366]);
      const toOnly = await history('?to=2026-11-12');
      expect([toOnly.status, toOnly.body.days.length, toOnly.body.days[0].date]).toEqual([200, 30, '2026-11-12']);
      const fromOnly = await history('?from=2026-11-01');
      expect([fromOnly.status, fromOnly.body.days.length, fromOnly.body.days.at(-1).date]).toEqual([200, 12, '2026-11-01']);
    });

    it('TEST-08a-9: GET /api/streak rejects unknown parameters; foreign ?userId 403; Manager 403 first; no token 401', async () => {
      await fixtureS();
      const foo = await get('/api/streak?foo=1');
      expect([foo.status, foo.body.fields.map((f: { field: string }) => f.field)]).toEqual([400, ['foo']]);
      const date = await get('/api/streak?date=2026-11-12');
      expect([date.status, date.body.fields.map((f: { field: string }) => f.field)]).toEqual([400, ['date']]);
      expect((await get(`/api/streak?userId=${bobId}`)).status).toBe(403);
      expect((await get(`/api/streak?userId=${aliceId}`)).status).toBe(200);
      expect((await get('/api/streak?foo=1', await managerToken())).status).toBe(403);
      expect((await request(app).get('/api/streak')).status).toBe(401);
    });
  });

  describe('AC-19a the 70% boundary', () => {
    /** Three every-day items from 2 Nov: A weight 5 (40 reps), B weight 2 (100 reps), C weight 3 (40 reps). */
    const threeItems = async () => {
      await reset();
      const make = (priorityWeight: number, target: { targetSets: number; targetRepsPerSet: number }) =>
        createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-11-02', priorityWeight, target });
      return { a: await make(5, { targetSets: 4, targetRepsPerSet: 10 }), b: await make(2, { targetSets: 10, targetRepsPerSet: 10 }), c: await make(3, { targetSets: 4, targetRepsPerSet: 10 }) };
    };

    it('TEST-19a-1: exactly 70% yesterday (7/10) counts: streak 1, today pending', async () => {
      const { a, b } = await threeItems();
      await reps(a, '2026-11-11', 40);
      await reps(b, '2026-11-11', 100);
      expect((await get('/api/progress/daily?date=2026-11-11')).body.overallPercent).toBe(70);
      expect(await streak()).toMatchObject({ streak: 1, todayPending: true });
    });

    it('TEST-19a-2: 69.8% yesterday does not count: streak 0', async () => {
      const { a, b } = await threeItems();
      await reps(a, '2026-11-11', 40);
      await reps(b, '2026-11-11', 99);
      expect((await get('/api/progress/daily?date=2026-11-11')).body.overallPercent).toBe(69.8);
      expect((await streak()).streak).toBe(0);
    });

    it('TEST-19a-3: today at exactly 70% counts at once (not pending); 69.8% today does not', async () => {
      const { a, b } = await threeItems();
      await reps(a, TODAY, 40);
      await reps(b, TODAY, 100);
      expect(await streak()).toEqual({ date: TODAY, streak: 1, todayPending: false, todayPercent: 70 });
      await prisma.ledgerEntry.deleteMany({ where: { userExerciseId: b.userExerciseId } });
      await reps(b, TODAY, 99);
      expect(await streak()).toEqual({ date: TODAY, streak: 0, todayPending: true, todayPercent: 69.8 });
    });
  });

  describe('AC-19b a closed targeted day without a log resets the streak', () => {
    it('TEST-19b-1: no entry on 11 Nov → streak 0 although 9 and 10 Nov were 100%', async () => {
      const item = await fixtureS();
      await reps(item, '2026-11-09', 40);
      await reps(item, '2026-11-10', 40);
      expect(await streak()).toMatchObject({ streak: 0, todayPending: true });
    });

    it('TEST-19b-2: the reset at 10 Nov is not undone; the count restarts at 11 Nov (1)', async () => {
      const item = await fixtureS();
      await reps(item, '2026-11-09', 40);
      await reps(item, '2026-11-11', 40);
      expect((await streak()).streak).toBe(1);
    });

    it('TEST-19b-3: an entry of an exercise that is not planned on 11 Nov is ignored: streak 0', async () => {
      const item = await fixtureS();
      const monday = await createHistoricalPlanItem(prisma, { userId: aliceId, templateName: 'Bench Press', effectiveFrom: '2026-11-02', repeatDays: [1] });
      await reps(item, '2026-11-09', 40);
      await reps(item, '2026-11-10', 40);
      await reps(monday, '2026-11-11', 40); // Wednesday
      expect((await streak()).streak).toBe(0);
    });

    it('TEST-19b-4: no plan item at all → 0, not pending, todayPercent null; a plan that starts today → 0, pending', async () => {
      await reset();
      expect(await streak()).toEqual({ date: TODAY, streak: 0, todayPending: false, todayPercent: null });
      await createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: TODAY });
      expect(await streak()).toMatchObject({ streak: 0, todayPending: true, todayPercent: 0 });
    });
  });

  describe('AC-19c Rest Days are neutral', () => {
    const MON_FRI = [1, 2, 3, 4, 5];
    const weekItem = async (at: Date, repeatDays: number[] = MON_FRI) => {
      await reset(at);
      return createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-11-06', repeatDays });
    };
    const TUE_10 = new Date('2026-11-10T03:00:00.000Z');

    it('TEST-19c-1: Friday 100%, Saturday and Sunday Rest Days, Monday 100% → 2, today (Tue) pending', async () => {
      const item = await weekItem(TUE_10);
      await reps(item, '2026-11-06', 40);
      await reps(item, '2026-11-09', 40);
      expect(await streak()).toMatchObject({ streak: 2, todayPending: true });
    });

    it('TEST-19c-2: on Monday evening Monday itself is already 100%: 2, not pending', async () => {
      const item = await weekItem(new Date('2026-11-09T13:00:00.000Z'));
      await reps(item, '2026-11-06', 40);
      await reps(item, '2026-11-09', 40);
      expect(await streak()).toMatchObject({ streak: 2, todayPending: false });
    });

    it('TEST-19c-3: logging on the Saturday Rest Day changes nothing', async () => {
      const item = await weekItem(TUE_10);
      await reps(item, '2026-11-06', 40);
      await reps(item, '2026-11-09', 40);
      await reps(item, '2026-11-07', 40);
      expect((await streak()).streak).toBe(2);
    });

    it('TEST-19c-4: an every-day plan makes the weekend targeted: Sunday at 0% stops the walk → 1', async () => {
      const item = await weekItem(TUE_10, [1, 2, 3, 4, 5, 6, 7]);
      await reps(item, '2026-11-06', 40);
      await reps(item, '2026-11-09', 40);
      expect((await streak()).streak).toBe(1);
    });

    it('TEST-19c-5: today is a Saturday Rest Day: 1, not pending, todayPercent null', async () => {
      const item = await weekItem(new Date('2026-11-07T03:00:00.000Z'));
      await reps(item, '2026-11-06', 40);
      expect(await streak()).toMatchObject({ streak: 1, todayPending: false, todayPercent: null });
    });

    it('TEST-19c-6: an item ended on 12 Nov (28 reps, 70%) keeps the streak 4 while later dates are Rest Days', async () => {
      const item = await fixtureS();
      for (const d of ['2026-11-09', '2026-11-10', '2026-11-11']) await reps(item, d, 40);
      await reps(item, TODAY, 28);
      const end = await request(app).put(`/api/plan-items/${item.id}`).set(bearer(await aliceToken())).send({ endDate: TODAY });
      expect(end.status, JSON.stringify(end.body)).toBe(200);
      clock.set(new Date('2026-11-26T03:00:00.000Z'));
      expect(await streak()).toMatchObject({ date: '2026-11-26', streak: 4, todayPending: false, todayPercent: null });
    });

    it('TEST-19c-7: the same item ended without any entry on 12 Nov: that last targeted day is 0% → streak 0', async () => {
      const item = await fixtureS();
      for (const d of ['2026-11-09', '2026-11-10', '2026-11-11']) await reps(item, d, 40);
      const end = await request(app).put(`/api/plan-items/${item.id}`).set(bearer(await aliceToken())).send({ endDate: TODAY });
      expect(end.status).toBe(200);
      clock.set(new Date('2026-11-26T03:00:00.000Z'));
      expect(await streak()).toMatchObject({ streak: 0, todayPending: false });
    });
  });

  describe('AC-19d the current day and midnight', () => {
    const threeClosedDays = async (at: Date = NOW) => {
      const item = await fixtureS(at);
      for (const d of ['2026-11-09', '2026-11-10', '2026-11-11']) await reps(item, d, 40);
      return item;
    };

    it('TEST-19d-1: yesterday streak 3, today 0 reps → 3, pending, todayPercent 0', async () => {
      await threeClosedDays();
      expect(await streak()).toEqual({ date: TODAY, streak: 3, todayPending: true, todayPercent: 0 });
    });

    it('TEST-19d-2: today 27 reps (67.5%) stays 3; one more rep (28, exactly 70%) → 4', async () => {
      const item = await threeClosedDays();
      const row = await reps(item, TODAY, 27);
      expect(await streak()).toMatchObject({ streak: 3, todayPending: true });
      await prisma.ledgerEntry.update({ where: { id: row.id }, data: { totalReps: 28 } });
      expect(await streak()).toMatchObject({ streak: 4, todayPending: false });
    });

    it('TEST-19d-3: 50% today: 3 at 23:59:59, 0 at 00:00:00 (the new day is pending); history shows 11-12 at 50%', async () => {
      const item = await threeClosedDays(new Date('2026-11-12T16:59:59.000Z'));
      await reps(item, TODAY, 20);
      expect(await streak()).toMatchObject({ streak: 3, todayPending: true });
      clock.set(new Date('2026-11-12T17:00:00.000Z'));
      expect(await streak()).toMatchObject({ date: '2026-11-13', streak: 0, todayPending: true, todayPercent: 0 });
      const days = (await history('?from=2026-11-12&to=2026-11-13')).body.days;
      expect(days.map((d: { date: string; overallPercent: number }) => [d.date, d.overallPercent])).toEqual([['2026-11-13', 0], ['2026-11-12', 50]]);
    });

    it('TEST-19d-4: 70% today: 4 at 23:59:59 and still 4 at 00:00:00 (now a closed qualifying day), pending for the new day', async () => {
      const item = await threeClosedDays(new Date('2026-11-12T16:59:59.000Z'));
      await reps(item, TODAY, 28);
      expect(await streak()).toMatchObject({ streak: 4, todayPending: false });
      clock.set(new Date('2026-11-12T17:00:00.000Z'));
      expect(await streak()).toMatchObject({ date: '2026-11-13', streak: 4, todayPending: true });
    });

    it('TEST-19d-5: at 03:00 on 13 Nov Bangkok (12 Nov in UTC) the Bangkok date decides: 11-12 is closed without entries → 0', async () => {
      await threeClosedDays(new Date('2026-11-12T20:00:00.000Z'));
      expect(await streak()).toMatchObject({ date: '2026-11-13', streak: 0 });
    });

    it("TEST-19d-6: editing today's entry down and then deleting it moves today's contribution only (4 → 3, pending)", async () => {
      const item = await threeClosedDays();
      const token = await aliceToken();
      const created = await request(app).post('/api/entries').set(bearer(token)).send({ userExerciseId: item.userExerciseId, sets: 1, totalReps: 28 });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(await streak()).toMatchObject({ streak: 4, todayPending: false });
      const edited = await request(app).put(`/api/entries/${created.body.id}`).set(bearer(token)).send({ sets: 1, totalReps: 20 });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(await streak()).toMatchObject({ streak: 3, todayPending: true });
      expect((await request(app).delete(`/api/entries/${created.body.id}`).set(bearer(token))).status).toBe(204);
      expect(await streak()).toMatchObject({ streak: 3, todayPending: true });
    });
  });
});
