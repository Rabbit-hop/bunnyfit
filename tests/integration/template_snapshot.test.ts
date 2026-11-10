import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../server/config/env.js';
import { buildIntegrationApp, databaseUrl, MutableClock, newPrisma } from '../helpers/integrationApp.js';

// F-03 STS §8 AC-27 (Copy-on-Select snapshot isolation, Decision 12). The contract's example is
// "Push-up"; editing or deleting a seeded template would break other suites, so the Manager creates
// a Push-up-like template for this suite through the F-02 API and the suite removes it afterwards.
if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('DATABASE_URL_TEST is required in CI (AC-27 / TEST-27).');
}
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const NOW = new Date('2026-11-05T03:00:00.000Z'); // Thu 5 Nov 2026 10:00 Asia/Bangkok
const CATEGORY = 'F03 Snapshot';

describeWithDatabase('F-03 snapshot isolation (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildIntegrationApp>;
  let managerAuth: { Authorization: string };
  let aliceAuth: { Authorization: string };
  let templateId: string;
  let categoryId: string;

  const token = async (email: string, password: string) =>
    ({ Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ email, password })).body.token as string}` });
  const cleanup = async () => {
    await prisma.planItem.deleteMany();
    await prisma.userExercise.deleteMany();
    await prisma.exerciseTemplate.deleteMany({ where: { category: { name: CATEGORY } } });
    await prisma.category.deleteMany({ where: { name: CATEGORY } });
  };

  beforeAll(async () => {
    prisma = newPrisma();
    app = buildIntegrationApp(prisma, new MutableClock(NOW));
    await cleanup();
    managerAuth = await token('manager@exercise.test', env.seedManagerPassword);
    aliceAuth = await token('alice@exercise.test', env.seedParticipantPassword);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // Manager creates the template, Alice selects it (snapshot S1, plan item P1).
  let snapshotBefore: { userExercises: unknown; planItem: unknown; planItemId: string };

  it('TEST-27-1: Manager updates name, metValue and rangeMax → Alice\'s UserExercise and PlanItem equal their pre-update values field by field', async () => {
    categoryId = (await request(app).post('/api/categories').set(managerAuth).send({ name: CATEGORY })).body.id;
    const created = await request(app).post('/api/templates').set(managerAuth).send({
      categoryId,
      name: 'Snapshot Push-up',
      targetBodyPart: 'Chest',
      trackingMode: 'BODYWEIGHT_REPS',
      metValue: 3.8,
      rangeMin: 1,
      rangeMax: 4000,
    });
    expect(created.status).toBe(201);
    templateId = created.body.id;

    const selected = await request(app).post('/api/plan-items').set(aliceAuth).send({
      source: 'TEMPLATE',
      templateId,
      priorityWeight: 2,
      targetSets: 3,
      targetRepsPerSet: 10,
    });
    expect(selected.status).toBe(201);
    const planItemId = selected.body.planItem.id as string;
    const rowBefore = await prisma.userExercise.findUniqueOrThrow({ where: { id: selected.body.userExercise.id } });
    snapshotBefore = {
      userExercises: (await request(app).get('/api/user-exercises').set(aliceAuth)).body,
      planItem: (await request(app).get(`/api/plan-items/${planItemId}`).set(aliceAuth)).body,
      planItemId,
    };

    const edit = await request(app).put(`/api/templates/${templateId}`).set(managerAuth).send({
      categoryId,
      name: 'Snapshot Push-up (renamed)',
      targetBodyPart: 'Chest',
      metValue: 9.5,
      rangeMin: 1,
      rangeMax: 100,
    });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ name: 'Snapshot Push-up (renamed)', metValue: 9.5, rangeMax: 100 });

    const exercisesAfter = await request(app).get('/api/user-exercises').set(aliceAuth);
    const itemAfter = await request(app).get(`/api/plan-items/${planItemId}`).set(aliceAuth);
    expect(exercisesAfter.body).toEqual(snapshotBefore.userExercises);
    expect(itemAfter.body).toEqual(snapshotBefore.planItem);
    expect(exercisesAfter.body[0]).toMatchObject({ name: 'Snapshot Push-up', metValue: 3.8, rangeMax: 4000 });
    expect(await prisma.userExercise.findUniqueOrThrow({ where: { id: rowBefore.id } })).toEqual(rowBefore);
  });

  it('TEST-27-2: Manager deletes the template → 204; snapshot and plan item unchanged, the plan still returns the item, sourceTemplateId is still stored', async () => {
    const del = await request(app).delete(`/api/templates/${templateId}`).set(managerAuth);
    expect(del.status).toBe(204);
    expect(await prisma.exerciseTemplate.count({ where: { id: templateId } })).toBe(0);

    const exercises = await request(app).get('/api/user-exercises').set(aliceAuth);
    expect(exercises.body).toEqual(snapshotBefore.userExercises);
    expect(exercises.body[0].sourceTemplateId).toBe(templateId);
    const item = await request(app).get(`/api/plan-items/${snapshotBefore.planItemId}`).set(aliceAuth);
    expect(item.body).toEqual(snapshotBefore.planItem);
    const plan = await request(app).get('/api/plan?date=2026-11-05').set(aliceAuth);
    expect(plan.status).toBe(200);
    expect(plan.body.isRestDay).toBe(false);
    expect(plan.body.items.map((i: { planItem: { id: string } }) => i.planItem.id)).toEqual([snapshotBefore.planItemId]);
  });

  it('TEST-27-3: Alice selects the deleted template again → 404 NOT_FOUND', async () => {
    const before = { exercises: await prisma.userExercise.count(), items: await prisma.planItem.count() };
    const res = await request(app).post('/api/plan-items').set(aliceAuth).send({
      source: 'TEMPLATE',
      templateId,
      priorityWeight: 2,
      targetSets: 3,
      targetRepsPerSet: 10,
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect({ exercises: await prisma.userExercise.count(), items: await prisma.planItem.count() }).toEqual(before);
  });
});
