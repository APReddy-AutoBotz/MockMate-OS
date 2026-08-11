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
  mode: 'development' | 'test' | 'preview' | 'production';
}

type RuntimeMode = RuntimeConfig['mode'];

const parseRuntimeMode = (requested: string): RuntimeMode => {
  if (requested === 'development' || requested === 'test' || requested === 'preview' || requested === 'production') {
    return requested;
  }
  throw new Error('Runtime configuration is invalid (CONFIGURATION_INVALID).');
};

// Direct statically replaceable references for Vite define / env replacement
const VITE_API_URL = process.env.VITE_API_URL || '';
const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const VITE_ENABLE_DEV_AUTH = process.env.VITE_ENABLE_DEV_AUTH === 'true';
const NODE_ENV = process.env.NODE_ENV || 'development';
const VITE_RUNTIME_MODE = process.env.VITE_RUNTIME_MODE || '';

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
  const envNodeEnv = process.env.NODE_ENV || NODE_ENV;
  const requestedMode = process.env.VITE_RUNTIME_MODE || VITE_RUNTIME_MODE || envNodeEnv;
  const mode = parseRuntimeMode(requestedMode);
  const envApiUrl = process.env.VITE_API_URL !== undefined ? process.env.VITE_API_URL : VITE_API_URL;
  const envSupabaseUrl = process.env.VITE_SUPABASE_URL !== undefined ? process.env.VITE_SUPABASE_URL : VITE_SUPABASE_URL;
  const envSupabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY !== undefined ? process.env.VITE_SUPABASE_ANON_KEY : VITE_SUPABASE_ANON_KEY;
  const envEnableDevAuth = process.env.VITE_ENABLE_DEV_AUTH !== undefined ? process.env.VITE_ENABLE_DEV_AUTH === 'true' : VITE_ENABLE_DEV_AUTH;

  const isTest = mode === 'test';
  const isProduction = mode === 'production' || mode === 'preview';
  const isDevelopment = mode === 'development';

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
    mode,
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
  if (config.isProduction && config.enableDevAuth) {
    return { valid: false, error: 'Runtime configuration is invalid (CONFIGURATION_INVALID).' };
  }
  try {
    const supabase = new URL(config.supabaseUrl);
    if (supabase.protocol !== 'https:' || supabase.username || supabase.password) throw new Error();
    if (config.apiOrigin) {
      const api = new URL(config.apiOrigin);
      if (config.isProduction && api.protocol !== 'https:') throw new Error();
    }
  } catch {
    return { valid: false, error: 'Runtime configuration is invalid (CONFIGURATION_INVALID).' };
  }
  return { valid: true };
}
