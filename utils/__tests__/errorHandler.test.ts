import { 
  handleAPIError, 
  NetworkError, 
  ValidationError, 
  QuotaError, 
  APIError 
} from '../errorHandler';

describe('Error Handler', () => {
  describe('handleAPIError', () => {
    it('should return NetworkError for fetch errors', () => {
      const error = new TypeError('fetch failed');
      const result = handleAPIError(error);
      
      expect(result).toBeInstanceOf(NetworkError);
      expect(result.message).toBe('Unable to connect to our servers. Please check your internet connection.');
      expect(result.retryable).toBe(true);
    });

    it('should return APIError for 504 errors', () => {
      const error = { status: 504, message: 'Gateway Timeout' };
      const result = handleAPIError(error);
      
      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe('SERVICE_UNAVAILABLE');
      expect(result.retryable).toBe(true);
    });

    it('should return APIError for 503 errors', () => {
      const error = { status: 503, message: 'Service Unavailable' };
      const result = handleAPIError(error);
      
      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe('SERVICE_MAINTENANCE');
      expect(result.retryable).toBe(false);
    });

    it('should return ValidationError for 400 errors', () => {
      const error = { status: 400, message: 'Bad Request' };
      const result = handleAPIError(error);
      
      expect(result).toBeInstanceOf(ValidationError);
      expect(result.retryable).toBe(false);
    });

    it('should return QuotaError for 429 errors', () => {
      const error = { status: 429, message: 'Too Many Requests' };
      const result = handleAPIError(error);
      
      expect(result).toBeInstanceOf(QuotaError);
      expect(result.retryable).toBe(false);
    });

    it('should return generic APIError for unknown errors', () => {
      const error = { status: 418, message: "I'm a teapot" };
      const result = handleAPIError(error);
      
      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe('HTTP_ERROR');
      expect(result.retryable).toBe(true);
    });

    it('should handle API key errors', () => {
      const error = new Error('Invalid API key');
      const result = handleAPIError(error);
      
      expect(result).toBeInstanceOf(APIError);
      expect(result.code).toBe('API_KEY_ERROR');
      expect(result.retryable).toBe(false);
    });
  });

  describe('Error Classes', () => {
    it('should create NetworkError with correct properties', () => {
      const error = new NetworkError('Connection failed');
      
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.retryable).toBe(true);
    });

    it('should create ValidationError with correct properties', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.retryable).toBe(false);
    });

    it('should create QuotaError with correct properties', () => {
      const error = new QuotaError('Limit exceeded');
      
      expect(error.name).toBe('QuotaError');
      expect(error.message).toBe('Limit exceeded');
      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.retryable).toBe(false);
    });
  });
});
