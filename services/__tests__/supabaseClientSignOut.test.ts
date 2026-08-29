describe('Supabase sign-out authority', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('rejects when Supabase resolves signOut with an error', async () => {
    const providerSignOut = jest.fn().mockResolvedValue({
      error: { message: 'remote sign-out failed', status: 503 },
    });
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({ auth: { signOut: providerSignOut } }),
    }));

    const { signOut } = await import('../supabaseClient');
    await expect(signOut()).rejects.toMatchObject({
      message: 'remote sign-out failed',
      code: 'auth/signout-failed',
    });
    expect(providerSignOut).toHaveBeenCalledTimes(1);
  });

  it('resolves only when Supabase confirms sign-out', async () => {
    const providerSignOut = jest.fn().mockResolvedValue({ error: null });
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({ auth: { signOut: providerSignOut } }),
    }));

    const { signOut } = await import('../supabaseClient');
    await expect(signOut()).resolves.toBeUndefined();
  });
});
