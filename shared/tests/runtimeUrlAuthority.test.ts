import { isLoopbackHostname, isValidRuntimeUrl } from '../src/index';

describe('canonical runtime URL authority', () => {
  test.each([
    'localhost', 'LOCALHOST', 'localhost.', 'LoCaLhOsT...', 'fixture.localhost', 'fixture.localhost.',
    '127.0.0.1', '127.0.0.2', '127.255.255.255',
    '::1', '[::1]', '0:0:0:0:0:0:0:1',
    '::ffff:7f00:1', '[::ffff:7f7f:ffff]',
  ])('recognizes loopback hostname %s', hostname => {
    expect(isLoopbackHostname(hostname)).toBe(true);
  });

  test.each([
    'example.com', 'localhost.example.com', '126.255.255.255', '128.0.0.1',
    '::2', '2001:db8::1', '::ffff:8000:1',
  ])('does not broaden loopback policy to %s', hostname => {
    expect(isLoopbackHostname(hostname)).toBe(false);
  });

  test.each([
    'https://localhost./',
    'https://fixture.LOCALHOST./',
    'https://127.1/',
    'https://0177.0.0.1/',
    'https://2130706433/',
    'https://127.255.255.255/',
    'https://[0:0:0:0:0:0:0:1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:7f00:1]/',
  ])('rejects URL-parser-normalized loopback URL %s in release-like mode', value => {
    expect(isValidRuntimeUrl(value, { httpsRequired: true, forbidLoopback: true })).toBe(false);
  });

  test.each([
    'https://user@example.com',
    'https://:password@example.com',
    'http://example.com',
    'ftp://example.com',
    'not a URL',
  ])('rejects malformed or forbidden release-like URL %s', value => {
    expect(isValidRuntimeUrl(value, { httpsRequired: true, forbidLoopback: true })).toBe(false);
  });

  it('retains explicitly bounded development and test loopback fixtures', () => {
    expect(isValidRuntimeUrl('http://127.0.0.1:3001', { httpsRequired: false, forbidLoopback: false })).toBe(true);
    expect(isValidRuntimeUrl('http://[::1]:54321', { httpsRequired: false, forbidLoopback: false })).toBe(true);
  });

  it('enforces origin-only URL boundaries', () => {
    expect(isValidRuntimeUrl('https://example.com', { httpsRequired: true, forbidLoopback: true, originOnly: true })).toBe(true);
    for (const value of ['https://example.com/path', 'https://example.com/?query=1', 'https://example.com/#fragment']) {
      expect(isValidRuntimeUrl(value, { httpsRequired: true, forbidLoopback: true, originOnly: true })).toBe(false);
    }
  });
});
