import React, { Component, ReactNode } from 'react';

declare global {
  interface Window {
    gtag?: (command: string, action: string, options: any) => void;
  }
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo);

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: error.message,
        fatal: false,
      });
    }

    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-ink p-4">
          <div className="w-full max-w-md rounded-[24px] border border-brand-tint/15 bg-brand-dark/95 p-8 text-center shadow-2xl backdrop-blur-2xl">
            <div className="mx-auto mb-6 h-12 w-12 rounded-2xl border border-brand-primary/25 bg-brand-primary/10" />
            <h2 className="mb-4 text-2xl font-medium tracking-tight text-white">
              Something went wrong
            </h2>
            <p className="mb-6 text-brand-tint">
              Your saved work should still be there. Try again or refresh the page.
            </p>

            <div className="space-y-3">
              <button
                onClick={this.handleReset}
                className="w-full rounded-xl bg-brand-primary px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-dark transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-xl border border-brand-tint/15 bg-white/5 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-tint transition-colors hover:text-white"
              >
                Refresh page
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-brand-tint hover:text-white">
                  Error details
                </summary>
                <pre className="mt-2 overflow-auto rounded-xl border border-brand-tint/15 bg-white/5 p-3 text-xs text-brand-tint">
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
