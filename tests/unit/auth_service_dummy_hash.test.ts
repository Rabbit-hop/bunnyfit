import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../../server/domain/authService.js';
import { FixedClock } from '../../server/domain/clock.js';
import { FakeAuthRepo } from '../helpers/fakeAuthRepo.js';

// R5: the dummy hash is built when the service is created, so the first
// unknown-email login after start-up does no extra hashing (no one-off timing
// difference, no synchronous hash on the request path).
// Cost 7 is used by this file only, so the per-cost cache is cold here.
const COST = 7;

describe('createAuthService R5 dummy hash', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds the dummy hash at creation, not on the first unknown-email login', async () => {
    const hashSync = vi.spyOn(bcrypt, 'hashSync');
    const service = createAuthService({
      repo: new FakeAuthRepo(),
      clock: new FixedClock(new Date('2026-11-08T00:00:00Z')),
      secret: 'unit-test-secret-0123456789abcdefghij',
      expiresInSeconds: 3600,
      bcryptCost: COST,
    });
    expect(hashSync).toHaveBeenCalledWith(expect.any(String), COST);

    hashSync.mockClear();
    await expect(service.login({ email: 'nobody@exercise.test', password: 'x' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(hashSync).not.toHaveBeenCalled();
  });
});
