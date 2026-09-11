import React from 'react';
import { RefreshCw, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';

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
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error(`[ErrorBoundary - ${this.props.sectionName || 'Application'}] Captured Exception:`, error, errorInfo);
  }

  handleRetry = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    });
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const sectionTitle = this.props.sectionName || 'ERP Module';

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
