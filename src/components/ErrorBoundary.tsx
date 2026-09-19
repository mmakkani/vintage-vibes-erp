import React from 'react';
import { RefreshCw, ChevronDown, ChevronUp, ShieldAlert, Sparkles } from 'lucide-react';
import { isChunkLoadError, purgeCachesAndServiceWorkers } from '../utils/lazyWithRetry.ts';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  sectionName?: string;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
  isChunkError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    isChunkError: false
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const isChunk = isChunkLoadError(error);
    return { hasError: true, error, isChunkError: isChunk };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error(`[ErrorBoundary - ${this.props.sectionName || 'Application'}] Captured Exception:`, error, errorInfo);

    // If chunk 404 / dynamic import error, attempt auto-reload once with 15s cooldown
    if (isChunkLoadError(error)) {
      const RELOAD_KEY = 'vv_chunk_reload_cooldown';
      const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      const now = Date.now();

      if (now - lastReload > 15000) {
        console.info('[ErrorBoundary] Detected outdated deployment chunk 404. Triggering auto-reload...');
        sessionStorage.setItem(RELOAD_KEY, String(now));
        purgeCachesAndServiceWorkers().then(() => {
          window.location.reload();
        }).catch(() => {
          window.location.reload();
        });
      }
    }
  }

  handleHardRefresh = async () => {
    await purgeCachesAndServiceWorkers();
    window.location.reload();
  };

  handleRetry = () => {
    if (this.state.isChunkError) {
      this.handleHardRefresh();
      return;
    }
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      isChunkError: false
    });
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const sectionTitle = this.props.sectionName || 'ERP Module';

      // Special UI for Deployment / Dynamic Chunk 404
      if (this.state.isChunkError) {
        return (
          <div
            role="alert"
            className="my-4 p-6 rounded-2xl bg-amber-500/10 border-2 border-amber-500/80 shadow-lg text-slate-800 transition-all text-center max-w-xl mx-auto"
          >
            <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-400 flex items-center justify-center mx-auto mb-3 text-amber-800 shadow-xs">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <h3 className="text-base font-black text-slate-900 font-serif tracking-tight">
              New Deployment of {sectionTitle} is Live!
            </h3>
            <p className="mt-1.5 text-xs text-slate-700 leading-relaxed">
              A fresh update has been deployed to the cloud. Please refresh to load the latest high-speed module chunks.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleHardRefresh}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Update / Refresh Now</span>
              </button>
            </div>
          </div>
        );
      }

      return (
        <div
          role="alert"
          className="my-4 p-5 rounded-xl bg-amber-50/90 border-2 border-amber-300 shadow-md text-slate-800 transition-all"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-lg bg-amber-100 text-amber-900 shrink-0 border border-amber-300">
              <ShieldAlert className="w-6 h-6 text-amber-800" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold tracking-tight text-slate-900">
                  {sectionTitle} Encountered a Temporary Issue
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-950 border border-amber-400">
                  Fault Isolated
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-700 leading-relaxed max-w-2xl">
                The error was contained by the fault-tolerant error boundary. Other ERP modules and multi-user synchronization remain fully operational.
              </p>

              <div className="mt-3.5 flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Retry / Reload {sectionTitle}</span>
                </button>

                <button
                  type="button"
                  onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100/70 text-slate-700 font-semibold text-xs border border-amber-300 transition-colors cursor-pointer"
                >
                  <span>{this.state.showDetails ? 'Hide Diagnostics' : 'Inspect Diagnostics'}</span>
                  {this.state.showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {this.state.showDetails && (
                <div className="mt-3 p-3 rounded-lg bg-stone-900 text-amber-200 font-mono text-[11px] overflow-x-auto border border-stone-700 max-h-60">
                  <div className="font-bold text-red-400 mb-1">
                    {this.state.error?.name}: {this.state.error?.message}
                  </div>
                  {this.state.error?.stack && (
                    <pre className="text-[10px] text-stone-300 whitespace-pre-wrap">
                      {this.state.error.stack}
                    </pre>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <div className="mt-2 pt-2 border-t border-stone-800 text-[10px] text-stone-400">
                      <strong>Component Hierarchy:</strong>
                      <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
