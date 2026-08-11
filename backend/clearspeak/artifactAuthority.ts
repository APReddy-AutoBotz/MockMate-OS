import crypto from 'crypto';

/** JSONB-compatible, recursively key-sorted representation used for persistence and integrity. */
export function canonicalJsonValue<T>(value: T): T {
  const jsonSafe = JSON.parse(JSON.stringify(value));
  const sort = (current: any): any => {
    if (Array.isArray(current)) return current.map(sort);
    if (current && typeof current === 'object') {
      return Object.keys(current).sort().reduce((result, key) => {
        result[key] = sort(current[key]);
        return result;
      }, {} as Record<string, unknown>);
    }
    return current;
  };
  return sort(jsonSafe);
}

export function hashArtifactContent(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalJsonValue(value))).digest('hex');
}
