const normalizeBase = (value: string | undefined, fallback: string) => {
  const base = (value || fallback).trim().replace(/\/+$/, '');
  return base || fallback;
};

// On mobile, local server must use host IP or custom URL
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
const allowLocalFallback = process.env.EXPO_PUBLIC_ENABLE_MOCK_AUTH === 'true';

if (!configuredApiUrl && !allowLocalFallback) {
  throw new Error('MockMate mobile is missing EXPO_PUBLIC_API_URL. Set it to the deployed Vercel origin.');
}

// Default fallback is local development port
export const API_ORIGIN = normalizeBase(
  configuredApiUrl,
  allowLocalFallback ? 'http://localhost:3001' : ''
);
export const API_BASE = `${API_ORIGIN}/api`;

export const apiUrl = (path: string) => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${safePath}`;
};

export const apiRoute = (path: string) => {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${safePath}`;
};
