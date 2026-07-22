export interface RuntimeConfig {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  enableDevAuth: boolean;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

// Direct statically replaceable references for Vite define / env replacement
const VITE_API_URL = process.env.VITE_API_URL || '';
const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const VITE_ENABLE_DEV_AUTH = process.env.VITE_ENABLE_DEV_AUTH === 'true';
const NODE_ENV = process.env.NODE_ENV || 'development';

export function getRuntimeConfig(): RuntimeConfig {
  const isTest = NODE_ENV === 'test';
  const isProduction = NODE_ENV === 'production';
  const isDevelopment = NODE_ENV === 'development' || (!isProduction && !isTest);

  const supabaseUrl = VITE_SUPABASE_URL || (isTest ? 'https://dummy.supabase.co' : '');
  const supabaseAnonKey = VITE_SUPABASE_ANON_KEY || (isTest ? 'dummy-anon-key' : '');
  const apiUrl = VITE_API_URL || (isTest ? 'http://localhost:3001/api' : (isDevelopment ? 'http://localhost:3001/api' : '/api'));

  return {
    apiUrl,
    supabaseUrl,
    supabaseAnonKey,
    enableDevAuth: VITE_ENABLE_DEV_AUTH,
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
