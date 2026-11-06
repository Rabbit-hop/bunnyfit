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
});
