import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-01 STS §8: TEST-01a–f against a real PostgreSQL test database seeded by
// tests/globalSetup.ts (manager@, alice@, bob@exercise.test).
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-01 / TEST-01).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const T = new Date();
const PARTICIPANT_PW = env.seedParticipantPassword;
const MANAGER_PW = env.seedManagerPassword;
const SEEDED = [
  { email: 'manager@exercise.test', password: MANAGER_PW },
  { email: 'alice@exercise.test', password: PARTICIPANT_PW },
  { email: 'bob@exercise.test', password: PARTICIPANT_PW },
];

/** Valid-format e-mail of exactly `length` characters. */
function emailOfLength(length: number): string {
  const suffix = '.exercise.test';
  const local = 'a'.repeat(length - 1 - 63 - suffix.length - 1);
  return `${local.slice(0, 64)}@${'b'.repeat(length - Math.min(local.length, 64) - 1 - suffix.length)}${suffix}`;
}

describeWithDatabase('F-01 authentication (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let clock: MutableClock;
  let app: ReturnType<typeof buildIntegrationApp>;

  const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });
  const tokenOf = async (email = 'alice@exercise.test', password = PARTICIPANT_PW) =>
    (await login(email, password)).body.token as string;
  const counts = async () => ({
    users: await prisma.user.count(),
    revoked: await prisma.revokedToken.count(),
  });

  beforeAll(() => {
    if (!PARTICIPANT_PW || !MANAGER_PW) throw new Error('SEED_MANAGER_PASSWORD / SEED_PARTICIPANT_PASSWORD must be set');
    prisma = newPrisma();
    clock = new MutableClock(T);
    app = buildIntegrationApp(prisma, clock);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('AC-01a login', () => {
    it('TEST-01a-1: Alice → 200, 1-hour HS256 JWT with sub, role, uuid jti; user object has no secrets', async () => {
      const res = await login('alice@exercise.test', PARTICIPANT_PW);
      const alice = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } });
      expect(res.status).toBe(200);
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.expiresIn).toBe(3600);
      expect(res.body.user).toEqual({ id: alice.id, email: alice.email, role: 'PARTICIPANT', displayName: alice.displayName });
      const header = JSON.parse(Buffer.from(res.body.token.split('.')[0], 'base64url').toString('utf8'));
      expect(header.alg).toBe('HS256');
      const claims = decodeJwt(res.body.token);
      expect(claims.sub).toBe(alice.id);
      expect(claims['role']).toBe('PARTICIPANT');
      expect(claims.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(3600);
    });

    it('TEST-01a-2: Manager login → role MANAGER in token and body', async () => {
      const res = await login('manager@exercise.test', MANAGER_PW);
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('MANAGER');
      expect(decodeJwt(res.body.token)['role']).toBe('MANAGER');
    });

    it('TEST-01a-3: e-mail is case-insensitive (R6)', async () => {
      const res = await login('ALICE@Exercise.TEST', PARTICIPANT_PW);
      expect(res.status).toBe(200);
    });

    it('TEST-01a-4: response contains no password or bcrypt hash', async () => {
      const res = await login('alice@exercise.test', PARTICIPANT_PW);
      expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);
    });
  });

  describe('AC-01b failed login', () => {
    it('TEST-01b-1/2/3: unknown e-mail and wrong password give the identical 401 INVALID_CREDENTIALS, no token', async () => {
      const unknown = await login('nobody@exercise.test', 'whatever-password');
      const wrong = await login('alice@exercise.test', 'definitely-wrong');
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.token).toBeUndefined();
      expect(wrong.body.token).toBeUndefined();
      expect(unknown.body).toEqual(wrong.body);
    });

    it('TEST-01b-4: a 254-character e-mail and a 72-character password are valid input → 401, not 400', async () => {
      const email = emailOfLength(254);
      expect(email).toHaveLength(254);
      const res = await login(email, 'p'.repeat(72));
      expect(res.status).toBe(401);
    });
  });

  describe('AC-01c current user', () => {
    it('TEST-01c-1: Alice /me returns her id, email, role, displayName and no hash', async () => {
      const alice = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } });
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${await tokenOf()}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: alice.id, email: alice.email, role: 'PARTICIPANT', displayName: alice.displayName });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });

    it('TEST-01c-2: Manager /me returns role MANAGER', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${await tokenOf('manager@exercise.test', MANAGER_PW)}`);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('MANAGER');
    });
  });

  describe('AC-01d logout and revocation', () => {
    it('TEST-01d-1/2: logout → 204, RevokedToken row (jti, userId, expiresAt = exp), then /me is 401', async () => {
      const token = await tokenOf();
      const claims = decodeJwt(token);
      const out = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
      expect(out.status).toBe(204);
      const row = await prisma.revokedToken.findUniqueOrThrow({ where: { jti: claims.jti as string } });
      expect(row.userId).toBe(claims.sub);
      expect(row.expiresAt.getTime()).toBe((claims.exp as number) * 1000);
      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(401);
      expect(me.body.code).toBe('UNAUTHENTICATED');
    });

    it('TEST-01d-3: revocation survives a restart (new app + new database connection)', async () => {
      const token = await tokenOf();
      await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
      const restartedPrisma = newPrisma();
      try {
        const restarted = buildIntegrationApp(restartedPrisma, clock);
        const me = await request(restarted).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
        expect(me.status).toBe(401);
      } finally {
        await restartedPrisma.$disconnect();
      }
    });

    it('TEST-01d-4: a second token of the same user stays valid (R7)', async () => {
      const first = await tokenOf();
      const second = await tokenOf();
      await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${first}`);
      const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${second}`);
      expect(me.status).toBe(200);
    });

    it('TEST-01d-5: logout without a token → 401 and no database change', async () => {
      const before = await counts();
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(401);
      expect(await counts()).toEqual(before);
    });
  });

  describe('AC-01e stored passwords', () => {
    it('TEST-01e-1: every seeded hash is a 60-character bcrypt hash and not the plaintext', async () => {
      for (const { email, password } of SEEDED) {
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
        expect(user.passwordHash).toHaveLength(60);
        expect(user.passwordHash).not.toBe(password);
      }
    });

    it('TEST-01e-2: bcrypt.compare accepts the plaintext and the cost equals BCRYPT_COST', async () => {
      for (const { email, password } of SEEDED) {
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
        expect(bcrypt.getRounds(user.passwordHash)).toBe(env.bcryptCost);
      }
    });
  });

  describe('AC-01f login input validation', () => {
    const invalid: [string, () => request.Test, string?][] = [
      ['missing email', () => request(app).post('/api/auth/login').send({ password: 'x' }), 'email'],
      ['missing password', () => request(app).post('/api/auth/login').send({ email: 'alice@exercise.test' }), 'password'],
      ['email shorter than 3 characters', () => request(app).post('/api/auth/login').send({ email: 'ab', password: 'x' }), 'email'],
      ['email not an e-mail', () => request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' }), 'email'],
      ['email of 255 characters', () => request(app).post('/api/auth/login').send({ email: emailOfLength(255), password: 'x' }), 'email'],
      ['empty password', () => request(app).post('/api/auth/login').send({ email: 'alice@exercise.test', password: '' }), 'password'],
      ['password of 73 characters', () => request(app).post('/api/auth/login').send({ email: 'alice@exercise.test', password: 'p'.repeat(73) }), 'password'],
      ['unknown extra field', () => request(app).post('/api/auth/login').send({ email: 'alice@exercise.test', password: 'x', role: 'MANAGER' }), 'role'],
      ['body that is not JSON', () => request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{not json'), 'body'],
      ['body that is a JSON array', () => request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('[]'), 'body'],
    ];

    it.each(invalid)('TEST-01f-1: %s → 400 VALIDATION_ERROR, no token, no database change', async (_name, send, field) => {
      const before = await counts();
      const res = await send();
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.token).toBeUndefined();
      if (field) expect(res.body.fields.map((f: { field: string }) => f.field)).toContain(field);
      expect(await counts()).toEqual(before);
    });

    it('TEST-01f-2: 72 UTF-8 bytes of Thai is accepted (401); 75 bytes is 400 naming password', async () => {
      const before = await counts();
      const ok = await login('alice@exercise.test', 'ก'.repeat(24));
      expect(ok.status).toBe(401);
      const tooLong = await login('alice@exercise.test', 'ก'.repeat(25));
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.code).toBe('VALIDATION_ERROR');
      expect(tooLong.body.fields.map((f: { field: string }) => f.field)).toContain('password');
      expect(tooLong.body.token).toBeUndefined();
      expect(await counts()).toEqual(before);
    });
  });
});
