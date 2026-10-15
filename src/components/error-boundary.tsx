'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-stone-500 dark:text-night-400">
            Esta sección no se pudo mostrar.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 dark:border-night-700 dark:bg-night-800 dark:text-night-200 dark:hover:bg-night-700"
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
