-- CreateEnum
CREATE TYPE "BiometricType" AS ENUM ('WEIGHT', 'BODY_FAT', 'LEAN_MASS', 'HEART_RATE', 'HRV', 'SLEEP_SCORE');

-- CreateEnum
CREATE TYPE "SetType" AS ENUM ('STRENGTH', 'CALISTHENICS', 'CARDIO', 'WOD', 'MOBILITY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "gender" TEXT,
    "phoneNumber" TEXT,
    "fitnessLevel" TEXT,
    "goal" TEXT,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Settings" (
    "userId" TEXT NOT NULL,
    "preferredUnit" TEXT NOT NULL DEFAULT 'metric',
    "notificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inactivityDaysThreshold" INTEGER NOT NULL DEFAULT 3,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "aiConsentEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Biometric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "BiometricType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "Biometric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Muscle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Muscle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusclePath" (
    "id" TEXT NOT NULL,
    "muscleId" TEXT NOT NULL,
    "svgPathId" TEXT NOT NULL,
    "pathData" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'front',

    CONSTRAINT "MusclePath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Modality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ExerciseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modalityId" TEXT NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuscleExercise" (
    "muscleId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "impactFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "MuscleExercise_pkey" PRIMARY KEY ("muscleId","exerciseId")
);

-- CreateTable
CREATE TABLE "ExerciseCategoryMap" (
    "exerciseId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ExerciseCategoryMap_pkey" PRIMARY KEY ("exerciseId","categoryId")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentExercise" (
    "equipmentId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "qtyOptional" INTEGER,
    "notes" TEXT,

    CONSTRAINT "EquipmentExercise_pkey" PRIMARY KEY ("equipmentId","exerciseId")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,
    "avgRpe" DOUBLE PRECISION,
    "totalVolume" DOUBLE PRECISION,
    "weatherCondition" TEXT,
    "notes" TEXT,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutExercise" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "WorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSet" (
    "id" TEXT NOT NULL,
    "workoutExerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "setType" "SetType" NOT NULL,
    "rpe" DOUBLE PRECISION,
    "restSeconds" INTEGER,

    CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetStrength" (
    "setId" TEXT NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SetStrength_pkey" PRIMARY KEY ("setId")
);

-- CreateTable
CREATE TABLE "SetCalisthenics" (
    "setId" TEXT NOT NULL,
    "reps" INTEGER NOT NULL,
    "addedWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SetCalisthenics_pkey" PRIMARY KEY ("setId")
);

-- CreateTable
CREATE TABLE "SetCardio" (
    "setId" TEXT NOT NULL,
    "distance" DOUBLE PRECISION,
    "time" INTEGER,

    CONSTRAINT "SetCardio_pkey" PRIMARY KEY ("setId")
);

-- CreateTable
CREATE TABLE "SetWOD" (
    "setId" TEXT NOT NULL,
    "distance" DOUBLE PRECISION,
    "time" INTEGER,

    CONSTRAINT "SetWOD_pkey" PRIMARY KEY ("setId")
);

-- CreateTable
CREATE TABLE "SetMobility" (
    "setId" TEXT NOT NULL,
    "time" INTEGER,

    CONSTRAINT "SetMobility_pkey" PRIMARY KEY ("setId")
);

-- CreateTable
CREATE TABLE "MuscleFatigueCurrent" (
    "userId" TEXT NOT NULL,
    "muscleId" TEXT NOT NULL,
    "fatigueLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recoveryTargetAt" TIMESTAMP(3),

    CONSTRAINT "MuscleFatigueCurrent_pkey" PRIMARY KEY ("userId","muscleId")
);

-- CreateTable
CREATE TABLE "MuscleFatigueLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "muscleId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'workout',
    "delta" DOUBLE PRECISION NOT NULL,
    "fatigueLevelAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workoutSessionId" TEXT,

    CONSTRAINT "MuscleFatigueLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SleepLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sleepDate" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "sleepScore" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "SleepLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "proteinG" DOUBLE PRECISION,
    "calories" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "NutritionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIChat" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Muscle_name_key" ON "Muscle"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Modality_name_key" ON "Modality"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseCategory_name_key" ON "ExerciseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_name_key" ON "Equipment"("name");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Biometric" ADD CONSTRAINT "Biometric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusclePath" ADD CONSTRAINT "MusclePath_muscleId_fkey" FOREIGN KEY ("muscleId") REFERENCES "Muscle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_modalityId_fkey" FOREIGN KEY ("modalityId") REFERENCES "Modality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuscleExercise" ADD CONSTRAINT "MuscleExercise_muscleId_fkey" FOREIGN KEY ("muscleId") REFERENCES "Muscle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuscleExercise" ADD CONSTRAINT "MuscleExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseCategoryMap" ADD CONSTRAINT "ExerciseCategoryMap_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseCategoryMap" ADD CONSTRAINT "ExerciseCategoryMap_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExerciseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentExercise" ADD CONSTRAINT "EquipmentExercise_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentExercise" ADD CONSTRAINT "EquipmentExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetStrength" ADD CONSTRAINT "SetStrength_setId_fkey" FOREIGN KEY ("setId") REFERENCES "WorkoutSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetCalisthenics" ADD CONSTRAINT "SetCalisthenics_setId_fkey" FOREIGN KEY ("setId") REFERENCES "WorkoutSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetCardio" ADD CONSTRAINT "SetCardio_setId_fkey" FOREIGN KEY ("setId") REFERENCES "WorkoutSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetWOD" ADD CONSTRAINT "SetWOD_setId_fkey" FOREIGN KEY ("setId") REFERENCES "WorkoutSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetMobility" ADD CONSTRAINT "SetMobility_setId_fkey" FOREIGN KEY ("setId") REFERENCES "WorkoutSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuscleFatigueCurrent" ADD CONSTRAINT "MuscleFatigueCurrent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuscleFatigueCurrent" ADD CONSTRAINT "MuscleFatigueCurrent_muscleId_fkey" FOREIGN KEY ("muscleId") REFERENCES "Muscle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuscleFatigueLog" ADD CONSTRAINT "MuscleFatigueLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuscleFatigueLog" ADD CONSTRAINT "MuscleFatigueLog_muscleId_fkey" FOREIGN KEY ("muscleId") REFERENCES "Muscle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuscleFatigueLog" ADD CONSTRAINT "MuscleFatigueLog_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepLog" ADD CONSTRAINT "SleepLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionLog" ADD CONSTRAINT "NutritionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIChat" ADD CONSTRAINT "AIChat_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
