import { isValidRuntimeUrl } from 'mockmate-shared';

export type RuntimeMode = 'development' | 'test' | 'preview' | 'production';

export class ConfigurationError extends Error {
  readonly code = 'CONFIGURATION_INVALID';
  constructor() {
    super('Runtime configuration is invalid.');
    this.name = 'ConfigurationError';
  }
}

export const validRuntimeUrl = (
  value: string | undefined,
  { httpsRequired, originOnly = false }: { httpsRequired: boolean; originOnly?: boolean },
) => isValidRuntimeUrl(value, { httpsRequired, forbidLoopback: httpsRequired, originOnly });

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

const PROJECT_REF = /^[a-z0-9]{20}$/;
const PREVIEW_TARGET_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/;
const GIT_HEAD_SHA = /^[0-9a-f]{40}$/;

function supabaseProjectRef(urlValue: string | undefined) {
  if (!urlValue) return null;
  try {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function deployedGitHeadSha(env: NodeJS.ProcessEnv): string | null {
  const override = env.MOCKMATE_DEPLOYED_GIT_SHA?.trim() || undefined;
  const providerShas = [
    env.VERCEL_GIT_COMMIT_SHA?.trim() || undefined,
    env.COMMIT_REF?.trim() || undefined,
  ].filter((value): value is string => Boolean(value));

  const providerSha = providerShas[0];
  if (providerSha && providerShas.some(value => value !== providerSha)) return null;
  if (providerSha && override && override !== providerSha) return null;
  return providerSha || override || null;
}

export type PreviewAuthority = {
  previewOrigin: string;
  previewTargetId: string;
  supabaseProjectRef: string;
  gitHeadSha: string;
};

/** Validate server authority once, without returning secret names or values to callers. */
export function assertServerRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const mode = runtimeMode(env);
  if (mode === 'test' || mode === 'development') return { mode, productionLike: false } as const;

  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  const validOrigins = origins.length > 0 && origins.every(origin => origin !== '*' &&
    validRuntimeUrl(origin, { httpsRequired: true, originOnly: true }));
  const serverProjectRef = supabaseProjectRef(env.SUPABASE_URL);
  const browserProjectRef = supabaseProjectRef(env.VITE_SUPABASE_URL);

  // AI provider readiness is feature-level authority. The server must remain available for
  // authentication, account, persistence, and other non-AI routes when no provider is configured.
  const invalid = env.ENABLE_DEV_AUTH === 'true' || env.VITE_ENABLE_DEV_AUTH === 'true' ||
    !validRuntimeUrl(env.SUPABASE_URL, { httpsRequired: true }) || !env.SUPABASE_SERVICE_ROLE_KEY || !validOrigins ||
    Boolean(env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY === env.VITE_SUPABASE_ANON_KEY);
  if (invalid) throw new ConfigurationError();

  if (mode === 'preview') {
    const previewOrigin = env.PREVIEW_ORIGIN?.trim();
    const previewTargetId = env.MOCKMATE_PREVIEW_TARGET_ID?.trim();
    const expectedProjectRef = env.MOCKMATE_SUPABASE_PROJECT_REF?.trim();
    const gitHeadSha = deployedGitHeadSha(env);
    const previewInvalid = origins.length !== 1 || !previewOrigin || previewOrigin !== origins[0] ||
      !validRuntimeUrl(previewOrigin, { httpsRequired: true, originOnly: true }) ||
      !previewTargetId || !PREVIEW_TARGET_ID.test(previewTargetId) ||
      !expectedProjectRef || !PROJECT_REF.test(expectedProjectRef) ||
      serverProjectRef !== expectedProjectRef || browserProjectRef !== expectedProjectRef ||
      !gitHeadSha || !GIT_HEAD_SHA.test(gitHeadSha);
    if (previewInvalid) throw new ConfigurationError();
    return {
      mode,
      productionLike: true,
      previewAuthority: {
        previewOrigin,
        previewTargetId,
        supabaseProjectRef: expectedProjectRef,
        gitHeadSha,
      } satisfies PreviewAuthority,
    } as const;
  }

  return { mode, productionLike: true } as const;
}
