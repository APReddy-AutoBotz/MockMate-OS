const API_BASE = import.meta.env.VITE_API_URL || "";
import { z } from 'zod';

export class ApiError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string,
        public details?: any
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export const getAuthToken = async (): Promise<string | null> => {
    const { getAccessToken } = await import('./supabaseClient');
    return getAccessToken();
};

interface RequestOptions extends RequestInit {
    requireAuth?: boolean;
    params?: Record<string, string>;
}

async function request<T>(endpoint: string, schema: z.ZodType<T> | undefined, options: RequestOptions = {}): Promise<T> {
    const { requireAuth = true, params, headers: customHeaders, ...fetchOptions } = options;
    
    let url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    if (params) {
        const query = new URLSearchParams(params).toString();
        if (query) url += `?${query}`;
    }

    const headers = new Headers(customHeaders);
    
    if (requireAuth) {
        const token = await getAuthToken();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        } else {
            throw new ApiError(401, 'unauthorized', 'Authentication required');
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
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            errorData = { error: response.statusText };
        }
        throw new ApiError(
            response.status,
            errorData.code || 'unknown_error',
            errorData.error || errorData.message || 'API request failed',
            errorData.details
        );
    }

    if (response.status === 204) {
        return {} as T;
    }

    const data = await response.json();
    
    if (schema) {
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
            console.error('API response schema validation failed:', parsed.error);
            // Optionally throw or log depending on strictness
        }
    }
    
    return data as T;
}

export const apiClient = {
    get<T = any>(endpoint: string, schemaOrOptions?: z.ZodType<T> | Omit<RequestOptions, 'method' | 'body'>, options?: Omit<RequestOptions, 'method' | 'body'>) {
        const schema = schemaOrOptions instanceof z.ZodType ? schemaOrOptions : undefined;
        const opts = schemaOrOptions instanceof z.ZodType ? options : schemaOrOptions;
        return request<T>(endpoint, schema, { ...opts, method: 'GET' });
    },

    post<T = any>(endpoint: string, data?: any, schemaOrOptions?: z.ZodType<T> | Omit<RequestOptions, 'method' | 'body'>, options?: Omit<RequestOptions, 'method' | 'body'>) {
        const schema = schemaOrOptions instanceof z.ZodType ? schemaOrOptions : undefined;
        const opts = schemaOrOptions instanceof z.ZodType ? options : schemaOrOptions;
        return request<T>(endpoint, schema, {
            ...opts,
            method: 'POST',
            body: data instanceof FormData ? data : JSON.stringify(data),
        });
    },

    put<T = any>(endpoint: string, data?: any, schemaOrOptions?: z.ZodType<T> | Omit<RequestOptions, 'method' | 'body'>, options?: Omit<RequestOptions, 'method' | 'body'>) {
        const schema = schemaOrOptions instanceof z.ZodType ? schemaOrOptions : undefined;
        const opts = schemaOrOptions instanceof z.ZodType ? options : schemaOrOptions;
        return request<T>(endpoint, schema, {
            ...opts,
            method: 'PUT',
            body: data instanceof FormData ? data : JSON.stringify(data),
        });
    },

    delete<T = any>(endpoint: string, schemaOrOptions?: z.ZodType<T> | Omit<RequestOptions, 'method' | 'body'>, options?: Omit<RequestOptions, 'method' | 'body'>) {
        const schema = schemaOrOptions instanceof z.ZodType ? schemaOrOptions : undefined;
        const opts = schemaOrOptions instanceof z.ZodType ? options : schemaOrOptions;
        return request<T>(endpoint, schema, { ...opts, method: 'DELETE' });
    }
};
