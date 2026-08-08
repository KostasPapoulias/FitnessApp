-- Saved plans, scheduling, and the AI's proposal staging table.
--
-- Purely additive: five new tables, one new nullable column on WorkoutSession,
-- and their indexes. Nothing existing is dropped, renamed or retyped, so this
-- is safe to run against a database with live data and needs no backfill.

-- A workout the athlete intends to do, as opposed to one they did. Sessions
-- stay the factual log that fatigue and training load are derived from;
-- templates are editable intentions carrying no load until a session runs.
CREATE TABLE "WorkoutTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    -- user | ai. An AI-drafted plan stays labelled as one for its whole life.
    "source" TEXT NOT NULL DEFAULT 'user',
    -- Archived rather than deleted: a template that produced sessions is part
    -- of how the athlete got here, and deleting it would strand their
    -- templateId and quietly rewrite that history.
    "archivedAt" TIMESTAMP(3),
    "lastPerformedAt" TIMESTAMP(3),
    "timesPerformed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateExercise" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "TemplateExercise_pkey" PRIMARY KEY ("id")
);

-- Flat rather than mirroring the five-table SetType split of WorkoutSet: a
-- plan is a target, and a target needs few enough modality columns that a join
-- per modality buys nothing.
CREATE TABLE "TemplateSet" (
    "id" TEXT NOT NULL,
    "templateExerciseId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "reps" INTEGER,
    "weight" DOUBLE PRECISION,
    "rpe" DOUBLE PRECISION,
    "restSeconds" INTEGER,
    "distance" DOUBLE PRECISION,
    "time" INTEGER,
    "rounds" DOUBLE PRECISION,

    CONSTRAINT "TemplateSet_pkey" PRIMARY KEY ("id")
);

-- A template placed on a date — the "standby" state. The reminder is not a
-- time stored here; it creates a Notification row, which is the one table that
-- already knows about quiet hours, daily caps, dedupe and delivery receipts.
CREATE TABLE "ScheduledWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "reminderAt" TIMESTAMP(3),
    "notificationId" TEXT,
    -- standby | started | completed | skipped | cancelled
    "status" TEXT NOT NULL DEFAULT 'standby',
    "sessionId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledWorkout_pkey" PRIMARY KEY ("id")
);

-- Something the AI has drafted and the athlete has not yet accepted. The model
-- never writes to the app's own tables; it writes here, and a row here does
-- nothing until a request carrying the user's own session confirms it.
CREATE TABLE "AiProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    -- The assistant message this was drafted alongside, so reopening a thread
    -- shows the card attached to the reply that produced it.
    "messageId" TEXT,
    -- create_template | schedule_workout
    "kind" TEXT NOT NULL,
    -- The validated, ID-resolved draft. Applied verbatim on confirm.
    "payload" JSONB NOT NULL,
    -- pending | applied | rejected | expired
    "status" TEXT NOT NULL DEFAULT 'pending',
    -- Stale drafts must not be applicable: a card scrolled past on Monday and
    -- tapped on Thursday would schedule a workout reasoned about a body state
    -- three days gone.
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProposal_pkey" PRIMARY KEY ("id")
);

-- Which saved plan a session came from, when it came from one. Nullable, so
-- every existing session keeps its meaning: NULL is "logged ad hoc", which is
-- exactly what those sessions were.
ALTER TABLE "WorkoutSession" ADD COLUMN "templateId" TEXT;

CREATE INDEX "WorkoutTemplate_userId_archivedAt_idx" ON "WorkoutTemplate"("userId", "archivedAt");
CREATE INDEX "TemplateExercise_templateId_idx" ON "TemplateExercise"("templateId");
CREATE INDEX "TemplateExercise_exerciseId_idx" ON "TemplateExercise"("exerciseId");
CREATE UNIQUE INDEX "TemplateSet_templateExerciseId_setNumber_key" ON "TemplateSet"("templateExerciseId", "setNumber");
CREATE UNIQUE INDEX "ScheduledWorkout_sessionId_key" ON "ScheduledWorkout"("sessionId");
CREATE INDEX "ScheduledWorkout_userId_status_scheduledFor_idx" ON "ScheduledWorkout"("userId", "status", "scheduledFor");
CREATE INDEX "AiProposal_userId_status_idx" ON "AiProposal"("userId", "status");
CREATE INDEX "WorkoutSession_templateId_idx" ON "WorkoutSession"("templateId");

ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateExercise" ADD CONSTRAINT "TemplateExercise_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateExercise" ADD CONSTRAINT "TemplateExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemplateSet" ADD CONSTRAINT "TemplateSet_templateExerciseId_fkey" FOREIGN KEY ("templateExerciseId") REFERENCES "TemplateExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledWorkout" ADD CONSTRAINT "ScheduledWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledWorkout" ADD CONSTRAINT "ScheduledWorkout_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledWorkout" ADD CONSTRAINT "ScheduledWorkout_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
