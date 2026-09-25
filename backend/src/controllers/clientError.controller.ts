import { Response } from 'express'
import { AuthRequest } from '../server'
import { log } from '../lib/logger'
import { parseBody } from '../lib/validate'
import { clientErrorSchema } from '../schemas/clientError.schema'

/**
 * Receives a frontend crash report and logs it as an Error, so it reaches
 * Sentry alongside server faults. Rate-limited at the route; fields bounded by
 * the schema.
 */
export const reportClientError = async (req: AuthRequest, res: Response) => {
  const body = parseBody(clientErrorSchema, req.body, res)
  if (!body) return

  // Rebuilt as an Error so the logger treats it as reportable
  const error = new Error(body.message)
  error.name = body.name ?? 'ClientError'
  // The browser's stack, not this process's
  error.stack = body.stack ?? undefined

  log.error('Client error reported', error, {
    source: 'client',
    route: body.route ?? null,
    boundary: body.boundary ?? null,
    appVersion: body.appVersion ?? null,
    userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
  })

  // Nothing useful to return
  res.status(204).end()
}
