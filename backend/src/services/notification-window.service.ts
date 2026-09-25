import prisma from '../lib/prisma'

/** When a notification may be sent: quiet hours, activity, daily cap and spacing. */

/** Sending while the user is already in the app is pure noise. */
const RECENTLY_ACTIVE_MINUTES = 30

/** Nothing may follow another notification inside this window. */
const MIN_GAP_MINUTES = 60

/** Local hour (0–23) in an IANA zone, via Intl so DST is handled. */
export const localHour = (date: Date, timezone: string): number => {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', hour12: false
    }).format(date)
    // Some engines render midnight as "24"
    return Number(hour) % 24
  } catch {
    return date.getUTCHours()
  }
}

/** Local calendar day as YYYY-MM-DD — the basis for per-day dedupe keys. */
export const localDay = (date: Date, timezone: string): string => {
  try {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** Quiet hours, which may wrap midnight. Equal start and end means disabled. */
export const isQuietHour = (hour: number, startHour: number, endHour: number): boolean => {
  if (startHour === endHour) return false
  return startHour > endHour
    ? hour >= startHour || hour < endHour
    : hour >= startHour && hour < endHour
}

export interface WindowVerdict {
  ok: boolean
  reason?: string
}

/**
 * Every timing gate, cheapest first. `urgent` skips the daily cap and spacing,
 * never quiet hours.
 */
export const checkSendWindow = async (
  userId: string,
  options: { urgent?: boolean } = {}
): Promise<WindowVerdict> => {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } })
  if (!pref) return { ok: false, reason: 'no preferences' }
  if (!pref.pushEnabled) return { ok: false, reason: 'push disabled' }

  const now = new Date()

  // 1. Quiet hours — never overridden
  const hour = localHour(now, pref.timezone)
  if (isQuietHour(hour, pref.quietStartHour, pref.quietEndHour)) {
    return { ok: false, reason: 'quiet hours' }
  }

  // 2. Already in the app
  if (pref.lastSeenAt) {
    const minutesSinceSeen = (now.getTime() - pref.lastSeenAt.getTime()) / 60_000
    if (minutesSinceSeen < RECENTLY_ACTIVE_MINUTES) {
      return { ok: false, reason: 'user is active in the app' }
    }
  }

  if (options.urgent) return { ok: true }

  // 3. Daily cap over a rolling 24 h, so it cannot burst across midnight
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sentToday = await prisma.notification.count({
    where: { userId, sentAt: { gte: dayAgo } }
  })
  if (sentToday >= pref.dailyCap) {
    return { ok: false, reason: `daily cap reached (${pref.dailyCap})` }
  }

  // 4. Minimum spacing
  const lastSent = await prisma.notification.findFirst({
    where: { userId, sentAt: { not: null } },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true }
  })
  if (lastSent?.sentAt) {
    const minutesSince = (now.getTime() - lastSent.sentAt.getTime()) / 60_000
    if (minutesSince < MIN_GAP_MINUTES) {
      return { ok: false, reason: 'too soon after the last notification' }
    }
  }

  return { ok: true }
}

/** Whether this type has gone out within `hours`. Per-type cooldowns. */
export const sentWithin = async (
  userId: string,
  type: string,
  hours: number
): Promise<boolean> => {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)
  const count = await prisma.notification.count({
    where: { userId, type, sentAt: { gte: since } }
  })
  return count > 0
}

/** Record that the user is in the app. Throttled to one write per 5 minutes. */
const lastWrite = new Map<string, number>()
const WRITE_THROTTLE_MS = 5 * 60 * 1000

export const touchLastSeen = (userId: string) => {
  const now = Date.now()
  if ((lastWrite.get(userId) ?? 0) > now - WRITE_THROTTLE_MS) return
  lastWrite.set(userId, now)

  // Fire and forget; updateMany so it can never create a preferences row (a silent opt-in)
  prisma.notificationPreference
    .updateMany({ where: { userId }, data: { lastSeenAt: new Date() } })
    .catch(() => {})
}
