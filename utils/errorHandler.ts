export interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
  retryable?: boolean;
  context?: any;
}

export class APIError extends Error implements AppError {
  code?: string;
  statusCode?: number;
  retryable?: boolean;
  context?: any;

  constructor(message: string, options: Partial<AppError> = {}) {
    super(message);
    this.name = 'APIError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? true;
    this.context = options.context;
  }
}

export class NetworkError extends APIError {
  constructor(message: string = 'Network connection failed') {
    super(message, { 
      code: 'NETWORK_ERROR', 
      retryable: true,
      statusCode: 0 
    });
    this.name = 'NetworkError';
  }
}

export class ValidationError extends APIError {
  constructor(message: string, context?: any) {
    super(message, { 
      code: 'VALIDATION_ERROR', 
      retryable: false,
      context 
    });
    this.name = 'ValidationError';
  }
}

export class QuotaError extends APIError {
  constructor(message: string = 'API quota exceeded') {
    super(message, { 
      code: 'QUOTA_EXCEEDED', 
      retryable: false,
      statusCode: 429 
    });
    this.name = 'QuotaError';
  }
}

export const handleAPIError = (error: any, context?: any): APIError => {
  // Network errors
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return new NetworkError('Unable to connect to our servers. Please check your internet connection.');
  }

  // Model provider errors (504, 502, etc.)
  if (error.status === 504 || error.message?.includes('504')) {
    return new APIError('AI service temporarily unavailable. Please try again in a moment.', {
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
      statusCode: 504
    });
  }

  if (error.status === 503 || error.message?.includes('503')) {
    return new APIError('AI service is down for maintenance. Please try again later.', {
      code: 'SERVICE_MAINTENANCE',
      retryable: false,
      statusCode: 503
    });
  }

  // API key errors
  if (error.message?.includes('API key') || error.message?.includes('unauthorized')) {
    return new APIError('Service configuration error. Please check your API key setup.', {
      code: 'API_KEY_ERROR',
      retryable: false
    });
  }

  // API response errors
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;
    
    switch (status) {
      case 400:
        return new ValidationError('Invalid request. Please try again.', error);
      case 401:
        return new APIError('Authentication required. Please log in again.', {
          code: 'UNAUTHORIZED',
          retryable: false,
          statusCode: 401
        });
      case 403:
        return new APIError('Access denied. You do not have permission for this action.', {
          code: 'FORBIDDEN',
          retryable: false,
          statusCode: 403
        });
      case 429:
        return new QuotaError('Too many requests. Please wait a moment and try again.');
      case 500:
        return new APIError('Server error. Our team has been notified.', {
          code: 'SERVER_ERROR',
          retryable: true,
          statusCode: 500
        });
      default:
        return new APIError(`Request failed (${status}). Please try again.`, {
          code: 'HTTP_ERROR',
          statusCode: status,
          context: error
        });
    }
  }

  // Gemini API specific errors
  if (error.message?.includes('quota') || error.message?.includes('429')) {
    return new QuotaError('AI service quota exceeded. Please try again in a few minutes.');
  }

  if (error.message?.includes('API key')) {
    return new APIError('Service configuration error. Please contact support.', {
      code: 'API_KEY_ERROR',
      retryable: false
    });
  }

  // Generic errors
  return new APIError(error.message || 'An unexpected error occurred', {
    code: 'UNKNOWN_ERROR',
    retryable: true,
    context: error
  });
};

export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  context?: any
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const appError = handleAPIError(error, context);
    console.error('Operation failed:', appError, { context });
    
    // Track errors in analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: appError.message,
        fatal: !appError.retryable
      });
    }
    
    throw appError;
  }
};

export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  context?: any
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withErrorHandling(operation, context);
    } catch (error) {
      lastError = error;
      
      // Don't retry if error is not retryable
      if (error instanceof APIError && !error.retryable) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const backoffDelay = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      
      console.warn(`Retrying operation (attempt ${attempt + 1}/${maxRetries}) after ${backoffDelay}ms`);
    }
  }
  
  throw lastError;
};

// Extend Window interface for gtag
declare global {
  interface Window {
    gtag?: (command: string, action: string, options: any) => void;
  }
}
