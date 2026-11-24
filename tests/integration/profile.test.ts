import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-04 STS §8 (docs/sprints/sprint-1/F-04-daily-logging.md), the Profile cases deferred to Sprint 2
// (CHANGE-04, issue #71 Part 1): TEST-17a-1, 17a-2, 17b-1, 17b-2, 17b-4, 17c-1, 17d-1 against a real
// PostgreSQL test database. Extras (NOT STS rows): 401 without a token, the response shape of PUT, and
// "the rejected PUT of TEST-17c-1 appends no row" is checked per value (the STS row says it once).
//
// Deviation from the STS text: it says Alice has one seed row of 70.0 kg; the seed (prisma/seed.ts) inserts
// four rows for Alice (71.2, 71.0, 70.8, 70.5 kg on 1 to 4 Nov 2026). The expected "current weight" is
// therefore read from the database (latest row by effectiveDate, then createdAt), not hard-coded.
//
// The Clock is the real current time: the seed rows are dated 1 to 4 Nov 2026, so a PUT dated "today" must
// be later than them for "current weight" to change. Rows added by a test are removed again afterwards.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-17 / TEST-17).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('F-04 profile and body weight API (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  let clock: MutableClock;
  let aliceId: string;
  let bobId: string;
  let managerId: string;
  /** Rows that existed before the suite; everything else of these users is removed after each test. */
  const keep = new Set<string>();

  const login = async (email: string, password: string): Promise<Record<string, string>> => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return { Authorization: `Bearer ${res.body.token as string}` };
  };
  const alice = () => login('alice@exercise.test', env.seedParticipantPassword);
  const bob = () => login('bob@exercise.test', env.seedParticipantPassword);
  const manager = () => login('manager@exercise.test', env.seedManagerPassword);

  const rowsOf = (userId: string) =>
    prisma.weightLog.findMany({ where: { userId }, orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }] });

  const latestOf = async (userId: string) => {
    const rows = await rowsOf(userId);
    const last = rows[rows.length - 1];
    return last ? { kg: Number(last.weightKg), date: last.effectiveDate.toISOString().slice(0, 10) } : null;
  };

  beforeAll(async () => {
    prisma = newPrisma();
    clock = new MutableClock(new Date());
    app = buildIntegrationApp(prisma, clock);
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })).id;
    bobId = (await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })).id;
    managerId = (await prisma.user.findUniqueOrThrow({ where: { email: 'manager@exercise.test' } })).id;
    for (const row of await prisma.weightLog.findMany({ where: { userId: { in: [aliceId, bobId, managerId] } } })) {
      keep.add(row.id);
    }
  });

  afterEach(async () => {
    await prisma.weightLog.deleteMany({
      where: { userId: { in: [aliceId, bobId, managerId] }, id: { notIn: [...keep] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('TEST-17a-1: Alice GET /api/profile returns her email, display name, current weight and its date', async () => {
    const expected = await latestOf(aliceId);
    expect(expected).not.toBeNull();
    const res = await request(app).get('/api/profile').set(await alice());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      email: 'alice@exercise.test',
      displayName: expect.any(String),
      currentWeightKg: expected?.kg,
      weightEffectiveDate: expected?.date,
    });
    expect((res.body.displayName as string).length).toBeGreaterThan(0);
  });

  it('TEST-17a-2: Bob (no WeightLog) GET /api/profile returns currentWeightKg null', async () => {
    expect(await rowsOf(bobId)).toHaveLength(0);
    const res = await request(app).get('/api/profile').set(await bob());
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('bob@exercise.test');
    expect(res.body.currentWeightKg).toBeNull();
    expect(res.body.weightEffectiveDate).toBeNull();
  });

  it('TEST-17b-1: PUT {weightKg: 68.5} returns it as current and appends one row dated today, earlier rows unchanged', async () => {
    const before = await rowsOf(aliceId);
    const res = await request(app).put('/api/profile').set(await alice()).send({ weightKg: 68.5 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      email: 'alice@exercise.test',
      displayName: expect.any(String),
      currentWeightKg: 68.5,
      weightEffectiveDate: clock.today(),
    });
    const after = await rowsOf(aliceId);
    expect(after).toHaveLength(before.length + 1);
    // Earlier rows are identical (no update), the new one is dated today.
    expect(after.slice(0, before.length)).toEqual(before);
    const added = after[after.length - 1];
    expect(Number(added?.weightKg)).toBe(68.5);
    expect(added?.effectiveDate.toISOString().slice(0, 10)).toBe(clock.today());
    // GET agrees with the PUT response.
    const get = await request(app).get('/api/profile').set(await alice());
    expect(get.body.currentWeightKg).toBe(68.5);
  });

  it('TEST-17b-2: two PUTs the same day (68.5 then 69.0) append two rows; current weight is 69.0; earlier rows unchanged', async () => {
    const before = await rowsOf(aliceId);
    const auth = await alice();
    expect((await request(app).put('/api/profile').set(auth).send({ weightKg: 68.5 })).status).toBe(200);
    const second = await request(app).put('/api/profile').set(auth).send({ weightKg: 69.0 });
    expect(second.status).toBe(200);
    expect(second.body.currentWeightKg).toBe(69);
    const after = await rowsOf(aliceId);
    expect(after).toHaveLength(before.length + 2);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length).map((r) => Number(r.weightKg))).toEqual([68.5, 69]);
    expect((await request(app).get('/api/profile').set(auth)).body.currentWeightKg).toBe(69);
  });

  it('TEST-17b-4: PATCH, DELETE and PUT /api/profile/weights/:id do not exist (404 NOT_FOUND) and rows stay unchanged', async () => {
    const auth = await alice();
    await request(app).put('/api/profile').set(auth).send({ weightKg: 68.5 });
    const before = await rowsOf(aliceId);
    const id = before[before.length - 1]?.id as string;
    for (const [method, path, body] of [
      ['patch', '/api/profile', { weightKg: 60 }],
      ['delete', '/api/profile', undefined],
      ['put', `/api/profile/weights/${id}`, { weightKg: 60 }],
      ['patch', `/api/profile/weights/${id}`, { weightKg: 60 }],
      ['delete', `/api/profile/weights/${id}`, undefined],
    ] as const) {
      const res = await (request(app)[method](path) as request.Test).set(auth).send(body);
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
    expect(await rowsOf(aliceId)).toEqual(before);
  });

  it('TEST-17c-1: weightKg 1 and 800 are accepted; 0.9, 800.1, 0, -5, 70.55, "abc" and a missing value are 400 and append no row', async () => {
    const auth = await alice();
    const base = (await rowsOf(aliceId)).length;
    let accepted = 0;
    for (const weightKg of [1, 800]) {
      const res = await request(app).put('/api/profile').set(auth).send({ weightKg });
      expect(res.status, `weightKg ${weightKg}`).toBe(200);
      expect(res.body.currentWeightKg).toBe(weightKg);
      accepted += 1;
      expect(await rowsOf(aliceId)).toHaveLength(base + accepted);
    }
    const bodies: Array<[string, Record<string, unknown>]> = [
      ['0.9', { weightKg: 0.9 }],
      ['800.1', { weightKg: 800.1 }],
      ['0', { weightKg: 0 }],
      ['-5', { weightKg: -5 }],
      ['70.55', { weightKg: 70.55 }],
      ['"abc"', { weightKg: 'abc' }],
      ['missing', {}],
    ];
    for (const [label, body] of bodies) {
      const res = await request(app).put('/api/profile').set(auth).send(body);
      expect(res.status, `weightKg ${label}`).toBe(400);
      expect(res.body.code, `weightKg ${label}`).toBe('VALIDATION_ERROR');
      expect(res.body.fields, `weightKg ${label}`).toEqual([
        { field: 'weightKg', limit: expect.stringContaining('1-800') },
      ]);
      expect(await rowsOf(aliceId), `weightKg ${label}`).toHaveLength(base + accepted);
    }
  });

  it('TEST-17d-1: a Manager gets 403 on GET and PUT /api/profile with no profile data in the body, and no row is appended', async () => {
    const auth = await manager();
    const before = await prisma.weightLog.count();
    for (const res of [
      await request(app).get('/api/profile').set(auth),
      await request(app).put('/api/profile').set(auth).send({ weightKg: 70 }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(JSON.stringify(res.body)).not.toMatch(/currentWeightKg|weightEffectiveDate|alice@|bob@/);
    }
    expect(await prisma.weightLog.count()).toBe(before);
  });

  it('extra: GET and PUT /api/profile without a token are 401', async () => {
    expect((await request(app).get('/api/profile')).status).toBe(401);
    expect((await request(app).put('/api/profile').send({ weightKg: 70 })).status).toBe(401);
  });
});
