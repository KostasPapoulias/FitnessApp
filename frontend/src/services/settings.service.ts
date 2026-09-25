import api from './api'
import type { Settings } from '../types'
import type { Locale } from '../i18n/locales'

/** A partial settings patch; only the fields sent are changed. */
export interface SettingsPatch {
  preferredUnit?: 'metric' | 'imperial'
  theme?: 'dark' | 'light'
  notificationEnabled?: boolean
  inactivityDaysThreshold?: number
  aiConsentEnabled?: boolean
  language?: Locale
}

export const settingsService = {
  getSettings: async (): Promise<Settings> => {
    const res = await api.get('/settings')
    return res.data.data
  },

  updateSettings: async (patch: SettingsPatch): Promise<Settings> => {
    const res = await api.put('/settings', patch)
    return res.data.data
  },
}
