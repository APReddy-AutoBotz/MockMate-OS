import crypto from 'crypto';
import { supabaseAdmin } from '../supabaseAdmin';

const memoryCache = new Map<string, { payload: unknown; expiresAt: number }>();

export function hashText(input: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(input).toLowerCase().replace(/\s+/g, ' ').trim())
    .digest('hex');
}

export async function getCachedResult<T>(kind: string, cacheKey: string): Promise<T | null> {
  const key = `${kind}:${cacheKey}`;
  if (!supabaseAdmin) {
    const cached = memoryCache.get(key);
    if (!cached || cached.expiresAt < Date.now()) return null;
    return cached.payload as T;
  }

  const { data, error } = await supabaseAdmin
    .from('ai_cache')
    .select('payload, expires_at')
    .eq('cache_key', key)
    .eq('kind', kind)
    .maybeSingle();

  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload as T;
}

export async function setCachedResult(kind: string, cacheKey: string, payload: unknown, ttlHours = 24): Promise<void> {
  const key = `${kind}:${cacheKey}`;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  if (!supabaseAdmin) {
    memoryCache.set(key, { payload, expiresAt: new Date(expiresAt).getTime() });
    return;
  }

  await supabaseAdmin.from('ai_cache').upsert({
    cache_key: key,
    kind,
    payload,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  });
}
