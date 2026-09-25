import { Component, ErrorInfo, ReactNode } from 'react'
import { reportClientError } from '../lib/clientErrors'
import { dismissBoot } from '../boot'
import { AlertTriangleIcon } from './icons'

/**
 * Catches render errors and shows a recovery screen instead of a blank page.
 * Errors in handlers, timers and promises never reach a boundary — they are
 * reported by `installGlobalErrorReporting` instead.
 */

interface Props {
  children: ReactNode
  /** Names the boundary in reports ('root' or 'page'). */
  boundary?: string
  /** Offer "Try again" — only useful for the page boundary; the root would throw again. */
  allowRetry?: boolean
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Remove the boot overlay, which would otherwise cover this screen after a launch crash
    dismissBoot()

    reportClientError({
      error,
      componentStack: info.componentStack,
      route: window.location.pathname,
      boundary: this.props.boundary,
    })
  }

  private retry = (): void => {
    this.setState({ error: null })
  }

  private reload = (): void => {
    window.location.reload()
  }

  /** Full navigation home — the router is inside the tree that threw. */
  private goHome = (): void => {
    window.location.href = '/'
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const isDev = import.meta.env.DEV

    return (
      <div
        className="min-h-[100dvh] bg-dark-900 text-dark-100 flex flex-col items-center justify-center px-6"
        style={{
          // Applies its own safe-area padding (may render outside AppLayout)
          paddingTop: 'max(0px, var(--safe-top))',
          paddingBottom: 'max(0px, var(--safe-bottom))',
        }}
      >
        <div className="w-full max-w-[430px] flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-brand-red/10 flex items-center justify-center mb-5">
            <span className="text-2xl" role="img" aria-label="">
              <AlertTriangleIcon className="w-8 h-8 text-brand-yellow" />
            </span>
          </div>

          <h1 className="text-lg font-semibold mb-2">Something broke</h1>

          {/* Reassures that logged data is safe (a render throw happens after writes) */}
          <p className="text-sm text-dark-300 leading-relaxed mb-6">
            This screen hit an error and stopped. Anything you had already saved
            is safe.
          </p>

          <div className="w-full flex flex-col gap-2.5">
            {this.props.allowRetry && (
              <button
                onClick={this.retry}
                className="w-full py-3 rounded-btn bg-brand-teal text-dark-900 font-semibold text-sm active:opacity-80"
              >
                Try again
              </button>
            )}
            <button
              onClick={this.reload}
              className={`w-full py-3 rounded-btn font-semibold text-sm active:opacity-80 ${
                this.props.allowRetry
                  ? 'bg-dark-700 text-dark-100'
                  : 'bg-brand-teal text-dark-900'
              }`}
            >
              Reload the app
            </button>
            <button
              onClick={this.goHome}
              className="w-full py-3 rounded-btn text-dark-300 text-sm active:opacity-80"
            >
              Go to Home
            </button>
          </div>

          {/* The stack, in development only */}
          {isDev && (
            <pre className="mt-6 w-full max-h-52 overflow-auto text-left text-[11px] leading-relaxed text-brand-red/90 bg-dark-800 border border-dark-600 rounded-card p-3 whitespace-pre-wrap">
              {error.stack || `${error.name}: ${error.message}`}
            </pre>
          )}
        </div>
      </div>
    )
  }
}
