import bcrypt from 'bcryptjs';

/**
 * Password hashing — F-01 R1 (bcrypt, cost from BCRYPT_COST) and R5.
 * R5: for an unknown email the login path still performs a bcrypt compare
 * (against a dummy hash of the SAME cost as real hashes) so response time does
 * not reveal which emails exist, whatever BCRYPT_COST is.
 */

const dummyHashes = new Map<number, string>();

/** Hash of a random throw-away value at `cost`, built once per cost. Never matches real input. */
export function dummyHashFor(cost: number): string {
  let hash = dummyHashes.get(cost);
  if (hash === undefined) {
    hash = bcrypt.hashSync(`dummy-${Math.random()}-${Date.now()}`, cost);
    dummyHashes.set(cost, hash);
  }
  return hash;
}

export function hashPassword(plain: string, cost: number): Promise<string> {
  return bcrypt.hash(plain, cost);
}

/**
 * `hash === null` means "no such user": compare against a dummy hash of the
 * configured `cost` and return false regardless of the result.
 */
export async function verifyPassword(plain: string, hash: string | null, cost: number): Promise<boolean> {
  if (hash === null) {
    await bcrypt.compare(plain, dummyHashFor(cost));
    return false;
  }
  return bcrypt.compare(plain, hash);
}
