import api from './api'
import type { Settings } from '../types'

/**
 * Everything on the Settings row is a partial patch — the settings screen saves
 * one control at a time, and sending the whole object back would let a screen
 * that never loaded a field overwrite it with a stale value.
 */
export interface SettingsPatch {
  preferredUnit?: 'metric' | 'imperial'
  theme?: 'dark' | 'light'
  notificationEnabled?: boolean
  inactivityDaysThreshold?: number
  aiConsentEnabled?: boolean
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
