import api from './api'

/** Password-reset calls. Sign-in and registration live in useAuthStore, which owns the token. */
export const authService = {
  /** Request a reset link. The server answers the same whether or not the address is registered. */
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
