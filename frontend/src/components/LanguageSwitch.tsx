import { useLocaleStore } from '../store/useLocaleStore'
import { LANGUAGE_NAMES, LOCALES, useT } from '../i18n'

/**
 * EN / ΕΛ switch for the signed-out screens. The choice is saved to whichever
 * account signs in next (see `reconcileLocale` in useAuthStore). Each option
 * has its own `lang` for screen readers.
 */
export default function LanguageSwitch() {
  const { locale, t } = useT()
  const setLocale = useLocaleStore(s => s.setLocale)

  return (
    <div role="radiogroup" aria-label={t('common.language')}
         className="flex bg-dark-800 border border-dark-600 rounded-full p-0.5">
      {LOCALES.map(option => (
        <button
          key={option}
          role="radio"
          aria-checked={locale === option}
          aria-label={LANGUAGE_NAMES[option].name}
          lang={option}
          onClick={() => setLocale(option, { pending: true })}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors
                      ${locale === option ? 'bg-brand-teal text-black' : 'text-dark-300'}`}
        >
          {LANGUAGE_NAMES[option].short}
        </button>
      ))}
    </div>
  )
}
