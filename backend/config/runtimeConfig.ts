export type RuntimeMode = 'development' | 'test' | 'preview' | 'production';

export class ConfigurationError extends Error {
  readonly code = 'CONFIGURATION_INVALID';
  constructor() {
    super('Runtime configuration is invalid.');
    this.name = 'ConfigurationError';
  }
}

const isLocalHostname = (hostname: string) => hostname === 'localhost' ||
  hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';

export const validRuntimeUrl = (
  value: string | undefined,
  { httpsRequired, originOnly = false }: { httpsRequired: boolean; originOnly?: boolean },
) => {
  try {
    const url = new URL(value || '');
    const validScheme = url.protocol === 'https:' || (!httpsRequired && url.protocol === 'http:');
    return validScheme && Boolean(url.hostname) && !url.username && !url.password &&
      (!httpsRequired || !isLocalHostname(url.hostname)) &&
      (!originOnly || (url.pathname === '/' && !url.search && !url.hash));
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
  const validOrigins = origins.length > 0 && origins.every(origin => origin !== '*' &&
    validRuntimeUrl(origin, { httpsRequired: true, originOnly: true }));
  const providerConfigured = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GROQ_API_KEY);
  const invalid = env.ENABLE_DEV_AUTH === 'true' || env.VITE_ENABLE_DEV_AUTH === 'true' ||
    !validRuntimeUrl(env.SUPABASE_URL, { httpsRequired: true }) || !env.SUPABASE_SERVICE_ROLE_KEY || !validOrigins ||
    !providerConfigured || Boolean(env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY === env.VITE_SUPABASE_ANON_KEY);
  if (invalid) throw new ConfigurationError();
  return { mode, productionLike: true } as const;
}
