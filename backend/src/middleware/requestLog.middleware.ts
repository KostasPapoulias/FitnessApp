/**
 * One log line per request, and the request context every other line inherits.
 *
 * Mounted before the routes so that the id it generates exists for the whole
 * lifetime of the request — including the error handler at the very bottom of
 * server.ts, which is the place that most needs to be able to say *which*
 * request the stack trace belongs to.
 */

import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { log, runWithRequestContext } from '../lib/logger'

/** Long enough not to collide within a deploy, short enough to read aloud. */
const REQ_ID_LENGTH = 8

/**
 * Paths that must not produce a log line.
 *
 * Railway's health check runs every few seconds forever. Logging it buries
 * everything else and, on a per-GB log plan, is the single largest line item
 * for no information at all.
 */
const SILENT_PATHS = new Set(['/health'])

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (SILENT_PATHS.has(req.path)) {
    next()
    return
  }

  const reqId = randomUUID().replace(/-/g, '').slice(0, REQ_ID_LENGTH)
  const startedAt = process.hrtime.bigint()

  // Handed back on every response so a user reporting "it failed at about
  // half four" can be matched to an exact request instead of a time window.
  res.setHeader('X-Request-Id', reqId)

  runWithRequestContext({ reqId, method: req.method, path: req.path }, () => {
    // `finish` rather than `close`: close also fires when the client hangs up
    // mid-response, which would log a status that was never actually sent.
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6

      const fields = {
        status: res.statusCode,
        ms: Math.round(ms),
      }

      // A 4xx is the client being told no — normal traffic, not an incident.
      // Only 5xx means this server got something wrong.
      if (res.statusCode >= 500) log.error('request failed', fields)
      else if (res.statusCode >= 400) log.warn('request rejected', fields)
      else log.info('request', fields)
    })

    next()
  })
}
