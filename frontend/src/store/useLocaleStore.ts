import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_LOCALE, Locale, isLocale } from '../i18n/locales'

interface LocaleStore {
  locale: Locale
  /**
   * The language was picked on a signed-out screen and no account has heard
   * about it yet. Cleared once one has.
   */
  pendingSync: boolean

  /**
   * `pending` marks a choice made while signed out, which the next sign-in
   * saves to the account instead of overwriting.
   */
  setLocale: (locale: Locale, opts?: { pending?: boolean }) => void
  markSynced: () => void
}

/**
 * The language on screen.
 *
 * Persisted on the device, not just read from the account, because Login,
 * Register, the PIN pad and the boot splash all render before any account is
 * loaded. Reading it from `/auth/me` would paint every Greek user's launch in
 * English first and then switch — the same class of flicker `useAppLock`
 * exists to prevent. Zustand's localStorage hydration is synchronous, so the
 * first frame already has it.
 *
 * Once signed in, the account's language wins over the device's (so a new
 * phone follows you) — except when the device's was chosen deliberately on a
 * signed-out screen, in which case it is saved to the account instead. Without
 * that exception every existing account, which the migration left on 'en',
 * would switch a user straight back to English the moment they signed in on a
 * Greek Login screen. See `reconcileLocale` in useAuthStore.
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
      // Storage is user-writable and outlives releases. A value this build
      // does not speak would index a dictionary that does not exist and take
      // every screen down with it, so anything unrecognised is dropped.
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

// `lang` on <html> is what makes the browser uppercase Greek correctly —
// `text-transform: uppercase` drops the accents only when it knows the text is
// Greek, and several section headings here are uppercased in CSS. It also picks
// the screen reader's voice.
const applyDocumentLang = (locale: Locale) => {
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}
applyDocumentLang(useLocaleStore.getState().locale)
useLocaleStore.subscribe(state => applyDocumentLang(state.locale))
