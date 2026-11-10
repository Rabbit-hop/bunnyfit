import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../../server/config/env.js'
import { buildIntegrationApp, MutableClock, newPrisma } from '../helpers/integrationApp.js'

const databaseUrl = process.env.DATABASE_URL_TEST

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error(
    'DATABASE_URL_TEST is required to run the persistence suite in CI (AC-24a / TEST-24a).',
  )
}

const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('AC-24a data persistence after application restart', () => {
  const suffix = randomUUID()
  const email = `persistence-${suffix}@exercise.test`
  const jti = `persistence-${suffix}`
  const planKey = randomUUID()
  const categoryName = `Persistence Category ${suffix}`
  const effectiveDate = new Date('2026-11-05T00:00:00.000Z')

  let prisma: PrismaClient
  let managerId: string | undefined
  let participantId: string | undefined
  // Rows TEST-24a-1 creates for the seeded Alice and Bob; removed in afterAll so
  // the suite never leaves data behind (entries before exercises: FK Restrict).
  const createdPlanItemIds: string[] = []
  const createdExerciseIds: string[] = []
  const createdEntryIds: string[] = []

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    })

    const manager = await prisma.user.create({
      data: {
        email: `manager-${suffix}@exercise.test`,
        passwordHash: 'not-used-in-this-test',
        role: 'MANAGER',
        displayName: 'Persistence Manager',
      },
    })
    managerId = manager.id

    const participant = await prisma.user.create({
      data: {
        email,
        passwordHash: 'not-used-in-this-test',
        role: 'PARTICIPANT',
        displayName: 'Persistence Participant',
      },
    })
    participantId = participant.id

    const category = await prisma.category.create({
      data: {
        name: categoryName,
      },
    })

    const template = await prisma.exerciseTemplate.create({
      data: {
        categoryId: category.id,
        name: `Persistence Squat ${suffix}`,
        targetBodyPart: 'Legs',
        unit: 'reps',
        trackingMode: 'WEIGHT',
        metValue: 3.5,
        rangeMin: 1,
        rangeMax: 4000,
        createdById: manager.id,
      },
    })

    const exercise = await prisma.userExercise.create({
      data: {
        userId: participant.id,
        sourceTemplateId: template.id,
        isCustom: false,
        name: template.name,
        targetBodyPart: template.targetBodyPart,
        unit: template.unit,
        trackingMode: template.trackingMode,
        metValue: template.metValue,
        rangeMin: template.rangeMin,
        rangeMax: template.rangeMax,
      },
    })

    await prisma.planItem.create({
      data: {
        planKey,
        version: 1,
        userId: participant.id,
        userExerciseId: exercise.id,
        priorityWeight: 3,
        targetSets: 3,
        targetRepsPerSet: 10,
        repeatDays: 127,
        effectiveFrom: effectiveDate,
      },
    })

    await prisma.ledgerEntry.create({
      data: {
        userId: participant.id,
        userExerciseId: exercise.id,
        logDate: effectiveDate,
        sets: 3,
        totalReps: 30,
        kind: 'MANUAL',
      },
    })

    await prisma.weightLog.create({
      data: {
        userId: participant.id,
        weightKg: 70,
        effectiveDate,
      },
    })

    await prisma.revokedToken.create({
      data: {
        jti,
        userId: participant.id,
        expiresAt: new Date('2026-11-06T00:00:00.000Z'),
      },
    })
  })

  afterAll(async () => {
    if (!prisma) {
      return
    }

    const cleanup = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    })

    try {
      // Delete only rows created by this suite. Guard on the ids: Prisma treats
      // `where: { userId: undefined }` as "no filter", which would wipe a table.
      await cleanup.revokedToken.deleteMany({ where: { jti } })
      await cleanup.ledgerEntry.deleteMany({ where: { id: { in: createdEntryIds } } })
      await cleanup.planItem.deleteMany({ where: { planKey } })
      await cleanup.planItem.deleteMany({ where: { id: { in: createdPlanItemIds } } })
      await cleanup.userExercise.deleteMany({ where: { id: { in: createdExerciseIds } } })
      if (participantId) {
        await cleanup.ledgerEntry.deleteMany({ where: { userId: participantId } })
        await cleanup.weightLog.deleteMany({ where: { userId: participantId } })
        await cleanup.userExercise.deleteMany({ where: { userId: participantId } })
      }
      if (managerId) {
        await cleanup.exerciseTemplate.deleteMany({ where: { createdById: managerId } })
      }
      await cleanup.category.deleteMany({ where: { name: categoryName } })
      const userIds = [managerId, participantId].filter((id): id is string => Boolean(id))
      if (userIds.length > 0) {
        await cleanup.user.deleteMany({ where: { id: { in: userIds } } })
      }
    } finally {
      await cleanup.$disconnect()
      await prisma.$disconnect()
    }
  })

  it('keeps plans, entries, weight logs and revoked tokens after reconnecting', async () => {
    // AC-24a says "after a server restart". The HTTP API for plans, entries and
    // weight logs does not exist yet (F-03/F-04), so this test simulates the
    // restart by disposing the setup client and opening a brand-new connection.
    // Extend it to go through Supertest once those endpoints land (RTM TEST-24a).
    await prisma.$disconnect()

    const restarted = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    })

    try {
      const restored = await restarted.user.findUnique({
        where: { email },
        include: {
          planItems: true,
          ledgerEntries: true,
          weightLogs: true,
          revokedTokens: true,
          userExercises: true,
        },
      })

      expect(restored).not.toBeNull()
      expect(restored?.planItems).toHaveLength(1)
      expect(restored?.planItems[0]).toMatchObject({
        planKey,
        version: 1,
        repeatDays: 127,
      })
      expect(restored?.ledgerEntries).toHaveLength(1)
      expect(restored?.ledgerEntries[0]).toMatchObject({
        sets: 3,
        totalReps: 30,
        kind: 'MANUAL',
      })
      expect(restored?.weightLogs).toHaveLength(1)
      expect(Number(restored?.weightLogs[0]?.weightKg)).toBe(70)
      expect(restored?.revokedTokens).toHaveLength(1)
      expect(restored?.revokedTokens[0]?.jti).toBe(jti)
    } finally {
      await restarted.$disconnect()
    }
  })

  // F-04 STS §8 TEST-24a-1 (AC-24a): "new application instance on the same database;
  // log in again; GET /api/plan-items, GET /api/entries". Q10 (docs/local/loop/questions.md):
  // the seed gives Alice FOUR dated weight rows (71.2 -> 70.5 kg, 1-4 Nov), not the
  // single 70.0 kg row of contract §5.2; Bob has none (SRS A.6).
  it('TEST-24a-1: manual entry and day listing survive a restart; plan ids and values unchanged; Alice weight rows identical, Bob has none', async () => {
    const opened: PrismaClient[] = []
    const open = (): PrismaClient => {
      const client = newPrisma()
      opened.push(client)
      return client
    }
    const weightRows = async (client: PrismaClient, userId: string) =>
      (
        await client.weightLog.findMany({
          where: { userId },
          orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
        })
      ).map((row) => ({
        id: row.id,
        weightKg: Number(row.weightKg),
        effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
      }))

    try {
      const prismaBefore = open()
      const clock = new MutableClock(new Date('2026-11-05T03:00:00.000Z')) // 10:00 Asia/Bangkok
      const appBefore = buildIntegrationApp(prismaBefore, clock)
      const login = async (app: ReturnType<typeof buildIntegrationApp>, email: string): Promise<string> =>
        (await request(app).post('/api/auth/login').send({ email, password: env.seedParticipantPassword })).body
          .token as string
      const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

      const alice = await prismaBefore.user.findUniqueOrThrow({ where: { email: 'alice@exercise.test' } })
      const bob = await prismaBefore.user.findUniqueOrThrow({ where: { email: 'bob@exercise.test' } })
      const squatTemplate = await prismaBefore.exerciseTemplate.findFirstOrThrow({ where: { name: 'Barbell Squat' } })
      const aliceAuth = bearer(await login(appBefore, alice.email))
      const bobAuth = bearer(await login(appBefore, bob.email))

      const weightsBefore = await weightRows(prismaBefore, alice.id)
      expect(weightsBefore.map((w) => w.weightKg)).toEqual([71.2, 71, 70.8, 70.5])
      expect(await prismaBefore.weightLog.count({ where: { userId: bob.id } })).toBe(0)

      // Preconditions: Alice and Bob each own a plan item and an entry on today.
      const planBody = {
        source: 'TEMPLATE',
        templateId: squatTemplate.id,
        priorityWeight: 3,
        targetSets: 4,
        targetRepsPerSet: 10,
        loadKg: 40,
      }
      const alicePlan = await request(appBefore).post('/api/plan-items').set(aliceAuth).send(planBody)
      expect(alicePlan.status, JSON.stringify(alicePlan.body)).toBe(201)
      createdPlanItemIds.push(alicePlan.body.planItem.id as string)
      createdExerciseIds.push(alicePlan.body.userExercise.id as string)

      const bobPlan = await request(appBefore).post('/api/plan-items').set(bobAuth).send(planBody)
      expect(bobPlan.status, JSON.stringify(bobPlan.body)).toBe(201)
      createdPlanItemIds.push(bobPlan.body.planItem.id as string)
      createdExerciseIds.push(bobPlan.body.userExercise.id as string)

      const aliceEntry = await request(appBefore)
        .post('/api/entries')
        .set(aliceAuth)
        .send({ userExerciseId: alicePlan.body.userExercise.id, sets: 2, totalReps: 20, logDate: '2026-11-05' })
      expect(aliceEntry.status, JSON.stringify(aliceEntry.body)).toBe(201)
      createdEntryIds.push(aliceEntry.body.entry.id as string)

      const bobEntry = await request(appBefore)
        .post('/api/entries')
        .set(bobAuth)
        .send({ userExerciseId: bobPlan.body.userExercise.id, sets: 1, totalReps: 10, logDate: '2026-11-05' })
      expect(bobEntry.status, JSON.stringify(bobEntry.body)).toBe(201)
      createdEntryIds.push(bobEntry.body.entry.id as string)

      const plansBefore = {
        alice: (await request(appBefore).get('/api/plan-items').set(aliceAuth)).body,
        bob: (await request(appBefore).get('/api/plan-items').set(bobAuth)).body,
      }
      const entriesBefore = {
        alice: await request(appBefore).get('/api/entries?date=2026-11-05').set(aliceAuth),
        bob: await request(appBefore).get('/api/entries?date=2026-11-05').set(bobAuth),
      }
      expect(entriesBefore.alice.status, JSON.stringify(entriesBefore.alice.body)).toBe(200)
      expect(entriesBefore.bob.status, JSON.stringify(entriesBefore.bob.body)).toBe(200)

      // Restart: a brand-new application instance (new PrismaClient) on the same database.
      await prismaBefore.$disconnect()
      const prismaAfter = open()
      const appAfter = buildIntegrationApp(prismaAfter, clock)
      const aliceAuth2 = bearer(await login(appAfter, alice.email))
      const bobAuth2 = bearer(await login(appAfter, bob.email))

      const plansAfter = {
        alice: (await request(appAfter).get('/api/plan-items').set(aliceAuth2)).body,
        bob: (await request(appAfter).get('/api/plan-items').set(bobAuth2)).body,
      }
      const entriesAfter = {
        alice: await request(appAfter).get('/api/entries?date=2026-11-05').set(aliceAuth2),
        bob: await request(appAfter).get('/api/entries?date=2026-11-05').set(bobAuth2),
      }

      expect(plansAfter.alice).toEqual(plansBefore.alice)
      expect(plansAfter.bob).toEqual(plansBefore.bob)
      expect(entriesAfter.alice.status, JSON.stringify(entriesAfter.alice.body)).toBe(200)
      expect(entriesAfter.alice.body).toEqual(entriesBefore.alice.body)
      expect(entriesAfter.bob.body).toEqual(entriesBefore.bob.body)
      // Each participant still sees only their own row; Bob's data is untouched.
      expect(JSON.stringify(entriesAfter.alice.body)).not.toContain(bobEntry.body.entry.id as string)

      expect(await weightRows(prismaAfter, alice.id)).toEqual(weightsBefore)
      expect(await prismaAfter.weightLog.count({ where: { userId: bob.id } })).toBe(0)
    } finally {
      for (const client of opened) await client.$disconnect()
    }
  })
  // F-04 STS §8 TEST-24a-2 (AC-24a): "Quick Complete before restart, Quick Complete after
  // restart -> second is a No-op (state persisted)". Uses Alice's own Plank (120 s) so it
  // shares nothing with TEST-24a-1's Squat plan items.
  it('TEST-24a-2: a Quick Complete row survives a restart (kind QUICK_COMPLETE), so the second Quick Complete after the restart is a No-op', async () => {
    const opened: PrismaClient[] = []
    const open = (): PrismaClient => {
      const client = newPrisma()
      opened.push(client)
      return client
    }
    try {
      const prismaBefore = open()
      const clock = new MutableClock(new Date('2026-11-05T03:00:00.000Z')) // 10:00 Asia/Bangkok
      const appBefore = buildIntegrationApp(prismaBefore, clock)
      const login = async (app: ReturnType<typeof buildIntegrationApp>): Promise<Record<string, string>> => ({
        Authorization: `Bearer ${
          (await request(app).post('/api/auth/login').send({ email: 'alice@exercise.test', password: env.seedParticipantPassword }))
            .body.token as string
        }`,
      })
      const plank = await prismaBefore.exerciseTemplate.findFirstOrThrow({ where: { name: 'Plank' } })

      const auth = await login(appBefore)
      const plan = await request(appBefore)
        .post('/api/plan-items')
        .set(auth)
        .send({ source: 'TEMPLATE', templateId: plank.id, priorityWeight: 2, targetDurationSec: 120 })
      expect(plan.status, JSON.stringify(plan.body)).toBe(201)
      createdPlanItemIds.push(plan.body.planItem.id as string)
      createdExerciseIds.push(plan.body.userExercise.id as string)
      const exerciseId = plan.body.userExercise.id as string

      const first = await request(appBefore).post('/api/entries/quick-complete').set(auth).send({ userExerciseId: exerciseId })
      expect(first.status, JSON.stringify(first.body)).toBe(201)
      expect(first.body.entry).toMatchObject({ kind: 'QUICK_COMPLETE', durationSec: 120 })
      createdEntryIds.push(first.body.entry.id as string)

      // Restart: a brand-new application instance (new PrismaClient) on the same database.
      await prismaBefore.$disconnect()
      const prismaAfter = open()
      const appAfter = buildIntegrationApp(prismaAfter, clock)
      const authAfter = await login(appAfter)

      const stored = await prismaAfter.ledgerEntry.findUniqueOrThrow({ where: { id: first.body.entry.id as string } })
      expect(stored.kind).toBe('QUICK_COMPLETE')

      const second = await request(appAfter)
        .post('/api/entries/quick-complete')
        .set(authAfter)
        .send({ userExerciseId: exerciseId })
      expect(second.status, JSON.stringify(second.body)).toBe(200)
      expect(second.body.entry).toBeNull()
      expect(second.body.cumulative).toMatchObject({ userExerciseId: exerciseId, durationSec: 120 })
      expect(await prismaAfter.ledgerEntry.count({ where: { userExerciseId: exerciseId } })).toBe(1)
    } finally {
      for (const client of opened) await client.$disconnect()
    }
  })
})
