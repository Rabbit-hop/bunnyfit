import { CardioCategory, PrismaClient, Role, TrackingMode } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { env } from '../server/config/env.js'

const prisma = new PrismaClient()

const bcryptCost = env.bcryptCost

const users = [
  {
    email: 'manager@exercise.test',
    displayName: 'Program Manager',
    role: Role.MANAGER,
    passwordEnv: 'SEED_MANAGER_PASSWORD',
  },
  {
    email: 'alice@exercise.test',
    displayName: 'Alice',
    role: Role.PARTICIPANT,
    passwordEnv: 'SEED_PARTICIPANT_PASSWORD',
  },
  {
    email: 'bob@exercise.test',
    displayName: 'Bob',
    role: Role.PARTICIPANT,
    passwordEnv: 'SEED_PARTICIPANT_PASSWORD',
  },
] as const

const categories = ['Weight Training', 'Bodyweight', 'Yoga', 'Cardio'] as const

const templates = [
  {
    category: 'Weight Training',
    name: 'Barbell Squat',
    targetBodyPart: 'Legs',
    trackingMode: TrackingMode.WEIGHT,
    metValue: 3.5,
    rangeMin: 1,
    rangeMax: 4000,
  },
  {
    category: 'Weight Training',
    name: 'Bench Press',
    targetBodyPart: 'Chest',
    trackingMode: TrackingMode.WEIGHT,
    metValue: 3.5,
    rangeMin: 1,
    rangeMax: 4000,
  },
  {
    category: 'Bodyweight',
    name: 'Push-up',
    targetBodyPart: 'Chest',
    trackingMode: TrackingMode.BODYWEIGHT_REPS,
    metValue: 3.8,
    rangeMin: 1,
    rangeMax: 4000,
  },
  {
    category: 'Bodyweight',
    name: 'Plank',
    targetBodyPart: 'Core',
    trackingMode: TrackingMode.BODYWEIGHT_TIME,
    metValue: 3.8,
    rangeMin: 1,
    rangeMax: 10800,
  },
  {
    category: 'Yoga',
    name: 'Sun Salutation',
    targetBodyPart: 'Full body',
    trackingMode: TrackingMode.YOGA,
    metValue: 2.5,
    rangeMin: 1,
    rangeMax: 10800,
  },
  {
    category: 'Cardio',
    name: 'Jump Rope',
    targetBodyPart: 'Full body',
    trackingMode: TrackingMode.CARDIO_TIME,
    metValue: 7,
    rangeMin: 1,
    rangeMax: 10800,
  },
  {
    category: 'Cardio',
    name: 'Outdoor Run',
    targetBodyPart: 'Legs',
    trackingMode: TrackingMode.CARDIO_DISTANCE,
    metValue: 9.8,
    rangeMin: 0.01,
    rangeMax: 100,
    cardioCategory: CardioCategory.RUNNING,
  },
  {
    category: 'Cardio',
    name: 'Road Cycling',
    targetBodyPart: 'Legs',
    trackingMode: TrackingMode.CARDIO_DISTANCE,
    metValue: 8,
    rangeMin: 0.01,
    rangeMax: 100,
    cardioCategory: CardioCategory.CYCLING,
  },
] as const

function unitFor(mode: TrackingMode) {
  if (mode === TrackingMode.CARDIO_DISTANCE) {
    return 'km'
  }

  if (mode === TrackingMode.WEIGHT || mode === TrackingMode.BODYWEIGHT_REPS) {
    return 'reps'
  }

  return 'seconds'
}

function bangkokToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.appTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  return new Date(`${parts}T00:00:00.000Z`)
}

async function seedUsers() {
  const passwordHashes = new Map<string, string>()

  for (const user of users) {
    const password = process.env[user.passwordEnv]

    if (!password) {
      throw new Error(`${user.passwordEnv} is required to seed users`)
    }

    let passwordHash = passwordHashes.get(password)

    if (!passwordHash) {
      passwordHash = await bcrypt.hash(password, bcryptCost)
      passwordHashes.set(password, passwordHash)
    }

    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        passwordHash,
        role: user.role,
        displayName: user.displayName,
      },
    })
  }

  const manager = await prisma.user.findUniqueOrThrow({
    where: { email: 'manager@exercise.test' },
  })

  return manager
}

async function seedLibrary(managerId: string) {
  const categoryIds = new Map<string, string>()

  for (const name of categories) {
    const category = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    })

    categoryIds.set(name, category.id)
  }

  for (const template of templates) {
    const categoryId = categoryIds.get(template.category)

    if (!categoryId) {
      throw new Error(`Missing seeded category ${template.category}`)
    }

    const data = {
      categoryId,
      name: template.name,
      targetBodyPart: template.targetBodyPart,
      unit: unitFor(template.trackingMode),
      trackingMode: template.trackingMode,
      cardioCategory: 'cardioCategory' in template ? template.cardioCategory : null,
      metValue: template.metValue,
      rangeMin: template.rangeMin,
      rangeMax: template.rangeMax,
      createdById: managerId,
    }

    await prisma.exerciseTemplate.upsert({
      where: {
        categoryId_name: {
          categoryId,
          name: template.name,
        },
      },
      update: {},
      create: data,
    })
  }
}

const weightHistory = [
  { date: '2026-11-01', weightKg: 71.2 },
  { date: '2026-11-02', weightKg: 71.0 },
  { date: '2026-11-03', weightKg: 70.8 },
  { date: '2026-11-04', weightKg: 70.5 },
] as const

async function seedWeightLogs() {
  const alice = await prisma.user.findUniqueOrThrow({
    where: { email: 'alice@exercise.test' },
  })

  const rows = [
    ...weightHistory.map((row) => ({
      effectiveDate: new Date(`${row.date}T00:00:00.000Z`),
      weightKg: row.weightKg,
    })),
    { effectiveDate: bangkokToday(), weightKg: 70 },
  ]

  for (const row of rows) {
    const existing = await prisma.weightLog.findFirst({
      where: {
        userId: alice.id,
        effectiveDate: row.effectiveDate,
      },
    })

    if (!existing) {
      await prisma.weightLog.create({
        data: {
          userId: alice.id,
          weightKg: row.weightKg,
          effectiveDate: row.effectiveDate,
        },
      })
    }
  }
}

async function main() {
  const manager = await seedUsers()
  await seedLibrary(manager.id)
  await seedWeightLogs()

  const [userCount, categoryCount, templateCount, weightLogCount] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.exerciseTemplate.count(),
    prisma.weightLog.count(),
  ])

  console.log(
    `Seed complete: ${userCount} users, ${categoryCount} categories, ${templateCount} templates, ${weightLogCount} weight logs`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
