-- Notification opt-in and the delivery ledger.
--
-- Two things this migration is careful about:
--
-- 1. EVERY preference defaults to false and nothing is backfilled. Users who
--    already have a PushSubscription row stay silent until they opt in — having
--    granted permission to deliver is not the same as asking to be messaged.
--
-- 2. `Notification` already existed and was written by nothing. It becomes the
--    ledger: one row per notification, from planned through to tapped. `sentAt`
--    and `displayedAt` are deliberately separate — a push service accepting a
--    payload is not evidence any phone displayed it, and conflating the two is
--    how you end up sending to ghosts and never noticing.

CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "essentialEnabled" BOOLEAN NOT NULL DEFAULT false,
    "coachEnabled" BOOLEAN NOT NULL DEFAULT false,
    -- IANA zone captured from the browser. Every timed rule depends on it.
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "quietStartHour" INTEGER NOT NULL DEFAULT 22,
    "quietEndHour" INTEGER NOT NULL DEFAULT 8,
    "dailyCap" INTEGER NOT NULL DEFAULT 3,
    -- Consecutive coach notifications displayed but never opened
    "ignoredStreak" INTEGER NOT NULL DEFAULT 0,
    "coachSuspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-type opt-in. No row means not enabled.
CREATE TABLE "NotificationTypePref" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationTypePref_pkey" PRIMARY KEY ("userId","type")
);

ALTER TABLE "NotificationTypePref" ADD CONSTRAINT "NotificationTypePref_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Notification becomes the delivery ledger ──
ALTER TABLE "Notification" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'essential';
ALTER TABLE "Notification" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'rule';
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "plannedFor" TIMESTAMP(3);
-- The real delivery receipt, reported by the service worker after it renders
ALTER TABLE "Notification" ADD COLUMN "displayedAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "clickedAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "dismissedAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "failReason" TEXT;

-- Was 'unread', which described a read state rather than a delivery state
ALTER TABLE "Notification" ALTER COLUMN "status" SET DEFAULT 'planned';

-- NULL dedupeKeys are distinct in Postgres, so unkeyed notifications are
-- unaffected by this constraint.
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");
CREATE INDEX "Notification_userId_status_plannedFor_idx" ON "Notification"("userId", "status", "plannedFor");
