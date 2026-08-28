import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin';

type CacheScope = { userId?: string };

const memoryCache = new Map<string, {
  payload: unknown;
  expiresAt: number;
  userId: string | null;
}>();

const canonicalizeJson = (input: unknown): unknown => {
  if (Array.isArray(input)) return input.map(canonicalizeJson);
  if (input && typeof input === 'object') {
    return Object.keys(input as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalizeJson((input as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return input;
};

export function hashText(input: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(input).toLowerCase().replace(/\s+/g, ' ').trim())
    .digest('hex');
}

// Unlike hashText, this preserves string case and whitespace while making
// object-key order irrelevant. It is suitable for durable request identity.
export function hashExactJson(input: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalizeJson(input)))
    .digest('hex');
}

export async function getCachedResult<T>(
  kind: string,
  cacheKey: string,
  scope: CacheScope = {},
): Promise<T | null> {
  const key = `${kind}:${cacheKey}`;
  const ownerUserId = scope.userId ?? null;
  if (!supabaseAdmin) {
    const cached = memoryCache.get(key);
    if (!cached || cached.userId !== ownerUserId || cached.expiresAt < Date.now()) return null;
    return cached.payload as T;
  }

  let query = supabaseAdmin
    .from('ai_cache')
    .select('payload, expires_at')
    .eq('cache_key', key)
    .eq('kind', kind);
  query = ownerUserId
    ? query.eq('user_id', ownerUserId)
    : query.is('user_id', null);

  const { data, error } = await query.maybeSingle();

  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload as T;
}

export async function setCachedResult(
  kind: string,
  cacheKey: string,
  payload: unknown,
  ttlHours = 24,
  scope: CacheScope = {},
): Promise<void> {
  const key = `${kind}:${cacheKey}`;
  const ownerUserId = scope.userId ?? null;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  if (!supabaseAdmin) {
    memoryCache.set(key, { payload, expiresAt: new Date(expiresAt).getTime(), userId: ownerUserId });
    return;
  }

  await supabaseAdmin.from('ai_cache').upsert({
    cache_key: key,
    kind,
    payload,
    user_id: ownerUserId,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  });
}
