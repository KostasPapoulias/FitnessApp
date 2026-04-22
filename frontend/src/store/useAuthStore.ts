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

      login: async (email, password) => {
        set({ isLoading: true })
        const res = await api.post('/auth/login', { email, password })
        const { token, user } = res.data.data
        localStorage.setItem('somatrack_token', token)
        set({ token, user, isAuthenticated: true, isLoading: false })
      },

      register: async (email, password, name) => {
        set({ isLoading: true })
        const res = await api.post('/auth/register', { email, password, name })
        const { token, user } = res.data.data
        localStorage.setItem('somatrack_token', token)
        set({ token, user, isAuthenticated: true, isLoading: false })
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