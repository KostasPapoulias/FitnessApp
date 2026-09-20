import { NextFunction, Request, Response } from 'express'
import { localeFromHeader, localizeMessage, Locale } from '../lib/locale'

/**
 * Resolves the request's language and translates the messages in its answer.
 *
 * Translation happens here, once, on the way out, rather than at the hundred
 * places a controller writes `error: '…'`. Those sites keep writing English —
 * the logs stay greppable and a controller never needs to know who is asking —
 * and only the fields the client shows verbatim are rewritten.
 *
 * Mounted before the rate limiters on purpose. express-rate-limit answers with
 * `res.send(object)`, which Express routes through `res.json`, so a 429 is
 * translated like any other error — but only if this wrapper is already in
 * place when the limiter runs.
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

/**
 * Only `error`, `errors` and `data.message` — the three shapes a client prints
 * as-is. Everything else in a body is data, and data is never translated here:
 * an exercise name or a stored note rewritten on the way out would come back
 * in the next request as a different value.
 */
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
