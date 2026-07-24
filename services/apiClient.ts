import { z } from 'zod';
import { ApiErrorCode } from 'mockmate-shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode | string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const getAuthToken = async (): Promise<string | null> => {
  const { getAccessToken } = await import('./supabaseClient');
  return getAccessToken();
};

export interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
  params?: Record<string, string>;
}

import { getRuntimeConfig } from './runtimeConfig';

const getApiBase = (): string => {
  return getRuntimeConfig().apiUrl;
};

const isDevEnv = (): boolean => {
  return getRuntimeConfig().isDevelopment;
};

async function request<T>(
  endpoint: string,
  schema: z.ZodType<T, any, any>,
  options: RequestOptions = {}
): Promise<T> {
  const { requireAuth = true, params, headers: customHeaders, ...fetchOptions } = options;

  const API_BASE = getApiBase();
  let url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  if (params) {
    const query = new URLSearchParams(params).toString();
    if (query) url += `?${query}`;
  }

  const headers = new Headers(customHeaders as any);

  if (requireAuth) {
    const token = await getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
    }
  }

  if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        // Ignored
      }
      throw new ApiError(
        response.status,
        errorData.code || 'HTTP_ERROR',
        errorData.error || errorData.message || `Request failed with status ${response.status}`,
        errorData.details
      );
    }

    const json = await response.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      console.error(`[API Client Schema Failure] Endpoint: ${endpoint}`, parsed.error.format());
      throw new ApiError(
        500,
        'SCHEMA_VALIDATION_ERROR',
        `Response schema validation failed for ${endpoint}`,
        parsed.error.issues
      );
    }

    return parsed.data;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, 'NETWORK_ERROR', err.message || 'Network request failed');
  }
}

async function requestRaw(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ArrayBuffer> {
  const { requireAuth = true, params, headers: customHeaders, ...fetchOptions } = options;

  const API_BASE = getApiBase();
  let url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  if (params) {
    const query = new URLSearchParams(params).toString();
    if (query) url += `?${query}`;
  }

  const headers = new Headers(customHeaders as any);

  if (requireAuth) {
    const token = await getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
    }
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status, 'INTERNAL_ERROR', 'API raw request failed');
  }

  return response.arrayBuffer();
}

export const apiClient = {
  get<T>(endpoint: string, schema: z.ZodType<T, any, any>, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, schema, { ...options, method: 'GET' });
  },

  post<T>(endpoint: string, schema: z.ZodType<T, any, any>, data?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, schema, {
      ...options,
      method: 'POST',
      body: data instanceof FormData ? data : JSON.stringify(data),
    });
  },

  put<T>(endpoint: string, schema: z.ZodType<T, any, any>, data?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, schema, {
      ...options,
      method: 'PUT',
      body: data instanceof FormData ? data : JSON.stringify(data),
    });
  },

  delete<T>(endpoint: string, schema: z.ZodType<T, any, any>, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, schema, { ...options, method: 'DELETE' });
  },

  getRaw(endpoint: string, options?: RequestOptions): Promise<ArrayBuffer> {
    return requestRaw(endpoint, options);
  }
};
