import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// R10 at the process level: server/index.ts must refuse to start (exit ≠ 0, naming
// JWT_SECRET) before listening. requireJwtSecret() itself is covered in env.test.ts.
const run = (jwtSecret: string) =>
  spawnSync('pnpm', ['exec', 'tsx', 'server/index.ts'], {
    env: { ...process.env, NODE_ENV: 'test', PORT: '18099', JWT_SECRET: jwtSecret },
    encoding: 'utf8',
    timeout: 15_000,
    // pnpm is a .cmd/sh shim on Windows; Node cannot spawn it without a shell.
    shell: process.platform === 'win32',
  });

describe('server startup (R10)', () => {
  it.each([
    ['missing', ''],
    ['31 bytes', 'a'.repeat(31)],
  ])('SUP-01: exits non-zero without listening when JWT_SECRET is %s', (_name, secret) => {
    const res = run(secret);
    expect(res.error).toBeUndefined();
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/JWT_SECRET/);
    expect(res.stdout).not.toMatch(/listening/);
  });
});
