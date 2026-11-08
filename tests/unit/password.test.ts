import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { dummyHashFor, hashPassword, verifyPassword } from '../../server/domain/password.js';

// F-01 R1, R5 (cost factor; dummy compare for an unknown e-mail) at unit level.
const COST = 4; // minimum allowed by env validation; keeps the unit test fast

describe('hashPassword / verifyPassword (R1)', () => {
  it('produces a 60-char bcrypt hash with the configured cost', async () => {
    const hash = await hashPassword('s3cret-pass', COST);
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).toHaveLength(60);
    expect(bcrypt.getRounds(hash)).toBe(COST);
    expect(hash).not.toContain('s3cret-pass');
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('s3cret-pass', COST);
    await expect(verifyPassword('s3cret-pass', hash, COST)).resolves.toBe(true);
    await expect(verifyPassword('wrong-pass', hash, COST)).resolves.toBe(false);
  });
});

describe('verifyPassword with no stored hash (R5)', () => {
  it('still runs a bcrypt compare against the dummy hash and returns false', async () => {
    await expect(verifyPassword('anything', null, COST)).resolves.toBe(false);
  });

  it('dummy hash uses the configured cost, so unknown-email timing matches real users (R5)', () => {
    for (const cost of [4, 5, 6]) {
      expect(dummyHashFor(cost)).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(bcrypt.getRounds(dummyHashFor(cost))).toBe(cost);
    }
    expect(dummyHashFor(4)).toBe(dummyHashFor(4)); // cached, not re-hashed per login
  });

  it('never returns true for the dummy hash, whatever the input', async () => {
    await expect(verifyPassword('', null, COST)).resolves.toBe(false);
    await expect(verifyPassword('password', dummyHashFor(COST), COST)).resolves.toBe(false);
  });
});
