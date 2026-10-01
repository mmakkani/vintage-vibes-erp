import './utils/fetchUtils.ts';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

import { TelemetryErrorService } from './services/telemetryErrorService.ts';

// Enterprise Shield: Intercept, neutralize third-party browser extension crashes and report real exceptions
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = String(reason?.message || reason || '');
    const stack = String(reason?.stack || '');
    if (
      msg.includes('useCache') ||
      msg.includes('rytr') ||
      msg.includes('Could not establish connection') ||
      msg.includes('Receiving end does not exist') ||
      stack.includes('content.js') ||
      stack.includes('chrome-extension://') ||
      stack.includes('moz-extension://')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    TelemetryErrorService.reportError({
      errorType: 'UNHANDLED_PROMISE_REJECTION',
      errorMessage: msg || 'Unhandled Promise Rejection',
      errorStack: stack,
      sourceFile: reason?.fileName || undefined,
      lineNumber: reason?.lineNumber || undefined
    });
  });

  window.addEventListener('error', (event) => {
    const msg = String(event.message || '');
    const filename = String(event.filename || '');
    if (
      msg.includes('useCache') ||
      msg.includes('Could not establish connection') ||
      msg.includes('Receiving end does not exist') ||
      filename.includes('content.js') ||
      filename.includes('chrome-extension://')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    TelemetryErrorService.reportError({
      errorType: 'WINDOW_GLOBAL_ERROR',
      errorMessage: msg || 'Window Global Error',
      errorStack: event.error?.stack || undefined,
      sourceFile: filename || undefined,
      lineNumber: event.lineno || undefined,
      columnNumber: event.colno || undefined
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary sectionName="Vintage Vibes Root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
