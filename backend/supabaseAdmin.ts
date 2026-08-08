import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);

export let supabaseAdmin: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Installs a server-authoritative persistence double for HTTP integration tests.
 * Production and development callers must configure Supabase through environment
 * variables instead; keeping this hook test-only prevents it becoming a runtime
 * persistence fallback.
 */
export function installSupabaseAdminForTest(client: SupabaseClient | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Supabase test persistence can only be installed in NODE_ENV=test');
  }
  supabaseAdmin = client;
}

export function requireSupabase(): SupabaseClient {
  if (!supabaseAdmin) {
    throw new Error('Supabase service role is not configured');
  }
  return supabaseAdmin;
}
