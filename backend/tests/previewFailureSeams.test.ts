import fs from 'node:fs';
import path from 'node:path';
import {
  ACCOUNT_DELETE_FAILURE_HEADER,
  ACCOUNT_DELETE_FAILURE_VALUE,
  ACCOUNT_DELETE_FAILURE_ENV,
  accountDeleteFailureSeamDecision,
} from '../config/previewFailureSeams';

const previewEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  MOCKMATE_RUNTIME_MODE: 'preview',
  ...extra,
});

describe('P0-8 account deletion preview failure seam', () => {
  it('does not intercept ordinary account deletion requests', () => {
    expect(accountDeleteFailureSeamDecision(previewEnv({ [ACCOUNT_DELETE_FAILURE_ENV]: 'true' }), undefined))
      .toEqual({ requested: false, authorized: false });
  });

  it('authorizes only the exact header in preview with the explicit environment gate', () => {
    expect(accountDeleteFailureSeamDecision(
      previewEnv({ [ACCOUNT_DELETE_FAILURE_ENV]: 'true' }),
      ACCOUNT_DELETE_FAILURE_VALUE,
    )).toEqual({ requested: true, authorized: true });
  });

  it('fails closed when the environment gate is absent', () => {
    expect(accountDeleteFailureSeamDecision(previewEnv(), ACCOUNT_DELETE_FAILURE_VALUE))
      .toEqual({ requested: true, authorized: false });
  });

  it('fails closed outside preview even when the environment gate is set', () => {
    expect(accountDeleteFailureSeamDecision(
      { MOCKMATE_RUNTIME_MODE: 'production', [ACCOUNT_DELETE_FAILURE_ENV]: 'true' },
      ACCOUNT_DELETE_FAILURE_VALUE,
    )).toEqual({ requested: true, authorized: false });
  });

  it('fails closed for malformed or alternate seam values', () => {
    for (const value of ['account-delete', 'before-mutation', `${ACCOUNT_DELETE_FAILURE_VALUE},extra`]) {
      expect(accountDeleteFailureSeamDecision(
        previewEnv({ [ACCOUNT_DELETE_FAILURE_ENV]: 'true' }),
        value,
      )).toEqual({ requested: true, authorized: false });
    }
  });

  it('fails closed when runtime mode is invalid', () => {
    expect(accountDeleteFailureSeamDecision(
      { MOCKMATE_RUNTIME_MODE: 'invalid-mode', [ACCOUNT_DELETE_FAILURE_ENV]: 'true' },
      ACCOUNT_DELETE_FAILURE_VALUE,
    )).toEqual({ requested: true, authorized: false });
  });

  it('keeps the seam check before all Supabase deletion authority', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../routes/meRoutes.ts'), 'utf8');
    expect(source).toContain(`req.header(ACCOUNT_DELETE_FAILURE_HEADER)`);
    const decisionIndex = source.indexOf('accountDeleteFailureSeamDecision(');
    const persistenceIndex = source.indexOf('if (!supabaseAdmin)');
    const rpcIndex = source.indexOf("supabaseAdmin.rpc('delete_user_career_context'");
    expect(decisionIndex).toBeGreaterThan(-1);
    expect(persistenceIndex).toBeGreaterThan(decisionIndex);
    expect(rpcIndex).toBeGreaterThan(decisionIndex);
    expect(source).toContain('Preview-only deterministic failure seam; no deletion attempted.');
    expect(source).toContain('Preview failure seam is not authorized. No deletion attempted.');
    expect(ACCOUNT_DELETE_FAILURE_HEADER).toBe('x-mockmate-preview-failure');
  });
});
