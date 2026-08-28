const ZONED_RFC3339_TIMESTAMP = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

type PersistenceTimestampError = Error & { status: number };

function invalidTimestamp(fieldName: string): PersistenceTimestampError {
  const error = new Error(
    `Authoritative persistence returned an invalid ${fieldName} timestamp`
  ) as PersistenceTimestampError;
  error.status = 503;
  return error;
}

/**
 * Normalize Supabase/PostgREST TIMESTAMPTZ output to the API's canonical UTC
 * representation. PostgREST commonly returns an offset and microseconds, while
 * the public Career Context schemas intentionally require a UTC `Z` timestamp.
 */
export function normalizeRequiredDbTimestamp(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') throw invalidTimestamp(fieldName);

  const match = ZONED_RFC3339_TIMESTAMP.exec(value);
  if (!match) throw invalidTimestamp(fieldName);

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
  ].map(Number);

  // Date.parse normalizes invalid calendar dates, so validate the source date
  // components independently before using it for timezone conversion.
  const calendarProbe = new Date(0);
  calendarProbe.setUTCFullYear(year, month - 1, day);
  calendarProbe.setUTCHours(hour, minute, second, 0);
  if (
    calendarProbe.getUTCFullYear() !== year ||
    calendarProbe.getUTCMonth() !== month - 1 ||
    calendarProbe.getUTCDate() !== day ||
    calendarProbe.getUTCHours() !== hour ||
    calendarProbe.getUTCMinutes() !== minute ||
    calendarProbe.getUTCSeconds() !== second
  ) {
    throw invalidTimestamp(fieldName);
  }

  const epochMilliseconds = Date.parse(value);
  if (!Number.isFinite(epochMilliseconds)) throw invalidTimestamp(fieldName);
  return new Date(epochMilliseconds).toISOString();
}

export function normalizeOptionalDbTimestamp(
  value: unknown,
  fieldName: string
): string | undefined {
  if (value === null || value === undefined) return undefined;
  return normalizeRequiredDbTimestamp(value, fieldName);
}
