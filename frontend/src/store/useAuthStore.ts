import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '../types'
import api from '../services/api'

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      // isLoading is cleared in a finally on both of these. Clearing it only on
      // the success path left the button disabled and reading "Creating
      // account…" forever after any rejection — the form could not be corrected
      // and retried without reloading the app, which is how a rejected password
      // became an apparent dead end.
      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const res = await api.post('/auth/login', { email, password })
          const { token, user } = res.data.data
          localStorage.setItem('somatrack_token', token)
          set({ token, user, isAuthenticated: true })
        } finally {
          set({ isLoading: false })
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true })
        try {
          const res = await api.post('/auth/register', { email, password, name })
          const { token, user } = res.data.data
          localStorage.setItem('somatrack_token', token)
          set({ token, user, isAuthenticated: true })
        } finally {
          set({ isLoading: false })
        }
      },

      logout: () => {
        localStorage.removeItem('somatrack_token')
        set({ user: null, token: null, isAuthenticated: false })
      },

      fetchMe: async () => {
        try {
          const res = await api.get('/auth/me')
          set({ user: res.data.data, isAuthenticated: true })
        } catch {
          set({ user: null, token: null, isAuthenticated: false })
        }
      }
    }),
    {
      name: 'somatrack_auth',
      partialize: (state) => ({ token: state.token, user: state.user })
    }
  )
)