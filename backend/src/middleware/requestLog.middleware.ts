/** One log line per request, plus the request context (id, method, path) every other log line inherits. */

import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { log, runWithRequestContext } from '../lib/logger'

const REQ_ID_LENGTH = 8

/** Health checks run every few seconds; logging them is pure noise. */
const SILENT_PATHS = new Set(['/health'])

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (SILENT_PATHS.has(req.path)) {
    next()
    return
  }

  const reqId = randomUUID().replace(/-/g, '').slice(0, REQ_ID_LENGTH)
  const startedAt = process.hrtime.bigint()

  // Returned so a user's report can be matched to an exact request
  res.setHeader('X-Request-Id', reqId)

  runWithRequestContext({ reqId, method: req.method, path: req.path }, () => {
    // `finish`, not `close`: close also fires when the client hangs up
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6

      const fields = {
        status: res.statusCode,
        ms: Math.round(ms),
      }

      // Only 5xx is a server fault; 4xx is normal rejection
      if (res.statusCode >= 500) log.error('request failed', fields)
      else if (res.statusCode >= 400) log.warn('request rejected', fields)
      else log.info('request', fields)
    })

    next()
  })
}
