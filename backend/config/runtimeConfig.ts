export type RuntimeMode = 'development' | 'test' | 'preview' | 'production';

export class ConfigurationError extends Error {
  readonly code = 'CONFIGURATION_INVALID';
  constructor() {
    super('Runtime configuration is invalid.');
    this.name = 'ConfigurationError';
  }
}

const validUrl = (value: string | undefined, httpsRequired: boolean) => {
  try {
    const url = new URL(value || '');
    return (url.protocol === 'https:' || (!httpsRequired && url.protocol === 'http:')) && !url.username && !url.password;
  } catch { return false; }
};

export function runtimeMode(env: NodeJS.ProcessEnv = process.env): RuntimeMode {
  const requested = env.MOCKMATE_RUNTIME_MODE || env.NODE_ENV || 'development';
  if (requested === 'development' || requested === 'test' || requested === 'preview' || requested === 'production') {
    return requested;
  }
  throw new ConfigurationError();
}

export function isProductionLike(env: NodeJS.ProcessEnv = process.env) {
  const mode = runtimeMode(env);
  return mode === 'preview' || mode === 'production';
}

/** Validate server authority once, without returning names or values to callers. */
export function assertServerRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const mode = runtimeMode(env);
  if (mode === 'test' || mode === 'development') return { mode, productionLike: false } as const;
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  const validOrigins = origins.length > 0 && origins.every(origin => origin !== '*' && validUrl(origin, true));
  const providerConfigured = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GROQ_API_KEY);
  const invalid = env.ENABLE_DEV_AUTH === 'true' || env.VITE_ENABLE_DEV_AUTH === 'true' ||
    !validUrl(env.SUPABASE_URL, true) || !env.SUPABASE_SERVICE_ROLE_KEY || !validOrigins ||
    !providerConfigured || Boolean(env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY === env.VITE_SUPABASE_ANON_KEY);
  if (invalid) throw new ConfigurationError();
  return { mode, productionLike: true } as const;
}
