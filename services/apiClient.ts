import { API_BASE } from './apiBase';

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

export const apiClient = {
    async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
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

        return response.json();
    },

    get<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request<T>(endpoint, { ...options, method: 'GET' });
    },

    post<T>(endpoint: string, data?: any, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request<T>(endpoint, {
            ...options,
            method: 'POST',
            body: data instanceof FormData ? data : JSON.stringify(data),
        });
    },

    put<T>(endpoint: string, data?: any, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request<T>(endpoint, {
            ...options,
            method: 'PUT',
            body: data instanceof FormData ? data : JSON.stringify(data),
        });
    },

    delete<T>(endpoint: string, options?: Omit<RequestOptions, 'method' | 'body'>) {
        return this.request<T>(endpoint, { ...options, method: 'DELETE' });
    }
};
