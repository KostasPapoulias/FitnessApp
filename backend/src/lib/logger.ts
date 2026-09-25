/**
 * Structured logging — the only way the backend writes to stdout. JSON lines in
 * production (searchable on Railway), readable text in development. Request
 * context (id, user, route) rides in an AsyncLocalStorage, so services log it
 * without taking a request argument.
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

// Production defaults to `info`.
const MIN_LEVEL: LogLevel = (() => {
  const raw = process.env.LOG_LEVEL?.toLowerCase().trim()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return isProduction ? 'info' : 'debug'
})()

/** Arbitrary structured fields attached to a log line. */
export type LogFields = Record<string, unknown>

/** Fields every log line inside a request carries automatically. */
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

/** Add fields (e.g. `userId`, once auth has run) to the in-flight request's context. */
export const enrichRequestContext = (fields: Partial<RequestContext>): void => {
  const store = requestStore.getStore()
  if (store) Object.assign(store, fields)
}

// ── redaction ──────────────────────────────────────────────────────────────

/** Keys whose values are always redacted — matched on the key name, deliberately broad. */
const SENSITIVE_KEY = /pass|secret|token|authorization|cookie|pin|api[-_]?key|vapid|dsn/i

/** Depth and array caps, so large payloads (run tracks) are summarised. */
const MAX_DEPTH = 4
const MAX_ARRAY = 20

const redact = (value: unknown, depth = 0): unknown => {
  if (value == null) return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return value

  if (depth >= MAX_DEPTH) return '[deep]'

  if (Array.isArray(value)) {
    // Truncated arrays keep the shape without the size
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

/** Errors serialise to `{}` via JSON.stringify, so extract the useful fields. */
const serialiseError = (err: unknown): LogFields => {
  if (!(err instanceof Error)) {
    return { err: typeof err === 'string' ? err : redact(err) }
  }

  const fields: LogFields = {
    err: err.name,
    msg_detail: err.message,
    stack: err.stack,
  }

  // Prisma's error code (P2002, P2025, …)
  const code = (err as { code?: unknown }).code
  if (code != null) fields.code = code

  // `cause` via a cast, to avoid bumping `lib` to es2022
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

  // warn and above go to stderr
  const stream = LEVEL_RANK[level] >= LEVEL_RANK.warn ? process.stderr : process.stdout

  if (isProduction) {
    stream.write(JSON.stringify(line) + '\n')
    return
  }

  // Development: the stack on its own lines
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
 * Register where reportable errors go (`errorReporting.ts` calls this at import).
 * Inverted to avoid an import cycle; with nothing registered, logging still works.
 */
export const setErrorSink = (sink: ErrorSink): void => {
  errorSink = sink
}

/**
 * Accepts either an Error or plain fields. Only a real Error is reported to
 * Sentry — so the request logger's "request failed" summary, which has none,
 * never raises a second alert.
 */
const withError = (level: LogLevel) =>
  (message: string, errorOrFields?: unknown, extra?: LogFields): void => {
    const isError = errorOrFields instanceof Error || typeof errorOrFields === 'string'
    const fields = isError
      ? { ...serialiseError(errorOrFields), ...extra }
      : { ...(errorOrFields as LogFields | undefined), ...extra }

    write(level, message, fields)

    if (level === 'error' && errorSink && errorOrFields instanceof Error) {
      // Reporting must never break the caller
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
