import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary'
import { installGlobalErrorReporting } from './lib/clientErrors'

// Before anything else renders, so a throw during the first paint is still
// reported. Covers what error boundaries structurally cannot see: event
// handlers, timers, and unawaited promises.
installGlobalErrorReporting()

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/*
      The root boundary. It catches a throw from App itself — the launch gate,
      the PIN pad, the router — which is the case where there is no smaller
      boundary left to catch it and the alternative is a blank document.

      No retry offered here: resetting re-renders the same tree from the same
      state and throws again on the next frame, so the only honest options are
      a reload and a trip back to Home.
    */}
    <ErrorBoundary boundary="root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)