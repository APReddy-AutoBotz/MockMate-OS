import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireSupabaseConfig } from '../runtime';

export async function createCreatorServerClient() {
  const config = requireSupabaseConfig();
  if (!config) throw new Error('SUPABASE_CLIENT_UNAVAILABLE_IN_DEMO_MODE');
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => store.set(name, value, options))
    }
  });
}
