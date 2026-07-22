import { normalizeApiOrigin } from '../runtimeConfig';

describe('Phase 1: API Origin & Base Normalization Contract', () => {
  test('1. http://localhost:3001 -> apiOrigin: http://localhost:3001, apiBase: http://localhost:3001/api', () => {
    const res = normalizeApiOrigin('http://localhost:3001', { isProd: true });
    expect(res.apiOrigin).toBe('http://localhost:3001');
    expect(res.apiBase).toBe('http://localhost:3001/api');
  });

  test('2. http://localhost:3001/ -> apiOrigin: http://localhost:3001, apiBase: http://localhost:3001/api', () => {
    const res = normalizeApiOrigin('http://localhost:3001/', { isProd: true });
    expect(res.apiOrigin).toBe('http://localhost:3001');
    expect(res.apiBase).toBe('http://localhost:3001/api');
  });

  test('3. http://localhost:3001/api -> apiOrigin: http://localhost:3001, apiBase: http://localhost:3001/api', () => {
    const res = normalizeApiOrigin('http://localhost:3001/api', { isProd: true });
    expect(res.apiOrigin).toBe('http://localhost:3001');
    expect(res.apiBase).toBe('http://localhost:3001/api');
  });

  test('4. empty production value -> apiOrigin: "", apiBase: "/api"', () => {
    const res = normalizeApiOrigin('', { isProd: true });
    expect(res.apiOrigin).toBe('');
    expect(res.apiBase).toBe('/api');
  });

  test('5. endpoint interview/calibrate resolves to /api/interview/calibrate relative base', () => {
    const res = normalizeApiOrigin('', { isProd: true });
    const endpoint = 'interview/calibrate';
    const fullRoute = `${res.apiBase}/${endpoint}`;
    expect(fullRoute).toBe('/api/interview/calibrate');
  });
});
