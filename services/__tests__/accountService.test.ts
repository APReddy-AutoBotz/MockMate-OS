import { deleteMyData, clearLocalPracticeData } from '../accountService';
import { apiClient } from '../apiClient';

describe('accountService — Delete My Data & Local Practice Storage Integrity', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};

    const localStorageMock = {
      getItem: (key: string) => (key in mockStorage ? mockStorage[key] : null),
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      key: (index: number) => Object.keys(mockStorage)[index] || null,
      get length() {
        return Object.keys(mockStorage).length;
      },
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    jest.restoreAllMocks();
  });

  it('1. HTTP 200 + success=true clears mockmate_* keys and preserves non-mockmate keys', async () => {
    localStorage.setItem('mockmate_session_123', 'data1');
    localStorage.setItem('mockmate_user_profile', 'data2');
    localStorage.setItem('other_app_token', 'preserve_me');

    jest.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      success: true,
      operation: 'app_data_deleted',
      deletedTables: ['interview_sessions'],
      failedTables: [],
      authIdentityDeleted: false,
      authIdentityRetainedReason: 'Supabase Auth retained',
      requestId: 'req_123'
    });

    const res = await deleteMyData();
    expect(res.success).toBe(true);
    expect(localStorage.getItem('mockmate_session_123')).toBeNull();
    expect(localStorage.getItem('mockmate_user_profile')).toBeNull();
    expect(localStorage.getItem('other_app_token')).toBe('preserve_me');
  });

  it('2. HTTP 500 error does NOT clear mockmate_* local keys', async () => {
    localStorage.setItem('mockmate_session_123', 'data1');
    jest.spyOn(apiClient, 'delete').mockRejectedValueOnce(new Error('Server error 500'));

    await expect(deleteMyData()).rejects.toThrow('Server error 500');
    expect(localStorage.getItem('mockmate_session_123')).toBe('data1');
  });

  it('3. HTTP 503 service unconfigured error does NOT clear mockmate_* local keys', async () => {
    localStorage.setItem('mockmate_session_123', 'data1');
    jest.spyOn(apiClient, 'delete').mockRejectedValueOnce(new Error('Service unavailable 503'));

    await expect(deleteMyData()).rejects.toThrow('Service unavailable 503');
    expect(localStorage.getItem('mockmate_session_123')).toBe('data1');
  });

  it('4. success=false payload does NOT clear mockmate_* local keys', async () => {
    localStorage.setItem('mockmate_session_123', 'data1');
    jest.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      success: false,
      operation: 'app_data_deleted',
      deletedTables: [],
      failedTables: ['interview_sessions'],
      authIdentityDeleted: false,
      authIdentityRetainedReason: 'Failed',
      requestId: 'req_123'
    });

    const res = await deleteMyData();
    expect(res.success).toBe(false);
    expect(localStorage.getItem('mockmate_session_123')).toBe('data1');
  });

  it('5. clearLocalPracticeData directly clears only mockmate_* keys', () => {
    localStorage.setItem('mockmate_test', '1');
    localStorage.setItem('unrelated', '2');
    clearLocalPracticeData();
    expect(localStorage.getItem('mockmate_test')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('2');
  });
});
