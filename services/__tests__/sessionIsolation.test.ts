import {
  bindLocalPracticeDataOwner,
  clearLocalDataAfterConfirmedSignOut,
  deleteAppDataThenAttemptSignOut,
  LOCAL_PRACTICE_OWNER_KEY,
  readLocalUserProfile,
} from '../sessionIsolation';

describe('web session local-data isolation', () => {
  let storage: Record<string, string>;
  beforeEach(() => {
    storage = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => key in storage ? storage[key] : null,
        setItem: (key: string, value: string) => { storage[key] = value; },
        removeItem: (key: string) => { delete storage[key]; },
        clear: () => { storage = {}; },
        key: (index: number) => Object.keys(storage)[index] || null,
        get length() { return Object.keys(storage).length; },
      },
    });
  });

  it('clears legacy and cross-user MockMate data before binding a new owner', () => {
    localStorage.setItem('mockmate_session_history', 'user-a-report');
    localStorage.setItem('unrelated', 'keep');

    expect(bindLocalPracticeDataOwner('user-a')).toBe('cleared');
    localStorage.setItem('mockmate_session_history', 'user-a-report');
    expect(bindLocalPracticeDataOwner('user-a')).toBe('preserved');
    expect(localStorage.getItem('mockmate_session_history')).toBe('user-a-report');

    expect(bindLocalPracticeDataOwner('user-b')).toBe('cleared');
    expect(localStorage.getItem('mockmate_session_history')).toBeNull();
    expect(localStorage.getItem(LOCAL_PRACTICE_OWNER_KEY)).toBe('user-b');
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('keeps the authenticated owner and data when sign-out fails', async () => {
    bindLocalPracticeDataOwner('user-a');
    localStorage.setItem('mockmate_session_history', 'user-a-report');

    await expect(clearLocalDataAfterConfirmedSignOut(async () => {
      throw new Error('offline');
    })).rejects.toThrow('offline');

    expect(localStorage.getItem(LOCAL_PRACTICE_OWNER_KEY)).toBe('user-a');
    expect(localStorage.getItem('mockmate_session_history')).toBe('user-a-report');
  });

  it('rejects malformed local profiles without stalling authenticated startup', () => {
    localStorage.setItem('mockmate_user_profile', '{broken');
    expect(readLocalUserProfile()).toBeNull();
    expect(localStorage.getItem('mockmate_user_profile')).toBeNull();

    localStorage.setItem('mockmate_user_profile', JSON.stringify({ name: 'Asha', targetRole: 'QA', injected: true }));
    expect(readLocalUserProfile()).toEqual({ name: 'Asha', targetRole: 'QA' });
  });

  it('clears all MockMate local data only after sign-out succeeds', async () => {
    bindLocalPracticeDataOwner('user-a');
    localStorage.setItem('mockmate_session_history', 'user-a-report');
    await expect(clearLocalDataAfterConfirmedSignOut(async () => undefined)).resolves.toEqual({ localDataCleared: true });
    expect(localStorage.getItem(LOCAL_PRACTICE_OWNER_KEY)).toBeNull();
    expect(localStorage.getItem('mockmate_session_history')).toBeNull();
  });

  it('reports confirmed deletion truth separately when sign-out cleanup fails', async () => {
    await expect(deleteAppDataThenAttemptSignOut(
      async () => ({ success: true }),
      async () => { throw new Error('session cleanup failed'); },
    )).resolves.toEqual({ deleted: true, signedOut: false, localDataCleared: true });
  });

  it('rejects when server deletion itself is not confirmed', async () => {
    const signOutAction = jest.fn();
    await expect(deleteAppDataThenAttemptSignOut(
      async () => ({ success: false }),
      signOutAction,
    )).rejects.toThrow(/could not confirm/i);
    expect(signOutAction).not.toHaveBeenCalled();
  });

  it('degrades safely when browser storage is unavailable', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => { throw new Error('storage denied'); },
        setItem: () => { throw new Error('storage denied'); },
        removeItem: () => { throw new Error('storage denied'); },
        key: () => { throw new Error('storage denied'); },
        get length() { throw new Error('storage denied'); },
      },
    });

    expect(() => bindLocalPracticeDataOwner('user-a')).not.toThrow();
    expect(bindLocalPracticeDataOwner('user-a')).toBe('storage_unavailable');
    expect(readLocalUserProfile()).toBeNull();
    await expect(clearLocalDataAfterConfirmedSignOut(async () => undefined))
      .resolves.toEqual({ localDataCleared: false });
  });
});
