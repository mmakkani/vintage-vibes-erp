/**
 * Universal Error Telemetry Service for Vintage Vibes ERP
 * Automatically captures frontend crashes, unhandled promise rejections,
 * and React ErrorBoundary exceptions, and reports them to the central error registry.
 */

interface ErrorPayload {
  errorType?: string;
  errorMessage: string;
  errorStack?: string;
  componentStack?: string;
  url?: string;
  routePath?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  metadata?: Record<string, any>;
  sessionId?: string;
  username?: string;
}

// In-memory deduplication cache to prevent error flooding
const recentErrorsCache = new Map<string, number>();
const DEDUPLICATION_INTERVAL_MS = 30000; // 30 seconds

export class TelemetryErrorService {
  private static getSessionContext(): { sessionId: string; username: string } {
    try {
      if (typeof window === 'undefined') return { sessionId: 'ssr', username: 'server' };
      const sessionStr = localStorage.getItem('vv_operator_session') || sessionStorage.getItem('vv_operator_session') || '';
      let username = 'anonymous';
      let sessionId = `sess-${Date.now()}`;

      if (sessionStr) {
        try {
          const parsed = JSON.parse(sessionStr);
          username = parsed.username || parsed.name || username;
          sessionId = parsed.sessionId || parsed.token || sessionId;
        } catch (_) {
          username = sessionStr;
        }
      }

      return { sessionId, username };
    } catch (_) {
      return { sessionId: 'unknown', username: 'anonymous' };
    }
  }

  /**
   * Reports an error to the central telemetry endpoint /api/telemetry/report-error
   */
  public static async reportError(payload: ErrorPayload): Promise<void> {
    try {
      if (typeof window === 'undefined') return;

      const message = (payload.errorMessage || '').trim();
      if (!message) return;

      // Filter noise from browser extensions
      const stack = payload.errorStack || '';
      if (
        stack.includes('chrome-extension://') ||
        stack.includes('moz-extension://') ||
        stack.includes('content.js') ||
        message.includes('useCache') ||
        message.includes('Could not establish connection')
      ) {
        return;
      }

      // Deduplication check
      const cacheKey = `${payload.errorType || 'ERR'}:${message.slice(0, 100)}:${payload.routePath || ''}`;
      const now = Date.now();
      const lastSent = recentErrorsCache.get(cacheKey) || 0;
      if (now - lastSent < DEDUPLICATION_INTERVAL_MS) {
        return; // Suppress duplicate flood
      }
      recentErrorsCache.set(cacheKey, now);

      // Clean up cache periodically
      if (recentErrorsCache.size > 200) {
        for (const [k, timestamp] of recentErrorsCache.entries()) {
          if (now - timestamp > DEDUPLICATION_INTERVAL_MS * 2) {
            recentErrorsCache.delete(k);
          }
        }
      }

      const { sessionId, username } = this.getSessionContext();

      const bodyData = {
        errorType: payload.errorType || 'FRONTEND_UNHANDLED',
        errorMessage: message,
        errorStack: payload.errorStack || null,
        componentStack: payload.componentStack || null,
        url: payload.url || (typeof window !== 'undefined' ? window.location.href : null),
        routePath: payload.routePath || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : null),
        sourceFile: payload.sourceFile || null,
        lineNumber: payload.lineNumber || null,
        columnNumber: payload.columnNumber || null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
        sessionId: payload.sessionId || sessionId,
        username: payload.username || username,
        metadata: payload.metadata || {}
      };

      const endpoint = '/api/telemetry/report-error';

      // Use sendBeacon if available for guaranteed transmission during navigation/unload
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([JSON.stringify(bodyData)], { type: 'application/json' });
        const queued = navigator.sendBeacon(endpoint, blob);
        if (queued) return;
      }

      // Fallback to fetch with keepalive
      const rawFetch = (window as any).__originalFetch || window.fetch;
      await rawFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
        keepalive: true
      }).catch(() => {
        // Silently ignore telemetry failure to avoid secondary loops
      });
    } catch (_) {
      // Telemetry must never crash the host application
    }
  }

  /**
   * Dedicated helper for React ErrorBoundary componentDidCatch
   */
  public static reportReactCrash(
    error: Error,
    errorInfo: { componentStack?: string | null },
    sectionName?: string
  ): void {
    this.reportError({
      errorType: 'REACT_RENDER_CRASH',
      errorMessage: `[${sectionName || 'Application'}] ${error.name}: ${error.message}`,
      errorStack: error.stack,
      componentStack: errorInfo?.componentStack || undefined,
      metadata: { sectionName }
    });
  }

  /**
   * Helper for fetch / API failure reporting
   */
  public static reportApiFailure(
    endpoint: string,
    status: number,
    statusText: string,
    correlationId?: string
  ): void {
    this.reportError({
      errorType: 'API_HTTP_ERROR',
      errorMessage: `HTTP ${status} (${statusText}) on ${endpoint}`,
      url: endpoint,
      metadata: { status, statusText, correlationId }
    });
  }
}
