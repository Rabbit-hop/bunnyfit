import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import type { PrismaClient, TrackingMode } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { isoDaysToMask } from '../../server/domain/planValidation.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// AC-21a / NFR-01 (F-06 STS §8, TEST-21a-1..4, Sprint 2, CHANGE-03): 500 requests per endpoint at
// concurrency 50 against a real PostgreSQL test database seeded with the documented dataset
// (F-06 §5: 3 Participants x 8 plan items x 30 days, about 700 entries each). p95 < 500 ms for the
// progress and ledger endpoints; login is measured separately (p95 < 1,000 ms). The run prints
// the dataset size, run date, commit and every figure, and writes them to test-results/.
//
// This is an on-demand benchmark (SDS §9: "On demand / release PR"), not part of `pnpm test`:
//   pnpm run test:perf
// A missed target is reported with its figure and becomes a defect (plan R7); the thresholds
// are never loosened here.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-21a / TEST-21a).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-05T03:00:00.000Z'); // Thu 5 Nov 2026 10:00 Asia/Bangkok
const TODAY = '2026-11-05';
const HISTORY_DAYS = 30;
const FIRST_DAY = '2026-10-07'; // 30 days up to and including TODAY
const ENTRIES_PER_ITEM_DAY = 3;
const REQUESTS = 500;
const CONCURRENCY = 50;
const WARMUP = 20;
const P95_TARGET_MS = 500;
const LOGIN_P95_TARGET_MS = 1000;
const WRITER_EXERCISES = 50;

const PERF_EMAILS = [1, 2, 3].map((n) => `perf-participant-${n}@exercise.test`);
const WRITER_EMAIL = 'perf-writer@exercise.test';
const ALL_PERF_EMAILS = [...PERF_EMAILS, WRITER_EMAIL];

interface Result {
  test: string;
  endpoint: string;
  requests: number;
  concurrency: number;
  failures: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  meanMs: number;
  wallMs: number;
  requestsPerSecond: number;
}

/** Nearest-rank percentile of an ascending array. */
const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;
const round = (value: number): number => Math.round(value * 10) / 10;

describeWithDatabase('AC-21a latency benchmark (real PostgreSQL, in-process HTTP server)', () => {
  let prisma: PrismaClient;
  let server: Server;
  let baseUrl = '';
  let readerToken = '';
  let writerToken = '';
  let writerExerciseIds: string[] = [];
  let seededEntries = 0;
  let seededPlanItems = 0;
  const results: Result[] = [];

  const cleanup = async () => {
    const users = await prisma.user.findMany({ where: { email: { in: ALL_PERF_EMAILS } }, select: { id: true } });
    const userId = { in: users.map((u) => u.id) };
    await prisma.ledgerEntry.deleteMany({ where: { userId } });
    await prisma.planItem.deleteMany({ where: { userId } });
    await prisma.userExercise.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  };

  const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
  const dates = (): string[] => {
    const out: string[] = [];
    for (let t = Date.parse(`${FIRST_DAY}T00:00:00.000Z`); out.length < HISTORY_DAYS; t += 86_400_000) {
      out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
  };

  /** Documented dataset (F-06 §5): 8 plan items (one per seeded template) and 30 days of entries. */
  const seedParticipant = async (email: string, passwordHash: string) => {
    const user = await prisma.user.create({
      data: { email, passwordHash, role: 'PARTICIPANT', displayName: email.split('@')[0] ?? email },
    });
    const templates = await prisma.exerciseTemplate.findMany({ orderBy: { name: 'asc' } });
    const history = dates();
    for (const t of templates) {
      const exercise = await prisma.userExercise.create({
        data: {
          userId: user.id,
          sourceTemplateId: t.id,
          name: t.name,
          targetBodyPart: t.targetBodyPart,
          unit: t.unit,
          trackingMode: t.trackingMode,
          cardioCategory: t.cardioCategory,
          metValue: t.metValue,
          rangeMin: t.rangeMin,
          rangeMax: t.rangeMax,
        },
      });
      const mode: TrackingMode = t.trackingMode;
      const repsMode = mode === 'WEIGHT' || mode === 'BODYWEIGHT_REPS';
      const distanceMode = mode === 'CARDIO_DISTANCE';
      await prisma.planItem.create({
        data: {
          userId: user.id,
          userExerciseId: exercise.id,
          priorityWeight: 3,
          effectiveFrom: day(FIRST_DAY),
          repeatDays: isoDaysToMask([1, 2, 3, 4, 5, 6, 7]),
          ...(repsMode
            ? { targetSets: 3, targetRepsPerSet: 10, ...(mode === 'WEIGHT' ? { loadKg: 40 } : {}) }
            : distanceMode
              ? { targetDistanceKm: 5 }
              : { targetDurationSec: 600 }),
        },
      });
      seededPlanItems += 1;
      const rows = history.flatMap((date) =>
        Array.from({ length: ENTRIES_PER_ITEM_DAY }, () => ({
          userId: user.id,
          userExerciseId: exercise.id,
          logDate: day(date),
          kind: 'MANUAL' as const,
          ...(repsMode ? { sets: 1, totalReps: 10 } : distanceMode ? { distanceKm: 1.5 } : { durationSec: 120 }),
        })),
      );
      await prisma.ledgerEntry.createMany({ data: rows });
      seededEntries += rows.length;
    }
    return user;
  };

  /** A user that only receives write load: 50 planned CARDIO_TIME exercises (distinct per request, STS). */
  const seedWriter = async (passwordHash: string) => {
    const user = await prisma.user.create({
      data: { email: WRITER_EMAIL, passwordHash, role: 'PARTICIPANT', displayName: 'perf-writer' },
    });
    const ids: string[] = [];
    for (let i = 0; i < WRITER_EXERCISES; i += 1) {
      const exercise = await prisma.userExercise.create({
        data: {
          userId: user.id,
          isCustom: true,
          name: `Perf Walk ${i + 1}`,
          targetBodyPart: 'Legs',
          unit: 'seconds',
          trackingMode: 'CARDIO_TIME',
          metValue: 3.5,
          rangeMin: 1,
          rangeMax: 10800,
        },
      });
      await prisma.planItem.create({
        data: {
          userId: user.id,
          userExerciseId: exercise.id,
          priorityWeight: 1,
          effectiveFrom: day(TODAY),
          repeatDays: isoDaysToMask([1, 2, 3, 4, 5, 6, 7]),
          targetDurationSec: 600,
        },
      });
      ids.push(exercise.id);
    }
    return ids;
  };

  const login = async (email: string): Promise<string> => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: env.seedParticipantPassword }),
    });
    const body = (await res.json()) as { token?: string };
    if (res.status !== 200 || !body.token) throw new Error(`fixture login failed for ${email}: ${res.status}`);
    return body.token;
  };

  interface Spec {
    method: 'GET' | 'POST';
    path: string;
    token?: string;
    body?: unknown;
  }

  /** `requests` calls with at most `concurrency` in flight; every response is read and its status checked. */
  const runLoad = async (
    test: string,
    endpoint: string,
    build: (i: number) => Spec,
    okStatuses: number[],
    requests = REQUESTS,
    concurrency = CONCURRENCY,
  ): Promise<Result> => {
    const call = async (i: number): Promise<{ ms: number; ok: boolean }> => {
      const spec = build(i);
      const started = performance.now();
      const res = await fetch(`${baseUrl}${spec.path}`, {
        method: spec.method,
        headers: {
          ...(spec.token ? { authorization: `Bearer ${spec.token}` } : {}),
          ...(spec.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      });
      await res.arrayBuffer();
      return { ms: performance.now() - started, ok: okStatuses.includes(res.status) };
    };

    for (let i = 0; i < WARMUP; i += 1) await call(-1 - i); // unmeasured: connections, JIT, query plans

    const samples: number[] = [];
    let failures = 0;
    let next = 0;
    const wallStart = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < requests) {
          const i = next;
          next += 1;
          const { ms, ok } = await call(i);
          samples.push(ms);
          if (!ok) failures += 1;
        }
      }),
    );
    const wallMs = performance.now() - wallStart;
    samples.sort((a, b) => a - b);
    const result: Result = {
      test,
      endpoint,
      requests,
      concurrency,
      failures,
      p50Ms: round(percentile(samples, 0.5)),
      p95Ms: round(percentile(samples, 0.95)),
      maxMs: round(samples[samples.length - 1] ?? 0),
      meanMs: round(samples.reduce((a, b) => a + b, 0) / samples.length),
      wallMs: round(wallMs),
      requestsPerSecond: round((requests / wallMs) * 1000),
    };
    results.push(result);
    console.log(`[AC-21a] ${test} ${endpoint}: p50 ${result.p50Ms} ms, p95 ${result.p95Ms} ms, max ${result.maxMs} ms, ${result.failures} failed of ${requests}`);
    return result;
  };

  const writerExercise = (i: number): string => {
    const index = ((i % WRITER_EXERCISES) + WRITER_EXERCISES) % WRITER_EXERCISES;
    return writerExerciseIds[index] ?? '';
  };

  const expectWithin = (result: Result, targetMs: number) => {
    expect(result.failures, `${result.endpoint}: ${result.failures} of ${result.requests} responses were not the expected status`).toBe(0);
    expect(result.p95Ms, `${result.endpoint} p95 ${result.p95Ms} ms (target < ${targetMs} ms)`).toBeLessThan(targetMs);
  };

  beforeAll(async () => {
    prisma = newPrisma();
    await cleanup();
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } });
    for (const email of PERF_EMAILS) await seedParticipant(email, alice.passwordHash);
    writerExerciseIds = await seedWriter(alice.passwordHash);

    const app = buildIntegrationApp(prisma, new MutableClock(NOW));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    readerToken = await login(PERF_EMAILS[0] ?? '');
    writerToken = await login(WRITER_EMAIL);
  }, 300_000);

  afterAll(async () => {
    server?.close();
    const git = (cmd: string): string => {
      try {
        return execSync(cmd, { encoding: 'utf8' }).trim();
      } catch {
        return 'unknown';
      }
    };
    const dbVersion = ((await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`)[0]?.version ?? 'unknown').split(' on ')[0];
    const report = {
      runDate: new Date().toISOString(),
      commit: git('git rev-parse HEAD'),
      workingTreeClean: git('git status --porcelain --untracked-files=no') === '',
      dataset: {
        participants: PERF_EMAILS.length,
        planItemsPerParticipant: seededPlanItems / PERF_EMAILS.length,
        daysOfEntries: HISTORY_DAYS,
        entriesPerParticipant: seededEntries / PERF_EMAILS.length,
        totalEntries: seededEntries,
        writerUser: { exercises: WRITER_EXERCISES, note: 'receives POST /api/entries and quick-complete load only' },
        clock: NOW.toISOString(),
      },
      load: { requestsPerEndpoint: REQUESTS, concurrency: CONCURRENCY, warmupRequests: WARMUP },
      environment: {
        node: process.version,
        os: `${os.type()} ${os.release()} ${os.arch()}`,
        cpu: `${os.cpus()[0]?.model ?? 'unknown'} x${os.cpus().length}`,
        memoryGb: Math.round(os.totalmem() / 1024 ** 3),
        database: dbVersion,
        bcryptCost: process.env['BCRYPT_COST'] ?? 'default',
        note: 'client, server and PostgreSQL (docker, localhost) share one machine',
      },
      targetsMs: { progressAndLedgerP95: P95_TARGET_MS, loginP95: LOGIN_P95_TARGET_MS },
      results,
    };
    mkdirSync('test-results', { recursive: true });
    const file = `test-results/latency-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(`[AC-21a] report written to ${file}\n${JSON.stringify(report.dataset)}`);
    await cleanup();
    await prisma.$disconnect();
  }, 300_000);

  it('dataset size matches F-06 §5 (3 Participants x 8 plan items x 30 days, 720 entries each)', () => {
    expect(seededPlanItems).toBe(PERF_EMAILS.length * 8);
    expect(seededEntries).toBe(PERF_EMAILS.length * 8 * HISTORY_DAYS * ENTRIES_PER_ITEM_DAY);
  });

  it('TEST-21a-1: GET /api/progress/daily p95 < 500 ms', async () => {
    const result = await runLoad('TEST-21a-1', 'GET /api/progress/daily', () => ({ method: 'GET', path: '/api/progress/daily', token: readerToken }), [200]);
    expectWithin(result, P95_TARGET_MS);
  }, 300_000);

  it('TEST-21a-2: GET /api/progress/monthly p95 < 500 ms (current month 2026-11 and past month 2026-10)', async () => {
    const current = await runLoad('TEST-21a-2', 'GET /api/progress/monthly?month=2026-11', () => ({ method: 'GET', path: '/api/progress/monthly?month=2026-11', token: readerToken }), [200]);
    const past = await runLoad('TEST-21a-2', 'GET /api/progress/monthly?month=2026-10', () => ({ method: 'GET', path: '/api/progress/monthly?month=2026-10', token: readerToken }), [200]);
    expectWithin(current, P95_TARGET_MS);
    expectWithin(past, P95_TARGET_MS);
  }, 300_000);

  it('TEST-21a-3: GET /api/entries, POST /api/entries and POST /api/entries/quick-complete p95 < 500 ms each', async () => {
    const list = await runLoad('TEST-21a-3', 'GET /api/entries', () => ({ method: 'GET', path: `/api/entries?date=${TODAY}`, token: readerToken }), [200]);
    const post = await runLoad(
      'TEST-21a-3',
      'POST /api/entries',
      (i) => ({ method: 'POST', path: '/api/entries', token: writerToken, body: { userExerciseId: writerExercise(i), durationSec: 1 } }),
      [201],
    );
    // 201 on the first completion of an exercise, 200 with `entry: null` once it is complete (idempotent).
    const quick = await runLoad(
      'TEST-21a-3',
      'POST /api/entries/quick-complete',
      (i) => ({ method: 'POST', path: '/api/entries/quick-complete', token: writerToken, body: { userExerciseId: writerExercise(i) } }),
      [200, 201],
    );
    expectWithin(list, P95_TARGET_MS);
    expectWithin(post, P95_TARGET_MS);
    expectWithin(quick, P95_TARGET_MS);
  }, 300_000);

  it('TEST-21a-4: 500 POST /api/auth/login at concurrency 50, measured separately, p95 < 1,000 ms', async () => {
    const result = await runLoad(
      'TEST-21a-4',
      'POST /api/auth/login',
      () => ({ method: 'POST', path: '/api/auth/login', body: { email: PERF_EMAILS[0], password: env.seedParticipantPassword } }),
      [200],
    );
    expectWithin(result, LOGIN_P95_TARGET_MS);
  }, 300_000);
});
