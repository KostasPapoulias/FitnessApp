import { Component, ErrorInfo, ReactNode } from 'react'
import { reportClientError } from '../lib/clientErrors'
import { dismissBoot } from '../boot'

/**
 * The last thing between a render throw and a white screen.
 *
 * Nothing in the tree caught one before. On a laptop that is a red console
 * trace and a refresh; on a phone it is a blank page with no console, no error
 * text and no way out but force-quitting the app — and because a home-screen
 * PWA restores its last route, force-quitting can land straight back on the
 * screen that threw. That loop is why this exists.
 *
 * A class component, because `componentDidCatch` and `getDerivedStateFromError`
 * have no hook equivalent. React still offers no way to write one as a
 * function.
 *
 * What it does NOT catch, and this is worth knowing before trusting it: errors
 * in event handlers, in `setTimeout`, and in unawaited promises never pass
 * through render, so no boundary sees them. `installGlobalErrorReporting` in
 * `lib/clientErrors.ts` covers those — they still won't show this screen, but
 * they will be reported.
 */

interface Props {
  children: ReactNode
  /**
   * Named so a report says which boundary caught it. The app mounts two: one
   * around everything, and one inside the layout around the routed page.
   */
  boundary?: string
  /**
   * Whether "Try again" is offered.
   *
   * Only meaningful for the inner boundary. Resetting the root boundary
   * re-renders the same tree from the same state, which almost always throws
   * again immediately — offering a button that visibly does nothing is worse
   * than not offering it.
   */
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
    // The boot overlay from index.html sits at z-index 2147483000 and is only
    // ever removed when the launch gate in App resolves. A crash during launch
    // never reaches that line, so without this the error screen renders
    // perfectly — underneath a full-screen boot animation that never ends.
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

  /**
   * Back to the start, as a full navigation rather than a router push.
   *
   * The router is inside the tree that just threw. Asking it to navigate would
   * re-render the broken subtree; a location assignment throws the whole
   * document away and starts clean.
   */
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
          // This screen can render outside AppLayout, which is where the app's
          // safe-area padding normally comes from — so it applies its own.
          paddingTop: 'max(0px, var(--safe-top))',
          paddingBottom: 'max(0px, var(--safe-bottom))',
        }}
      >
        <div className="w-full max-w-[430px] flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-brand-red/10 flex items-center justify-center mb-5">
            <span className="text-2xl" role="img" aria-label="">
              ⚠️
            </span>
          </div>

          <h1 className="text-lg font-semibold mb-2">Something broke</h1>

          {/*
            Deliberately says the data is safe. The overwhelming likelihood is
            that it is — a render throw happens after the write — and the first
            thing anyone thinks mid-session is "did I just lose my workout".
          */}
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

          {/*
            The stack, in development only. In production it would tell a user
            nothing they can act on and would name internal file paths on a
            screen they might well screenshot and post.
          */}
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
