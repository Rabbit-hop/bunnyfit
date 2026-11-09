import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-02 STS §8 (docs/sprints/sprint-1/F-02-exercise-library.md): AC-02 against a
// real PostgreSQL test database seeded by tests/globalSetup.ts (4 categories, 8 templates).
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-02 / TEST-02).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const SEEDED_TEMPLATES = [
  'Barbell Squat',
  'Bench Press',
  'Push-up',
  'Plank',
  'Sun Salutation',
  'Jump Rope',
  'Outdoor Run',
  'Road Cycling',
];
const SEEDED_CATEGORIES = ['Weight Training', 'Bodyweight', 'Yoga', 'Cardio'];

describeWithDatabase('F-02 exercise library (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;

  const login = async (email: string, password: string): Promise<string> => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return res.body.token as string;
  };
  const aliceToken = () => login('alice@exercise.test', env.seedParticipantPassword);
  const managerToken = () => login('manager@exercise.test', env.seedManagerPassword);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';
  /** Names created by this suite; removed in afterAll (and before, in case of a crashed earlier run). */
  const TEST_CATEGORIES = ['Mobility', 'Mobility & Stretch', 'Disposable'];
  const cleanup = async () => {
    await prisma.exerciseTemplate.deleteMany({ where: { category: { name: { in: TEST_CATEGORIES } } } });
    await prisma.category.deleteMany({ where: { name: { in: TEST_CATEGORIES } } });
  };

  beforeAll(() => {
    if (!env.seedParticipantPassword || !env.seedManagerPassword) {
      throw new Error('SEED_MANAGER_PASSWORD / SEED_PARTICIPANT_PASSWORD must be set');
    }
    prisma = newPrisma();
    app = buildIntegrationApp(prisma, new MutableClock(new Date()));
  });

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  describe('AC-02c participant is read-only', () => {
    it('TEST-02c-1: Alice reads categories, templates and one template → 200, 8 seeded templates, no createdById', async () => {
      const token = await aliceToken();
      const auth = { Authorization: `Bearer ${token}` };

      const templates = await request(app).get('/api/templates').set(auth);
      expect(templates.status).toBe(200);
      const names = (templates.body as Array<{ name: string }>).map((t) => t.name);
      for (const seeded of SEEDED_TEMPLATES) expect(names).toContain(seeded);

      const categories = await request(app).get('/api/categories').set(auth);
      expect(categories.status).toBe(200);
      const categoryNames = (categories.body as Array<{ name: string }>).map((c) => c.name);
      for (const seeded of SEEDED_CATEGORIES) expect(categoryNames).toContain(seeded);

      const run = (templates.body as Array<{ id: string; name: string }>).find((t) => t.name === 'Outdoor Run');
      expect(run).toBeDefined();
      const one = await request(app).get(`/api/templates/${run?.id}`).set(auth);
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({
        id: run?.id,
        name: 'Outdoor Run',
        category: { name: 'Cardio' },
        trackingMode: 'CARDIO_DISTANCE',
        unit: 'km',
        cardioCategory: 'RUNNING',
      });

      for (const body of [templates.body, categories.body, one.body]) {
        expect(JSON.stringify(body)).not.toContain('createdById');
      }
    });

    it('TEST-02c-3: no token → 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('AC-02a / AC-02b categories (Manager)', () => {
    it('TEST-02a-1: Manager creates category "Mobility" → 201 with id and name; one new Category row', async () => {
      const token = await managerToken();
      const before = await prisma.category.count();
      const res = await request(app).post('/api/categories').set(bearer(token)).send({ name: 'Mobility' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Mobility');
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(await prisma.category.count()).toBe(before + 1);
      const row = await prisma.category.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.name).toBe('Mobility');
    });

    it('TEST-02b-1: Manager renames a category → 200 with the new name; database row updated', async () => {
      const token = await managerToken();
      const created = await prisma.category.findFirstOrThrow({ where: { name: 'Mobility' } });
      const res = await request(app)
        .put(`/api/categories/${created.id}`)
        .set(bearer(token))
        .send({ name: 'Mobility & Stretch' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: created.id, name: 'Mobility & Stretch' });
      const row = await prisma.category.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.name).toBe('Mobility & Stretch');
    });

    it('TEST-02b-3: Manager deletes an empty category → 204; it no longer appears in GET /api/categories', async () => {
      const token = await managerToken();
      const created = await prisma.category.create({ data: { name: 'Disposable' } });
      const res = await request(app).delete(`/api/categories/${created.id}`).set(bearer(token));
      expect(res.status).toBe(204);
      const list = await request(app).get('/api/categories').set(bearer(token));
      expect((list.body as Array<{ id: string }>).map((c) => c.id)).not.toContain(created.id);
      expect(await prisma.category.count({ where: { id: created.id } })).toBe(0);
    });

    it('TEST-02b-5 (category part): PUT and DELETE on a well-formed unknown id → 404 NOT_FOUND; database unchanged', async () => {
      const token = await managerToken();
      const before = await prisma.category.findMany({ orderBy: { id: 'asc' } });
      const put = await request(app).put(`/api/categories/${NO_SUCH_ID}`).set(bearer(token)).send({ name: 'Ghost' });
      const del = await request(app).delete(`/api/categories/${NO_SUCH_ID}`).set(bearer(token));
      expect(put.status).toBe(404);
      expect(put.body.code).toBe('NOT_FOUND');
      expect(del.status).toBe(404);
      expect(del.body.code).toBe('NOT_FOUND');
      // An unmounted route also answers 404 NOT_FOUND ("No route matches ..."); the record-level 404 must come from a mounted route.
      expect(put.body.message).not.toMatch(/No route matches/);
      expect(del.body.message).not.toMatch(/No route matches/);
      expect(await prisma.category.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    });
  });
});
