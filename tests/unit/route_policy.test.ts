import { describe, expect, it } from 'vitest';
import { ROUTE_POLICIES, findRoutePolicy, type RoutePolicy } from '../../server/routes/registry.js';

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

// F-01 §4.5 — path-param matching (middleware must find the policy for `/api/entries/42`).
describe('findRoutePolicy path-param matching', () => {
  const policies: RoutePolicy[] = [
    { method: 'GET', path: '/api/entries/:id', featureId: 'T', auth: 'required', roles: ['PARTICIPANT'], ownership: 'resource-owner' },
    { method: 'GET', path: '/api/entries/today', featureId: 'T', auth: 'required', roles: ['PARTICIPANT'], ownership: 'self-scoped' },
    { method: 'PUT', path: '/api/entries/:id', featureId: 'T', auth: 'required', roles: ['PARTICIPANT'], ownership: 'resource-owner' },
    { method: 'GET', path: '/api/a/:x/b/:y', featureId: 'T', auth: 'required', roles: ['MANAGER'], ownership: 'none' },
  ];

  it('matches a :param segment', () => {
    expect(findRoutePolicy('GET', '/api/entries/42', policies)?.path).toBe('/api/entries/:id');
  });

  it('prefers the literal route over a :param route', () => {
    expect(findRoutePolicy('GET', '/api/entries/today', policies)?.ownership).toBe('self-scoped');
  });

  it('respects the method', () => {
    expect(findRoutePolicy('PUT', '/api/entries/42', policies)?.method).toBe('PUT');
    expect(findRoutePolicy('DELETE', '/api/entries/42', policies)).toBeUndefined();
  });

  it('matches several params and ignores a trailing slash and query string', () => {
    expect(findRoutePolicy('GET', '/api/a/1/b/2/', policies)?.roles).toEqual(['MANAGER']);
    expect(findRoutePolicy('GET', '/api/entries/42?x=1', policies)?.path).toBe('/api/entries/:id');
  });

  it('does not match a different segment count or an empty param', () => {
    expect(findRoutePolicy('GET', '/api/entries', policies)).toBeUndefined();
    expect(findRoutePolicy('GET', '/api/entries/42/extra', policies)).toBeUndefined();
    expect(findRoutePolicy('GET', '/api/entries/', policies)).toBeUndefined();
  });
});
