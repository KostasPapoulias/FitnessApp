import api from './api'

export interface PinStatus {
  enabled: boolean
  locked: boolean
  lockedUntil: string | null
  attemptsRemaining: number
}

export const securityService = {
  getPinStatus: async (): Promise<PinStatus> => {
    const res = await api.get('/security/pin')
    return res.data.data
  },

  // Changing an existing PIN needs the old one, or the account password as the
  // way back in when it has been forgotten.
  setPin: async (pin: string, proof?: { currentPin?: string; password?: string }) => {
    await api.put('/security/pin', { pin, ...proof })
  },

  removePin: async (proof: { pin?: string; password?: string }) => {
    await api.delete('/security/pin', { data: proof })
  },

  // Verified server-side, so the correct PIN never sits in the bundle or in
  // device storage where it could simply be read.
  verifyPin: async (pin: string): Promise<boolean> => {
    const res = await api.post('/security/pin/verify', { pin })
    return res.data.success === true
  },

  signOutEverywhere: async () => {
    await api.post('/security/sign-out-everywhere')
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    await api.put('/security/password', { currentPassword, newPassword })
  },
}
