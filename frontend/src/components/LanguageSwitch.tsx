import { useLocaleStore } from '../store/useLocaleStore'
import { LANGUAGE_NAMES, LOCALES, useT } from '../i18n'

/**
 * The EN / ΕΛ pill on the signed-out screens.
 *
 * Signed-out only. A choice made here is marked pending and saved to whichever
 * account signs in next (see `reconcileLocale` in useAuthStore); once signed
 * in, the language lives in Profile, where it is saved straight away.
 *
 * Each option carries its own `lang` so a screen reader pronounces "ΕΛ" as
 * Greek even while the page around it is English.
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
