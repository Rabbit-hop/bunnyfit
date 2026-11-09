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

  beforeAll(() => {
    if (!env.seedParticipantPassword || !env.seedManagerPassword) {
      throw new Error('SEED_MANAGER_PASSWORD / SEED_PARTICIPANT_PASSWORD must be set');
    }
    prisma = newPrisma();
    app = buildIntegrationApp(prisma, new MutableClock(new Date()));
  });

  afterAll(async () => {
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
});
