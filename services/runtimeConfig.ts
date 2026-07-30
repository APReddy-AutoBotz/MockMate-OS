export interface RuntimeConfig {
  apiOrigin: string;
  apiBase: string;
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  enableDevAuth: boolean;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

// Direct statically replaceable references for Vite define / env replacement
const VITE_API_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || (typeof process !== 'undefined' && process.env?.VITE_API_URL) || '';
const VITE_SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || '';
const VITE_SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || '';
const VITE_ENABLE_DEV_AUTH = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_DEV_AUTH) || (typeof process !== 'undefined' && process.env?.VITE_ENABLE_DEV_AUTH)) === 'true';
const NODE_ENV = (typeof import.meta !== 'undefined' && import.meta.env?.MODE) || (typeof process !== 'undefined' && process.env?.NODE_ENV) || 'development';

export function normalizeApiOrigin(rawInput?: string, mode: { isProd?: boolean; isDev?: boolean; isTest?: boolean } = {}): { apiOrigin: string; apiBase: string } {
  const trimmed = (rawInput || '').trim().replace(/\/+$/, '');
  
  if (trimmed) {
    if (trimmed.endsWith('/api')) {
      const apiOrigin = trimmed.slice(0, -4);
      return { apiOrigin, apiBase: trimmed };
    }
    return { apiOrigin: trimmed, apiBase: `${trimmed}/api` };
  }

  if (mode.isDev || (!mode.isProd && !mode.isTest)) {
    return { apiOrigin: 'http://localhost:3001', apiBase: 'http://localhost:3001/api' };
  }

  if (mode.isTest) {
    return { apiOrigin: 'http://localhost:3001', apiBase: 'http://localhost:3001/api' };
  }

  // Production empty value uses same-origin /api
  return { apiOrigin: '', apiBase: '/api' };
}

export function getRuntimeConfig(): RuntimeConfig {
  const envNodeEnv = (typeof process !== 'undefined' && process.env?.NODE_ENV) || (typeof import.meta !== 'undefined' && import.meta.env?.MODE) || 'development';
  const envApiUrl = (typeof process !== 'undefined' && process.env?.VITE_API_URL !== undefined) ? process.env.VITE_API_URL : VITE_API_URL;
  const envSupabaseUrl = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL !== undefined) ? process.env.VITE_SUPABASE_URL : VITE_SUPABASE_URL;
  const envSupabaseAnonKey = (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY !== undefined) ? process.env.VITE_SUPABASE_ANON_KEY : VITE_SUPABASE_ANON_KEY;
  const envEnableDevAuth = (typeof process !== 'undefined' && process.env?.VITE_ENABLE_DEV_AUTH !== undefined)
    ? process.env.VITE_ENABLE_DEV_AUTH === 'true'
    : VITE_ENABLE_DEV_AUTH;

  const isTest = envNodeEnv === 'test';
  const isProduction = envNodeEnv === 'production';
  const isDevelopment = envNodeEnv === 'development' || (!isProduction && !isTest);

  const { apiOrigin, apiBase } = normalizeApiOrigin(envApiUrl, { isProd: isProduction, isDev: isDevelopment, isTest });

  const supabaseUrl = envSupabaseUrl || (isTest ? 'https://dummy.supabase.co' : '');
  const supabaseAnonKey = envSupabaseAnonKey || (isTest ? 'dummy-anon-key' : '');

  return {
    apiOrigin,
    apiBase,
    apiUrl: apiBase,
    supabaseUrl,
    supabaseAnonKey,
    enableDevAuth: envEnableDevAuth,
    isProduction,
    isDevelopment,
    isTest,
  };
}

export function validateRuntimeConfig(): { valid: boolean; error?: string } {
  const config = getRuntimeConfig();
  if (config.isTest) {
    return { valid: true };
  }
  if (config.enableDevAuth && config.isDevelopment) {
    return { valid: true };
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return {
      valid: false,
      error: 'Missing Supabase configuration (VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY). Production must fail closed.',
    };
  }
  return { valid: true };
}
