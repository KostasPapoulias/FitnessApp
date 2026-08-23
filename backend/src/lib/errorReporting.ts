/**
 * Error reporting to Sentry.
 *
 * Structured logs make a failure findable; they do not make it *known*. Nobody
 * reads Railway's log stream at 11pm, so a 500 that happens to one athlete
 * mid-session is discovered when that athlete gets annoyed enough to say so.
 * This is the channel that pushes instead of waiting to be pulled.
 *
 * Entirely optional. With no SENTRY_DSN set — which is the normal state on a
 * development machine — `report` becomes a no-op and nothing about the app
 * changes. Making it required would have meant every contributor needing an
 * account before the server would boot.
 *
 * Deliberately configured with `defaultIntegrations: false`. The SDK's default
 * setup installs OpenTelemetry auto-instrumentation, which only works if this
 * module is imported before Express, Prisma and http — a load-order rule that
 * is invisible in the source and breaks silently when someone reorders the
 * imports at the top of server.ts. We only want exception capture, so we take
 * the three integrations that improve an exception report and none of the
 * machinery that carries the ordering constraint.
 */

import * as Sentry from '@sentry/node'
import { log, currentRequestContext, setErrorSink } from './logger'

const dsn = process.env.SENTRY_DSN?.trim()

export const errorReportingEnabled = Boolean(dsn)

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Railway exposes the deploy's commit; without it every issue in Sentry
    // looks like it has existed forever and "did my fix work" is unanswerable.
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    defaultIntegrations: false,
    integrations: [
      // Same error thrown twice in one tick reports once.
      Sentry.dedupeIntegration(),
      // Follows `cause` chains — Prisma wraps the useful error in a generic one.
      Sentry.linkedErrorsIntegration(),
      // Source lines around each frame. The single biggest difference between
      // an issue you can act on and a stack trace of minified filenames.
      Sentry.contextLinesIntegration(),
    ],
    // Errors only. Tracing is what needs the import-first ordering above.
    tracesSampleRate: 0,
    /**
     * Last line of defence on secrets.
     *
     * `logger.ts` redacts what it prints, but an exception carries its own
     * payload — a Prisma error quotes the failing query's parameters, and a
     * JWT error can quote the token. Anything that reaches here has left our
     * process and is held by a third party, so the scrub happens before the
     * send rather than being trusted to the call site.
     */
    beforeSend(event) {
      if (event.request?.headers) delete event.request.headers
      if (event.request?.cookies) delete event.request.cookies
      if (event.request?.data) delete event.request.data
      return event
    },
  })

  // Every `log.error(msg, error)` in the codebase now reaches Sentry, without
  // 60 call sites each having to remember a second call. See setErrorSink.
  setErrorSink((error, fields) => report(error, fields))

  log.info('Error reporting enabled', { target: 'sentry' })
}

/**
 * Report an exception, tagged with whatever the in-flight request knows.
 *
 * Never throws. A reporting channel that can take down the request it was
 * reporting on is worse than no reporting channel — the failure it causes is
 * bigger than the one it was describing.
 */
export const report = (error: unknown, extra?: Record<string, unknown>): void => {
  if (!dsn) return

  try {
    const context = currentRequestContext()

    Sentry.withScope((scope) => {
      if (context) {
        // Sentry groups and searches on tags; ids go on the scope's user so an
        // issue can answer "how many people did this hit" and not just "how
        // many times did it fire".
        scope.setTag('reqId', context.reqId)
        if (context.path) scope.setTag('route', `${context.method} ${context.path}`)
        if (context.userId) scope.setUser({ id: context.userId })
      }
      if (extra) scope.setContext('details', extra)

      Sentry.captureException(error)
    })
  } catch (reportingError) {
    log.warn('Error report could not be sent', reportingError)
  }
}

/**
 * Give queued events a moment to leave the process before it exits.
 *
 * The crash you most want reported is the one that kills the server, and that
 * is precisely the one whose report is still sitting in a buffer when the
 * process ends.
 */
export const flushErrorReports = async (timeoutMs = 2000): Promise<void> => {
  if (!dsn) return
  try {
    await Sentry.flush(timeoutMs)
  } catch {
    // Nothing useful to do while shutting down.
  }
}
