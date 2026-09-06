-- Starred exercises.
--
-- The star has been on ExerciseDetail since the screen was written, with no
-- onClick behind it and nothing in the database underneath — one of the
-- "intact and doing nothing" surfaces the app already has a history of.
--
-- The pair is the primary key rather than a uuid with a unique index over it.
-- Starring is idempotent by nature: a double-tap, an offline replay, or two
-- tabs should all converge on one row, and a composite PK makes that a
-- structural guarantee instead of something the client has to get right.
--
-- No `updatedAt`: there is nothing to update. A star is created or it is gone,
-- and `createdAt` is kept only so "recently starred" can order the list later.
CREATE TABLE "FavoriteExercise" (
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteExercise_pkey" PRIMARY KEY ("userId", "exerciseId")
);

-- Every read starts from the athlete — listing their stars, or marking up a
-- catalogue page they are looking at. Nothing asks "who starred this
-- exercise", so there is no index in the other direction.
--
-- The composite PK already covers userId as its leading column, so this index
-- is redundant for lookups. It is declared anyway to match what Prisma's
-- schema states, so a future `migrate diff` does not see drift and propose to
-- add it.
CREATE INDEX "FavoriteExercise_userId_idx" ON "FavoriteExercise"("userId");

-- CASCADE on both sides, and both are deliberate:
--   · deleting an account takes its stars with it — they are worthless alone;
--   · deleting a custom exercise takes the stars pointing at it, because the
--     alternative is a star that resolves to nothing and renders as a blank
--     row in the favourites list.
ALTER TABLE "FavoriteExercise" ADD CONSTRAINT "FavoriteExercise_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FavoriteExercise" ADD CONSTRAINT "FavoriteExercise_exerciseId_fkey"
    FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
