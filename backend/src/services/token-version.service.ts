import prisma from '../lib/prisma'

/**
 * Token revocation. Each user's current token version is cached for 10 s, so a
 * revoked token stays usable for at most that long. Anything that bumps a
 * version must call `forgetTokenVersion`.
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

  // Deleted account
  if (!user) {
    cache.delete(userId)
    return null
  }

  cache.set(userId, { version: user.tokenVersion, readAt: Date.now() })

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

/** Revoke every token the user holds (sign out everywhere, credential changes). */
export const revokeAllTokens = async (userId: string): Promise<number> => {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  })
  forgetTokenVersion(userId)
  return updated.tokenVersion
}
