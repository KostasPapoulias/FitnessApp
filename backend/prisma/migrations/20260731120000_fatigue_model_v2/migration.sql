-- Fatigue model v2.
--
-- The old model scored every modality with one constant (`intensity × impact ×
-- 0.1`) while `intensity` carried a different unit per modality — kg·reps for
-- strength, raw seconds for cardio/WOD. Strength therefore dominated the whole
-- system (a single 5×100kg bench set was worth +40 fatigue) and cardio was
-- either negligible or instantly capped. These columns back the replacement:
-- per-muscle recovery rates, whole-body load, and load relative to the
-- athlete's own strength.

-- Per-muscle exponential recovery. Seeded properly by prisma/seed.ts; the
-- default keeps existing rows sane until then.
ALTER TABLE "Muscle" ADD COLUMN "recoveryHalfLifeHours" DOUBLE PRECISION NOT NULL DEFAULT 15;

-- A metcon's score. Both were previously discarded, so 3 rounds and 15 rounds
-- inside the same time cap produced identical fatigue.
ALTER TABLE "SetWOD" ADD COLUMN "reps" INTEGER;
ALTER TABLE "SetWOD" ADD COLUMN "rounds" DOUBLE PRECISION;

-- Foster sRPE training load for the session (minutes × RPE × modality weight).
ALTER TABLE "WorkoutSession" ADD COLUMN "systemicLoad" DOUBLE PRECISION;

-- CreateTable: whole-body fatigue, which no per-muscle row can represent.
CREATE TABLE "SystemicFatigue" (
    "userId" TEXT NOT NULL,
    "level" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recoveryTargetAt" TIMESTAMP(3),

    CONSTRAINT "SystemicFatigue_pkey" PRIMARY KEY ("userId")
);

-- CreateTable: rolling best estimated 1RM, so load can be scored relative to
-- the athlete rather than in absolute kilograms.
CREATE TABLE "ExerciseStrengthEstimate" (
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "e1rm" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseStrengthEstimate_pkey" PRIMARY KEY ("userId","exerciseId")
);

-- AddForeignKey
ALTER TABLE "SystemicFatigue" ADD CONSTRAINT "SystemicFatigue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseStrengthEstimate" ADD CONSTRAINT "ExerciseStrengthEstimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseStrengthEstimate" ADD CONSTRAINT "ExerciseStrengthEstimate_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
