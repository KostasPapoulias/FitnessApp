import type { Response } from 'express'
import { EL_MESSAGES, EL_PATTERNS } from './messages.el'

// The two languages the app speaks.
//
// Where the server gets the language from depends on whether a request is in
// flight. Anything written in answer to a request follows its Accept-Language
// header, which the client sets from the language on screen — that is the only
// source that also works before sign-in, when Register and Login still need
// their errors in Greek. Anything written with no request behind it (push
// notifications, the AI coach's nudges) reads `Settings.language` instead.

export const LOCALES = ['en', 'el'] as const
export type Locale = typeof LOCALES[number]

export const DEFAULT_LOCALE: Locale = 'en'

/**
 * The tag for Intl, where the server formats a date or a number into text it
 * sends (the calendar's month labels). Matches the client's own mapping, so
 * the same month reads the same way on both sides.
 */
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en-GB',
  el: 'el-GR',
}

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/**
 * The first language tag's primary subtag, if it is one we speak.
 *
 * Only the first tag is read, and q-values are ignored. The app always sends a
 * single bare tag, and a browser's own header (anything that reaches the API
 * without going through the app's axios instance) is not a choice the athlete
 * made in SomaTrack — falling to English there is the documented default.
 */
export const localeFromHeader = (header: string | undefined): Locale => {
  const primary = header?.split(',')[0]?.split(';')[0]?.trim().split('-')[0]?.toLowerCase()
  return isLocale(primary) ? primary : DEFAULT_LOCALE
}

/** The request's language, as resolved by `localizeResponses`. */
export const localeOf = (res: Response): Locale =>
  isLocale(res.locals.locale) ? res.locals.locale : DEFAULT_LOCALE

/**
 * A server message in the athlete's language.
 *
 * Keyed by the English text rather than by a code at every call site. There are
 * over a hundred `error:` strings across the controllers, and the English one
 * is already the contract the client displays verbatim — so a message nobody
 * has translated yet still reaches the athlete, in English, instead of turning
 * into a key. Rewording an English message silently drops its translation back
 * to English; that failure is visible and harmless, which is the trade.
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
