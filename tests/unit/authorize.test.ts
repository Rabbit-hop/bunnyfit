import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../server/middleware/errorHandler.js';
import type { AuthIdentity } from '../../server/middleware/auth.js';
import { createAuthorize } from '../../server/middleware/authorize.js';
import type { RoutePolicy } from '../../server/routes/registry.js';

// F-01 §3.2 steps 2-3; STS TEST-22b, TEST-12a/b/c at middleware level (fakes, no DB).
const policy = (p: Partial<RoutePolicy>): RoutePolicy => ({
  method: 'GET',
  path: '/x',
  featureId: 'T',
  auth: 'required',
  roles: ['PARTICIPANT'],
  ownership: 'none',
  ...p,
});

const identity = (userId: string, role: AuthIdentity['role']): AuthIdentity => ({
  userId,
  role,
  jti: `jti-${userId}`,
  exp: 9999999999,
});

/** Fake "authenticate": identity comes from the x-test-user header (id:ROLE). */
const fakeAuth: RequestHandler = (req, _res, next) => {
  const raw = req.header('x-test-user');
  if (raw) {
    const [id = '', role = ''] = raw.split(':');
    req.auth = identity(id, role as AuthIdentity['role']);
  }
  next();
};

function appWith(p: RoutePolicy, lookup?: (id: string) => Promise<string | null>) {
  const app = express();
  app.use(express.json());
  app.all('/x/:id?', fakeAuth, createAuthorize(p, lookup), (_req, res) => res.json({ secret: 'data' }));
  app.use(errorHandler);
  return app;
}

const FORBIDDEN = { code: 'FORBIDDEN', fields: [] };
const noData = (body: Record<string, unknown>) =>
  expect(Object.keys(body).sort()).toEqual(['code', 'fields', 'message']);

describe('authorize — role (step 2)', () => {
  it('TEST-22b-1: Participant on a MANAGER-only route → 403 envelope only', async () => {
    const res = await request(appWith(policy({ roles: ['MANAGER'] }))).get('/x').set('x-test-user', 'alice:PARTICIPANT');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(FORBIDDEN);
    noData(res.body);
  });

  it('TEST-22b-2 / TEST-12a-1: Manager on a PARTICIPANT-only route → 403, no data', async () => {
    const res = await request(appWith(policy({ ownership: 'self-scoped' }))).get('/x').set('x-test-user', 'm:MANAGER');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(FORBIDDEN);
    noData(res.body);
  });

  it('allowed role passes', async () => {
    const res = await request(appWith(policy({ roles: ['MANAGER', 'PARTICIPANT'] }))).get('/x').set('x-test-user', 'm:MANAGER');
    expect(res.status).toBe(200);
  });

  it('without an identity (authenticate not run) → 401, never passes', async () => {
    const res = await request(appWith(policy({}))).get('/x');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});

describe('authorize — self-scoped (step 3)', () => {
  const app = appWith(policy({ ownership: 'self-scoped' }));

  it('TEST-12b-4: foreign ?userId → 403, no data', async () => {
    const res = await request(app).get('/x?userId=bob').set('x-test-user', 'alice:PARTICIPANT');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(FORBIDDEN);
    noData(res.body);
  });

  it('own ?userId or none → 200', async () => {
    expect((await request(app).get('/x?userId=alice').set('x-test-user', 'alice:PARTICIPANT')).status).toBe(200);
    expect((await request(app).get('/x').set('x-test-user', 'alice:PARTICIPANT')).status).toBe(200);
  });

  it('repeated or array ?userId containing a foreign id → 403', async () => {
    const res = await request(app).get('/x?userId=alice&userId=bob').set('x-test-user', 'alice:PARTICIPANT');
    expect(res.status).toBe(403);
  });
});

describe('authorize — resource-owner (step 3)', () => {
  const owners: Record<string, string> = { r1: 'bob' };
  const lookup = async (id: string) => owners[id] ?? null;
  const app = appWith(policy({ ownership: 'resource-owner' }), lookup);

  it.each(['GET', 'PUT', 'DELETE'] as const)('TEST-12b-1: %s on another user\'s record → 403', async (m) => {
    const res = await request(app)[m.toLowerCase() as 'get' | 'put' | 'delete']('/x/r1').set('x-test-user', 'alice:PARTICIPANT');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(FORBIDDEN);
    noData(res.body);
  });

  it('TEST-12b-2: the owner → 200', async () => {
    expect((await request(app).get('/x/r1').set('x-test-user', 'bob:PARTICIPANT')).status).toBe(200);
  });

  it('TEST-12b-3: record does not exist → 404 NOT_FOUND', async () => {
    const res = await request(app).get('/x/nope').set('x-test-user', 'alice:PARTICIPANT');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('role is checked before the owner lookup (wrong role never reaches the lookup)', async () => {
    let called = false;
    const a = appWith(policy({ ownership: 'resource-owner' }), async () => ((called = true), 'bob'));
    const res = await request(a).get('/x/r1').set('x-test-user', 'm:MANAGER');
    expect(res.status).toBe(403);
    expect(called).toBe(false);
  });
});

describe('authorize — registration (R11)', () => {
  it('TEST-12c-2: resource-owner without an owner lookup throws at registration', () => {
    expect(() => createAuthorize(policy({ ownership: 'resource-owner' }))).toThrow(/owner/i);
  });

  it('a public policy cannot be wrapped in authorize', () => {
    expect(() => createAuthorize(policy({ auth: 'public', roles: [] }))).toThrow(/public/i);
  });
});
