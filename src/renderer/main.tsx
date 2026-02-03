/**
 * Halo - React Entry Point
 */

// ========================================
// LOGGING INITIALIZATION (must be first)
// ========================================
// Initialize electron-log for renderer process
// Logs are sent to main process via IPC and written to the same log file
// This replaces console.log/warn/error globally
import log from 'electron-log/renderer.js'

// Replace global console with electron-log (performance: direct replacement, no wrapper)
Object.assign(console, log.functions)

import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// i18n configuration - must be imported before App
import './i18n'

// CSS imports - order matters for cascade
import './assets/styles/globals.css'       // Theme, base styles, shared animations
import './assets/styles/syntax-theme.css'  // Code syntax highlighting (highlight.js)
import './assets/styles/canvas-tabs.css'   // VS Code style tab bar
import './assets/styles/browser-task-card.css' // AI Browser sci-fi effects

// Mark React as mounted - disables global error fallback (React handles errors now)
// This flag is checked by the global error handler in index.html
;(window as unknown as { __HALO_APP_MOUNTED__: boolean }).__HALO_APP_MOUNTED__ = true

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
