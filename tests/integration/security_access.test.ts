import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { createAuthorize } from '../../server/middleware/authorize.js';
import { activePolicies, type RoutePolicy } from '../../server/routes/registry.js';
import { routesMissingPolicy } from '../helpers/expressRoutes.js';
import { createHistoricalPlanItem } from '../helpers/historicalPlan.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma, TEST_SECRET } from '../helpers/integrationApp.js';

// F-01 STS §8, stage 1: TEST-22a–c and TEST-12a–c against the real test database,
// using the F-01 routes and the test-only probe routes. Stage-2 cases (every
// Sprint 1 route in the registry: TEST-12a-2, TEST-12b-4, and the stage-2 scope of
// 22c-1 / 12c-1) need F-02–F-06 routes and are NOT covered here. The last describe block covers the
// five F-03 routes only (F-03 STS TEST-22c / 12a / 12b / 12c, issue #4); the aggregate result is issue #18.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-12 / AC-22).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const T = new Date();
const PARTICIPANT_PW = env.seedParticipantPassword;
const MANAGER_PW = env.seedManagerPassword;
const bearer = (t: string) => `Bearer ${t}`;
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

describeWithDatabase('F-01 security and access control (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let clock: MutableClock;
  let app: ReturnType<typeof buildIntegrationApp>;
  let aliceId: string;
  let bobId: string;

  const login = async (email: string, password: string) =>
    (await request(app).post('/api/auth/login').send({ email, password })).body.token as string;
  const alice = () => login('alice@exercise.test', PARTICIPANT_PW);
  const manager = () => login('manager@exercise.test', MANAGER_PW);
  const dbCounts = async () => ({ users: await prisma.user.count(), revoked: await prisma.revokedToken.count() });
  const sign = (secret: string, alg: string, claims: Record<string, unknown> = {}) =>
    new SignJWT({ role: 'PARTICIPANT', ...claims })
      .setProtectedHeader({ alg })
      .setSubject((claims['sub'] as string | undefined) ?? aliceId)
      .setJti(randomUUID())
      .setIssuedAt(Math.floor(T.getTime() / 1000))
      .setExpirationTime(Math.floor(T.getTime() / 1000) + 3600)
      .sign(new TextEncoder().encode(secret));

  beforeAll(async () => {
    if (!PARTICIPANT_PW || !MANAGER_PW) throw new Error('SEED_MANAGER_PASSWORD / SEED_PARTICIPANT_PASSWORD must be set');
    prisma = newPrisma();
    clock = new MutableClock(T);
    app = buildIntegrationApp(prisma, clock);
    aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })).id;
    bobId = (await prisma.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('AC-22a authentication failures → 401', () => {
    const me = (header?: string) => {
      const r = request(app).get('/api/auth/me');
      return header === undefined ? r : r.set('Authorization', header);
    };
    const expectEnvelope401 = (res: request.Response) => {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', message: expect.any(String), fields: [] });
    };

    it('TEST-22a-1/2/3/4/9: no header, malformed headers, wrong secret, alg:none, HS512 → 401 envelope only, no database writes', async () => {
      const before = await dbCounts();
      const noneToken = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
        sub: aliceId,
        role: 'MANAGER',
        jti: randomUUID(),
        iat: Math.floor(T.getTime() / 1000),
        exp: Math.floor(T.getTime() / 1000) + 3600,
      })}.`;
      const headers = [
        undefined,
        'Basic abc',
        'Bearer ',
        'Bearer',
        'Bearer a.b',
        bearer(await sign('another-secret-0123456789abcdefghij', 'HS256')),
        bearer(noneToken),
        bearer(await sign(TEST_SECRET, 'HS512')),
      ];
      for (const h of headers) expectEnvelope401(await me(h));
      expect(await dbCounts()).toEqual(before);
    });

    it('TEST-22a-5/6: token valid at T+3599 s, expired at T+3600 s (R3)', async () => {
      const token = await alice();
      clock.set(new Date(T.getTime() + 3599_000));
      try {
        expect((await me(bearer(token))).status).toBe(200);
        clock.set(new Date(T.getTime() + 3600_000));
        expectEnvelope401(await me(bearer(token)));
      } finally {
        clock.set(T);
      }
    });

    it('TEST-22a-7: a token revoked by logout → 401', async () => {
      const token = await alice();
      await request(app).post('/api/auth/logout').set('Authorization', bearer(token));
      expectEnvelope401(await me(bearer(token)));
    });

    it('TEST-22a-8: a valid token whose user was deleted → 401, not 500', async () => {
      const email = `deleted-${randomUUID()}@exercise.test`;
      await prisma.user.create({
        data: { email, passwordHash: bcrypt.hashSync('temp-password-1', 4), role: 'PARTICIPANT', displayName: 'Temp' },
      });
      const token = await login(email, 'temp-password-1');
      expect(token).toBeTruthy();
      await prisma.user.delete({ where: { email } });
      expectEnvelope401(await me(bearer(token)));
    });

    it('TEST-22a-8 (probe route): the user check is in the middleware — a deleted user is 401 on a route that never loads the user', async () => {
      const email = `deleted-probe-${randomUUID()}@exercise.test`;
      await prisma.user.create({
        data: { email, passwordHash: bcrypt.hashSync('temp-password-1', 4), role: 'PARTICIPANT', displayName: 'Temp' },
      });
      const token = await login(email, 'temp-password-1');
      expect((await request(app).get('/__test/participant-only').set('Authorization', bearer(token))).status).toBe(200);
      await prisma.user.delete({ where: { email } });
      expectEnvelope401(await request(app).get('/__test/participant-only').set('Authorization', bearer(token)));
    });
  });

  describe('AC-22b wrong role → 403', () => {
    it('TEST-22b-1: Alice → manager-only probe = 403 FORBIDDEN, envelope only', async () => {
      const res = await request(app).get('/__test/manager-only').set('Authorization', bearer(await alice()));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN', message: expect.any(String), fields: [] });
    });

    it('TEST-22b-2: Manager → participant-only probe = 403 FORBIDDEN, no data', async () => {
      const res = await request(app).get('/__test/participant-only').set('Authorization', bearer(await manager()));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN', message: expect.any(String), fields: [] });
    });
  });

  describe('AC-22c endpoint access matrix (stage 1: F-01 routes and probes)', () => {
    const policies = activePolicies('test');
    const concretePath = (p: RoutePolicy) => p.path.replace(/:[A-Za-z]+/g, randomUUID());
    const nonPublic = policies.filter((p) => p.auth !== 'public');

    it('TEST-22c-1: every non-public route → 401 without a token, 403 for a role not in its roles', async () => {
      expect(nonPublic.length).toBeGreaterThan(0);
      const tokens = { MANAGER: await manager(), PARTICIPANT: await alice() };
      for (const p of nonPublic) {
        const call = (token?: string) => {
          const r = request(app)[p.method.toLowerCase() as 'get'](concretePath(p));
          return token ? r.set('Authorization', bearer(token)) : r;
        };
        expect((await call()).status, `${p.method} ${p.path} without token`).toBe(401);
        for (const role of ['MANAGER', 'PARTICIPANT'] as const) {
          if (!p.roles.includes(role)) {
            expect((await call(tokens[role])).status, `${p.method} ${p.path} as ${role}`).toBe(403);
          }
        }
      }
    });

    it('TEST-22c-2: no registered route is missing from the registry, and a stray route is detected', () => {
      expect(routesMissingPolicy(app, policies)).toEqual([]);
      const strayApp = buildIntegrationApp(prisma, clock);
      strayApp.get('/api/stray-unregistered', (_req, res) => res.json({}));
      expect(routesMissingPolicy(strayApp, policies)).toContain('GET /api/stray-unregistered');
    });
  });

  describe('AC-12a Manager vs Participant data → 403', () => {
    it('TEST-12a-1: Manager token on the participant-only probe → 403 with no data', async () => {
      const res = await request(app).get('/__test/participant-only').set('Authorization', bearer(await manager()));
      expect(res.status).toBe(403);
      expect(res.body.userId).toBeUndefined();
      expect(res.body.ok).toBeUndefined();
    });
  });

  describe('AC-12b / AC-12c ownership', () => {
    // Probe resource id = a User id; its owner is that user (see tests/helpers/integrationApp.ts).
    it('TEST-12b-1 / 12c-1: Alice on Bob\'s resource → 403 for GET, PUT, DELETE; Bob\'s row unchanged', async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: bobId } });
      const token = bearer(await alice());
      for (const method of ['get', 'put', 'delete'] as const) {
        const res = await request(app)[method](`/__test/owned/${bobId}`).set('Authorization', token);
        expect(res.status, method).toBe(403);
        expect(res.body.ok).toBeUndefined();
      }
      expect(await prisma.user.findUniqueOrThrow({ where: { id: bobId } })).toEqual(before);
    });

    it('TEST-12b-2: Bob on his own resource → 200 (control)', async () => {
      const token = await login('bob@exercise.test', PARTICIPANT_PW);
      const res = await request(app).get(`/__test/owned/${bobId}`).set('Authorization', bearer(token));
      expect(res.status).toBe(200);
    });

    it('TEST-12b-3: a non-existent id → 404 NOT_FOUND', async () => {
      const res = await request(app).get(`/__test/owned/${randomUUID()}`).set('Authorization', bearer(await alice()));
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('TEST-12c-2 (R11): a resource-owner route without an owner lookup cannot be registered', () => {
      const ownerPolicy = activePolicies('test').find((p) => p.ownership === 'resource-owner');
      expect(ownerPolicy).toBeDefined();
      expect(() => createAuthorize(ownerPolicy as RoutePolicy)).toThrow(/owner lookup/);
    });
  });
  describe('F-03 routes: AC-22c / AC-12a / AC-12b / AC-12c (issue #4; aggregate stage 2 is issue #18)', () => {
    const F03_ROUTES: Array<[string, string]> = [
      ['POST', '/api/plan-items'],
      ['GET', '/api/plan-items'],
      ['GET', '/api/plan-items/:id'],
      ['GET', '/api/user-exercises'],
      ['GET', '/api/plan'],
    ];
    let bobItemId: string;
    let aliceItemId: string;
    const createdItems: string[] = [];
    const tokenOf = (email: string) => login(email, PARTICIPANT_PW);
    const planSnapshot = async () => ({
      exercises: await prisma.userExercise.findMany({ orderBy: { id: 'asc' } }),
      items: await prisma.planItem.findMany({ orderBy: { id: 'asc' } }),
    });
    const validBody = {
      source: 'TEMPLATE',
      templateId: '00000000-0000-4000-8000-000000000000',
      priorityWeight: 3,
      targetSets: 3,
      targetRepsPerSet: 10,
      loadKg: 20,
    };

    beforeAll(async () => {
      const bob = await createHistoricalPlanItem(prisma, { userId: bobId, effectiveFrom: '2026-11-01' });
      const al = await createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-11-01' });
      bobItemId = bob.id;
      aliceItemId = al.id;
      createdItems.push(bob.id, al.id);
    });

    afterAll(async () => {
      await prisma.planItem.deleteMany({ where: { id: { in: createdItems } } });
      await prisma.userExercise.deleteMany({ where: { userId: { in: [aliceId, bobId] }, sourceTemplateId: { not: null } } });
    });

    it('TEST-22c (F-03 routes): the registry holds the five routes as F-03 / PARTICIPANT, resource-owner only on :id', () => {
      const policies = activePolicies('test');
      for (const [method, path] of F03_ROUTES) {
        const p = policies.find((x) => x.method === method && x.path === path);
        expect(p, `${method} ${path} in the registry`).toBeDefined();
        expect(p?.featureId).toBe('F-03');
        expect(p?.auth).toBe('required');
        expect(p?.roles).toEqual(['PARTICIPANT']);
        expect(p?.ownership, `${method} ${path}`).toBe(path === '/api/plan-items/:id' ? 'resource-owner' : 'self-scoped');
      }
      expect(policies.filter((x) => x.featureId === 'F-03')).toHaveLength(5);
    });

    it('TEST-22c (F-03 routes): no token → 401 on each route', async () => {
      const before = await planSnapshot();
      for (const [method, path] of F03_ROUTES) {
        const url = path.replace(':id', bobItemId);
        const res = await request(app)[method.toLowerCase() as 'get' | 'post'](url).send(method === 'POST' ? validBody : undefined);
        expect(res.status, `${method} ${path}`).toBe(401);
        expect(res.body.code).toBe('UNAUTHENTICATED');
      }
      expect(await planSnapshot()).toEqual(before);
    });

    it('TEST-12a (F-03 routes): Manager → 403 on each route, envelope only, even with an invalid body; nothing stored', async () => {
      const token = bearer(await manager());
      const before = await planSnapshot();
      for (const [method, path] of F03_ROUTES) {
        const url = path.replace(':id', bobItemId);
        const req = request(app)[method.toLowerCase() as 'get' | 'post'](url).set('Authorization', token);
        const res = await (method === 'POST' ? req.send({ garbage: true }) : req);
        expect(res.status, `${method} ${path}`).toBe(403);
        expect(res.body).toEqual({ code: 'FORBIDDEN', message: expect.any(String), fields: [] });
        expect(JSON.stringify(res.body)).not.toContain(bobItemId);
      }
      expect(await planSnapshot()).toEqual(before);
    });

    it("TEST-12b (F-03 routes): Alice on Bob's plan item → 403; Bob's own request → 200; unknown id → 404; malformed id → 400", async () => {
      const aliceToken = bearer(await alice());
      const forbidden = await request(app).get(`/api/plan-items/${bobItemId}`).set('Authorization', aliceToken);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual({ code: 'FORBIDDEN', message: expect.any(String), fields: [] });

      const own = await request(app).get(`/api/plan-items/${bobItemId}`).set('Authorization', bearer(await tokenOf('bob@exercise.test')));
      expect(own.status).toBe(200);
      expect(own.body.planItem.id).toBe(bobItemId);

      const missing = await request(app).get(`/api/plan-items/${randomUUID()}`).set('Authorization', aliceToken);
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('NOT_FOUND');

      const malformed = await request(app).get('/api/plan-items/not-a-uuid').set('Authorization', aliceToken);
      expect(malformed.status).toBe(400);
      expect(malformed.body.code).toBe('VALIDATION_ERROR');
    });

    it("TEST-12c (F-03 routes): Alice's ?userId=<Bob> → 403 on the three list routes; ?userId=<Alice> and Bob's own → 200; Bob's data unchanged", async () => {
      const aliceToken = bearer(await alice());
      const bobToken = bearer(await tokenOf('bob@exercise.test'));
      const before = await planSnapshot();
      for (const path of ['/api/plan-items', '/api/user-exercises', '/api/plan']) {
        const foreign = await request(app).get(`${path}?userId=${bobId}`).set('Authorization', aliceToken);
        expect(foreign.status, `${path} ?userId=<Bob> as Alice`).toBe(403);
        expect(JSON.stringify(foreign.body)).not.toContain(bobItemId);
        expect((await request(app).get(`${path}?userId=${aliceId}`).set('Authorization', aliceToken)).status, `${path} ?userId=<Alice>`).toBe(200);
        expect((await request(app).get(`${path}?userId=${bobId}`).set('Authorization', bobToken)).status, `${path} Bob own`).toBe(200);
      }
      expect(await planSnapshot()).toEqual(before);
    });

    it('TEST-12c (F-03 routes): Alice lists only her own rows, never Bob\'s', async () => {
      const res = await request(app).get('/api/plan-items').set('Authorization', bearer(await alice()));
      expect(res.status).toBe(200);
      const ids = res.body.map((i: { planItem: { id: string } }) => i.planItem.id);
      expect(ids).toContain(aliceItemId);
      expect(ids).not.toContain(bobItemId);
    });

    it('TEST-12c (F-03 routes): POST with userId in the body → 400 naming userId; nothing stored', async () => {
      const template = await prisma.exerciseTemplate.findFirstOrThrow({ where: { name: 'Barbell Squat' } });
      const before = await planSnapshot();
      const res = await request(app)
        .post('/api/plan-items')
        .set('Authorization', bearer(await alice()))
        .send({ ...validBody, templateId: template.id, userId: bobId });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields.map((f: { field: string }) => f.field)).toContain('userId');
      expect(await planSnapshot()).toEqual(before);
    });
  });

  // Issue #18, stage 2: the F-02, F-04 and F-06 routes, and the aggregate over every real
  // (non-probe) route of the registry. A route added later without a case here fails the
  // "every route has a case" assertions below.
  describe('Stage 2 (issue #18): F-02 / F-04 / F-06 routes and the aggregate over the real registry', () => {
    const realPolicies = () => activePolicies('test').filter((p) => !p.path.startsWith('/__test'));
    const bearerOf = async (email: string) => bearer(await login(email, PARTICIPANT_PW));
    const today = () => clock.today();
    const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

    let aliceExerciseId: string;
    let bobExerciseId: string;
    let bobEntryId: string;
    let bobItemId: string;
    let aliceItemId: string;
    let templateId: string;
    let categoryId: string;

    const call = (method: string, url: string, token?: string) => {
      const r = request(app)[method.toLowerCase() as 'get'](url);
      return token ? r.set('Authorization', token) : r;
    };
    const snapshot = async () => ({
      entries: await prisma.ledgerEntry.findMany({ orderBy: { id: 'asc' } }),
      exercises: await prisma.userExercise.findMany({ orderBy: { id: 'asc' } }),
      items: await prisma.planItem.findMany({ orderBy: { id: 'asc' } }),
      categories: await prisma.category.findMany({ orderBy: { id: 'asc' } }),
      templates: await prisma.exerciseTemplate.findMany({ orderBy: { id: 'asc' } }),
    });
    const FORBIDDEN = { code: 'FORBIDDEN', message: expect.any(String), fields: [] };

    beforeAll(async () => {
      const bobItem = await createHistoricalPlanItem(prisma, { userId: bobId, effectiveFrom: '2026-11-01' });
      const aliceItem = await createHistoricalPlanItem(prisma, { userId: aliceId, effectiveFrom: '2026-11-01' });
      bobItemId = bobItem.id;
      aliceItemId = aliceItem.id;
      bobExerciseId = bobItem.userExerciseId;
      aliceExerciseId = aliceItem.userExerciseId;
      const entry = await prisma.ledgerEntry.create({
        data: { userId: bobId, userExerciseId: bobExerciseId, logDate: day(today()), sets: 1, totalReps: 10, kind: 'MANUAL' },
      });
      bobEntryId = entry.id;
      templateId = (await prisma.exerciseTemplate.findFirstOrThrow()).id;
      categoryId = (await prisma.category.findFirstOrThrow()).id;
    });

    afterAll(async () => {
      await prisma.ledgerEntry.deleteMany({ where: { userExerciseId: { in: [aliceExerciseId, bobExerciseId] } } });
      await prisma.planItem.deleteMany({ where: { id: { in: [aliceItemId, bobItemId] } } });
      await prisma.userExercise.deleteMany({ where: { id: { in: [aliceExerciseId, bobExerciseId] } } });
    });

    it('TEST-22c (aggregate): the real routes belong to SYS-01 / F-01 / F-02 / F-03 / F-04 / F-06 only (a new feature must get a stage 2 case)', () => {
      const features = new Set(realPolicies().map((p) => p.featureId));
      expect([...features].sort()).toEqual(['F-01', 'F-02', 'F-03', 'F-04', 'F-06', 'SYS-01']);
    });

    it('TEST-12a-2: Manager → 403 on every PARTICIPANT-only route of the registry, even with an invalid body or query; envelope only, nothing stored', async () => {
      const routes = realPolicies().filter((p) => p.roles.length === 1 && p.roles[0] === 'PARTICIPANT');
      expect(routes.map((p) => p.featureId).sort()).toEqual([
        ...Array(4).fill('F-04'),
        ...Array(5).fill('F-03'),
        'F-06',
      ].sort());
      const token = await manager();
      const before = await snapshot();
      for (const p of routes) {
        const url = p.path.replace(/:[A-Za-z]+/g, bobEntryId) + (p.method === 'GET' ? '?date=garbage&userId=not-a-uuid' : '');
        const r = call(p.method, url, bearer(token));
        const res = await (p.method === 'GET' ? r : r.send({ garbage: true, userId: bobId }));
        expect(res.status, `${p.method} ${p.path}`).toBe(403);
        expect(res.body, `${p.method} ${p.path}`).toEqual(FORBIDDEN);
      }
      expect(await snapshot()).toEqual(before);
    });

    it('TEST-12b-4: Alice with a foreign ?userId=<Bob> → 403 on every self-scoped route (any method); own ?userId is not rejected; nothing stored, no Bob data in the body', async () => {
      const routes = realPolicies().filter((p) => p.ownership === 'self-scoped' && p.roles.includes('PARTICIPANT'));
      expect(routes.map((p) => p.featureId).sort()).toEqual(['F-03', 'F-03', 'F-03', 'F-03', 'F-04', 'F-04', 'F-04', 'F-06']);
      const aliceToken = await bearerOf('alice@exercise.test');
      const before = await snapshot();
      for (const p of routes) {
        const url = `${p.path}?userId=${bobId}`;
        const r = call(p.method, url, aliceToken);
        const res = await (p.method === 'GET' ? r : r.send({ userExerciseId: bobExerciseId }));
        expect(res.status, `${p.method} ${p.path} ?userId=<Bob>`).toBe(403);
        expect(res.body).toEqual(FORBIDDEN);
        const own = await call(p.method, `${p.path}?userId=${aliceId}`, aliceToken).send(p.method === 'GET' ? undefined : { garbage: true });
        expect(own.status, `${p.method} ${p.path} ?userId=<Alice> is authorized`).not.toBe(403);
        expect(own.status, `${p.method} ${p.path} ?userId=<Alice> is authorized`).not.toBe(401);
      }
      expect(await snapshot()).toEqual(before);
    });

    it('TEST-12c (aggregate): every real resource-owner route has a case; Alice on Bob\'s record → 403, Bob → 200, unknown id → 404', async () => {
      const ids: Record<string, string> = { '/api/plan-items/:id': bobItemId, '/api/entries/:id': bobEntryId };
      const routes = realPolicies().filter((p) => p.ownership === 'resource-owner');
      expect(routes.map((p) => p.path).sort()).toEqual(Object.keys(ids).sort());
      const aliceToken = await bearerOf('alice@exercise.test');
      const bobToken = await bearerOf('bob@exercise.test');
      const before = await snapshot();
      for (const p of routes) {
        const id = ids[p.path];
        expect(id, `${p.method} ${p.path} has a stage 2 case`).toBeDefined();
        const url = (value: string) => p.path.replace(':id', value);
        const foreign = await call(p.method, url(id!), aliceToken);
        expect(foreign.status, `${p.method} ${p.path} as Alice`).toBe(403);
        expect(foreign.body).toEqual(FORBIDDEN);
        expect(JSON.stringify(foreign.body)).not.toContain(id!);
        expect((await call(p.method, url(id!), bobToken)).status, `${p.method} ${p.path} as Bob`).toBe(200);
        const missing = await call(p.method, url(randomUUID()), aliceToken);
        expect(missing.status, `${p.method} ${p.path} unknown id`).toBe(404);
        expect(missing.body.code).toBe('NOT_FOUND');
      }
      expect(await snapshot()).toEqual(before);
    });

    describe('F-02 routes (shared catalog; no owner-scoped route)', () => {
      const WRITES: Array<[string, string]> = [
        ['POST', '/api/categories'],
        ['PUT', '/api/categories/:id'],
        ['DELETE', '/api/categories/:id'],
        ['POST', '/api/templates'],
        ['PUT', '/api/templates/:id'],
        ['DELETE', '/api/templates/:id'],
      ];

      it('TEST-22c / TEST-12c (F-02 routes): the registry holds 9 routes, all ownership none; 3 reads for both roles, 6 writes MANAGER only', () => {
        const f02 = activePolicies('test').filter((p) => p.featureId === 'F-02');
        expect(f02).toHaveLength(9);
        expect(f02.every((p) => p.ownership === 'none' && p.auth === 'required')).toBe(true);
        for (const p of f02) {
          const isWrite = WRITES.some(([m, path]) => m === p.method && path === p.path);
          expect(p.roles, `${p.method} ${p.path}`).toEqual(isWrite ? ['MANAGER'] : ['MANAGER', 'PARTICIPANT']);
        }
      });

      it('TEST-22c (F-02 routes): no token → 401 on each route, then a Participant token on each write route → 403 envelope only, even with an invalid body; catalog unchanged', async () => {
        const before = await snapshot();
        const aliceToken = await bearerOf('alice@exercise.test');
        for (const [method, path] of WRITES) {
          const url = path.replace(':id', path.includes('categories') ? categoryId : templateId);
          const send = (r: request.Test) => (method === 'POST' || method === 'PUT' ? r.send({ garbage: true }) : r);
          const anon = await send(call(method, url));
          expect(anon.status, `${method} ${path} no token`).toBe(401);
          const res = await send(call(method, url, aliceToken));
          expect(res.status, `${method} ${path} as Participant`).toBe(403);
          expect(res.body).toEqual(FORBIDDEN);
        }
        expect(await snapshot()).toEqual(before);
      });

      it('TEST-22c (F-02 routes): the read routes answer 200 for a Participant and a Manager', async () => {
        for (const token of [await bearerOf('alice@exercise.test'), bearer(await manager())]) {
          for (const url of ['/api/categories', '/api/templates', `/api/templates/${templateId}`]) {
            expect((await call('GET', url, token)).status, url).toBe(200);
          }
        }
      });
    });

    describe('F-04 routes', () => {
      const F04: Array<[string, string]> = [
        ['POST', '/api/entries'],
        ['POST', '/api/entries/quick-complete'],
        ['GET', '/api/entries'],
        ['GET', '/api/entries/:id'],
      ];

      it('TEST-22c (F-04 routes): the registry holds the 4 Sprint 1 routes as F-04 / PARTICIPANT, resource-owner only on :id', () => {
        const policies = activePolicies('test');
        for (const [method, path] of F04) {
          const p = policies.find((x) => x.method === method && x.path === path);
          expect(p, `${method} ${path} in the registry`).toBeDefined();
          expect(p?.featureId).toBe('F-04');
          expect(p?.auth).toBe('required');
          expect(p?.roles).toEqual(['PARTICIPANT']);
          expect(p?.ownership).toBe(path === '/api/entries/:id' ? 'resource-owner' : 'self-scoped');
        }
        expect(policies.filter((x) => x.featureId === 'F-04')).toHaveLength(4);
      });

      it('TEST-22c / 12a (F-04 routes): no token → 401; Manager → 403 envelope only on every route, even with an invalid body; nothing stored', async () => {
        const managerToken = bearer(await manager());
        const before = await snapshot();
        for (const [method, path] of F04) {
          const url = path.replace(':id', bobEntryId);
          const send = (r: request.Test) => (method === 'POST' ? r.send({ garbage: true }) : r);
          expect((await send(call(method, url))).status, `${method} ${path} no token`).toBe(401);
          const res = await send(call(method, url, managerToken));
          expect(res.status, `${method} ${path} as Manager`).toBe(403);
          expect(res.body).toEqual(FORBIDDEN);
          expect(JSON.stringify(res.body)).not.toContain(bobEntryId);
        }
        expect(await snapshot()).toEqual(before);
      });

      it("TEST-12c (F-04 routes): Alice's GET /api/entries?userId=<Bob> → 403; own and Bob's own → 200; Alice's list never contains Bob's entry", async () => {
        const aliceToken = await bearerOf('alice@exercise.test');
        const foreign = await call('GET', `/api/entries?userId=${bobId}`, aliceToken);
        expect(foreign.status).toBe(403);
        expect(JSON.stringify(foreign.body)).not.toContain(bobEntryId);
        const own = await call('GET', `/api/entries?userId=${aliceId}`, aliceToken);
        expect(own.status).toBe(200);
        expect(JSON.stringify(own.body)).not.toContain(bobEntryId);
        const bobOwn = await call('GET', `/api/entries?userId=${bobId}`, await bearerOf('bob@exercise.test'));
        expect(bobOwn.status).toBe(200);
        expect(JSON.stringify(bobOwn.body)).toContain(bobEntryId);
      });

      it("TEST-12b (F-04 routes): Alice's POST with Bob's userExerciseId → 403 (manual and Quick Complete); unknown well-formed id → 404; userId in the body → 400; nothing stored", async () => {
        const aliceToken = await bearerOf('alice@exercise.test');
        const before = await snapshot();
        const cases: Array<[string, Record<string, unknown>]> = [
          ['/api/entries', { sets: 1, totalReps: 10 }],
          ['/api/entries/quick-complete', {}],
        ];
        for (const [url, values] of cases) {
          const foreign = await call('POST', url, aliceToken).send({ userExerciseId: bobExerciseId, ...values });
          expect(foreign.status, `${url} foreign userExerciseId`).toBe(403);
          expect(foreign.body).toEqual(FORBIDDEN);
          const unknown = await call('POST', url, aliceToken).send({ userExerciseId: randomUUID(), ...values });
          expect(unknown.status, `${url} unknown userExerciseId`).toBe(404);
          expect(unknown.body.code).toBe('NOT_FOUND');
          const withUserId = await call('POST', url, aliceToken).send({ userExerciseId: aliceExerciseId, userId: bobId, ...values });
          expect(withUserId.status, `${url} userId in the body`).toBe(400);
          expect(withUserId.body.fields.map((f: { field: string }) => f.field)).toContain('userId');
        }
        expect(await snapshot()).toEqual(before);
      });
    });

    describe('F-06 routes', () => {
      it('TEST-22c (F-06 routes): the registry holds GET /api/progress/daily as F-06 / PARTICIPANT / self-scoped, and only that one in Sprint 1', () => {
        const f06 = activePolicies('test').filter((x) => x.featureId === 'F-06');
        expect(f06).toHaveLength(1);
        expect(f06[0]).toMatchObject({ method: 'GET', path: '/api/progress/daily', auth: 'required', roles: ['PARTICIPANT'], ownership: 'self-scoped' });
      });

      it('TEST-22c / 12a (F-06 routes): no token → 401; Manager → 403 envelope only, with a valid and with an invalid date', async () => {
        expect((await call('GET', '/api/progress/daily')).status).toBe(401);
        const token = bearer(await manager());
        for (const query of ['', `?date=${today()}`, '?date=garbage', '?date=2999-01-01']) {
          const res = await call('GET', `/api/progress/daily${query}`, token);
          expect(res.status, query).toBe(403);
          expect(res.body, query).toEqual(FORBIDDEN);
        }
      });

      it("TEST-12b (F-06 routes): Alice's ?userId=<Bob> → 403 with no data; Bob's own request → 200 with his exercise; Alice's own never shows Bob's exercise", async () => {
        const aliceToken = await bearerOf('alice@exercise.test');
        const foreign = await call('GET', `/api/progress/daily?userId=${bobId}`, aliceToken);
        expect(foreign.status).toBe(403);
        expect(foreign.body).toEqual(FORBIDDEN);
        expect(JSON.stringify(foreign.body)).not.toContain(bobExerciseId);
        const bobOwn = await call('GET', `/api/progress/daily?userId=${bobId}`, await bearerOf('bob@exercise.test'));
        expect(bobOwn.status).toBe(200);
        expect(JSON.stringify(bobOwn.body)).toContain(bobExerciseId);
        const aliceOwn = await call('GET', '/api/progress/daily', aliceToken);
        expect(aliceOwn.status).toBe(200);
        expect(JSON.stringify(aliceOwn.body)).not.toContain(bobExerciseId);
        expect(JSON.stringify(aliceOwn.body)).toContain(aliceExerciseId);
      });
    });
  });
});
