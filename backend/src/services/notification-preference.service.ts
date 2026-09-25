import prisma from '../lib/prisma'

/**
 * Notification types. Essential types are rule-driven and never suspend;
 * coach types are AI-planned and back off when ignored.
 */
export const NOTIFICATION_TYPES = {
  // ── essential ──
  READINESS_READY: 'readiness_ready',
  OVERREACHING: 'overreaching',
  INACTIVITY: 'inactivity',
  COACH_SUSPENDED: 'coach_suspended',
  // Essential: the athlete asked for this reminder explicitly
  WORKOUT_REMINDER: 'workout_reminder',
  // ── coach ──
  COACH_NUDGE: 'coach_nudge',
} as const

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES]

export const ESSENTIAL_TYPES: NotificationType[] = [
  NOTIFICATION_TYPES.READINESS_READY,
  NOTIFICATION_TYPES.OVERREACHING,
  NOTIFICATION_TYPES.INACTIVITY,
  NOTIFICATION_TYPES.COACH_SUSPENDED,
  NOTIFICATION_TYPES.WORKOUT_REMINDER,
]

/** The AI-planned types. */
export const COACH_TYPES: NotificationType[] = [
  NOTIFICATION_TYPES.COACH_NUDGE,
]

/** Unknown types classify as essential, so a typo fails toward "sent", not "silently dropped". */
export const tierOf = (type: string): 'essential' | 'coach' =>
  COACH_TYPES.includes(type as NotificationType) ? 'coach' : 'essential'

/** A user's preferences, with all-off defaults. Never creates a row. */
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

/** Update preferences; only fields present in `input` change. Daily cap is clamped server-side. */
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
    // Re-enabling the coach clears the suspension and streak
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

/** Unknown IANA zones fall back to UTC — they would throw inside the scheduler. */
const sanitizeTimezone = (timezone: string): string => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return timezone
  } catch {
    return 'UTC'
  }
}

/** Master switch, tier and type must all be on. Ignores timing. */
export const isTypeAllowed = async (userId: string, type: string): Promise<boolean> => {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } })
  if (!pref?.pushEnabled) return false

  const tier = tierOf(type)
  if (tier === 'essential' && !pref.essentialEnabled) return false
  if (tier === 'coach') {
    if (!pref.coachEnabled) return false
    if (pref.coachSuspendedAt) return false
  }

  // No per-type row means "follow the tier"
  const typePref = await prisma.notificationTypePref.findUnique({
    where: { userId_type: { userId, type } }
  })
  return typePref ? typePref.enabled : true
}
