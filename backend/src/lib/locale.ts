import type { Response } from 'express'
import { EL_MESSAGES, EL_PATTERNS } from './messages.el'

// The app's two languages. Request responses follow Accept-Language; work with
// no request behind it (push, AI nudges) reads `Settings.language`.

export const LOCALES = ['en', 'el'] as const
export type Locale = typeof LOCALES[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Intl tags for server-formatted dates and numbers; matches the client's mapping. */
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-GB',
  el: 'el-GR',
}

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/** Primary subtag of the first language tag, if supported; otherwise English. */
export const localeFromHeader = (header: string | undefined): Locale => {
  const primary = header?.split(',')[0]?.split(';')[0]?.trim().split('-')[0]?.toLowerCase()
  return isLocale(primary) ? primary : DEFAULT_LOCALE
}

/** The request's language, as resolved by `localizeResponses`. */
export const localeOf = (res: Response): Locale =>
  isLocale(res.locals.locale) ? res.locals.locale : DEFAULT_LOCALE

/**
 * Translates a server message, keyed by its English text. Untranslated
 * messages fall back to English.
 */
export const localizeMessage = (message: string, locale: Locale): string => {
  if (locale === 'en') return message

  const exact = EL_MESSAGES[message]
  if (exact) return exact

  for (const [pattern, render] of EL_PATTERNS) {
    const match = pattern.exec(message)
    if (match) return render(match)
  }
  return message
}
