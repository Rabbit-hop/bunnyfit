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
  const TEST_CATEGORIES = ['Mobility', 'Mobility & Stretch', 'Disposable', 'Mobility Extra'];
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

  describe('AC-02a / AC-02b templates (Manager)', () => {
    const MODES = [
      { trackingMode: 'WEIGHT', unit: 'reps' },
      { trackingMode: 'BODYWEIGHT_REPS', unit: 'reps' },
      { trackingMode: 'BODYWEIGHT_TIME', unit: 'seconds' },
      { trackingMode: 'YOGA', unit: 'seconds' },
      { trackingMode: 'CARDIO_TIME', unit: 'seconds' },
      { trackingMode: 'CARDIO_DISTANCE', unit: 'km', cardioCategory: 'RUNNING' },
    ];
    const created: Array<{ id: string; trackingMode: string }> = [];
    let categoryId: string;

    const templateBody = (extra: Record<string, unknown>) => ({
      categoryId,
      name: `Tpl ${String(extra['trackingMode'])} ${String(extra['cardioCategory'] ?? '')}`.trim(),
      targetBodyPart: 'Full body',
      metValue: 4.5,
      ...extra,
    });

    beforeAll(async () => {
      categoryId = (await prisma.category.create({ data: { name: 'Mobility' } })).id;
    });

    it('TEST-02a-2: POST one template per tracking mode → 201, unit reps/reps/seconds/seconds/seconds/km, 6 new rows', async () => {
      const token = await managerToken();
      const before = await prisma.exerciseTemplate.count();
      for (const m of MODES) {
        const res = await request(app)
          .post('/api/templates')
          .set(bearer(token))
          .send(templateBody({ trackingMode: m.trackingMode, ...(m.cardioCategory ? { cardioCategory: m.cardioCategory } : {}) }));
        expect(res.status).toBe(201);
        expect(res.body.unit).toBe(m.unit);
        expect(res.body.trackingMode).toBe(m.trackingMode);
        expect(res.body.category).toEqual({ id: categoryId, name: 'Mobility' });
        expect(JSON.stringify(res.body)).not.toContain('createdById');
        created.push({ id: res.body.id, trackingMode: m.trackingMode });
      }
      expect(await prisma.exerciseTemplate.count()).toBe(before + 6);
      const row = await prisma.exerciseTemplate.findUniqueOrThrow({ where: { id: created[5]?.id ?? '' } });
      expect(row.metValue.toNumber()).toBe(4.5);
      expect(row.createdById).toBeTruthy();
    });

    it('TEST-02a-3: CARDIO_DISTANCE with RUNNING, WALKING, CYCLING, SWIMMING → 201; cardioCategory stored as sent', async () => {
      const token = await managerToken();
      for (const cardioCategory of ['WALKING', 'CYCLING', 'SWIMMING']) {
        const res = await request(app)
          .post('/api/templates')
          .set(bearer(token))
          .send(templateBody({ trackingMode: 'CARDIO_DISTANCE', cardioCategory }));
        expect(res.status).toBe(201);
        expect(res.body.cardioCategory).toBe(cardioCategory);
        const row = await prisma.exerciseTemplate.findUniqueOrThrow({ where: { id: res.body.id } });
        expect(row.cardioCategory).toBe(cardioCategory);
      }
      // RUNNING was stored by TEST-02a-2.
      const running = await prisma.exerciseTemplate.findUniqueOrThrow({ where: { id: created[5]?.id ?? '' } });
      expect(running.cardioCategory).toBe('RUNNING');
    });

    it('TEST-02a-4: CARDIO_DISTANCE without cardioCategory → 400 VALIDATION_ERROR naming cardioCategory; no new row', async () => {
      const token = await managerToken();
      const before = await prisma.exerciseTemplate.count();
      const res = await request(app)
        .post('/api/templates')
        .set(bearer(token))
        .send(templateBody({ name: 'No cardio category', trackingMode: 'CARDIO_DISTANCE' }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields.map((f: { field: string }) => f.field)).toContain('cardioCategory');
      expect(await prisma.exerciseTemplate.count()).toBe(before);
    });

    it('TEST-02a-5: after a restart (new application instance) GET /api/templates/:id returns the same data', async () => {
      const token = await managerToken();
      expect(created).toHaveLength(6); // precondition: the templates of TEST-02a-2 exist
      const otherPrisma = newPrisma();
      try {
        const restarted = buildIntegrationApp(otherPrisma, new MutableClock(new Date()));
        const login2 = await request(restarted)
          .post('/api/auth/login')
          .send({ email: 'manager@exercise.test', password: env.seedManagerPassword });
        expect(login2.status).toBe(200);
        for (const t of created) {
          const before = await request(app).get(`/api/templates/${t.id}`).set(bearer(token));
          const after = await request(restarted).get(`/api/templates/${t.id}`).set(bearer(login2.body.token));
          expect(after.status).toBe(200);
          expect(after.body).toEqual(before.body);
          expect(after.body.trackingMode).toBe(t.trackingMode);
        }
      } finally {
        await otherPrisma.$disconnect();
      }
    });

    it('TEST-02b-2: PUT changes name, targetBodyPart, metValue, rangeMax and categoryId → 200; response and database show them; updatedAt later', async () => {
      const token = await managerToken();
      const other = await prisma.category.create({ data: { name: 'Mobility Extra' } });
      const target = created[0];
      const beforeRow = await prisma.exerciseTemplate.findUniqueOrThrow({ where: { id: target?.id ?? '' } });
      await new Promise((r) => setTimeout(r, 15));
      const res = await request(app)
        .put(`/api/templates/${target?.id}`)
        .set(bearer(token))
        .send({ categoryId: other.id, name: 'Renamed squat', targetBodyPart: 'Legs and core', metValue: 5.5, rangeMax: 3000 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: target?.id,
        category: { id: other.id, name: 'Mobility Extra' },
        name: 'Renamed squat',
        targetBodyPart: 'Legs and core',
        metValue: 5.5,
        rangeMax: 3000,
        trackingMode: 'WEIGHT',
      });
      const row = await prisma.exerciseTemplate.findUniqueOrThrow({ where: { id: target?.id ?? '' } });
      expect([row.categoryId, row.name, row.targetBodyPart, row.metValue.toNumber(), row.rangeMax.toNumber()]).toEqual([
        other.id,
        'Renamed squat',
        'Legs and core',
        5.5,
        3000,
      ]);
      expect(row.updatedAt.getTime()).toBeGreaterThan(beforeRow.updatedAt.getTime());
    });

    it('TEST-02b-4: DELETE a template → 204, then GET → 404 NOT_FOUND', async () => {
      const token = await managerToken();
      const target = created[1];
      const del = await request(app).delete(`/api/templates/${target?.id}`).set(bearer(token));
      expect(del.status).toBe(204);
      const get = await request(app).get(`/api/templates/${target?.id}`).set(bearer(token));
      expect(get.status).toBe(404);
      expect(get.body.code).toBe('NOT_FOUND');
      expect(get.body.message).not.toMatch(/No route matches/);
    });

    it('TEST-02b-5 (template part): PUT and DELETE on a well-formed unknown id → 404 NOT_FOUND; database unchanged', async () => {
      const token = await managerToken();
      const before = await prisma.exerciseTemplate.findMany({ orderBy: { id: 'asc' } });
      const put = await request(app)
        .put(`/api/templates/${NO_SUCH_ID}`)
        .set(bearer(token))
        .send({ categoryId, name: 'Ghost', targetBodyPart: 'None', metValue: 3 });
      const del = await request(app).delete(`/api/templates/${NO_SUCH_ID}`).set(bearer(token));
      for (const res of [put, del]) {
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
        expect(res.body.message).not.toMatch(/No route matches/);
      }
      expect(await prisma.exerciseTemplate.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    });
  });

  describe('AC-02c participant cannot write', () => {
    it('TEST-02c-2: Alice POST/PUT/DELETE on templates and categories (one with an invalid body) → 403 FORBIDDEN; database unchanged', async () => {
      const token = await aliceToken();
      const auth = bearer(token);
      const snapshot = async () => ({
        categories: await prisma.category.findMany({ orderBy: { id: 'asc' } }),
        templates: await prisma.exerciseTemplate.findMany({ orderBy: { id: 'asc' } }),
      });
      const someTemplate = await prisma.exerciseTemplate.findFirstOrThrow();
      const someCategory = await prisma.category.findFirstOrThrow();
      const before = await snapshot();

      const responses = [
        await request(app).post('/api/templates').set(auth).send({ categoryId: someCategory.id, name: 'X', targetBodyPart: 'Y', trackingMode: 'WEIGHT', metValue: 3 }),
        await request(app).put(`/api/templates/${someTemplate.id}`).set(auth).send({ name: 'Hacked' }),
        await request(app).delete(`/api/templates/${someTemplate.id}`).set(auth),
        await request(app).post('/api/categories').set(auth).send({ name: 'Hacked' }),
        await request(app).put(`/api/categories/${someCategory.id}`).set(auth).send({ name: 'Hacked' }),
        await request(app).delete(`/api/categories/${someCategory.id}`).set(auth),
        // invalid body: authorization is checked before validation (R1)
        await request(app).post('/api/templates').set(auth).send({ name: '' }),
      ];
      for (const res of responses) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
      }
      expect(await snapshot()).toEqual(before);
    });
  });
});
