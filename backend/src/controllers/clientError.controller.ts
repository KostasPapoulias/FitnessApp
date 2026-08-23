import { Response } from 'express'
import { AuthRequest } from '../server'
import { log } from '../lib/logger'
import { parseBody } from '../lib/validate'
import { clientErrorSchema } from '../schemas/clientError.schema'

/**
 * Where a crash on somebody's phone goes.
 *
 * The frontend error boundary catches a render throw and shows a recovery
 * screen — which is the user-facing half of the fix. This is the other half.
 * On a phone there is no console to read, so without an endpoint like this a
 * white screen is reported as "the app broke" and nothing more, and the stack
 * trace that would explain it dies with the tab.
 *
 * It deliberately reuses the same path as a server fault: `log.error` with a
 * real Error routes to Sentry through the logger's sink, so a client crash
 * lands in the same place as a 500 and carries the same request context.
 *
 * Two things it is not allowed to be:
 *
 *   - a way to forge server errors. The message is prefixed and every field is
 *     bounded, so a crafted payload cannot impersonate a backend stack trace.
 *   - an unbounded write. It is rate-limited at the route and the schema caps
 *     every string, because an open reporting endpoint is otherwise a free way
 *     to fill someone's log bill.
 */
export const reportClientError = async (req: AuthRequest, res: Response) => {
  const body = parseBody(clientErrorSchema, req.body, res)
  if (!body) return

  // Reconstructed as an Error so the logger serialises it the way it serialises
  // every other failure, and so the sink recognises it as reportable.
  const error = new Error(body.message)
  error.name = body.name ?? 'ClientError'
  // The browser's stack, not this process's — a stack from here would point at
  // this file and be worse than none.
  error.stack = body.stack ?? undefined

  log.error('Client error reported', error, {
    source: 'client',
    // Which screen it happened on is usually the whole diagnosis.
    route: body.route ?? null,
    boundary: body.boundary ?? null,
    appVersion: body.appVersion ?? null,
    userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
  })

  // 204: the client is telling us something, not asking for anything, and it
  // has already shown its recovery screen. Nothing useful can come back.
  res.status(204).end()
}
