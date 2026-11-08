import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../server/domain/clock.js';
import { signToken, verifyToken } from '../../server/domain/token.js';

// F-01 R2–R4, token layer only; the RTM-mapped HTTP-level cases live in
// tests/integration/auth.test.ts and security_access.test.ts.
const SECRET = 'unit-test-secret-0123456789abcdef-xyz';
const T = new Date('2026-11-05T03:00:00Z');
const key = (s: string) => new TextEncoder().encode(s);
const at = (seconds: number) => new FixedClock(new Date(T.getTime() + seconds * 1000));

describe('signToken (R2)', () => {
  it('sub, role, uuid jti, iat and exp = iat + 3600', async () => {
    const issued = await signToken(
      { sub: 'user-1', role: 'PARTICIPANT' },
      { secret: SECRET, clock: new FixedClock(T), expiresInSeconds: 3600 },
    );
    const claims = await verifyToken(issued.token, { secret: SECRET, clock: new FixedClock(T) });
    expect(claims.sub).toBe('user-1');
    expect(claims.role).toBe('PARTICIPANT');
    expect(claims.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(claims.iat).toBe(Math.floor(T.getTime() / 1000));
    expect(claims.exp - claims.iat).toBe(3600);
    expect(issued.jti).toBe(claims.jti);
    expect(issued.exp).toBe(claims.exp);
  });

  it('issues a new jti per call', async () => {
    const opts = { secret: SECRET, clock: new FixedClock(T), expiresInSeconds: 3600 };
    const a = await signToken({ sub: 'u', role: 'MANAGER' }, opts);
    const b = await signToken({ sub: 'u', role: 'MANAGER' }, opts);
    expect(a.jti).not.toBe(b.jti);
  });
});

describe('verifyToken', () => {
  const sign = () =>
    signToken(
      { sub: 'user-1', role: 'PARTICIPANT' },
      { secret: SECRET, clock: new FixedClock(T), expiresInSeconds: 3600 },
    );

  it('valid at T + 3,599 s', async () => {
    const { token } = await sign();
    await expect(verifyToken(token, { secret: SECRET, clock: at(3599) })).resolves.toMatchObject({
      sub: 'user-1',
    });
  });

  it('expired at T + 3,600 s (R3)', async () => {
    const { token } = await sign();
    await expect(verifyToken(token, { secret: SECRET, clock: at(3600) })).rejects.toThrow();
  });

  it('rejects a token signed with a different secret', async () => {
    const { token } = await sign();
    await expect(
      verifyToken(token, { secret: 'another-secret-0123456789abcdef-xyz', clock: new FixedClock(T) }),
    ).rejects.toThrow();
  });

  it('rejects alg none (R4)', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const iat = Math.floor(T.getTime() / 1000);
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: 'user-1', role: 'MANAGER', jti: 'x', iat, exp: iat + 3600,
    })}.`;
    await expect(verifyToken(token, { secret: SECRET, clock: new FixedClock(T) })).rejects.toThrow();
  });

  it('rejects HS512 signed with the correct secret (R4)', async () => {
    const iat = Math.floor(T.getTime() / 1000);
    const token = await new SignJWT({ role: 'PARTICIPANT' })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('user-1')
      .setJti('11111111-1111-4111-8111-111111111111')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key(SECRET));
    await expect(verifyToken(token, { secret: SECRET, clock: new FixedClock(T) })).rejects.toThrow();
  });

  it.each(['', 'a.b', 'not-a-jwt', 'a.b.c'])('rejects malformed token %j', async (t) => {
    await expect(verifyToken(t, { secret: SECRET, clock: new FixedClock(T) })).rejects.toThrow();
  });

  it('rejects a validly signed token missing required claims (jti, role)', async () => {
    const iat = Math.floor(T.getTime() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key(SECRET));
    await expect(verifyToken(token, { secret: SECRET, clock: new FixedClock(T) })).rejects.toThrow();
  });

  it('rejects an unknown role value', async () => {
    const iat = Math.floor(T.getTime() / 1000);
    const token = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setJti('11111111-1111-4111-8111-111111111111')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key(SECRET));
    await expect(verifyToken(token, { secret: SECRET, clock: new FixedClock(T) })).rejects.toThrow();
  });
});
