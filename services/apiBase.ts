import { getRuntimeConfig } from './runtimeConfig';

const config = getRuntimeConfig();
const rawApiUrl = config.apiUrl || '/api';
const base = rawApiUrl.replace(/\/+$/, '');

export const API_BASE = base;
export const API_ORIGIN = base.replace(/\/api$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');

export const apiUrl = (path: string) => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${safePath}`;
};

export const apiRoute = (path: string) => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${safePath}`;
};
