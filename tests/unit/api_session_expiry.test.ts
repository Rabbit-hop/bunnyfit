import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The web modules use browser-only types and extensionless imports that the server tsconfig cannot
// compile, so they are loaded at run time (Vitest resolves them) instead of imported statically.
const API_PATH = '../../web/src/lib/api';
const SESSION_PATH = '../../web/src/auth/session';
type AppUser = { id: string; email: string; role: 'PARTICIPANT' | 'MANAGER'; displayName: string };
const api = (await import(API_PATH)) as {
  SESSION_EXPIRED_EVENT: string;
  apiFetch: (path: string, init?: RequestInit) => Promise<unknown>;
};
const { destroySession, getToken, saveSession } = (await import(SESSION_PATH)) as {
  destroySession: () => void;
  getToken: () => string | null;
  saveSession: (token: string, user: AppUser) => void;
};
const { SESSION_EXPIRED_EVENT, apiFetch } = api;

// Issue #122 (UAT-S1-02 step 6): a request sent before Log out can get its 401 after the token was
// revoked. That late 401 must not be reported as an expired session, or the browser ends on
// /login?reason=expired instead of /login. Supplementary unit test, not an RTM test file.

const USER = { id: 'u1', email: 'a@example.test', role: 'PARTICIPANT' as const, displayName: 'A' };

function unauthorized(): Response {
  return new Response(JSON.stringify({ code: 'UNAUTHENTICATED', message: 'x', fields: [] }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch session-expired event (#122)', () => {
  let events: number;
  let target: EventTarget;

  beforeEach(() => {
    events = 0;
    target = new EventTarget();
    target.addEventListener(SESSION_EXPIRED_EVENT, () => {
      events += 1;
    });
    vi.stubGlobal('window', target);
    destroySession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    destroySession();
  });

  it('a 401 for the current token destroys the session and reports it expired', async () => {
    saveSession('tok-1', USER);
    vi.stubGlobal('fetch', vi.fn(async () => unauthorized()));

    await expect(apiFetch('/api/progress/daily')).rejects.toMatchObject({ status: 401 });

    expect(events).toBe(1);
    expect(getToken()).toBeNull();
  });

  it('a late 401 after Log out already cleared the token is not reported as expired', async () => {
    saveSession('tok-1', USER);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        destroySession(); // Log out finished while this request was in flight
        return unauthorized();
      }),
    );

    await expect(apiFetch('/api/progress/daily')).rejects.toMatchObject({ status: 401 });

    expect(events).toBe(0);
  });

  it('a late 401 for an old token does not expire a newer session', async () => {
    saveSession('tok-1', USER);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        saveSession('tok-2', USER); // signed in again while the old request was in flight
        return unauthorized();
      }),
    );

    await expect(apiFetch('/api/progress/daily')).rejects.toMatchObject({ status: 401 });

    expect(events).toBe(0);
    expect(getToken()).toBe('tok-2');
  });
});
