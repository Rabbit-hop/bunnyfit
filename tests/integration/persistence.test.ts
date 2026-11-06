import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

    // Delete only rows created by this suite. Guard on the ids: Prisma treats
    // `where: { userId: undefined }` as "no filter", which would wipe a table.
    await prisma.revokedToken.deleteMany({ where: { jti } })
    await prisma.planItem.deleteMany({ where: { planKey } })
    if (participantId) {
      await prisma.ledgerEntry.deleteMany({ where: { userId: participantId } })
      await prisma.weightLog.deleteMany({ where: { userId: participantId } })
      await prisma.userExercise.deleteMany({ where: { userId: participantId } })
    }
    if (managerId) {
      await prisma.exerciseTemplate.deleteMany({ where: { createdById: managerId } })
    }
    await prisma.category.deleteMany({ where: { name: categoryName } })
    const userIds = [managerId, participantId].filter((id): id is string => Boolean(id))
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    }

    await prisma.$disconnect()
  })

  it('keeps plans, entries, weight logs and revoked tokens after reconnecting', async () => {
    // AC-24a says "after a server restart". The HTTP API for plans, entries and
    // weight logs does not exist yet (F-03/F-04), so this test simulates the
    // restart by disposing the client and opening a brand-new connection.
    // Extend it to go through Supertest once those endpoints land (RTM TEST-24a).
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
})
