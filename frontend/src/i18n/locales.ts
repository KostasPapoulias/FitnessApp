// The languages the app speaks. No imports on purpose: the locale store, the
// shared types and the translation hook all need these, and the hook imports
// the store — keeping the constants apart is what stops that becoming a cycle.

export const LOCALES = ['en', 'el'] as const
export type Locale = typeof LOCALES[number]

export const DEFAULT_LOCALE: Locale = 'en'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/**
 * How each language names itself — never translated. Someone who opened the
 * app in a language they cannot read has to be able to find their own.
 * `short` is for the pill on the signed-out screens, where there is no room.
 */
export const LANGUAGE_NAMES: Record<Locale, { name: string; short: string }> = {
  en: { name: 'English', short: 'EN' },
  el: { name: 'Ελληνικά', short: 'ΕΛ' },
}

/**
 * The BCP 47 tag handed to Intl and toLocale*. 'en-GB' rather than 'en' because
 * that is what the app already formatted with: day-month order and a 24-hour
 * clock, which is also what Greek readers expect.
 */
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-GB',
  el: 'el-GR',
}
