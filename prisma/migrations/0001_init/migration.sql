-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MANAGER', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('WEIGHT', 'BODYWEIGHT_REPS', 'BODYWEIGHT_TIME', 'YOGA', 'CARDIO_TIME', 'CARDIO_DISTANCE');

-- CreateEnum
CREATE TYPE "CardioCategory" AS ENUM ('RUNNING', 'WALKING', 'CYCLING', 'SWIMMING');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('MANUAL', 'QUICK_COMPLETE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevokedToken" (
    "jti" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedToken_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseTemplate" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "targetBodyPart" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "trackingMode" "TrackingMode" NOT NULL,
    "cardioCategory" "CardioCategory",
    "metValue" DECIMAL(4,1) NOT NULL,
    "rangeMin" DECIMAL(8,2) NOT NULL,
    "rangeMax" DECIMAL(8,2) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserExercise" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceTemplateId" UUID,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "targetBodyPart" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "trackingMode" "TrackingMode" NOT NULL,
    "cardioCategory" "CardioCategory",
    "metValue" DECIMAL(4,1) NOT NULL,
    "rangeMin" DECIMAL(8,2) NOT NULL,
    "rangeMax" DECIMAL(8,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" UUID NOT NULL,
    "planKey" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "userId" UUID NOT NULL,
    "userExerciseId" UUID NOT NULL,
    "targetSets" INTEGER,
    "targetRepsPerSet" INTEGER,
    "loadKg" DECIMAL(5,2),
    "targetDurationSec" INTEGER,
    "targetDistanceKm" DECIMAL(6,2),
    "priorityWeight" INTEGER NOT NULL,
    "repeatDays" INTEGER NOT NULL DEFAULT 127,
    "effectiveFrom" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "userExerciseId" UUID NOT NULL,
    "logDate" DATE NOT NULL,
    "sets" INTEGER,
    "totalReps" INTEGER,
    "durationSec" INTEGER,
    "distanceKm" DECIMAL(6,2),
    "kind" "EntryKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weightKg" DECIMAL(4,1) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderSetting" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "timeOfDay" VARCHAR(5) NOT NULL,
    "repeatDays" INTEGER NOT NULL DEFAULT 127,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RevokedToken_expiresAt_idx" ON "RevokedToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "ExerciseTemplate_categoryId_idx" ON "ExerciseTemplate"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseTemplate_categoryId_name_key" ON "ExerciseTemplate"("categoryId", "name");

-- CreateIndex
CREATE INDEX "UserExercise_userId_idx" ON "UserExercise"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserExercise_id_userId_key" ON "UserExercise"("id", "userId");

-- CreateIndex
CREATE INDEX "PlanItem_userId_effectiveFrom_idx" ON "PlanItem"("userId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PlanItem_userExerciseId_effectiveFrom_idx" ON "PlanItem"("userExerciseId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItem_planKey_version_key" ON "PlanItem"("planKey", "version");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_logDate_idx" ON "LedgerEntry"("userId", "logDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_userExerciseId_logDate_idx" ON "LedgerEntry"("userExerciseId", "logDate");

-- CreateIndex
CREATE INDEX "WeightLog_userId_effectiveDate_idx" ON "WeightLog"("userId", "effectiveDate");

-- CreateIndex
CREATE INDEX "ReminderSetting_userId_idx" ON "ReminderSetting"("userId");

-- AddForeignKey
ALTER TABLE "RevokedToken" ADD CONSTRAINT "RevokedToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserExercise" ADD CONSTRAINT "UserExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_userExerciseId_userId_fkey" FOREIGN KEY ("userExerciseId", "userId") REFERENCES "UserExercise"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userExerciseId_userId_fkey" FOREIGN KEY ("userExerciseId", "userId") REFERENCES "UserExercise"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightLog" ADD CONSTRAINT "WeightLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderSetting" ADD CONSTRAINT "ReminderSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Baseline constraints from docs/system-sds.md and SRS BR-02
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" = lower("email"));

CREATE UNIQUE INDEX "Category_name_lower_key" ON "Category" (lower("name"));
CREATE UNIQUE INDEX "ExerciseTemplate_category_name_lower_key" ON "ExerciseTemplate" ("categoryId", lower("name"));

ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_metValue_check" CHECK ("metValue" > 0 AND "metValue" <= 25);
ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_range_check" CHECK ("rangeMin" > 0 AND "rangeMin" <= "rangeMax");
ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_cardio_category_check" CHECK (("trackingMode" = 'CARDIO_DISTANCE') = ("cardioCategory" IS NOT NULL));

ALTER TABLE "UserExercise" ADD CONSTRAINT "UserExercise_metValue_check" CHECK ("metValue" > 0 AND "metValue" <= 25);
ALTER TABLE "UserExercise" ADD CONSTRAINT "UserExercise_range_check" CHECK ("rangeMin" > 0 AND "rangeMin" <= "rangeMax");
ALTER TABLE "UserExercise" ADD CONSTRAINT "UserExercise_cardio_category_check" CHECK (("trackingMode" = 'CARDIO_DISTANCE') = ("cardioCategory" IS NOT NULL));

ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_version_check" CHECK ("version" >= 1);
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_priority_check" CHECK ("priorityWeight" BETWEEN 1 AND 5);
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_repeat_days_check" CHECK ("repeatDays" BETWEEN 1 AND 127);
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_target_sets_check" CHECK ("targetSets" IS NULL OR "targetSets" BETWEEN 1 AND 20);
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_target_reps_check" CHECK ("targetRepsPerSet" IS NULL OR "targetRepsPerSet" BETWEEN 1 AND 200);
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_load_check" CHECK ("loadKg" IS NULL OR ("loadKg" > 0 AND "loadKg" <= 500));
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_duration_check" CHECK ("targetDurationSec" IS NULL OR "targetDurationSec" BETWEEN 1 AND 10800);
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_distance_check" CHECK ("targetDistanceKm" IS NULL OR ("targetDistanceKm" > 0 AND "targetDistanceKm" <= 100));
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_end_date_check" CHECK ("endDate" IS NULL OR "endDate" >= "effectiveFrom");
-- Target columns depend on the exercise's trackingMode (SDS §3.2). The DB can
-- only enforce one coherent group; the service also checks it against the
-- userExercise's trackingMode (a cross-table rule a CHECK cannot express).
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_measurement_group_check" CHECK (
  (("targetSets" IS NOT NULL) = ("targetRepsPerSet" IS NOT NULL)) AND
  ((("targetSets" IS NOT NULL)::int + ("targetDurationSec" IS NOT NULL)::int + ("targetDistanceKm" IS NOT NULL)::int) = 1)
);

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_sets_check" CHECK ("sets" IS NULL OR "sets" BETWEEN 1 AND 20);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_total_reps_check" CHECK ("totalReps" IS NULL OR "totalReps" >= 1);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reps_per_set_check" CHECK ("totalReps" IS NULL OR "sets" IS NULL OR "totalReps" <= "sets" * 200);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_duration_check" CHECK ("durationSec" IS NULL OR "durationSec" BETWEEN 1 AND 10800);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_distance_check" CHECK ("distanceKm" IS NULL OR ("distanceKm" > 0 AND "distanceKm" <= 100));
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_sets_reps_pair_check" CHECK (("sets" IS NOT NULL) = ("totalReps" IS NOT NULL));
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_measurement_group_check" CHECK ((("sets" IS NOT NULL)::int + ("durationSec" IS NOT NULL)::int + ("distanceKm" IS NOT NULL)::int) = 1);

ALTER TABLE "WeightLog" ADD CONSTRAINT "WeightLog_weight_check" CHECK ("weightKg" BETWEEN 1 AND 800);
ALTER TABLE "ReminderSetting" ADD CONSTRAINT "ReminderSetting_time_check" CHECK ("timeOfDay" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "ReminderSetting" ADD CONSTRAINT "ReminderSetting_repeat_days_check" CHECK ("repeatDays" BETWEEN 1 AND 127);
