-- Per-exercise starting load, so a first-time suggestion is not the same
-- number for every movement.
--
-- Every strength exercise previously opened at 60/70/80 kg from a hardcoded
-- client-side table, which offered a 60 kg lateral raise. loadFactor expresses
-- a working set of ~10 reps as a fraction of bodyweight for a trained adult
-- male; the starting-load service scales that by the athlete's own bodyweight,
-- sex, age, level and training experience.
--
-- Purely additive and nullable. Null means "not loaded with external weight"
-- (or simply unseeded), and the suggestion path falls back to what it did
-- before rather than inventing a number.

ALTER TABLE "Exercise" ADD COLUMN "loadFactor" DOUBLE PRECISION;
