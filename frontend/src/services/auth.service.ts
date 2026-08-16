import api from './api'

/**
 * The unauthenticated auth calls.
 *
 * Sign-in and registration live in `useAuthStore`, because they produce the
 * token the store owns. These two produce no session at all — a reset
 * deliberately does not sign anyone in — so they have nothing to do with it.
 */
export const authService = {
  /**
   * Ask for a reset link.
   *
   * Resolves the same way whether or not the address is registered. The server
   * answers identically on purpose, so there is nothing here to branch on.
   */
  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const res = await api.post('/auth/forgot-password', { email })
    return res.data.data
  },

  /** Consume the emailed token and set a new password. Returns no session. */
  resetPassword: async (token: string, password: string): Promise<{ message: string }> => {
    const res = await api.post('/auth/reset-password', { token, password })
    return res.data.data
  },
}
