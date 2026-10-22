type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  requestId?: string;
  component?: string;
  error?: Error;
}

class Logger {
  private isDevelopment: boolean;
  private minLevel: LogLevel;
  private requestId: string | null = null;

  constructor() {
    // Check if we're in browser environment
    if (typeof window !== 'undefined') {
      this.isDevelopment = process.env.NODE_ENV === 'development';
      this.minLevel = this.isDevelopment ? 'DEBUG' : 'INFO';
    } else {
      // Server-side defaults
      this.isDevelopment = false;
      this.minLevel = 'ERROR';
    }
  }

  setRequestId(requestId: string) {
    this.requestId = requestId;
  }

  clearRequestId() {
    this.requestId = null;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };
    return levels[level] >= levels[this.minLevel];
  }

  private formatMessage(entry: LogEntry): string {
    const contextStr = entry.context ? ` | Context: ${JSON.stringify(entry.context)}` : '';
    const requestStr = entry.requestId ? ` | RequestID: ${entry.requestId}` : '';
    const componentStr = entry.component ? ` | Component: ${entry.component}` : '';
    
    return `[${entry.timestamp}] ${entry.level}${requestStr}${componentStr} - ${entry.message}${contextStr}`;
  }

  private log(level: LogLevel, message: string, context?: LogContext, component?: string, error?: Error) {
    if (!this.shouldLog(level)) return;
    
    // Skip logging on server-side to avoid SSR issues
    if (typeof window === 'undefined') return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      requestId: this.requestId || undefined,
      component,
      error
    };

    const formattedMessage = this.formatMessage(entry);

    // Console logging with appropriate method
    switch (level) {
      case 'DEBUG':
        console.debug(formattedMessage, error);
        break;
      case 'INFO':
        console.info(formattedMessage);
        break;
      case 'WARN':
        console.warn(formattedMessage, error);
        break;
      case 'ERROR':
        console.error(formattedMessage, error);
        break;
    }

    // In production, you might want to send logs to a service
    if (!this.isDevelopment && level === 'ERROR') {
      this.sendToLoggingService(entry);
    }
  }

  private sendToLoggingService(entry: LogEntry) {
    // Placeholder for sending logs to external service
    // This could be Sentry, LogRocket, or a custom logging endpoint
    try {
      // Example: Send to logging endpoint
      // fetch('/api/logs', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(entry)
      // }).catch(() => {}); // Fail silently
    } catch (e) {
      // Fail silently to avoid logging errors from breaking the app
    }
  }

  debug(message: string, context?: LogContext, component?: string) {
    this.log('DEBUG', message, context, component);
  }

  info(message: string, context?: LogContext, component?: string) {
    this.log('INFO', message, context, component);
  }

  warn(message: string, context?: LogContext, component?: string, error?: Error) {
    this.log('WARN', message, context, component, error);
  }

  error(message: string, context?: LogContext, component?: string, error?: Error) {
    this.log('ERROR', message, context, component, error);
  }

  // API-specific logging methods
  apiRequest(url: string, method: string, context?: LogContext) {
    this.info(`API Request: ${method} ${url}`, context, 'ApiClient');
  }

  apiResponse(url: string, method: string, status: number, duration: number, context?: LogContext) {
    const message = `API Response: ${method} ${url} - Status: ${status} - Duration: ${duration}ms`;
    if (status >= 400) {
      this.error(message, context, 'ApiClient');
    } else if (status >= 300) {
      this.warn(message, context, 'ApiClient');
    } else {
      this.info(message, context, 'ApiClient');
    }
  }

  apiError(url: string, method: string, error: Error, context?: LogContext) {
    this.error(`API Error: ${method} ${url}`, context, 'ApiClient', error);
  }

  // Component lifecycle logging
  componentMount(componentName: string, props?: Record<string, unknown>) {
    this.debug(`Component mounted: ${componentName}`, { props }, componentName);
  }

  componentUnmount(componentName: string) {
    this.debug(`Component unmounted: ${componentName}`, undefined, componentName);
  }

  componentError(componentName: string, error: Error, errorInfo?: Record<string, unknown>) {
    this.error(`Component error in ${componentName}`, { errorInfo }, componentName, error);
  }

  // Data processing logging
  dataTransform(operation: string, inputSize?: number, outputSize?: number, component?: string) {
    const context = { inputSize, outputSize };
    this.debug(`Data transform: ${operation}`, context, component);
  }

  chartRender(chartType: string, dataPoints: number, component?: string) {
    this.debug(`Chart rendered: ${chartType}`, { dataPoints }, component);
  }

  chartError(chartType: string, error: Error, component?: string) {
    this.error(`Chart rendering failed: ${chartType}`, undefined, component, error);
  }

  // Performance logging
  performanceMark(operation: string, duration: number, component?: string) {
    const message = `Performance: ${operation} completed in ${duration}ms`;
    if (duration > 1000) {
      this.warn(message, { duration }, component);
    } else {
      this.debug(message, { duration }, component);
    }
  }

  // User interaction logging
  userAction(action: string, context?: LogContext, component?: string) {
    this.info(`User action: ${action}`, context, component);
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;

// Utility function to generate request IDs
export function generateRequestId(): string {
  // Use crypto.randomUUID if available, fallback to Math.random
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID().substring(0, 8);
  }
  return Math.random().toString(36).substring(2, 10);
}

// Hook for component logging
export function useLogger(componentName: string) {
  return {
    debug: (message: string, context?: LogContext) => logger.debug(message, context, componentName),
    info: (message: string, context?: LogContext) => logger.info(message, context, componentName),
    warn: (message: string, context?: LogContext, error?: Error) => logger.warn(message, context, componentName, error),
    error: (message: string, context?: LogContext, error?: Error) => logger.error(message, context, componentName, error),
    dataTransform: (operation: string, inputSize?: number, outputSize?: number) => 
      logger.dataTransform(operation, inputSize, outputSize, componentName),
    chartRender: (chartType: string, dataPoints: number) => 
      logger.chartRender(chartType, dataPoints, componentName),
    chartError: (chartType: string, error: Error) => 
      logger.chartError(chartType, error, componentName),
    performanceMark: (operation: string, duration: number) => 
      logger.performanceMark(operation, duration, componentName),
    userAction: (action: string, context?: LogContext) => 
      logger.userAction(action, context, componentName),
  };
}

// Error boundary logging
export function logErrorBoundary(error: Error, errorInfo: unknown, componentStack: string) {
  logger.error('Error Boundary caught an error', {
    errorInfo,
    componentStack,
    stack: error.stack
  }, 'ErrorBoundary', error);
}