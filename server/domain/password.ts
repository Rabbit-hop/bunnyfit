import bcrypt from 'bcryptjs';

/**
 * Password hashing — F-01 R1 (bcrypt, cost from BCRYPT_COST) and R5.
 * R5: for an unknown email the login path still performs a bcrypt compare
 * (against DUMMY_HASH) so response time does not reveal which emails exist.
 */

/** Hash of a random throw-away value; fixed cost 10. Never matches real input. */
export const DUMMY_HASH = bcrypt.hashSync(`dummy-${Math.random()}-${Date.now()}`, 10);

export function hashPassword(plain: string, cost: number): Promise<string> {
  return bcrypt.hash(plain, cost);
}

/**
 * `hash === null` means "no such user": compare against the dummy hash and
 * return false regardless of the result.
 */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
