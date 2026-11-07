import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../server/domain/password.js';

// F-01 R1, R5; TEST-01e-2 (cost factor), TEST-01b-1 (dummy compare for unknown email).
const COST = 4; // minimum allowed by env validation; keeps the unit test fast

describe('hashPassword / verifyPassword (R1)', () => {
  it('TEST-01e-2: produces a 60-char bcrypt hash with the configured cost', async () => {
    const hash = await hashPassword('s3cret-pass', COST);
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).toHaveLength(60);
    expect(bcrypt.getRounds(hash)).toBe(COST);
    expect(hash).not.toContain('s3cret-pass');
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('s3cret-pass', COST);
    await expect(verifyPassword('s3cret-pass', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-pass', hash)).resolves.toBe(false);
  });
});

describe('verifyPassword with no stored hash (R5)', () => {
  it('TEST-01b-1: still runs a bcrypt compare against the dummy hash and returns false', async () => {
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$\d{2}\$/);
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
  });

  it('never returns true for the dummy hash, whatever the input', async () => {
    await expect(verifyPassword('', null)).resolves.toBe(false);
    await expect(verifyPassword('password', DUMMY_HASH)).resolves.toBe(false);
  });
});
