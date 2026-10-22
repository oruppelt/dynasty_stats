"use client";

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logErrorBoundary } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error with detailed context
    const componentStack = errorInfo.componentStack || 'No component stack available';
    
    logErrorBoundary(error, errorInfo, componentStack);
    
    // Store error info in state for display
    this.setState({
      error,
      errorInfo
    });

    // In development, also log to console for easier debugging
    if (process.env.NODE_ENV === 'development') {
      console.group('🚨 Error Boundary Caught an Error');
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Component Stack:', componentStack);
      console.groupEnd();
    }
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-[200px] flex items-center justify-center bg-red-50 border border-red-200 rounded-lg p-6 m-4">
          <div className="text-center">
            <div className="text-red-600 text-xl font-semibold mb-2">
              Something went wrong
            </div>
            <div className="text-red-700 mb-4">
              {this.props.name ? `Error in ${this.props.name}` : 'An unexpected error occurred'}
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left bg-red-100 p-3 rounded border">
                <summary className="cursor-pointer font-medium text-red-800 mb-2">
                  Error Details (Development)
                </summary>
                <div className="text-sm text-red-700 space-y-2">
                  <div>
                    <strong>Message:</strong> {this.state.error.message}
                  </div>
                  {this.state.error.stack && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="text-xs mt-1 whitespace-pre-wrap overflow-auto max-h-32">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                  {this.state.errorInfo?.componentStack && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="text-xs mt-1 whitespace-pre-wrap overflow-auto max-h-32">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}
            <button
              onClick={() => {
                this.setState({
                  hasError: false,
                  error: null,
                  errorInfo: null
                });
              }}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundaries
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// Specialized error boundaries for different parts of the app
export const WidgetErrorBoundary: React.FC<{ children: ReactNode; widgetName: string }> = ({ 
  children, 
  widgetName 
}) => (
  <ErrorBoundary 
    name={`${widgetName}Widget`}
    fallback={
      <div className="min-h-[400px] flex items-center justify-center bg-muted border border-border rounded-lg">
        <div className="text-center">
          <div className="text-foreground text-lg font-medium mb-2">
            Widget Error
          </div>
          <div className="text-muted-foreground">
            The {widgetName} widget encountered an error and couldn&apos;t load.
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);

export const ChartErrorBoundary: React.FC<{ children: ReactNode; chartType: string }> = ({ 
  children, 
  chartType 
}) => (
  <ErrorBoundary 
    name={`${chartType}Chart`}
    fallback={
      <div className="min-h-[300px] flex items-center justify-center bg-muted border border-border rounded">
        <div className="text-center">
          <div className="text-foreground font-medium mb-1">Chart Error</div>
          <div className="text-muted-foreground text-sm">
            The {chartType} chart couldn&apos;t be rendered.
          </div>
        </div>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);