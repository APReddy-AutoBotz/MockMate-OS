import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/001_initial_schema.sql', import.meta.url), 'utf8');
const sql = migration.toLowerCase().replace(/\s+/g, ' ');

const requiredTables = [
  'profiles',
  'resume_reviews',
  'interview_sessions',
  'interview_turns',
  'clearspeak_profiles',
  'clearspeak_sessions',
  'clearspeak_progress',
  'clearspeak_ledgers',
  'clearspeak_beta_feedback',
  'usage_ledger',
  'ai_cache',
];

const ownerTables = [
  'profiles',
  'resume_reviews',
  'interview_sessions',
  'interview_turns',
  'clearspeak_profiles',
  'clearspeak_sessions',
  'clearspeak_progress',
  'clearspeak_ledgers',
  'clearspeak_beta_feedback',
];

const failures = [];

for (const table of requiredTables) {
  if (!sql.includes(`create table if not exists public.${table}`)) {
    failures.push(`Missing table: ${table}`);
  }
  if (!sql.includes(`alter table public.${table} enable row level security`)) {
    failures.push(`Missing RLS enablement: ${table}`);
  }
}

for (const table of ownerTables) {
  const tableSection = sql.slice(sql.indexOf(`on public.${table}`));
  if (!tableSection.includes('user_id = auth.uid()')) {
    failures.push(`Missing owner policy user_id guard: ${table}`);
  }
}

if (!sql.includes('create policy "usage owner read" on public.usage_ledger for select using (user_id = auth.uid())')) {
  failures.push('usage_ledger should expose user read only through user_id = auth.uid()');
}

const aiCachePolicyPattern = /create policy "[^"]+" on public\.ai_cache/;
if (aiCachePolicyPattern.test(sql)) {
  failures.push('ai_cache must not have anon/authenticated policies');
}

if (!sql.includes('references auth.users(id) on delete cascade')) {
  failures.push('User-owned tables must cascade when Supabase Auth users are deleted');
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Supabase migration checks passed');
