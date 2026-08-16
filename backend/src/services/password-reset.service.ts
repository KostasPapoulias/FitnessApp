import crypto from 'crypto'
import bcrypt from 'bcrypt'
import prisma from '../lib/prisma'
import { isMailConfigured, passwordResetMail, sendMail } from '../lib/mailer'
import { revokeAllTokens } from './token-version.service'

/**
 * Forgotten-password recovery.
 *
 * `changePassword` required being signed in, so a forgotten password meant the
 * account was gone. This is the way back, and it is the one unauthenticated
 * flow in the app that can take over an account — so the rules below are not
 * decoration.
 */

/**
 * Short by design. The link is a bearer credential for the account sitting in
 * an inbox, and inboxes are forwarded, synced and left open. Long enough to
 * walk to a laptop, not long enough to be worth stealing later.
 */
export const TOKEN_TTL_MINUTES = 30

/**
 * 32 bytes of CSPRNG output. The token has to be unguessable against an
 * attacker who can make unlimited attempts, because unlike a password there is
 * no account lockout protecting it — only its own entropy.
 */
const TOKEN_BYTES = 32

/** Live requests allowed per account before further ones are refused. */
const MAX_ACTIVE_PER_USER = 3

/**
 * SHA-256, not bcrypt.
 *
 * A password is low-entropy and needs a slow hash to survive a dictionary
 * attack. This token is 256 random bits — there is no dictionary, so a work
 * factor buys nothing. And lookup must be by exact match, which a salted bcrypt
 * hash cannot do without scanning every row.
 */
const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex')

export const requestPasswordReset = async (
  email: string,
  { baseUrl, requestIp }: { baseUrl: string; requestIp?: string }
): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  })

  // No such account: return silently. Answering differently for a registered
  // and an unregistered address turns this endpoint into a way to test whether
  // someone has an account here, which for a fitness app is personal
  // information. The caller says "if that address is registered, check it"
  // either way.
  if (!user) return

  const active = await prisma.passwordResetToken.count({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
  })
  // Per-account cap on top of the per-IP rate limit. The IP limiter protects
  // the server; this protects the person whose inbox someone else is filling.
  if (active >= MAX_ACTIVE_PER_USER) return

  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url')

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
      requestIp: requestIp ?? null,
    },
  })

  const link = `${baseUrl.replace(/\/+$/, '')}/reset-password?token=${token}`
  await sendMail(passwordResetMail(user.email, link, TOKEN_TTL_MINUTES))
}

export class ResetError extends Error {}

export const completePasswordReset = async (
  token: string,
  newPassword: string
): Promise<void> => {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  })

  // One message for every failure mode. Distinguishing "no such token" from
  // "expired" from "already used" tells an attacker which guesses were closer.
  const rejection = 'That reset link is invalid or has expired. Request a new one.'

  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw new ResetError(rejection)
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { password: passwordHash },
    }),
    // Spent, not deleted — a removed row is indistinguishable from one that
    // never existed, and this way a reused link is provably a reused link.
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    // Every other outstanding link for this account dies with it. Otherwise a
    // second link, requested by whoever prompted the reset, still works.
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ])

  // The whole point of resetting a password is usually that someone else may
  // have had it. Leaving their existing sessions signed in would defeat it.
  await revokeAllTokens(row.userId)
}

export { isMailConfigured }
