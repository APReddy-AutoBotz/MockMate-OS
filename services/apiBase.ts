import { getRuntimeConfig, normalizeApiOrigin } from './runtimeConfig';

const config = getRuntimeConfig();

export const API_ORIGIN = config.apiOrigin;
export const API_BASE = config.apiBase;

export const apiUrl = (path: string) => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${safePath}`;
};

export const apiRoute = (path: string) => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  if (safePath.startsWith('/api/')) {
    return `${API_BASE}${safePath.slice(4)}`;
  }
  return `${API_BASE}${safePath}`;
};
