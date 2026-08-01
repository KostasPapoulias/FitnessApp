-- Per-exercise mechanical damage profile.
--
-- `impactFactor` on MuscleExercise says which muscles a movement recruits. It
-- was also being asked to carry how DAMAGING the movement is, which it cannot:
-- with cycling at 0.7 on quads and running at 0.6, the model scored a bike ride
-- as harder on the legs than a run of the same duration — backwards, since
-- running is eccentric and weight-bearing and cycling is neither.
--
-- referenceSpeedKmh converts distance covered into comparable work, so 15 km on
-- a bike and 15 km on foot stop counting the same. Null means distance carries
-- no meaning for this movement and duration is used instead.
ALTER TABLE "Exercise" ADD COLUMN "damageFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "Exercise" ADD COLUMN "referenceSpeedKmh" DOUBLE PRECISION;
