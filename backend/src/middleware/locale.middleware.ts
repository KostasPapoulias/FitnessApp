import { NextFunction, Request, Response } from 'express'
import { localeFromHeader, localizeMessage, Locale } from '../lib/locale'

/**
 * Resolves the request language from Accept-Language and translates the
 * user-facing messages in the response. Mounted before the rate limiters so
 * their 429 messages are translated too.
 */
export const localizeResponses = (req: Request, res: Response, next: NextFunction): void => {
  const locale = localeFromHeader(req.headers['accept-language'])
  res.locals.locale = locale

  if (locale !== 'en') {
    const json = res.json.bind(res)
    res.json = (body: unknown) => json(localizeBody(body, locale))
  }

  next()
}

/** Translates only `error`, `errors` and `data.message`; data is never touched. */
const localizeBody = (body: unknown, locale: Locale): unknown => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>) }

  if (typeof out.error === 'string') out.error = localizeMessage(out.error, locale)

  if (Array.isArray(out.errors)) {
    out.errors = out.errors.map(e => (typeof e === 'string' ? localizeMessage(e, locale) : e))
  }

  const data = out.data
  if (data && typeof data === 'object' && !Array.isArray(data) &&
      typeof (data as Record<string, unknown>).message === 'string') {
    out.data = {
      ...(data as Record<string, unknown>),
      message: localizeMessage((data as Record<string, string>).message, locale),
    }
  }

  return out
}
