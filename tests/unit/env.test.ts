import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return import('../../server/config/env.js');
}

describe('env config validation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['0', '-1', '65536'])('rejects PORT=%s at load time', async (port) => {
    await expect(loadEnv({ PORT: port })).rejects.toThrow(/PORT/);
  });

  it('accepts a valid PORT', async () => {
    const { env } = await loadEnv({ PORT: '8099' });
    expect(env.port).toBe(8099);
  });

  describe('SUP-01 JWT_SECRET startup check (R10)', () => {
    it('SUP-01-1 rejects a missing JWT_SECRET', async () => {
      const { requireJwtSecret } = await loadEnv({ JWT_SECRET: '' });
      expect(() => requireJwtSecret()).toThrow(/JWT_SECRET/);
    });

    it('SUP-01-2 rejects an ASCII JWT_SECRET of 31 bytes', async () => {
      const { requireJwtSecret } = await loadEnv({ JWT_SECRET: 'a'.repeat(31) });
      expect(() => requireJwtSecret()).toThrow(/JWT_SECRET/);
    });

    it('SUP-01-3 accepts an ASCII JWT_SECRET of 32 bytes', async () => {
      const secret = 'a'.repeat(32);
      const { requireJwtSecret } = await loadEnv({ JWT_SECRET: secret });
      expect(requireJwtSecret()).toBe(secret);
    });

    it('SUP-01 counts UTF-8 bytes: 11 three-byte characters (33 bytes, 11 chars) are accepted', async () => {
      const secret = '\u0e01'.repeat(11);
      const { requireJwtSecret } = await loadEnv({ JWT_SECRET: secret });
      expect(requireJwtSecret()).toBe(secret);
    });

    it('SUP-01 does not make merely importing the config fail without a secret', async () => {
      await expect(loadEnv({ JWT_SECRET: '' })).resolves.toBeDefined();
    });
  });
});
