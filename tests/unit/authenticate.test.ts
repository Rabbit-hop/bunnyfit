import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Clock } from '../../server/domain/clock.js';
import { FixedClock } from '../../server/domain/clock.js';
import { signToken } from '../../server/domain/token.js';
import { errorHandler } from '../../server/middleware/errorHandler.js';
import { createAuthenticate } from '../../server/middleware/auth.js';

// F-01 §3.2 steps 1 and 4; STS TEST-22a-1..9 at middleware level with fake
// dependencies (no database). The HTTP/DB-level runs are integration tests.
const SECRET = 'unit-test-secret-0123456789abcdef-xyz';
const T = new Date('2026-11-05T03:00:00Z');

function setup(opts: { users?: string[] } = {}) {
  const revoked = new Set<string>();
  let now = T;
  const clock: Clock = {
    now: () => new Date(now.getTime()),
    today: () => new FixedClock(now).today(),
  };
  const calls = { isRevoked: [] as string[], userExists: [] as string[] };
  const authenticate = createAuthenticate({
    secret: SECRET,
    clock,
    isRevoked: async (jti) => {
      calls.isRevoked.push(jti);
      return revoked.has(jti);
    },
    userExists: async (id) => {
      calls.userExists.push(id);
      return (opts.users ?? ['alice']).includes(id);
    },
  });
  const app = express();
  app.get('/me', authenticate, (req, res) => res.json({ auth: req.auth }));
  app.use(errorHandler);
  const issue = (sub = 'alice', role: 'MANAGER' | 'PARTICIPANT' = 'PARTICIPANT') =>
    signToken({ sub, role }, { secret: SECRET, clock: new FixedClock(T), expiresInSeconds: 3600 });
  return { app, calls, issue, revoked, setNow: (s: number) => (now = new Date(T.getTime() + s * 1000)) };
}

const UNAUTH = { code: 'UNAUTHENTICATED', fields: [] };
const expectEnvelopeOnly = (body: Record<string, unknown>) =>
  expect(Object.keys(body).sort()).toEqual(['code', 'fields', 'message']);

describe('authenticate', () => {
  it('TEST-22a-1: no Authorization header → 401 UNAUTHENTICATED', async () => {
    const { app, calls } = setup();
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject(UNAUTH);
    expectEnvelopeOnly(res.body);
    expect(calls.isRevoked).toEqual([]);
  });

  it.each(['Basic abc', 'Bearer', 'Bearer ', 'Bearer a.b', 'bearer x.y.z', 'Bearer a b'])(
    'TEST-22a-2: header %j → 401',
    async (header) => {
      const { app } = setup();
      const res = await request(app).get('/me').set('Authorization', header);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject(UNAUTH);
    },
  );

  it('TEST-22a-3: token signed with another secret → 401', async () => {
    const { app } = setup();
    const { token } = await signToken(
      { sub: 'alice', role: 'PARTICIPANT' },
      { secret: 'another-secret-0123456789abcdef-xyz', clock: new FixedClock(T), expiresInSeconds: 3600 },
    );
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('TEST-22a-4: alg none and HS512 → 401 each', async () => {
    const { app } = setup();
    const iat = Math.floor(T.getTime() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: 'alice', role: 'MANAGER', jti: 'j', iat, exp: iat + 3600,
    })}.`;
    const hs512 = await new SignJWT({ role: 'PARTICIPANT' })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('alice')
      .setJti('11111111-1111-4111-8111-111111111111')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(new TextEncoder().encode(SECRET));
    for (const t of [none, hs512]) {
      const res = await request(app).get('/me').set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(401);
    }
  });

  it('TEST-22a-5: valid at T + 3,599 s → 200 and identity attached (step 4)', async () => {
    const { app, issue, setNow } = setup();
    const { token, jti, exp } = await issue();
    setNow(3599);
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auth).toEqual({ userId: 'alice', role: 'PARTICIPANT', jti, exp });
  });

  it('TEST-22a-6: expired at T + 3,600 s → 401 (R3)', async () => {
    const { app, issue, setNow } = setup();
    const { token } = await issue();
    setNow(3600);
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject(UNAUTH);
  });

  it('TEST-22a-7: revoked jti → 401', async () => {
    const { app, issue, revoked } = setup();
    const { token, jti } = await issue();
    revoked.add(jti);
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject(UNAUTH);
  });

  it('TEST-22a-8: user no longer exists → 401, not 500', async () => {
    const { app, issue } = setup({ users: [] });
    const { token } = await issue();
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject(UNAUTH);
  });

  it('TEST-22a-9: every 401 body is the envelope only (no token echo, no private data)', async () => {
    const { app, issue } = setup({ users: [] });
    const { token } = await issue();
    for (const header of [undefined, 'Basic abc', `Bearer ${token}`, 'Bearer x.y.z']) {
      const req = request(app).get('/me');
      const res = await (header ? req.set('Authorization', header) : req);
      expect(res.status).toBe(401);
      expectEnvelopeOnly(res.body);
      expect(JSON.stringify(res.body)).not.toContain(token);
    }
  });
});
