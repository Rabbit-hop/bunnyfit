import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
const describeWithDatabase = databaseUrl ? describe : describe.skip

describeWithDatabase('AC-24a data persistence after application restart', () => {
  const suffix = randomUUID()
  const email = `persistence-${suffix}@exercise.test`
  const jti = `persistence-${suffix}`
  const planKey = randomUUID()
  const effectiveDate = new Date('2026-11-05T00:00:00.000Z')

  let prisma: PrismaClient
  let managerId: string
  let participantId: string

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl!,
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
        name: `Persistence Category ${suffix}`,
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

    await prisma.$disconnect()
  })

  afterAll(async () => {
    if (!prisma) {
      return
    }

    await prisma.revokedToken.deleteMany({ where: { jti } })
    await prisma.ledgerEntry.deleteMany({ where: { userId: participantId } })
    await prisma.weightLog.deleteMany({ where: { userId: participantId } })
    await prisma.planItem.deleteMany({ where: { planKey } })
    await prisma.userExercise.deleteMany({ where: { userId: participantId } })
    await prisma.exerciseTemplate.deleteMany({ where: { createdById: managerId } })
    await prisma.category.deleteMany({ where: { name: `Persistence Category ${suffix}` } })
    await prisma.user.deleteMany({ where: { id: { in: [managerId, participantId] } } })
    await prisma.$disconnect()
  })

  it('keeps plans, entries, weight logs and revoked tokens after reconnecting', async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl!,
        },
      },
    })

    const restored = await prisma.user.findUnique({
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
    expect(Number(restored?.weightLogs[0].weightKg)).toBe(70)
    expect(restored?.revokedTokens).toHaveLength(1)
    expect(restored?.revokedTokens[0].jti).toBe(jti)
  })
})
