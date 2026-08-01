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
