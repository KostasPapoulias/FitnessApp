import api from './api'

export interface NotificationPreferences {
  pushEnabled: boolean
  /** Rule-driven: readiness, overreaching, inactivity. Never auto-suspends. */
  essentialEnabled: boolean
  /** AI-planned nudges; back off and suspend when ignored. */
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
  /** Confirmed rendered on a device. Absent means unconfirmed, not undelivered. */
  displayedAt: string | null
  clickedAt: string | null
  failReason: string | null
}

/** Individually switchable types. `coach_nudge` is controlled by `coachEnabled` instead. */
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
    /** Turning it off asks for confirmation. */
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

/** The device's IANA timezone, e.g. "Europe/Athens". */
export const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
