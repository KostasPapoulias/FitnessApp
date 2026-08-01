-- Scheduler support.
--
-- lastSeenAt: notifications are suppressed while the user is already in the
-- app. A "time to train" push landing mid-set is noise, and worse, it teaches
-- people the notifications are not worth reading.
ALTER TABLE "NotificationPreference" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- plannerCalls: the AI planner's calls are capped on their own count rather
-- than sharing the user's chat budget. Otherwise a day of chatting silences the
-- planner, or a re-plan loop quietly spends the allowance the user wanted for
-- conversation.
ALTER TABLE "AiUsageDaily" ADD COLUMN "plannerCalls" INTEGER NOT NULL DEFAULT 0;
