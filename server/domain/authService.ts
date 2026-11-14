import type { Clock } from './clock.js';
import { appError } from './errors.js';
import { parseLoginBody } from './loginValidation.js';
import { dummyHashFor, verifyPassword } from './password.js';
import { signToken, type Role } from './token.js';

/**
 * Login / me / logout use cases (F-01 §4.1–4.4). Persistence goes through
 * `AuthRepository`, so the same service runs on an in-memory fake (unit tests)
 * and on the Prisma repository once the database layer lands.
 */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  displayName: string;
}

export interface UserView {
  id: string;
  email: string;
  role: Role;
  displayName: string;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  /** Existence check without loading the row (runs on every authenticated request). */
  userExists(id: string): Promise<boolean>;
  isRevoked(jti: string): Promise<boolean>;
  /** Stores the denylist row and deletes rows whose `expiresAt` is before `now` (§4.4). */
  revoke(entry: { jti: string; userId: string; expiresAt: Date }, now: Date): Promise<void>;
}

export interface LoginResult {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserView;
}

export interface AuthService {
  /** Validates the raw body, then checks credentials. */
  login(body: unknown): Promise<LoginResult>;
  me(userId: string): Promise<UserView>;
  logout(identity: { jti: string; userId: string; exp: number }): Promise<void>;
}

export interface AuthServiceDeps {
  repo: AuthRepository;
  clock: Clock;
  secret: string;
  expiresInSeconds: number;
  /** BCRYPT_COST; the R5 dummy compare uses the same cost as real hashes. */
  bcryptCost: number;
}

const view = (u: UserRecord): UserView => ({
  id: u.id,
  email: u.email,
  role: u.role,
  displayName: u.displayName,
});

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { repo, clock, secret, expiresInSeconds, bcryptCost } = deps;
  // R5: build the dummy hash now, so the first unknown-email login does not pay for it.
  dummyHashFor(bcryptCost);

  return {
    async login(body) {
      const { email, password } = parseLoginBody(body);
      const user = await repo.findUserByEmail(email);
      // R5: unknown email still runs a bcrypt compare, and both failures look identical.
      const ok = await verifyPassword(password, user?.passwordHash ?? null, bcryptCost);
      if (!user || !ok) {
        throw appError('INVALID_CREDENTIALS', 'Invalid email or password.');
      }
      const issued = await signToken(
        { sub: user.id, role: user.role },
        { secret, clock, expiresInSeconds },
      );
      return { token: issued.token, tokenType: 'Bearer', expiresIn: expiresInSeconds, user: view(user) };
    },

    async me(userId) {
      const user = await repo.findUserById(userId);
      if (!user) throw appError('UNAUTHENTICATED', 'Authentication required.');
      return view(user);
    },

    async logout({ jti, userId, exp }) {
      await repo.revoke({ jti, userId, expiresAt: new Date(exp * 1000) }, clock.now());
    },
  };
}
