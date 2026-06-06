const normalizeBase = (value: string | undefined, fallback: string) => {
  const base = (value || fallback).trim().replace(/\/+$/, '');
  return base || fallback;
};

const isDev = process.env.NODE_ENV === 'development';
const configuredApiUrl = process.env.VITE_API_URL;

export const API_ORIGIN = normalizeBase(configuredApiUrl, isDev ? 'http://localhost:3001' : '');
export const API_BASE = `${API_ORIGIN}/api`;

export const apiUrl = (path: string) => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${safePath}`;
};

export const apiRoute = (path: string) => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${safePath}`;
};
