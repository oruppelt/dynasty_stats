import logger, { generateRequestId } from './logger';

interface ApiClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  requestId?: string;
}

interface ApiError extends Error {
  status?: number;
  statusText?: string;
  response?: Response;
  requestId?: string;
}

class ApiClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || '';
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 1;
  }

  private async makeRequest<T>(
    url: string,
    options: RequestInit = {},
    attempt: number = 1
  ): Promise<ApiResponse<T>> {
    const requestId = generateRequestId();
    const fullUrl = `${this.baseUrl}${url}`;
    const startTime = performance.now();
    
    // Set request ID in logger context
    logger.setRequestId(requestId);
    
    // Log the request (only in browser)
    if (typeof window !== 'undefined') {
      logger.apiRequest(fullUrl, options.method || 'GET', {
        attempt,
        headers: options.headers,
        body: options.body ? 'present' : 'none'
      });
    }

    try {
      // Add timeout to the request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const requestOptions: RequestInit = {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          ...options.headers,
        },
      };

      const response = await fetch(fullUrl, requestOptions);
      clearTimeout(timeoutId);
      
      const duration = Math.round(performance.now() - startTime);
      
      // Log response (only in browser)
      if (typeof window !== 'undefined') {
        logger.apiResponse(fullUrl, options.method || 'GET', response.status, duration, {
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
          requestId: response.headers.get('X-Request-ID')
        });
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const error: ApiError = new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        error.status = response.status;
        error.statusText = response.statusText;
        error.response = response;
        error.requestId = requestId;
        
        throw error;
      }

      let data: T;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
          if (typeof window !== 'undefined') {
            logger.debug('Parsed JSON response', { 
              dataType: typeof data,
              isArray: Array.isArray(data),
              keys: typeof data === 'object' && data !== null ? Object.keys(data) : undefined
            }, 'ApiClient');
          }
        } catch (parseError) {
          if (typeof window !== 'undefined') {
            logger.error('Failed to parse JSON response', { contentType }, 'ApiClient', parseError as Error);
          }
          throw new Error('Invalid JSON response');
        }
      } else {
        data = await response.text() as T;
        if (typeof window !== 'undefined') {
          logger.debug('Received text response', { contentType, length: (data as string).length }, 'ApiClient');
        }
      }

      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        requestId
      };

    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      
      // Handle different types of errors (only in browser)
      if (typeof window !== 'undefined' && error instanceof Error) {
        if (error.name === 'AbortError') {
          logger.error(`Request timeout after ${this.timeout}ms`, { url: fullUrl, attempt }, 'ApiClient', error);
        } else if ('status' in error) {
          // HTTP error
          logger.apiError(fullUrl, options.method || 'GET', error, {
            attempt,
            duration,
            status: (error as ApiError).status
          });
        } else {
          // Network or other error
          logger.apiError(fullUrl, options.method || 'GET', error, {
            attempt,
            duration,
            errorType: error.name
          });
        }
      }

      // Retry logic
      if (attempt < this.retries && this.shouldRetry(error)) {
        if (typeof window !== 'undefined') {
          logger.info(`Retrying request (attempt ${attempt + 1}/${this.retries})`, { 
            url: fullUrl,
            errorType: error instanceof Error ? error.name : 'unknown'
          }, 'ApiClient');
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.makeRequest<T>(url, options, attempt + 1);
      }

      throw error;
    } finally {
      if (typeof window !== 'undefined') {
        logger.clearRequestId();
      }
    }
  }

  private shouldRetry(error: unknown): boolean {
    // Retry on network errors, timeouts, and 5xx status codes
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.name === 'TypeError') {
        return true; // Network errors
      }
      if ('status' in error) {
        const status = (error as ApiError).status;
        return status !== undefined && status >= 500;
      }
    }
    return false;
  }

  async get<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, { ...options, method: 'GET' });
  }

  async post<T>(url: string, data?: unknown, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(url: string, data?: unknown, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(url, { ...options, method: 'DELETE' });
  }
}

// Create singleton instance
const apiClient = new ApiClient({
  timeout: 30000,
  retries: 2
});

export default apiClient;

// Specific API functions for the dynasty stats app
export const statsApi = {
  getStrength: () => apiClient.get('/api/strength'),
  getForAgainst: () => apiClient.get('/api/for_against'),
  getScheduleStrength: () => apiClient.get('/api/schedule_strength'),
};

// React Query error handler with logging
export function handleQueryError(error: unknown, queryKey: string) {
  logger.error(`React Query error for ${queryKey}`, {
    queryKey,
    errorMessage: error instanceof Error ? error.message : String(error),
    status: error && typeof error === 'object' && 'status' in error ? error.status : undefined,
    requestId: error && typeof error === 'object' && 'requestId' in error ? error.requestId : undefined
  }, 'ReactQuery', error instanceof Error ? error : undefined);
}

// React Query success handler with logging
export function handleQuerySuccess(data: unknown, queryKey: string) {
  logger.info(`React Query success for ${queryKey}`, {
    queryKey,
    dataType: typeof data,
    hasData: !!data,
    dataKeys: typeof data === 'object' && data !== null ? Object.keys(data) : undefined
  }, 'ReactQuery');
}