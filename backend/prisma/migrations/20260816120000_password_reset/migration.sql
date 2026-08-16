-- Password reset.
--
-- `changePassword` required being signed in, so forgetting a password meant
-- losing the account outright — no reset, no email verification, no way to
-- prove ownership. This is the missing path back in.
--
-- Only the HASH of the emailed token is stored, for the same reason the
-- password is hashed: a reset link is a bearer credential for the account, and
-- anyone able to read this table would otherwise be able to take over every
-- account with a pending reset.
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- SHA-256 of the token, not bcrypt. The token is 32 bytes of CSPRNG output,
    -- so it has no dictionary to attack and needs no work factor — and lookup
    -- has to be by exact match, which a salted bcrypt hash cannot do.
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    -- Set on use. Kept rather than deleted so a spent link can be told apart
    -- from one that never existed.
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestIp" TEXT,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- Rate limiting reads the recent rows for a user; expiry sweeps read the whole
-- table by expiresAt.
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
