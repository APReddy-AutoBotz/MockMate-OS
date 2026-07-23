import { z } from 'zod';
import { API_BASE } from './apiBase';
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

async function request<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    options: RequestOptions = {}
): Promise<T> {
    const { requireAuth = true, params, headers: customHeaders, ...fetchOptions } = options;
    
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

    if (!(fetchOptions.body instanceof FormData)) {
        if (!headers.has('Content-Type') && fetchOptions.body) {
            headers.set('Content-Type', 'application/json');
        }
    }

    const response = await fetch(url, {
        ...fetchOptions,
        headers,
    });

    if (!response.ok) {
        let errorData: any = {};
        try {
            errorData = await response.json();
        } catch {
            errorData = { error: response.statusText };
        }
        throw new ApiError(
            response.status,
            errorData.code || 'INTERNAL_ERROR',
            errorData.error || errorData.message || 'API request failed',
            errorData.details
        );
    }

    if (response.status === 204) {
        return {} as T;
    }

    const payload = await response.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
        if (__DEV__) {
            console.error(
                `Contract validation failed for endpoint ${endpoint}:`,
                parsed.error.issues.map((i) => i.path.join('.'))
            );
        }
        throw new ApiError(
            500,
            'CONTRACT_RESPONSE_INVALID',
            `Response validation failed for endpoint ${endpoint}`,
            parsed.error.issues
        );
    }

    return parsed.data;
}

export const apiClient = {
    get<T>(endpoint: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T> {
        return request<T>(endpoint, schema, { ...options, method: 'GET' });
    },

    post<T>(endpoint: string, schema: z.ZodType<T>, data?: unknown, options?: RequestOptions): Promise<T> {
        return request<T>(endpoint, schema, {
            ...options,
            method: 'POST',
            body: data instanceof FormData ? data : JSON.stringify(data),
        });
    },

    put<T>(endpoint: string, schema: z.ZodType<T>, data?: unknown, options?: RequestOptions): Promise<T> {
        return request<T>(endpoint, schema, {
            ...options,
            method: 'PUT',
            body: data instanceof FormData ? data : JSON.stringify(data),
        });
    },

    delete<T>(endpoint: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T> {
        return request<T>(endpoint, schema, { ...options, method: 'DELETE' });
    }
};
