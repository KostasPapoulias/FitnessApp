import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary'
import { installGlobalErrorReporting } from './lib/clientErrors'

// Installed first, so errors outside React (handlers, timers, promises) are reported.
installGlobalErrorReporting()

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Root boundary: catches a throw in App itself. Offers reload, not retry — a retry would throw again. */}
    <ErrorBoundary boundary="root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)