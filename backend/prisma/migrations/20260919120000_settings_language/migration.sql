-- The athlete's app language: 'en' | 'el'.
--
-- Defaults to 'en' for every existing account, which is what they have been
-- reading all along — nothing changes for anyone until they pick Greek. The
-- client pushes a language chosen on the signed-out screens up to the account
-- at sign-in, so an existing user who switches to Greek on Login keeps it.
ALTER TABLE "Settings" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
