import { describe, expect, it } from 'vitest';
import { requireSupabaseConfig, runtimeMode } from './runtime';

describe('runtime configuration', () => {
  it('permits deterministic demo and test modes without cloud credentials', () => {
    expect(requireSupabaseConfig({ CREATOR_RUNTIME_MODE: 'demo' })).toBeNull();
    expect(requireSupabaseConfig({ CREATOR_RUNTIME_MODE: 'test' })).toBeNull();
  });
  it('fails closed outside authorized mock modes', () => {
    expect(() => requireSupabaseConfig({ CREATOR_RUNTIME_MODE: 'preview' })).toThrow('SUPABASE_CONFIGURATION_REQUIRED');
    expect(() => requireSupabaseConfig({ CREATOR_RUNTIME_MODE: 'production' })).toThrow('SUPABASE_CONFIGURATION_REQUIRED');
    expect(() => runtimeMode({ CREATOR_RUNTIME_MODE: 'development' })).toThrow('INVALID_RUNTIME_MODE');
  });
});
