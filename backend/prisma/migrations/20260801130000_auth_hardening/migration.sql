-- Auth hardening: token revocation and an optional screen lock.
--
-- tokenVersion is what makes a stateless JWT revocable. Tokens are signed with
-- the value current at issue time; incrementing it makes every outstanding
-- token for that user stale immediately. Without it a leaked token stayed valid
-- for its full 7 days and logging out only cleared the client's copy.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Optional PIN screen lock. Hashed with bcrypt like a password: a 4-6 digit
-- code is trivially brute-forced offline if stored reversibly.
ALTER TABLE "Settings" ADD COLUMN "pinHash" TEXT;
-- Rate limiting for PIN entry. 10,000 combinations is nothing without it.
ALTER TABLE "Settings" ADD COLUMN "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Settings" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
