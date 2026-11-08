import bcrypt from 'bcryptjs';
import type { AuthRepository, UserRecord } from '../../server/domain/authService.js';

/** In-memory AuthRepository for unit tests — no database (F-01 stage 1). */
export class FakeAuthRepo implements AuthRepository {
  readonly users: UserRecord[] = [];
  readonly revoked = new Map<string, { userId: string; expiresAt: Date }>();
  writes = 0;

  addUser(u: { id: string; email: string; password: string; role: UserRecord['role']; displayName: string }): void {
    this.users.push({
      id: u.id,
      email: u.email,
      passwordHash: bcrypt.hashSync(u.password, 4),
      role: u.role,
      displayName: u.displayName,
    });
  }

  removeUser(id: string): void {
    const i = this.users.findIndex((u) => u.id === id);
    if (i >= 0) this.users.splice(i, 1);
  }

  async findUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async findUserById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async userExists(id: string) {
    return this.users.some((u) => u.id === id);
  }

  async isRevoked(jti: string) {
    return this.revoked.has(jti);
  }

  async revoke(entry: { jti: string; userId: string; expiresAt: Date }, now: Date) {
    this.writes++;
    this.revoked.set(entry.jti, { userId: entry.userId, expiresAt: entry.expiresAt });
    for (const [jti, r] of this.revoked) if (r.expiresAt.getTime() < now.getTime()) this.revoked.delete(jti);
  }
}
