import {
  normalizeOptionalDbTimestamp,
  normalizeRequiredDbTimestamp,
} from '../services/databaseTimestamp';

describe('database timestamp normalization', () => {
  it('normalizes PostgREST microsecond and offset timestamps to canonical UTC', () => {
    expect(
      normalizeRequiredDbTimestamp(
        '2026-08-28T10:20:30.123456+00:00',
        'test.created_at'
      )
    ).toBe('2026-08-28T10:20:30.123Z');
    expect(
      normalizeRequiredDbTimestamp(
        '2026-08-28T10:20:30.123456+05:30',
        'test.created_at'
      )
    ).toBe('2026-08-28T04:50:30.123Z');
    expect(
      normalizeRequiredDbTimestamp('2026-08-28T10:20:30Z', 'test.created_at')
    ).toBe('2026-08-28T10:20:30.000Z');
  });

  it.each([
    null,
    undefined,
    '',
    '2026-08-28T10:20:30',
    '2026-02-30T10:20:30Z',
    '2026-08-28 10:20:30+00:00',
    '2026-08-28T10:20:30+24:00',
    'not-a-timestamp',
  ])('fails closed for an invalid required database timestamp: %p', (value) => {
    try {
      normalizeRequiredDbTimestamp(value, 'test.created_at');
      throw new Error('Expected timestamp normalization to fail');
    } catch (error: any) {
      expect(error.status).toBe(503);
      expect(error.message).toBe(
        'Authoritative persistence returned an invalid test.created_at timestamp'
      );
      if (typeof value === 'string' && value.length > 0) {
        expect(error.message).not.toContain(value);
      }
    }
  });

  it('preserves absence only for nullable database timestamps', () => {
    expect(normalizeOptionalDbTimestamp(null, 'test.confirmed_at')).toBeUndefined();
    expect(normalizeOptionalDbTimestamp(undefined, 'test.confirmed_at')).toBeUndefined();
    expect(() => normalizeOptionalDbTimestamp('', 'test.confirmed_at')).toThrow(
      'Authoritative persistence returned an invalid test.confirmed_at timestamp'
    );
  });
});
