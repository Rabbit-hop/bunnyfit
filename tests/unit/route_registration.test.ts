import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import { FixedClock } from '../../server/domain/clock.js';
import { signToken } from '../../server/domain/token.js';
import { activePolicies, PROBE_ROUTE_POLICIES } from '../../server/routes/registry.js';
import { routesMissingPolicy } from '../helpers/expressRoutes.js';

// F-01 §4.5: probe routes (test env only), registry completeness,
// R11 (a route without a policy cannot be registered). Fakes only — no database.
const SECRET = 'unit-test-secret-0123456789abcdef-xyz';
const T = new Date('2026-11-05T03:00:00Z');
const clock = new FixedClock(T);
const owners: Record<string, string> = { r1: 'bob' };

const build = (nodeEnv: string) =>
  createApp({
    nodeEnv,
    auth: {
      secret: SECRET,
      clock,
      isRevoked: async () => false,
      userExists: async () => true,
    },
    probeOwnerLookup: async (id) => owners[id] ?? null,
  });

const tokenFor = async (sub: string, role: 'MANAGER' | 'PARTICIPANT') =>
  (await signToken({ sub, role }, { secret: SECRET, clock, expiresInSeconds: 3600 })).token;

describe('probe routes (§4.5)', () => {
  it('are not mounted outside NODE_ENV=test', async () => {
    const app = build('production');
    const res = await request(app).get('/__test/manager-only').set('Authorization', `Bearer ${await tokenFor('m', 'MANAGER')}`);
    // Not 404 unconditionally: when dist/web is built, the SPA fallback answers
    // unknown non-API GETs with index.html (200). What matters is that the probe
    // handler (JSON { ok: true }) and its 401/403 auth chain are absent.
    expect([401, 403]).not.toContain(res.status);
    expect(res.body.ok).toBeUndefined();
    expect(activePolicies('production').some((p) => p.path.startsWith('/__test'))).toBe(false);
  });

  it('Alice → manager-only = 403; Manager → 200', async () => {
    const app = build('test');
    const alice = await tokenFor('alice', 'PARTICIPANT');
    expect((await request(app).get('/__test/manager-only').set('Authorization', `Bearer ${alice}`)).status).toBe(403);
    const m = await tokenFor('m', 'MANAGER');
    expect((await request(app).get('/__test/manager-only').set('Authorization', `Bearer ${m}`)).status).toBe(200);
  });

  it('Manager → participant-only = 403; self-scoped foreign userId = 403', async () => {
    const app = build('test');
    const m = await tokenFor('m', 'MANAGER');
    expect((await request(app).get('/__test/participant-only').set('Authorization', `Bearer ${m}`)).status).toBe(403);
    const alice = await tokenFor('alice', 'PARTICIPANT');
    expect((await request(app).get('/__test/participant-only').set('Authorization', `Bearer ${alice}`)).status).toBe(200);
    expect((await request(app).get('/__test/participant-only?userId=bob').set('Authorization', `Bearer ${alice}`)).status).toBe(403);
  });

  it('owned/:id — foreign 403 on GET/PUT/DELETE, owner 200, missing 404', async () => {
    const app = build('test');
    const alice = `Bearer ${await tokenFor('alice', 'PARTICIPANT')}`;
    const bob = `Bearer ${await tokenFor('bob', 'PARTICIPANT')}`;
    for (const m of ['get', 'put', 'delete'] as const) {
      expect((await request(app)[m]('/__test/owned/r1').set('Authorization', alice)).status).toBe(403);
    }
    expect((await request(app).get('/__test/owned/r1').set('Authorization', bob)).status).toBe(200);
    expect((await request(app).get('/__test/owned/none').set('Authorization', alice)).status).toBe(404);
  });
});

describe('every non-public policy → 401 without token, 403 with a wrong-role token', () => {
  for (const policy of PROBE_ROUTE_POLICIES) {
    it(`${policy.method} ${policy.path}`, async () => {
      const app = build('test');
      const url = policy.path.replace(':id', 'r1');
      const call = (t?: string) => {
        const r = request(app)[policy.method.toLowerCase() as 'get' | 'put' | 'delete' | 'post'](url);
        return t ? r.set('Authorization', `Bearer ${t}`) : r;
      };
      expect((await call()).status).toBe(401);
      const wrong = policy.roles.includes('MANAGER') ? 'PARTICIPANT' : 'MANAGER';
      expect((await call(await tokenFor('x', wrong))).status).toBe(403);
    });
  }
});

describe('registry completeness', () => {
  it('no route of the running app is missing from the registry', () => {
    expect(routesMissingPolicy(build('test'), activePolicies('test'))).toEqual([]);
    expect(routesMissingPolicy(build('production'), activePolicies('production'))).toEqual([]);
  });

  it('a regex route other than the SPA fallback is still reported', () => {
    const app = build('test');
    app.get(/^\/sneaky-regex/, (_req, res) => res.json({}));
    expect(routesMissingPolicy(app, activePolicies('test'))).toEqual(['GET /^\\/sneaky-regex/']);
  });

  it('a route inside a sub-Router mounted with app.use is also reported (TEST-22c-2)', () => {
    const app = build('test');
    const sub = express.Router();
    sub.get('/stray', (_req, res) => res.json({}));
    sub.post('/stray2', (_req, res) => res.json({}));
    app.use('/api/sub', sub);
    expect(routesMissingPolicy(app, activePolicies('test')).sort()).toEqual([
      'GET /api/sub/stray',
      'POST /api/sub/stray2',
    ]);
  });

  it('sub-Router mount paths with a param, a dot, or nesting are rebuilt as written', () => {
    const app = build('test');
    const mk = () => {
      const r = express.Router();
      r.get('/z', (_req, res) => res.json({}));
      return r;
    };
    const outer = express.Router();
    outer.use('/inner', mk());
    app.use('/api/:org', mk());
    app.use('/a.b', mk());
    app.use('/x/:a/y/:b', mk());
    app.use('/n', outer);
    expect(routesMissingPolicy(app, activePolicies('test')).sort()).toEqual([
      'GET /a.b/z',
      'GET /api/:org/z',
      'GET /n/inner/z',
      'GET /x/:a/y/:b/z',
    ]);
  });

  it('a deliberately unregistered route makes the check report it', () => {
    const app = build('test');
    app.get('/api/sneaky', (_req, res) => res.json({}));
    expect(routesMissingPolicy(app, activePolicies('test'))).toEqual(['GET /api/sneaky']);
  });
});
