import type { RequestHandler } from 'express';
import type { Clock } from '../domain/clock.js';
import { appError } from '../domain/errors.js';
import { verifyToken, type Role } from '../domain/token.js';

/**
 * Request pipeline steps 1 and 4 (F-01 §3.2): authenticate, then hand the
 * identity to services. Every failure is a bare 401 UNAUTHENTICATED envelope —
 * never 403/500 and never any detail about why (R8).
 */
export interface AuthIdentity {
  userId: string;
  role: Role;
  jti: string;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthIdentity;
    }
  }
}

export interface AuthenticateDeps {
  secret: string;
  clock: Clock;
  /** Is this `jti` in the RevokedToken denylist? */
  isRevoked(jti: string): Promise<boolean>;
  /** Does the user in `sub` still exist? */
  userExists(userId: string): Promise<boolean>;
}

const BEARER = /^Bearer ([^\s]+)$/;

export function createAuthenticate(deps: AuthenticateDeps): RequestHandler {
  const unauthenticated = () => appError('UNAUTHENTICATED', 'Authentication required.');

  return async (req, _res, next) => {
    try {
      const match = BEARER.exec(req.headers.authorization ?? '');
      if (!match?.[1]) throw unauthenticated();

      let claims;
      try {
        claims = await verifyToken(match[1], { secret: deps.secret, clock: deps.clock });
      } catch {
        throw unauthenticated();
      }

      if (await deps.isRevoked(claims.jti)) throw unauthenticated();
      if (!(await deps.userExists(claims.sub))) throw unauthenticated();

      req.auth = { userId: claims.sub, role: claims.role, jti: claims.jti, exp: claims.exp };
      next();
    } catch (err) {
      next(err);
    }
  };
}
