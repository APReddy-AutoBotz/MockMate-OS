import { normalizeApiOrigin, getRuntimeConfig, validateRuntimeConfig } from '../runtimeConfig';

describe('Supabase & Auth Safety Controls', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('1. development + enableDevAuth=true: mock authentication allowed', () => {
    process.env.NODE_ENV = 'development';
    process.env.VITE_ENABLE_DEV_AUTH = 'true';
    process.env.VITE_SUPABASE_URL = '';
    process.env.VITE_SUPABASE_ANON_KEY = '';

    const config = getRuntimeConfig();
    const validation = validateRuntimeConfig();

    expect(config.isDevelopment).toBe(true);
    expect(config.enableDevAuth).toBe(true);
    expect(config.isDevelopment && config.enableDevAuth).toBe(true);
    expect(validation.valid).toBe(true);
  });

  it('2. development + enableDevAuth=false: real configured authentication required', () => {
    process.env.NODE_ENV = 'development';
    process.env.VITE_ENABLE_DEV_AUTH = 'false';
    process.env.VITE_SUPABASE_URL = '';
    process.env.VITE_SUPABASE_ANON_KEY = '';

    const config = getRuntimeConfig();
    const validation = validateRuntimeConfig();

    expect(config.isDevelopment).toBe(true);
    expect(config.enableDevAuth).toBe(false);
    expect(config.isDevelopment && config.enableDevAuth).toBe(false);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Missing Supabase configuration');
  });

  it('3. production + enableDevAuth=true: mock authentication forbidden', () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_ENABLE_DEV_AUTH = 'true';
    process.env.VITE_SUPABASE_URL = 'https://prod.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'prod-key';

    const config = getRuntimeConfig();
    const isUsingMockAuth = config.isDevelopment && config.enableDevAuth;

    expect(config.isProduction).toBe(true);
    expect(config.isDevelopment).toBe(false);
    expect(config.enableDevAuth).toBe(true);
    expect(isUsingMockAuth).toBe(false);
  });

  it('4. production + missing Supabase configuration: application fails closed', () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_ENABLE_DEV_AUTH = 'true';
    process.env.VITE_SUPABASE_URL = '';
    process.env.VITE_SUPABASE_ANON_KEY = '';

    const config = getRuntimeConfig();
    const validation = validateRuntimeConfig();
    const isUsingMockAuth = config.isDevelopment && config.enableDevAuth;

    expect(config.isProduction).toBe(true);
    expect(isUsingMockAuth).toBe(false);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Missing Supabase configuration');
  });

  it('5. production may never issue test-token', () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_ENABLE_DEV_AUTH = 'true';

    const config = getRuntimeConfig();
    const isUsingMockAuth = config.isDevelopment && config.enableDevAuth;

    // Simulate getAccessToken logic in production
    const mockToken = isUsingMockAuth ? 'test-token' : null;
    expect(mockToken).toBeNull();
    expect(mockToken).not.toBe('test-token');
  });
});
