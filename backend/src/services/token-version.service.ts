import prisma from '../lib/prisma'

/**
 * Current token version per user, cached briefly.
 *
 * Revocation has to be checked on every authenticated request or it is not
 * revocation. That would be a database read per request, so versions are held
 * for a few seconds — a revoked token stays usable for at most that long, which
 * is the trade being made deliberately: seconds instead of the seven days a
 * stateless JWT otherwise survives.
 *
 * Any code that bumps a version must call `forget()` so the change applies at
 * once on the instance that made it.
 */

const TTL_MS = 10_000

const cache = new Map<string, { version: number; readAt: number }>()

export const currentTokenVersion = async (userId: string): Promise<number | null> => {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.readAt < TTL_MS) return hit.version

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  })

  // Deleted account: the token references somebody who no longer exists
  if (!user) {
    cache.delete(userId)
    return null
  }

  cache.set(userId, { version: user.tokenVersion, readAt: Date.now() })

  // Bounded so a long-running process cannot accumulate an entry per user seen
  if (cache.size > 5_000) {
    const cutoff = Date.now() - TTL_MS
    for (const [key, entry] of cache) {
      if (entry.readAt < cutoff) cache.delete(key)
    }
  }

  return user.tokenVersion
}

/** Drop a cached version — call immediately after incrementing one. */
export const forgetTokenVersion = (userId: string) => cache.delete(userId)

/**
 * Revoke every token this user holds.
 *
 * Used by "sign out everywhere" and by anything that changes a credential: a
 * password change that leaves old tokens working is not really a password
 * change.
 */
export const revokeAllTokens = async (userId: string): Promise<number> => {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  })
  forgetTokenVersion(userId)
  return updated.tokenVersion
}
