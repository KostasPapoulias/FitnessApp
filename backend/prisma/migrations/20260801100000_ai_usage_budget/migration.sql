-- Per-day AI spend tracking.
--
-- Nothing capped AI usage before this: a user (or a loop, or a script holding a
-- valid token) could call the chat endpoint indefinitely and every call was
-- billable. This table is the ledger the budget check reads, written from the
-- provider's reported token counts after each call.

CREATE TABLE "AiUsageDaily" (
    "userId" TEXT NOT NULL,
    -- UTC calendar day as YYYY-MM-DD. A string because the budget only ever
    -- needs equality against "today", never date arithmetic.
    "day" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY ("userId","day")
);

ALTER TABLE "AiUsageDaily" ADD CONSTRAINT "AiUsageDaily_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
