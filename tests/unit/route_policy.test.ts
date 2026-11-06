import { describe, expect, it } from 'vitest';
import { ROUTE_POLICIES, findRoutePolicy } from '../../server/routes/registry.js';

describe('route policy registry (SDS §6.3)', () => {
  it('registers every route exactly once (method + path unique)', () => {
    const keys = ROUTE_POLICIES.map((policy) => `${policy.method} ${policy.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('health is registered as public with feature SYS-01', () => {
    const health = findRoutePolicy('GET', '/api/health');
    expect(health).toBeDefined();
    expect(health?.auth).toBe('public');
    expect(health?.ownership).toBe('none');
    expect(health?.featureId).toBe('SYS-01');
  });

  it('public routes declare no roles and no ownership', () => {
    for (const policy of ROUTE_POLICIES) {
      if (policy.auth === 'public') {
        expect(policy.roles).toEqual([]);
        expect(policy.ownership).toBe('none');
      }
    }
  });
});
