import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * ErrorBoundary — Catches render errors in the React tree.
 *
 * Usage:
 *   <ErrorBoundary fallback={<CustomUI />} onReset={() => resetState()}>
 *     <YourComponent />
 *   </ErrorBoundary>
 *
 * If no fallback provided, renders a default crash screen with retry + home buttons.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  /** If true, shows a "go home" button in the default fallback */
  showHome?: boolean;
  onNavigateHome?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-deep-void flex flex-col items-center justify-center p-8 text-center gap-6">
          {/* Glitch effect circle */}
          <div className="w-24 h-24 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mb-4 animate-pulse">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-orbitron font-black text-white">
              CRITICAL ERROR
            </h1>
            <p className="text-white/40 max-w-md text-sm">
              Something went wrong rendering this view. This is likely a client-side issue and not your fault.
            </p>
          </div>

          {/* Error details (collapsed by default) */}
          {this.state.error && (
            <details className="w-full max-w-lg">
              <summary className="text-xs text-white/30 cursor-pointer hover:text-white/50 transition-colors uppercase tracking-widest font-bold">
                Technical Details
              </summary>
              <div className="mt-2 p-4 bg-black/40 border border-white/5 rounded-lg text-left">
                <p className="text-red-400 text-xs font-mono break-all mb-2">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="text-white/20 text-[10px] font-mono overflow-x-auto max-h-40 whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            </details>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={this.handleReset}
              className="px-6 py-3 rounded-xl bg-neon-emerald text-black font-bold uppercase tracking-widest text-xs flex items-center gap-2 hover:scale-105 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>

            {this.props.showHome && this.props.onNavigateHome && (
              <button
                onClick={this.props.onNavigateHome}
                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-white/10 transition-all"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
            )}
          </div>

          <p className="text-white/20 text-[10px] font-mono mt-8">
            If this persists, try refreshing the page or clearing your browser cache.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
