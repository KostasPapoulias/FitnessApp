// Supported languages. No imports, to avoid an import cycle with the store and hook.

export const LOCALES = ['en', 'el'] as const
export type Locale = typeof LOCALES[number]

export const DEFAULT_LOCALE: Locale = 'en'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/** Each language's own name (never translated); `short` is for the signed-out pill. */
export const LANGUAGE_NAMES: Record<Locale, { name: string; short: string }> = {
  en: { name: 'English', short: 'EN' },
  el: { name: 'Ελληνικά', short: 'ΕΛ' },
}

/** BCP 47 tags for Intl ('en-GB': day-month order, 24-hour clock). */
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-GB',
  el: 'el-GR',
}
