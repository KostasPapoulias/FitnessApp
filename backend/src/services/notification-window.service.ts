import prisma from '../lib/prisma'

/**
 * When a notification may be sent, as opposed to whether the user wants it.
 *
 * Every gate in here exists to stop the app becoming something people mute.
 * Notification fatigue is the failure mode that kills this whole feature, and
 * it is far easier to prevent than to recover from.
 */

/** Sending while the user is already in the app is pure noise. */
const RECENTLY_ACTIVE_MINUTES = 30

/** Nothing may follow another notification inside this window. */
const MIN_GAP_MINUTES = 60

/**
 * Local hour (0–23) for an instant in a given IANA zone.
 *
 * Intl is the only correct way to do this — offsets change with DST, so any
 * arithmetic on a stored offset is wrong twice a year.
 */
export const localHour = (date: Date, timezone: string): number => {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', hour12: false
    }).format(date)
    // en-GB renders midnight as "24" in some engines
    return Number(hour) % 24
  } catch {
    return date.getUTCHours()
  }
}

/** Local calendar day as YYYY-MM-DD — the basis for per-day dedupe keys. */
export const localDay = (date: Date, timezone: string): string => {
  try {
    // en-CA formats as YYYY-MM-DD, which sorts and compares correctly
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/**
 * Quiet hours, which normally wrap midnight (22:00 → 08:00). Equal start and
 * end means the user disabled them rather than requesting 24 hours of silence.
 */
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
 * Every timing gate, in the order that fails cheapest first.
 *
 * `urgent` skips only the daily cap and the minimum gap — never quiet hours.
 * Nothing this app has to say justifies waking someone at 3am.
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

  // 3. Daily cap, as a rolling 24 hours rather than a calendar day. A calendar
  //    reset allows three at 23:00 and three more at 00:05, which is precisely
  //    the burst the cap exists to prevent.
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

/**
 * Record that the user is using the app.
 *
 * Throttled in memory so an active session does not write on every request —
 * the value only needs to be accurate to within a few minutes for the
 * suppression check above.
 */
const lastWrite = new Map<string, number>()
const WRITE_THROTTLE_MS = 5 * 60 * 1000

export const touchLastSeen = (userId: string) => {
  const now = Date.now()
  if ((lastWrite.get(userId) ?? 0) > now - WRITE_THROTTLE_MS) return
  lastWrite.set(userId, now)

  // Fire and forget: a request must never fail or wait because of this, and
  // updateMany rather than upsert so it cannot create a preferences row —
  // which would be a silent opt-in.
  prisma.notificationPreference
    .updateMany({ where: { userId }, data: { lastSeenAt: new Date() } })
    .catch(() => {})
}
