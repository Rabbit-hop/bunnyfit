import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-09 STS §8 (docs/sprints/sprint-3/F-09-schedule-reminders.md): reminder settings (AC-09b) against a
// real PostgreSQL test database. Every reminder row of the seed users is removed after each test (the
// seed inserts none).
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-09 / TEST-09).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describeWithDatabase('F-09 reminder settings API (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  let aliceId: string;
  let bobId: string;
  let userIds: string[];

  const login = async (email: string, password: string): Promise<Record<string, string>> => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return { Authorization: `Bearer ${res.body.token as string}` };
  };
  const alice = () => login('alice@exercise.test', env.seedParticipantPassword);
  const bob = () => login('bob@exercise.test', env.seedParticipantPassword);
  const manager = () => login('manager@exercise.test', env.seedManagerPassword);

  const countAll = () => prisma.reminderSetting.count({ where: { userId: { in: userIds } } });
  const insert = (userId: string, timeOfDay: string, label: string, createdAt?: Date) =>
    prisma.reminderSetting.create({ data: { userId, timeOfDay, label, ...(createdAt ? { createdAt } : {}) } });

  beforeAll(async () => {
    prisma = newPrisma();
    app = buildIntegrationApp(prisma, new MutableClock(new Date('2026-11-26T03:00:00.000Z')));
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })).id;
    bobId = (await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })).id;
    const managerId = (await prisma.user.findUniqueOrThrow({ where: { email: 'manager@exercise.test' } })).id;
    userIds = [aliceId, bobId, managerId];
    await prisma.reminderSetting.deleteMany({ where: { userId: { in: userIds } } });
  });

  afterEach(async () => {
    await prisma.reminderSetting.deleteMany({ where: { userId: { in: userIds } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('TEST-09b-1: POST creates a persisted reminder (bitmask, trimmed label, defaults) and returns no userId', async () => {
    const auth = await alice();
    const first = await request(app)
      .post('/api/reminders')
      .set(auth)
      .send({ timeOfDay: '07:30', label: ' Morning run ', repeatDays: [1, 3, 5] });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      timeOfDay: '07:30',
      repeatDays: [1, 3, 5],
      label: 'Morning run',
      enabled: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(first.body).not.toHaveProperty('userId');

    const second = await request(app).post('/api/reminders').set(auth).send({ timeOfDay: '18:00', label: 'Yoga' });
    expect(second.status).toBe(201);
    expect(second.body.repeatDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(second.body.enabled).toBe(true);

    const rowA = await prisma.reminderSetting.findUniqueOrThrow({ where: { id: first.body.id as string } });
    expect(rowA).toMatchObject({ userId: aliceId, timeOfDay: '07:30', repeatDays: 21, label: 'Morning run', enabled: true });
    const rowB = await prisma.reminderSetting.findUniqueOrThrow({ where: { id: second.body.id as string } });
    expect(rowB).toMatchObject({ userId: aliceId, timeOfDay: '18:00', repeatDays: 127, label: 'Yoga', enabled: true });
  });

  it('TEST-09b-2: GET lists only the caller\'s reminders, ordered by time then creation', async () => {
    const evening = await insert(aliceId, '18:00', 'Evening', new Date('2026-11-20T00:00:00.000Z'));
    const early = await insert(aliceId, '07:30', 'Early', new Date('2026-11-21T00:00:00.000Z'));
    const late = await insert(aliceId, '07:30', 'Later', new Date('2026-11-22T00:00:00.000Z'));
    await insert(bobId, '06:00', 'Bob only');

    const res = await request(app).get('/api/reminders').set(await alice());
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).map((r) => r.id)).toEqual([early.id, late.id, evening.id]);
    for (const r of res.body as Record<string, unknown>[]) expect(r).not.toHaveProperty('userId');
  });

  it('TEST-09b-3: PUT changes only the sent fields, persists them and moves updatedAt', async () => {
    const auth = await alice();
    const created = await request(app)
      .post('/api/reminders')
      .set(auth)
      .send({ timeOfDay: '07:30', label: 'Run', repeatDays: [1, 3, 5] });
    const id = created.body.id as string;
    const before = await prisma.reminderSetting.findUniqueOrThrow({ where: { id } });

    const off = await request(app).put(`/api/reminders/${id}`).set(auth).send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ id, timeOfDay: '07:30', label: 'Run', repeatDays: [1, 3, 5], enabled: false });

    const moved = await request(app)
      .put(`/api/reminders/${id}`)
      .set(auth)
      .send({ timeOfDay: '06:45', repeatDays: [6, 7] });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ id, timeOfDay: '06:45', label: 'Run', repeatDays: [6, 7], enabled: false });

    const after = await prisma.reminderSetting.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({ timeOfDay: '06:45', repeatDays: 96, label: 'Run', enabled: false });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('TEST-09b-4: DELETE removes the row (204, empty body); a second DELETE and a PUT give 404', async () => {
    const auth = await alice();
    const created = await request(app).post('/api/reminders').set(auth).send({ timeOfDay: '07:30', label: 'Run' });
    const id = created.body.id as string;

    const del = await request(app).delete(`/api/reminders/${id}`).set(auth);
    expect(del.status).toBe(204);
    expect(del.text).toBe('');
    expect(await prisma.reminderSetting.findUnique({ where: { id } })).toBeNull();

    const again = await request(app).delete(`/api/reminders/${id}`).set(auth);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('NOT_FOUND');
    const put = await request(app).put(`/api/reminders/${id}`).set(auth).send({ enabled: false });
    expect(put.status).toBe(404);
  });

  it('TEST-09b-5: a malformed timeOfDay is rejected with 400 naming timeOfDay and nothing is stored', async () => {
    const auth = await alice();
    const bad: unknown[] = ['7:30', '24:00', '12:60', '1230', '07:30:00', 730, undefined];
    for (const timeOfDay of bad) {
      const body: Record<string, unknown> = { label: 'Run' };
      if (timeOfDay !== undefined) body['timeOfDay'] = timeOfDay;
      const res = await request(app).post('/api/reminders').set(auth).send(body);
      expect(res.status, `timeOfDay ${String(timeOfDay)}`).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect((res.body.fields as { field: string }[]).map((f) => f.field)).toContain('timeOfDay');
    }
    expect(await countAll()).toBe(0);

    const created = await request(app).post('/api/reminders').set(auth).send({ timeOfDay: '07:30', label: 'Run' });
    const put = await request(app).put(`/api/reminders/${created.body.id as string}`).set(auth).send({ timeOfDay: '25:00' });
    expect(put.status).toBe(400);
    expect((put.body.fields as { field: string }[]).map((f) => f.field)).toContain('timeOfDay');
    expect((await prisma.reminderSetting.findUniqueOrThrow({ where: { id: created.body.id as string } })).timeOfDay).toBe('07:30');
  });

  it('TEST-09b-6: invalid repeatDays, label, enabled, unknown fields and an empty PUT are rejected; nothing changes', async () => {
    const auth = await alice();
    const valid = { timeOfDay: '07:30', label: 'Run' };
    const cases: [Record<string, unknown>, string][] = [
      [{ ...valid, repeatDays: [] }, 'repeatDays'],
      [{ ...valid, repeatDays: [0] }, 'repeatDays'],
      [{ ...valid, repeatDays: [8] }, 'repeatDays'],
      [{ ...valid, repeatDays: [1, 1] }, 'repeatDays'],
      [{ ...valid, repeatDays: 'Mon' }, 'repeatDays'],
      [{ ...valid, repeatDays: 127 }, 'repeatDays'],
      [{ ...valid, label: '' }, 'label'],
      [{ ...valid, label: '   ' }, 'label'],
      [{ ...valid, label: 'x'.repeat(41) }, 'label'],
      [{ ...valid, label: 5 }, 'label'],
      [{ timeOfDay: '07:30' }, 'label'],
      [{ ...valid, enabled: 'true' }, 'enabled'],
      [{ ...valid, enabled: 1 }, 'enabled'],
      [{ ...valid, enabled: null }, 'enabled'],
      [{ ...valid, userId: bobId }, 'userId'],
      [{ ...valid, id: UNKNOWN_ID }, 'id'],
    ];
    for (const [body, field] of cases) {
      const res = await request(app).post('/api/reminders').set(auth).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect((res.body.fields as { field: string }[]).map((f) => f.field), JSON.stringify(body)).toContain(field);
    }
    expect(await countAll()).toBe(0);

    const okLabel = await request(app).post('/api/reminders').set(auth).send({ ...valid, label: 'x'.repeat(40) });
    expect(okLabel.status).toBe(201);
    const id = okLabel.body.id as string;
    const before = await prisma.reminderSetting.findUniqueOrThrow({ where: { id } });
    for (const body of [{}, { label: '' }, { enabled: 'no' }, { repeatDays: [9] }, { createdAt: '2026-01-01' }]) {
      const res = await request(app).put(`/api/reminders/${id}`).set(auth).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.reminderSetting.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });

  it('TEST-09b-7: another Participant cannot read, change or delete a reminder (403, row unchanged); unknown 404, malformed 400', async () => {
    const bobs = await insert(bobId, '06:00', 'Bob run');
    const auth = await alice();

    const put = await request(app).put(`/api/reminders/${bobs.id}`).set(auth).send({ enabled: false });
    expect(put.status).toBe(403);
    expect(put.body.code).toBe('FORBIDDEN');
    const del = await request(app).delete(`/api/reminders/${bobs.id}`).set(auth);
    expect(del.status).toBe(403);
    expect(await prisma.reminderSetting.findUniqueOrThrow({ where: { id: bobs.id } })).toEqual(bobs);

    const list = await request(app).get(`/api/reminders?userId=${bobId}`).set(auth);
    expect(list.status).toBe(403);
    expect(JSON.stringify(list.body)).not.toContain('Bob run');

    const ownList = await request(app).get('/api/reminders').set(auth);
    expect(ownList.status).toBe(200);
    expect(ownList.body).toEqual([]);

    expect((await request(app).put(`/api/reminders/${UNKNOWN_ID}`).set(auth).send({ enabled: false })).status).toBe(404);
    expect((await request(app).delete(`/api/reminders/${UNKNOWN_ID}`).set(auth)).status).toBe(404);
    const malformed = await request(app).delete('/api/reminders/abc').set(auth);
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe('VALIDATION_ERROR');

    // Bob still sees and owns his reminder.
    const bobList = await request(app).get('/api/reminders').set(await bob());
    expect((bobList.body as { id: string }[]).map((r) => r.id)).toEqual([bobs.id]);
  });

  it('TEST-09b-8: Manager gets 403 and no token gets 401 on every reminder route; nothing is stored', async () => {
    const own = await insert(aliceId, '07:30', 'Run');
    const mgr = await manager();
    const routes: [string, string, Record<string, unknown> | undefined][] = [
      ['get', '/api/reminders', undefined],
      ['post', '/api/reminders', { timeOfDay: '99:99' }],
      ['put', `/api/reminders/${own.id}`, { timeOfDay: '99:99' }],
      ['delete', `/api/reminders/${own.id}`, undefined],
      ['put', `/api/reminders/${UNKNOWN_ID}`, {}],
    ];
    for (const [method, path, body] of routes) {
      const call = (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path);
      const res = await call.set(mgr).send(body);
      expect(res.status, `${method} ${path}`).toBe(403);
      const anon = (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path);
      expect((await anon.send(body)).status, `${method} ${path} anonymous`).toBe(401);
    }
    expect(await countAll()).toBe(1);
    expect(await prisma.reminderSetting.findUniqueOrThrow({ where: { id: own.id } })).toEqual(own);
  });
});
