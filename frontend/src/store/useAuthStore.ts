import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '../types'
import api from '../services/api'

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  /** True only while the stored token is being revalidated on a cold launch. */
  isBootstrapping: boolean

  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

/**
 * The request interceptor authorises from `somatrack_token`, so that key — not
 * the persisted store — is what decides whether this device is signed in.
 * A 401 wipes it without touching the store, and the two must not disagree.
 */
const storedToken = (): string | null =>
  typeof localStorage === 'undefined' ? null : localStorage.getItem('somatrack_token')

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      // Seeded from the token that is already on the device.
      //
      // Starting these at null/false meant every cold launch began signed out:
      // `Protected` bounced to /login, Login painted, `fetchMe` came back a
      // moment later and bounced it straight back in. Nothing was wrong — the
      // app just rendered its answer before it had asked the question. A token
      // on disk is grounds to assume a session; `fetchMe` and the 401
      // interceptor both revoke it if the assumption turns out to be wrong.
      token: storedToken(),
      isAuthenticated: !!storedToken(),
      isLoading: false,
      isBootstrapping: !!storedToken(),

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
        set({ user: null, token: null, isAuthenticated: false, isBootstrapping: false })
      },

      fetchMe: async () => {
        try {
          const res = await api.get('/auth/me')
          set({ user: res.data.data, isAuthenticated: true })
        } catch {
          localStorage.removeItem('somatrack_token')
          set({ user: null, token: null, isAuthenticated: false })
        } finally {
          // Whatever the answer, the launch-time guess has been settled and the
          // app can stop holding its splash.
          set({ isBootstrapping: false })
        }
      }
    }),
    {
      name: 'somatrack_auth',
      // The user, not the token. Restoring the profile synchronously is what
      // keeps `Protected`'s onboarding gate from bouncing a returning user
      // through the form while `fetchMe` is still in flight. The token is
      // deliberately left to `somatrack_token` alone — persisting it in two
      // places let a 401 clear one and not the other.
      partialize: (state) => ({ user: state.user })
    }
  )
)