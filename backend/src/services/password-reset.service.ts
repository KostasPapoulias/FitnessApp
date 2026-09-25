import crypto from 'crypto'
import bcrypt from 'bcrypt'
import prisma from '../lib/prisma'
import { isMailConfigured, passwordResetMail, sendMail } from '../lib/mailer'
import { revokeAllTokens } from './token-version.service'
import type { Locale } from '../lib/locale'

/** Forgotten-password recovery: emailed single-use reset links. */

/** Reset links expire quickly; they are account credentials sitting in an inbox. */
export const TOKEN_TTL_MINUTES = 30

/** 256 bits of randomness — the token's only protection against guessing. */
const TOKEN_BYTES = 32

/** Live requests allowed per account before further ones are refused. */
const MAX_ACTIVE_PER_USER = 3

/**
 * SHA-256 rather than bcrypt: the token is high-entropy, so a slow hash adds
 * nothing, and lookup needs an exact match.
 */
const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex')

export const requestPasswordReset = async (
  email: string,
  { baseUrl, requestIp, locale = 'en' }: { baseUrl: string; requestIp?: string; locale?: Locale }
): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  })

  // Unknown address: return silently so the endpoint cannot reveal who has an account
  if (!user) return

  const active = await prisma.passwordResetToken.count({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
  })
  // Per-account cap on top of the per-IP rate limit
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
  await sendMail(passwordResetMail(user.email, link, TOKEN_TTL_MINUTES, locale))
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

  // One message for every failure, so attackers learn nothing
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
    // Marked used rather than deleted, so reuse is detectable
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate every other outstanding link for the account
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ])

  // Sign out every existing session
  await revokeAllTokens(row.userId)
}

export { isMailConfigured }
