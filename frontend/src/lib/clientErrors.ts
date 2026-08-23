/**
 * Reporting a crash that happened on somebody's phone.
 *
 * A render throw on a phone is a white screen: no console to open, no devtools
 * to attach, and nothing left once the tab is closed. The error boundary shows
 * the user a way out; this is what makes sure the failure is also *seen*.
 *
 * Deliberately not axios. The api client attaches a token, and a 401 in its
 * response interceptor wipes localStorage and navigates to /login — which,
 * during a crash report, would sign the user out because the app had already
 * broken. `fetch` with no interceptors cannot do that.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export interface ClientErrorReport {
  error: unknown
  /** React's component stack, when an error boundary caught it. */
  componentStack?: string | null
  /** Where the user was. Usually the whole diagnosis. */
  route?: string | null
  /** Which boundary caught it, or absent for a global handler. */
  boundary?: string | null
}

/**
 * How many reports this page load will send.
 *
 * A component that throws on every render, remounted by a retry, reports on
 * every attempt. The server rate-limits too, but stopping here also stops the
 * network churn on a phone that is already struggling.
 */
const MAX_REPORTS_PER_SESSION = 5
let sent = 0

const truncate = (value: string | null | undefined, max: number): string | null =>
  value ? value.slice(0, max) : null

/**
 * Send a crash to the backend. Never throws, never rejects.
 *
 * Failure to report is not worth surfacing: the user is already looking at an
 * error screen, and a second failure behind it helps nobody.
 */
export function reportClientError({
  error, componentStack, route, boundary,
}: ClientErrorReport): void {
  // Always local first. On a laptop this is the fastest path to the answer, and
  // it works when the network does not.
  console.error('[SomaTrack] crash:', error, componentStack ?? '')

  if (sent >= MAX_REPORTS_PER_SESSION) return
  sent++

  const asError = error instanceof Error ? error : null
  const token = (() => {
    try {
      return localStorage.getItem('somatrack_token')
    } catch {
      // Private mode, or storage disabled. An unattributed report is still
      // worth far more than no report.
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
      // The page may be about to be reloaded by the user tapping "Reload".
      // keepalive lets the request outlive the document.
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Offline, blocked, or fetch itself unavailable. Nothing to do.
  }
}

/**
 * Catch the throws that never reach a React error boundary.
 *
 * Boundaries only see errors thrown during render, in lifecycle methods and in
 * constructors. An error inside a `setTimeout`, an event handler or an
 * unawaited promise goes straight past them — and those are most of the async
 * code in this app: the run tracker, the wake lock poll, every service call
 * made from a click.
 */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportClientError({ error: event.error ?? event.message })
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError({ error: event.reason })
  })
}
