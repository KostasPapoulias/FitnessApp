import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '../types'
import api from '../services/api'
import { settingsService } from '../services/settings.service'
import { useLocaleStore } from './useLocaleStore'
import { isLocale } from '../i18n/locales'

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

/** The stored token (`somatrack_token`) alone decides whether the device is signed in. */
const storedToken = (): string | null =>
  typeof localStorage === 'undefined' ? null : localStorage.getItem('somatrack_token')

/**
 * Squares the device's language with the account's: the account wins, unless
 * the language was picked on a signed-out screen, in which case it is saved to
 * the account. A failed save stays pending and retries next launch.
 */
const reconcileLocale = (accountLanguage: unknown) => {
  const { locale, pendingSync, setLocale, markSynced } = useLocaleStore.getState()

  if (pendingSync) {
    if (accountLanguage === locale) {
      markSynced()
      return
    }
    settingsService.updateSettings({ language: locale })
      .then(() => {
        // Only if nothing newer was picked meanwhile
        if (useLocaleStore.getState().locale === locale) markSynced()
      })
      .catch(() => {})
    return
  }

  if (isLocale(accountLanguage) && accountLanguage !== locale) setLocale(accountLanguage)
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      // Seeded from the stored token, so a cold launch doesn't render Login
      // first; fetchMe and the 401 interceptor revoke it if it is invalid
      token: storedToken(),
      isAuthenticated: !!storedToken(),
      isLoading: false,
      isBootstrapping: !!storedToken(),

      // isLoading is cleared in `finally`, so a rejected attempt can be retried
      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const res = await api.post('/auth/login', { email, password })
          const { token, user } = res.data.data
          localStorage.setItem('somatrack_token', token)
          set({ token, user, isAuthenticated: true })
          reconcileLocale(user?.settings?.language)
        } finally {
          set({ isLoading: false })
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true })
        try {
          // The account starts in the language Register was showing
          const language = useLocaleStore.getState().locale
          const res = await api.post('/auth/register', { email, password, name, language })
          const { token, user } = res.data.data
          localStorage.setItem('somatrack_token', token)
          set({ token, user, isAuthenticated: true })
          reconcileLocale(user?.settings?.language)
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
          reconcileLocale(res.data.data?.settings?.language)
        } catch {
          localStorage.removeItem('somatrack_token')
          set({ user: null, token: null, isAuthenticated: false })
        } finally {
          // The launch check is settled; the splash can go
          set({ isBootstrapping: false })
        }
      }
    }),
    {
      name: 'somatrack_auth',
      // Persist the user (so the onboarding gate doesn't bounce on launch) but
      // not the token, which lives only in `somatrack_token`
      partialize: (state) => ({ user: state.user })
    }
  )
)