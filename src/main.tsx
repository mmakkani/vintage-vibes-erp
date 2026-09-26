import './utils/fetchUtils.ts';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

// Enterprise Shield: Intercept and neutralize third-party browser extension crashes (e.g. Rytr, Adobe, content.js)
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
    }
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
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary sectionName="Vintage Vibes Root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
