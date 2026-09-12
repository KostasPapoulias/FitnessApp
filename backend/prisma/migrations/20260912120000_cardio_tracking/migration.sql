-- How a cardio movement's work is measured.
--
-- 'gps'     — distance, and the phone can measure it (running, cycling, walking)
-- 'machine' — distance, but nothing measures it for you (erg, treadmill, pool)
-- 'reps'    — no distance at all; the work is counted (jump rope, stair climber)
--
-- Defaults to 'gps' rather than to the safest-looking value: every existing
-- cardio session already offers GPS, and defaulting to 'reps' would quietly
-- take the map away from every custom exercise the moment this lands. The seed
-- sets the real value for catalogue movements immediately afterwards.
ALTER TABLE "Exercise" ADD COLUMN "cardioTracking" TEXT NOT NULL DEFAULT 'gps';

-- Counts per minute for a 'reps' movement — the counting equivalent of
-- referenceSpeedKmh, and used identically by the fatigue model.
ALTER TABLE "Exercise" ADD COLUMN "referenceCadenceRpm" DOUBLE PRECISION;

-- 'skips' | 'floors' | 'reps'. Wording only.
ALTER TABLE "Exercise" ADD COLUMN "repUnit" TEXT;

-- Counted work for a cardio set with no distance. Null is a real answer, not a
-- missing one: a rope session logged on the clock alone still scores, just
-- without the density term.
ALTER TABLE "SetCardio" ADD COLUMN "reps" INTEGER;
