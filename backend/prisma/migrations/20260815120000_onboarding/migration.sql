-- New-user onboarding: the profile fields the gate collects, plus the three
-- tables behind equipment, injuries and the coach-mark tour.
--
-- Purely additive. Every new column is nullable or defaulted, and no existing
-- column is dropped, renamed or retyped, so this is safe against a database
-- with live data.
--
-- Deliberately NO backfill of "onboardingCompletedAt". Existing users are
-- meant to fall through the gate on next login: until they answer, their
-- bodyweight is null and fatigue scoring has been silently substituting 70 kg
-- for them, which is a wrong answer rather than a missing one. Stamping them
-- as already-onboarded would preserve that bug forever.

--  UserProfile: the gated answers
ALTER TABLE "UserProfile"
    -- Replaces "age", which is written once and wrong a year later. The old
    -- column stays for rows that only have it; readers fall back to it.
    ADD COLUMN "birthDate" TIMESTAMP(3),
    -- Self-reported sessions per week.
    ADD COLUMN "trainingDaysPerWeek" INTEGER,
    -- Years of consistent training. Fractional so "six months" is expressible.
    ADD COLUMN "experienceYears" DOUBLE PRECISION,
    -- The gate itself. NULL => required questions unanswered => redirect to
    -- /onboarding. This is the single flag the route guard reads.
    ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
    -- Equipment + injuries are offered after the gate lifts. NULL only keeps
    -- the Home prompt card visible; it never blocks access to anything.
    ADD COLUMN "optionalStageDoneAt" TIMESTAMP(3);

--  What the athlete can actually train with
-- Absence of rows means "never asked", NOT "owns nothing". An empty set must
-- be read as "no filter" — filtering the catalogue by an empty equipment list
-- would leave the user with no exercises at all.
CREATE TABLE "UserEquipment" (
    "userId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEquipment_pkey" PRIMARY KEY ("userId", "equipmentId")
);

ALTER TABLE "UserEquipment"
    ADD CONSTRAINT "UserEquipment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserEquipment"
    ADD CONSTRAINT "UserEquipment_equipmentId_fkey"
    FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

--  Body areas to train around
-- This table does NOT feed the fatigue model. A muscle rendering red on the
-- body map with no workout behind it cannot be explained to the user, so an
-- injury filters and warns on exercises and stops there.
CREATE TABLE "UserInjury" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- NULL when the limitation does not map onto a catalogued muscle.
    "muscleId" TEXT,
    "label" TEXT NOT NULL,
    -- 'avoid' hides matching exercises; 'caution' shows them with a warning.
    "severity" TEXT NOT NULL DEFAULT 'caution',
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Set when the athlete marks it healed. Filters read WHERE resolvedAt IS
    -- NULL, so history is kept rather than deleted.
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "UserInjury_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserInjury_userId_resolvedAt_idx" ON "UserInjury"("userId", "resolvedAt");

ALTER TABLE "UserInjury"
    ADD CONSTRAINT "UserInjury_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserProfile"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserInjury"
    ADD CONSTRAINT "UserInjury_muscleId_fkey"
    FOREIGN KEY ("muscleId") REFERENCES "Muscle"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

--  Coach-mark dismissals
-- One row per hint the user has dismissed: a row means "seen", absence means
-- "show it". Server-side rather than localStorage so the tour does not replay
-- every time they open the app on another device.
CREATE TABLE "SeenHint" (
    "userId" TEXT NOT NULL,
    "hintKey" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeenHint_pkey" PRIMARY KEY ("userId", "hintKey")
);

ALTER TABLE "SeenHint"
    ADD CONSTRAINT "SeenHint_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
