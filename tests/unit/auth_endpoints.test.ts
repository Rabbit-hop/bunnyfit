import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import { createAuthService } from '../../server/domain/authService.js';
import type { Clock } from '../../server/domain/clock.js';
import { FixedClock } from '../../server/domain/clock.js';
import { decodeJwt } from 'jose';
import { FakeAuthRepo } from '../helpers/fakeAuthRepo.js';

// F-01 login / me / logout against an in-memory repository (no database).
// The integration versions named by the RTM (tests/integration/auth.test.ts)
// are written after issue #2 settles; these cover the HTTP/service behaviour only.
const SECRET = 'unit-test-secret-0123456789abcdef-xyz';
const T = new Date('2026-11-05T03:00:00Z');
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

let repo: FakeAuthRepo;
let now: Date;
const clock: Clock = { now: () => new Date(now.getTime()), today: () => new FixedClock(now).today() };

const build = () =>
  createApp({
    nodeEnv: 'test',
    auth: {
      secret: SECRET,
      clock,
      isRevoked: (jti) => repo.isRevoked(jti),
      userExists: async (id) => (await repo.findUserById(id)) !== null,
    },
    authService: createAuthService({ repo, clock, secret: SECRET, expiresInSeconds: 3600 }),
  });

beforeEach(() => {
  now = T;
  repo = new FakeAuthRepo();
  repo.addUser({ id: ALICE, email: 'alice@exercise.test', password: 'alice-pass', role: 'PARTICIPANT', displayName: 'Alice' });
  repo.addUser({ id: BOB, email: 'bob@exercise.test', password: 'bob-pass', role: 'PARTICIPANT', displayName: 'Bob' });
});

const login = (app: ReturnType<typeof build>, email = 'alice@exercise.test', password = 'alice-pass') =>
  request(app).post('/api/auth/login').send({ email, password });

describe('POST /api/auth/login', () => {
  it('TEST-01a-1: valid credentials → 200 with a 1-hour Bearer JWT carrying sub, role, jti', async () => {
    const res = await login(build());
    expect(res.status).toBe(200);
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.expiresIn).toBe(3600);
    expect(res.body.user).toEqual({ id: ALICE, email: 'alice@exercise.test', role: 'PARTICIPANT', displayName: 'Alice' });
    const claims = decodeJwt(res.body.token);
    expect(claims.sub).toBe(ALICE);
    expect(claims['role']).toBe('PARTICIPANT');
    expect(typeof claims.jti).toBe('string');
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(3600);
  });

  it('TEST-01a-2: the response never contains the password hash', async () => {
    const res = await login(build());
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('TEST-01b-1/2/3: unknown email and wrong password give the identical 401 with no token', async () => {
    const app = build();
    const unknown = await login(app, 'nobody@exercise.test', 'whatever');
    const wrong = await login(app, 'alice@exercise.test', 'not-the-password');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.token).toBeUndefined();
  });

  it('R6: email is matched case-insensitively and trimmed', async () => {
    const res = await login(build(), '  ALICE@Exercise.Test ', 'alice-pass');
    expect(res.status).toBe(200);
  });

  it('TEST-01a-3 (R2): two logins give two tokens with different jti', async () => {
    const app = build();
    const a = decodeJwt((await login(app)).body.token);
    const b = decodeJwt((await login(app)).body.token);
    expect(a.jti).not.toBe(b.jti);
  });

  it('TEST-01f-1: an invalid body is 400 VALIDATION_ERROR naming the field, with no token', async () => {
    const app = build();
    const res = await request(app).post('/api/auth/login').send({ email: 'alice@exercise.test' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.fields.map((f: { field: string }) => f.field)).toContain('password');
    expect(res.body.token).toBeUndefined();
    const extra = await request(app).post('/api/auth/login').send({ email: 'alice@exercise.test', password: 'x', admin: true });
    expect(extra.status).toBe(400);
  });

  it('TEST-01f-2: 72 bytes of Thai is not a validation error (401); 75 bytes is 400 naming password', async () => {
    const app = build();
    const ok = await login(app, 'alice@exercise.test', 'ก'.repeat(24));
    expect(ok.status).toBe(401);
    const tooLong = await login(app, 'alice@exercise.test', 'ก'.repeat(25));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.fields[0].field).toBe('password');
  });
});

describe('GET /api/auth/me and POST /api/auth/logout', () => {
  const tokenOf = async (app: ReturnType<typeof build>, email?: string, pw?: string) =>
    `Bearer ${(await login(app, email, pw)).body.token}`;

  it('TEST-01c-1: /me with a valid token returns id, email, role, displayName and no hash', async () => {
    const app = build();
    const res = await request(app).get('/api/auth/me').set('Authorization', await tokenOf(app));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ALICE, email: 'alice@exercise.test', role: 'PARTICIPANT', displayName: 'Alice' });
  });

  it('TEST-01c-2 / 22a-1: /me without a token → 401 UNAUTHENTICATED envelope', async () => {
    const res = await request(build()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'UNAUTHENTICATED', message: expect.any(String), fields: [] });
  });

  it('TEST-01d-1/2: logout → 204, stores jti + expiresAt, and /me with the same token is 401', async () => {
    const app = build();
    const auth = await tokenOf(app);
    const jti = decodeJwt(auth.slice(7)).jti as string;
    const out = await request(app).post('/api/auth/logout').set('Authorization', auth);
    expect(out.status).toBe(204);
    expect(repo.revoked.get(jti)).toEqual({ userId: ALICE, expiresAt: new Date((T.getTime() / 1000 + 3600) * 1000) });
    expect((await request(app).get('/api/auth/me').set('Authorization', auth)).status).toBe(401);
  });

  it('TEST-01d-4 (R7): logout revokes only the presented token', async () => {
    const app = build();
    const first = await tokenOf(app);
    const second = await tokenOf(app);
    await request(app).post('/api/auth/logout').set('Authorization', first);
    expect((await request(app).get('/api/auth/me').set('Authorization', second)).status).toBe(200);
  });

  it('logout with an already revoked or missing token is 401 and writes nothing', async () => {
    const app = build();
    const auth = await tokenOf(app);
    await request(app).post('/api/auth/logout').set('Authorization', auth);
    const writes = repo.writes;
    expect((await request(app).post('/api/auth/logout').set('Authorization', auth)).status).toBe(401);
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
    expect(repo.writes).toBe(writes);
  });

  it('TEST-22a-8: a token for a deleted user → 401, not 500', async () => {
    const app = build();
    const auth = await tokenOf(app);
    repo.removeUser(ALICE);
    expect((await request(app).get('/api/auth/me').set('Authorization', auth)).status).toBe(401);
  });

  it('logout removes expired denylist rows in the same operation', async () => {
    const app = build();
    const old = await tokenOf(app);
    await request(app).post('/api/auth/logout').set('Authorization', old);
    now = new Date(T.getTime() + 2 * 3600 * 1000);
    const fresh = await tokenOf(app, 'bob@exercise.test', 'bob-pass');
    await request(app).post('/api/auth/logout').set('Authorization', fresh);
    expect(repo.revoked.size).toBe(1);
  });
});
