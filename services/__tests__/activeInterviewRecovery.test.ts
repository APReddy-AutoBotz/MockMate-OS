import {
  clearActiveInterviewReference,
  readActiveInterviewReference,
  saveActiveInterviewReference,
} from '../activeInterviewRecovery';

describe('bounded active-interview recovery reference', () => {
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

  it('persists only a version, session id, and timestamp—never answer text or context', () => {
    saveActiveInterviewReference('session-123');
    const raw = localStorage.getItem('mockmate_active_interview') || '';
    expect(JSON.parse(raw)).toEqual({ version: 1, sessionId: 'session-123', savedAt: expect.any(Number) });
    expect(raw).not.toMatch(/answer|resume|jobDescription|transcript/i);
    expect(readActiveInterviewReference()).toEqual({ sessionId: 'session-123' });
  });

  it('fails closed on malformed or stale references', () => {
    localStorage.setItem('mockmate_active_interview', '{broken');
    expect(readActiveInterviewReference()).toBeNull();
    localStorage.setItem('mockmate_active_interview', JSON.stringify({ version: 1, sessionId: 'old', savedAt: 1 }));
    expect(readActiveInterviewReference()).toBeNull();
    localStorage.setItem('mockmate_active_interview', JSON.stringify({ version: 1, sessionId: 'future', savedAt: Date.now() + 60 * 60 * 1000 }));
    expect(readActiveInterviewReference()).toBeNull();
    clearActiveInterviewReference();
  });
});
