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
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma, TEST_SECRET } from '../helpers/integrationApp.js';

// F-01 STS §8, stage 1: TEST-22a–c and TEST-12a–c against the real test database,
// using the F-01 routes and the test-only probe routes. Stage-2 cases (every
// Sprint 1 route in the registry: TEST-12a-2, TEST-12b-4, and the stage-2 scope of
// 22c-1 / 12c-1) need F-02–F-06 routes and are NOT covered here.
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
});
