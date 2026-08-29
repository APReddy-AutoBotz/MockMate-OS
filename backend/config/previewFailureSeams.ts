import { runtimeMode } from './runtimeConfig';

export const ACCOUNT_DELETE_FAILURE_HEADER = 'x-mockmate-preview-failure';
export const ACCOUNT_DELETE_FAILURE_VALUE = 'account-delete-before-mutation';
export const ACCOUNT_DELETE_FAILURE_ENV = 'MOCKMATE_ENABLE_P0_8_ACCOUNT_DELETE_FAILURE_SEAM';

export type PreviewFailureSeamDecision = {
  requested: boolean;
  authorized: boolean;
};

/**
 * Preview-only deterministic failure authority used by controller acceptance.
 * Any request that names the failure header is considered a seam request and
 * must be intercepted before persistence, even when the seam is not authorized.
 */
export function accountDeleteFailureSeamDecision(
  env: NodeJS.ProcessEnv,
  requestedValue: string | string[] | undefined,
): PreviewFailureSeamDecision {
  const rawValue = Array.isArray(requestedValue) ? requestedValue.join(',') : requestedValue;
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) return { requested: false, authorized: false };
  if (value !== ACCOUNT_DELETE_FAILURE_VALUE) return { requested: true, authorized: false };

  let preview = false;
  try {
    preview = runtimeMode(env) === 'preview';
  } catch {
    preview = false;
  }

  return {
    requested: true,
    authorized: preview && env[ACCOUNT_DELETE_FAILURE_ENV] === 'true',
  };
}
