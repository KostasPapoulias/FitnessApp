-- The recorded route, splits and average pace behind a cardio set.
--
-- Purely additive: one new table keyed on an existing WorkoutSet. Nothing is
-- dropped, renamed or retyped, so this is safe against a database with live
-- data and needs no backfill. Runs logged before it simply have no RunTrack —
-- every read path treats the row as optional, because for older runs the data
-- genuinely was never recorded rather than lost.
--
-- Separate from SetCardio on purpose. "route" is tens of kilobytes for a long
-- run, and SetCardio is loaded for every set of every session the calendar
-- lists; carrying a route through those queries would make the month view pay
-- for maps it never draws.

CREATE TABLE "RunTrack" (
    "setId" TEXT NOT NULL,
    -- When the clock started, which is not when the row was written: the effort
    -- rating can sit on screen for minutes after a run ends.
    "startedAt" TIMESTAMP(3) NOT NULL,
    -- Metres, unrounded. SetCardio.distance is kilometres rounded to two
    -- decimals for display, and a pace derived from that is off by seconds.
    "distanceM" DOUBLE PRECISION NOT NULL,
    "durationSec" INTEGER NOT NULL,
    -- Seconds per kilometre, stored rather than derived so history shows the
    -- same number the athlete saw when they finished.
    "avgPaceSec" INTEGER NOT NULL,
    "elevationGainM" INTEGER NOT NULL DEFAULT 0,
    -- 'gps' | 'manual'. A treadmill session has splits but no route.
    "source" TEXT NOT NULL DEFAULT 'gps',
    -- [[[lng, lat], ...], ...] — one array per stretch of continuous recording,
    -- segmented at write time so nothing downstream can draw a straight line
    -- across a gap the app was not running for.
    "route" JSONB,
    -- [[west, south], [east, north]], for framing the map without walking route.
    "bounds" JSONB,
    -- [{ index, meters, seconds, endMeters, auto }]
    "splits" JSONB,
    "laps" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunTrack_pkey" PRIMARY KEY ("setId")
);

-- Cascade matches every other set-detail table: a deleted set has no run.
ALTER TABLE "RunTrack"
    ADD CONSTRAINT "RunTrack_setId_fkey"
    FOREIGN KEY ("setId") REFERENCES "WorkoutSet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
