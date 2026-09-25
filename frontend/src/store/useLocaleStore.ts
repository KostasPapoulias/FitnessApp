import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_LOCALE, Locale, isLocale } from '../i18n/locales'

interface LocaleStore {
  locale: Locale
  /** Picked while signed out and not yet saved to an account. */
  pendingSync: boolean

  /** `pending`: chosen while signed out; the next sign-in saves it to the account. */
  setLocale: (locale: Locale, opts?: { pending?: boolean }) => void
  markSynced: () => void
}

/**
 * The on-screen language, persisted on the device so pre-login screens render
 * in it from the first frame. After sign-in the account's language wins,
 * unless one was chosen while signed out (see `reconcileLocale` in useAuthStore).
 */
export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      pendingSync: false,

      setLocale: (locale, opts) => set({ locale, pendingSync: opts?.pending ?? false }),
      markSynced: () => set({ pendingSync: false }),
    }),
    {
      name: 'somatrack_locale',
      // Drop unrecognised stored values — they would index a missing dictionary
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LocaleStore>
        return {
          ...current,
          locale: isLocale(p.locale) ? p.locale : current.locale,
          pendingSync: p.pendingSync === true,
        }
      },
    }
  )
)

// `lang` on <html>: correct Greek uppercasing and the screen reader's voice.
const applyDocumentLang = (locale: Locale) => {
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}
applyDocumentLang(useLocaleStore.getState().locale)
useLocaleStore.subscribe(state => applyDocumentLang(state.locale))
