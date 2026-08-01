import api from './api'

export interface NotificationPreferences {
  pushEnabled: boolean
  /** Rule-driven: readiness, overreaching, inactivity. Never auto-suspends. */
  essentialEnabled: boolean
  /** AI-planned nudges. Backs off and suspends itself when ignored. */
  coachEnabled: boolean
  timezone: string
  quietStartHour: number
  quietEndHour: number
  dailyCap: number
  coachSuspendedAt: string | null
  ignoredStreak: number
  types: Record<string, boolean>
}

export interface NotificationRecord {
  id: string
  type: string
  tier: string
  source: string
  title: string
  body: string
  status: string
  sentAt: string | null
  /** Confirmed rendered on a device. Absent means unconfirmed, NOT undelivered. */
  displayedAt: string | null
  clickedAt: string | null
  failReason: string | null
}

/**
 * The types a user can switch individually.
 *
 * `coach_nudge` is deliberately absent: the AI tier is controlled by the
 * `coachEnabled` flag rather than a per-type row, because the suspension and
 * backoff logic keys off that flag. A type row would let the two disagree.
 */
export const NOTIFICATION_CATALOGUE = [
  {
    type: 'readiness_ready',
    icon: '💪',
    label: 'Recovered and ready',
    description: 'When your readiness is high and you haven’t trained yet that day.',
  },
  {
    type: 'overreaching',
    icon: '⚠️',
    label: 'Injury risk warning',
    description: 'When your recent load spikes well above what you’re conditioned for.',
    /** Disabling gets a confirm — it fires exactly when you feel fine and are
     *  about to train through it, which is when it is easiest to dismiss. */
    safety: true,
  },
  {
    type: 'inactivity',
    icon: '🏋️',
    label: 'Been a while',
    description: 'When you haven’t logged a session for a few days.',
  },
] as const

export const notificationService = {
  getPreferences: async (): Promise<NotificationPreferences> => {
    const res = await api.get('/notifications/preferences')
    return res.data.data
  },

  updatePreferences: async (
    input: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> => {
    const res = await api.put('/notifications/preferences', input)
    return res.data.data
  },

  getHistory: async (limit = 25): Promise<NotificationRecord[]> => {
    const res = await api.get('/notifications/history', { params: { limit } })
    return res.data.data
  },
}

/**
 * The device's IANA zone, e.g. "Europe/Athens".
 *
 * Nothing timed can work without it — the server has no way to know what "9am"
 * means for a given user otherwise.
 */
export const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
