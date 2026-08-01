import prisma from '../lib/prisma'

/**
 * Notification types the app knows how to send.
 *
 * Essential types are rule-driven and never suspend themselves. Coach types are
 * planned by the AI and back off when ignored.
 */
export const NOTIFICATION_TYPES = {
  // ── essential ──
  READINESS_READY: 'readiness_ready',
  OVERREACHING: 'overreaching',
  INACTIVITY: 'inactivity',
  COACH_SUSPENDED: 'coach_suspended',
  // ── coach ──
  COACH_NUDGE: 'coach_nudge',
} as const

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES]

export const ESSENTIAL_TYPES: NotificationType[] = [
  NOTIFICATION_TYPES.READINESS_READY,
  NOTIFICATION_TYPES.OVERREACHING,
  NOTIFICATION_TYPES.INACTIVITY,
  NOTIFICATION_TYPES.COACH_SUSPENDED,
]

export const tierOf = (type: string): 'essential' | 'coach' =>
  ESSENTIAL_TYPES.includes(type as NotificationType) ? 'essential' : 'coach'

/**
 * Read a user's preferences.
 *
 * Returns the all-off defaults WITHOUT creating a row. Reading preferences must
 * never be what enables someone — a row only appears when they choose something.
 */
export const getPreferences = async (userId: string) => {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } })
  const typePrefs = await prisma.notificationTypePref.findMany({ where: { userId } })

  return {
    pushEnabled: pref?.pushEnabled ?? false,
    essentialEnabled: pref?.essentialEnabled ?? false,
    coachEnabled: pref?.coachEnabled ?? false,
    timezone: pref?.timezone ?? 'UTC',
    quietStartHour: pref?.quietStartHour ?? 22,
    quietEndHour: pref?.quietEndHour ?? 8,
    dailyCap: pref?.dailyCap ?? 3,
    coachSuspendedAt: pref?.coachSuspendedAt ?? null,
    ignoredStreak: pref?.ignoredStreak ?? 0,
    types: Object.fromEntries(typePrefs.map(t => [t.type, t.enabled])),
  }
}

const clampHour = (value: unknown, fallback: number) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback
}

/**
 * Update preferences. Only the fields present in `input` change.
 *
 * The daily cap is clamped server-side: the client can lower it but never raise
 * it past MAX_DAILY_CAP, so a tampered request cannot turn the app into a
 * notification firehose.
 */
const MAX_DAILY_CAP = 5

export const updatePreferences = async (userId: string, input: {
  pushEnabled?: boolean
  essentialEnabled?: boolean
  coachEnabled?: boolean
  timezone?: string
  quietStartHour?: number
  quietEndHour?: number
  dailyCap?: number
  types?: Record<string, boolean>
}) => {
  const current = await prisma.notificationPreference.findUnique({ where: { userId } })

  const data = {
    ...(input.pushEnabled !== undefined && { pushEnabled: Boolean(input.pushEnabled) }),
    ...(input.essentialEnabled !== undefined && { essentialEnabled: Boolean(input.essentialEnabled) }),
    ...(input.timezone !== undefined && { timezone: sanitizeTimezone(input.timezone) }),
    ...(input.quietStartHour !== undefined && {
      quietStartHour: clampHour(input.quietStartHour, current?.quietStartHour ?? 22)
    }),
    ...(input.quietEndHour !== undefined && {
      quietEndHour: clampHour(input.quietEndHour, current?.quietEndHour ?? 8)
    }),
    ...(input.dailyCap !== undefined && {
      dailyCap: Math.min(MAX_DAILY_CAP, Math.max(1, Number(input.dailyCap) || 1))
    }),
    // Turning the coach back on clears the suspension and the ignore streak —
    // an explicit opt-in is the strongest possible engagement signal.
    ...(input.coachEnabled !== undefined && {
      coachEnabled: Boolean(input.coachEnabled),
      ...(input.coachEnabled ? { coachSuspendedAt: null, ignoredStreak: 0 } : {})
    }),
  }

  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })

  if (input.types) {
    for (const [type, enabled] of Object.entries(input.types)) {
      await prisma.notificationTypePref.upsert({
        where: { userId_type: { userId, type } },
        create: { userId, type, enabled: Boolean(enabled) },
        update: { enabled: Boolean(enabled) },
      })
    }
  }

  return getPreferences(userId)
}

/**
 * Reject anything that is not a real IANA zone.
 *
 * The value is fed to Intl to resolve local hours, and an unknown zone throws
 * there — inside the scheduler, where a throw would stop notifications for
 * every user in the tick, not just this one.
 */
const sanitizeTimezone = (timezone: string): string => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return timezone
  } catch {
    return 'UTC'
  }
}

/**
 * Whether a specific notification may be sent right now, ignoring timing.
 *
 * Three explicit yeses: the master switch, the tier, and the type. A user who
 * has never touched the settings fails at the first.
 */
export const isTypeAllowed = async (userId: string, type: string): Promise<boolean> => {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } })
  if (!pref?.pushEnabled) return false

  const tier = tierOf(type)
  if (tier === 'essential' && !pref.essentialEnabled) return false
  if (tier === 'coach') {
    if (!pref.coachEnabled) return false
    if (pref.coachSuspendedAt) return false
  }

  // Per-type rows are an optional refinement: absent means "follow the tier".
  const typePref = await prisma.notificationTypePref.findUnique({
    where: { userId_type: { userId, type } }
  })
  return typePref ? typePref.enabled : true
}
