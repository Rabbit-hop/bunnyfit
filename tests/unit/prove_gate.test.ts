import { describe, expect, it } from 'vitest';

// TEMPORARY, issue #48 (Lab 5 C-02). This test fails on purpose to show that a failing
// required check blocks the merge. The branch test/48-prove-gate and its PR are closed
// without merging; this file must never reach staging or main.
describe('prove-gate (intentional failure, never merge)', () => {
  it('fails so the required check `test` turns red', () => {
    expect(1 + 1).toBe(3);
  });
});
