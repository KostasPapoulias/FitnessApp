/**
 * Error reporting to Sentry. Optional: without SENTRY_DSN, `report` is a no-op.
 *
 * `defaultIntegrations: false` on purpose — the defaults install OpenTelemetry
 * instrumentation that only works if this module is imported before Express,
 * Prisma and http, an ordering that breaks silently.
 */

import * as Sentry from '@sentry/node'
import { log, currentRequestContext, setErrorSink } from './logger'

const dsn = process.env.SENTRY_DSN?.trim()

export const errorReportingEnabled = Boolean(dsn)

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // The deploy's commit, so issues can be tied to a release
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    defaultIntegrations: false,
    integrations: [
      Sentry.dedupeIntegration(),
      // Follows `cause` chains (Prisma wraps the useful error)
      Sentry.linkedErrorsIntegration(),
      Sentry.contextLinesIntegration(),
    ],
    // Errors only; tracing would need the import-first ordering
    tracesSampleRate: 0,
    /** Strip headers, cookies and bodies — exceptions can carry tokens or query parameters. */
    beforeSend(event) {
      if (event.request?.headers) delete event.request.headers
      if (event.request?.cookies) delete event.request.cookies
      if (event.request?.data) delete event.request.data
      return event
    },
  })

  // Every `log.error(msg, error)` now reaches Sentry
  setErrorSink((error, fields) => report(error, fields))

  log.info('Error reporting enabled', { target: 'sentry' })
}

/** Report an exception tagged with the current request context. Never throws. */
export const report = (error: unknown, extra?: Record<string, unknown>): void => {
  if (!dsn) return

  try {
    const context = currentRequestContext()

    Sentry.withScope((scope) => {
      if (context) {
        // Tags for search; the user id lets an issue count affected users
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

/** Let queued events leave before the process exits. */
export const flushErrorReports = async (timeoutMs = 2000): Promise<void> => {
  if (!dsn) return
  try {
    await Sentry.flush(timeoutMs)
  } catch {
    // Nothing useful to do while shutting down.
  }
}
