import { CreatorStudio } from '../../components/creator-studio';
import { resolveCreatorRuntime } from '../../lib/runtime';
import { createCreatorSupabaseServerClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CreatorStudioPage() {
  const runtime = resolveCreatorRuntime();
  let initialUser: Readonly<{ id: string; email: string | null }> | null = null;

  if (runtime.executionMode === 'supabase') {
    try {
      const client = await createCreatorSupabaseServerClient();
      const { data } = await client.auth.getUser();
      if (data.user) {
        initialUser = { id: data.user.id, email: data.user.email ?? null };
      }
    } catch {
      initialUser = null;
    }
  }

  return <CreatorStudio runtime={runtime} initialUser={initialUser} />;
}
