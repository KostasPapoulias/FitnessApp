/**
 * Structured logging.
 *
 * What this replaces is ~80 bare `console.error` calls. On Railway those land
 * in one undifferentiated stream with no request id, no user and no status, so
 * there is no way to ask "how many 500s did the log-set endpoint serve today".
 * An endpoint could be broken for every user and the first anyone would hear of
 * it is someone saying the app "doesn't work".
 *
 * One line of JSON per event in production, because Railway's log search
 * indexes fields it can parse and treats anything else as an opaque string.
 * Development gets a human rendering instead — nobody debugs by reading JSON,
 * and a local terminal has no search for the JSON to satisfy.
 *
 * Request context (id, user, route) is carried in an AsyncLocalStorage rather
 * than threaded through every function signature. Threading it was the
 * alternative and it was rejected for a practical reason: the call sites that
 * most need the context are four layers deep in services that currently take no
 * request argument at all, and adding one to each of them would have made this
 * a refactor of the whole backend rather than a logging change.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const isProduction = process.env.NODE_ENV === 'production'

// Production defaults to `info`: `debug` on a request-per-second API is mostly
// noise, and Railway bills for log volume.
const MIN_LEVEL: LogLevel = (() => {
  const raw = process.env.LOG_LEVEL?.toLowerCase().trim()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return isProduction ? 'info' : 'debug'
})()

/** Arbitrary structured fields attached to a log line. */
export type LogFields = Record<string, unknown>

/**
 * What every log line inside a request should carry without being told.
 */
export interface RequestContext {
  reqId: string
  userId?: string
  method?: string
  path?: string
}

const requestStore = new AsyncLocalStorage<RequestContext>()

/** Run `fn` with `context` attached to every log line it produces. */
export const runWithRequestContext = <T>(context: RequestContext, fn: () => T): T =>
  requestStore.run(context, fn)

/** The active request's context, or null outside a request (schedulers, boot). */
export const currentRequestContext = (): RequestContext | null =>
  requestStore.getStore() ?? null

/**
 * Attach a field to the in-flight request's context so later lines carry it.
 *
 * `userId` is the case this exists for: the auth middleware learns it after the
 * request context has already been created, and every line after that point
 * should be attributable without the middleware having to re-enter the store.
 */
export const enrichRequestContext = (fields: Partial<RequestContext>): void => {
  const store = requestStore.getStore()
  if (store) Object.assign(store, fields)
}

// ── redaction ──────────────────────────────────────────────────────────────

/**
 * Keys whose values must never reach a log line or an error report.
 *
 * Matched on the key name rather than on the value, because a value-based rule
 * cannot tell a bcrypt hash from any other base64 string. This is deliberately
 * broad: a redacted field that did not need redacting costs nothing, and the
 * reverse is a password in a log aggregator that a third party now holds.
 */
const SENSITIVE_KEY = /pass|secret|token|authorization|cookie|pin|api[-_]?key|vapid|dsn/i

/** Objects deeper than this are summarised — a run track has 1000+ points. */
const MAX_DEPTH = 4
const MAX_ARRAY = 20

const redact = (value: unknown, depth = 0): unknown => {
  if (value == null) return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return value

  if (depth >= MAX_DEPTH) return '[deep]'

  if (Array.isArray(value)) {
    // A truncated array still tells you the shape; the full one can be
    // megabytes and costs real money to store.
    const head = value.slice(0, MAX_ARRAY).map(item => redact(item, depth + 1))
    return value.length > MAX_ARRAY
      ? [...head, `[+${value.length - MAX_ARRAY} more]`]
      : head
  }

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1)
  }
  return out
}

// ── error serialisation ────────────────────────────────────────────────────

/**
 * An Error does not survive JSON.stringify — `{}` is what you get, which is
 * exactly the outcome that made the old logs useless when they did fire.
 */
const serialiseError = (err: unknown): LogFields => {
  if (!(err instanceof Error)) {
    return { err: typeof err === 'string' ? err : redact(err) }
  }

  const fields: LogFields = {
    err: err.name,
    msg_detail: err.message,
    stack: err.stack,
  }

  // Prisma puts the useful part in `code` (P2002 unique violation, P2025 record
  // not found). Without it every database failure reads as the same line.
  const code = (err as { code?: unknown }).code
  if (code != null) fields.code = code

  // Read through a cast rather than bumping the project's `lib` to es2022 for
  // one property — `cause` exists at runtime on every Node this app supports.
  const cause = (err as { cause?: unknown }).cause
  if (cause) fields.cause = String(cause)

  return fields
}

// ── emit ───────────────────────────────────────────────────────────────────

const write = (level: LogLevel, message: string, fields: LogFields = {}): void => {
  if (LEVEL_RANK[level] < LEVEL_RANK[MIN_LEVEL]) return

  const context = requestStore.getStore()
  const line: LogFields = {
    level,
    ts: new Date().toISOString(),
    msg: message,
    ...(context ?? {}),
    ...(redact(fields) as LogFields),
  }

  // stderr for warn and above so a container runtime that separates the two
  // streams keeps the distinction; both are captured by Railway either way.
  const stream = LEVEL_RANK[level] >= LEVEL_RANK.warn ? process.stderr : process.stdout

  if (isProduction) {
    stream.write(JSON.stringify(line) + '\n')
    return
  }

  // Development rendering. The stack is printed on its own lines rather than
  // escaped into a JSON string, which is the entire difference between an error
  // you can read and one you have to unescape by hand.
  const { stack, ...rest } = line
  delete rest.level
  delete rest.ts
  delete rest.msg
  const tag = level.toUpperCase().padEnd(5)
  const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : ''
  stream.write(`${tag} ${message}${extra}\n`)
  if (typeof stack === 'string') stream.write(stack + '\n')
}

// ── error sink ─────────────────────────────────────────────────────────────

type ErrorSink = (error: unknown, fields: LogFields) => void

let errorSink: ErrorSink | null = null

/**
 * Register the destination for reportable errors — `errorReporting.ts` calls
 * this at import time.
 *
 * Inverted rather than having this module import the reporter, because the
 * reporter needs the logger (to say it started, and to complain if a send
 * fails) and the two importing each other is a cycle. This way the dependency
 * points one way and the logger works perfectly well with nothing registered,
 * which is the normal state on a development machine.
 */
export const setErrorSink = (sink: ErrorSink): void => {
  errorSink = sink
}

/**
 * `log.error('thing failed', err)` and `log.error('thing failed', { field })`
 * both work — the error is unwrapped when one is passed, because a call site
 * that has to remember to wrap it is a call site that will eventually forget.
 *
 * Passing a real Error is also what marks a line as *reportable*: it goes to
 * Sentry as well as to the log. Passing plain fields logs only. That
 * distinction is what keeps the request logger's "request failed" summary from
 * raising a second alert about a failure the handler already reported — the
 * summary has no Error to carry, and the handler does.
 */
const withError = (level: LogLevel) =>
  (message: string, errorOrFields?: unknown, extra?: LogFields): void => {
    const isError = errorOrFields instanceof Error || typeof errorOrFields === 'string'
    const fields = isError
      ? { ...serialiseError(errorOrFields), ...extra }
      : { ...(errorOrFields as LogFields | undefined), ...extra }

    write(level, message, fields)

    if (level === 'error' && errorSink && errorOrFields instanceof Error) {
      // Never let reporting break the thing being reported on.
      try {
        errorSink(errorOrFields, { message, ...extra })
      } catch {
        write('warn', 'Error sink threw', { swallowed: true })
      }
    }
  }

export const log = {
  debug: (message: string, fields?: LogFields) => write('debug', message, fields),
  info: (message: string, fields?: LogFields) => write('info', message, fields),
  warn: withError('warn'),
  error: withError('error'),
}

export default log
