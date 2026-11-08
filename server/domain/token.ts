import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { Clock } from './clock.js';

/**
 * JWT issue/verify — F-01 R2–R4.
 * HS256 only; time comes from the injected Clock (never the system clock),
 * so `exp` boundaries are testable: valid at exp-1 s, expired at exp (R3).
 */
export type Role = 'MANAGER' | 'PARTICIPANT';
const ROLES: readonly string[] = ['MANAGER', 'PARTICIPANT'];

export interface TokenClaims {
  sub: string;
  role: Role;
  jti: string;
  iat: number;
  exp: number;
}

export interface IssuedToken {
  token: string;
  jti: string;
  iat: number;
  exp: number;
}

const encode = (secret: string) => new TextEncoder().encode(secret);

export async function signToken(
  subject: { sub: string; role: Role },
  opts: { secret: string; clock: Clock; expiresInSeconds: number },
): Promise<IssuedToken> {
  const iat = Math.floor(opts.clock.now().getTime() / 1000);
  const exp = iat + opts.expiresInSeconds;
  const jti = randomUUID();
  const token = await new SignJWT({ role: subject.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(subject.sub)
    .setJti(jti)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(encode(opts.secret));
  return { token, jti, iat, exp };
}

/** Throws on any invalid token (bad signature, algorithm, expiry, claims). */
export async function verifyToken(
  token: string,
  opts: { secret: string; clock: Clock },
): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, encode(opts.secret), {
    algorithms: ['HS256'],
    currentDate: opts.clock.now(),
    requiredClaims: ['sub', 'jti', 'iat', 'exp'],
  });
  const { sub, role, jti, iat, exp } = payload;
  if (
    typeof sub !== 'string' ||
    typeof role !== 'string' ||
    !ROLES.includes(role) ||
    typeof jti !== 'string' ||
    typeof iat !== 'number' ||
    typeof exp !== 'number'
  ) {
    throw new Error('Invalid token claims');
  }
  return { sub, role: role as Role, jti, iat, exp };
}
