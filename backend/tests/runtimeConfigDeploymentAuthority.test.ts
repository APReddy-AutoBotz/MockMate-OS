import { assertServerRuntimeConfig, ConfigurationError } from '../config/runtimeConfig';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const PREVIEW_ORIGIN = 'https://mockmate-p0-8-preview.netlify.app';
const PROJECT_REF = 'cysnsoeonyhcshjjpezk';

const previewEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  MOCKMATE_RUNTIME_MODE: 'preview',
  ALLOWED_ORIGINS: PREVIEW_ORIGIN,
  PREVIEW_ORIGIN,
  MOCKMATE_PREVIEW_TARGET_ID: 'mockmate-p0-8-preview',
  MOCKMATE_SUPABASE_PROJECT_REF: PROJECT_REF,
  SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
  VITE_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-secret',
  VITE_SUPABASE_ANON_KEY: 'browser-test-key',
  ENABLE_DEV_AUTH: 'false',
  VITE_ENABLE_DEV_AUTH: 'false',
  ...extra,
});

const resolvedSha = (env: NodeJS.ProcessEnv) => {
  const result = assertServerRuntimeConfig(env);
  if (result.mode !== 'preview' || !('previewAuthority' in result)) {
    throw new Error('Expected preview authority.');
  }
  return result.previewAuthority.gitHeadSha;
};

describe('preview deployed Git authority', () => {
  it('uses Netlify COMMIT_REF when it is the platform authority', () => {
    expect(resolvedSha(previewEnv({ COMMIT_REF: SHA_A }))).toBe(SHA_A);
  });

  it('uses Vercel VERCEL_GIT_COMMIT_SHA when it is the platform authority', () => {
    expect(resolvedSha(previewEnv({ VERCEL_GIT_COMMIT_SHA: SHA_A }))).toBe(SHA_A);
  });

  it('allows the explicit override only when no platform authority exists', () => {
    expect(resolvedSha(previewEnv({ MOCKMATE_DEPLOYED_GIT_SHA: SHA_A }))).toBe(SHA_A);
  });

  it('accepts a matching override without replacing the platform authority', () => {
    expect(resolvedSha(previewEnv({ COMMIT_REF: SHA_A, MOCKMATE_DEPLOYED_GIT_SHA: SHA_A }))).toBe(SHA_A);
  });

  it('accepts matching Netlify and Vercel platform authorities', () => {
    expect(resolvedSha(previewEnv({ COMMIT_REF: SHA_A, VERCEL_GIT_COMMIT_SHA: SHA_A }))).toBe(SHA_A);
  });

  it('fails closed when an override disagrees with Netlify', () => {
    expect(() => assertServerRuntimeConfig(previewEnv({ COMMIT_REF: SHA_A, MOCKMATE_DEPLOYED_GIT_SHA: SHA_B })))
      .toThrow(ConfigurationError);
  });

  it('fails closed when an override disagrees with Vercel', () => {
    expect(() => assertServerRuntimeConfig(previewEnv({ VERCEL_GIT_COMMIT_SHA: SHA_A, MOCKMATE_DEPLOYED_GIT_SHA: SHA_B })))
      .toThrow(ConfigurationError);
  });

  it('fails closed when hosting providers disagree', () => {
    expect(() => assertServerRuntimeConfig(previewEnv({ COMMIT_REF: SHA_A, VERCEL_GIT_COMMIT_SHA: SHA_B })))
      .toThrow(ConfigurationError);
  });

  it('does not let a valid override rescue a malformed provider authority', () => {
    expect(() => assertServerRuntimeConfig(previewEnv({ COMMIT_REF: 'not-a-sha', MOCKMATE_DEPLOYED_GIT_SHA: SHA_A })))
      .toThrow(ConfigurationError);
  });
});
