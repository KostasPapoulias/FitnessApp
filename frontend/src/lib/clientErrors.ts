/**
 * Sends frontend crashes to the backend. Uses fetch, not axios — the axios
 * 401 interceptor would sign the user out mid-report.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export interface ClientErrorReport {
  error: unknown
  /** React's component stack, when an error boundary caught it. */
  componentStack?: string | null
  /** Where the user was. */
  route?: string | null
  /** Which boundary caught it; absent for global handlers. */
  boundary?: string | null
}

/** Cap per page load, so a render loop cannot flood the network. */
const MAX_REPORTS_PER_SESSION = 5
let sent = 0

const truncate = (value: string | null | undefined, max: number): string | null =>
  value ? value.slice(0, max) : null

/** Send a crash report. Never throws or rejects. */
export function reportClientError({
  error, componentStack, route, boundary,
}: ClientErrorReport): void {
  // Always logged locally too
  console.error('[SomaTrack] crash:', error, componentStack ?? '')

  if (sent >= MAX_REPORTS_PER_SESSION) return
  sent++

  const asError = error instanceof Error ? error : null
  const token = (() => {
    try {
      return localStorage.getItem('somatrack_token')
    } catch {
      // Storage unavailable: send the report unattributed
      return null
    }
  })()

  const payload = {
    message: truncate(asError?.message ?? String(error), 500) ?? 'Unknown error',
    name: asError?.name ?? 'ClientError',
    stack: truncate(asError?.stack, 8000),
    route: truncate(route ?? window.location.pathname, 200),
    componentStack: truncate(componentStack, 4000),
    boundary: truncate(boundary, 40),
  }

  try {
    void fetch(`${API_BASE}/client-errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      // keepalive lets the request outlive a reload
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Offline or blocked: nothing to do
  }
}

/** Report errors that never reach a React boundary: event handlers, timers, unhandled promises. */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportClientError({ error: event.error ?? event.message })
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError({ error: event.reason })
  })
}
