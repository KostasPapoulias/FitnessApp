-- Seconds under tension for isometric calisthenics holds (plank, L-sit, front
-- lever...). Previously the hold duration was written into `reps`, which scored
-- a 45s plank as 45 repetitions. Null for normal rep-based sets.
ALTER TABLE "SetCalisthenics" ADD COLUMN "time" INTEGER;
