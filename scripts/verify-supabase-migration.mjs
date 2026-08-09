import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../supabase/migrations');

const files = (await readdir(migrationsDir))
  .filter(file => file.endsWith('.sql'))
  .sort();

console.log(`[Static Check] Verifying ${files.length} Supabase migration file(s) in lexical order: ${files.join(', ')}`);

let combinedSql = '';
for (const file of files) {
  const content = await readFile(path.join(migrationsDir, file), 'utf8');
  combinedSql += `\n--- FILE: ${file} ---\n` + content;
}

const normalizedSql = combinedSql.toLowerCase().replace(/\s+/g, ' ');

const failures = [];

// 1. Verify required tables
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
  'career_context_state',
  'career_context_items',
  'career_context_snapshots',
  'career_context_snapshot_items',
  'career_context_bridges',
];

for (const table of requiredTables) {
  if (!normalizedSql.includes(`create table if not exists public.${table}`)) {
    failures.push(`Missing table definition: ${table}`);
  }
  if (!normalizedSql.includes(`alter table public.${table} enable row level security`)) {
    failures.push(`Missing RLS enablement: ${table}`);
  }
}

// 2. Verify RLS ownership policies
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
  'career_context_state',
  'career_context_items',
  'career_context_snapshots',
  'career_context_bridges',
];

for (const table of ownerTables) {
  const sectionIndex = normalizedSql.indexOf(`on public.${table}`);
  if (sectionIndex === -1) {
    failures.push(`Missing policy section for table: ${table}`);
  } else {
    const tableSection = normalizedSql.slice(sectionIndex);
    if (!tableSection.includes('user_id = auth.uid()')) {
      failures.push(`Missing owner policy user_id guard for table: ${table}`);
    }
  }
}

// 3. Verify RPC definitions & security properties
if (!normalizedSql.includes('create or replace function public.delete_user_career_context')) {
  failures.push('Missing RPC definition: delete_user_career_context');
}

// 4. A prior accepted migration already installs the current ten-argument
// snapshot RPC. Any later forward migration that redefines it must first drop
// that exact signature (or use CREATE OR REPLACE), otherwise an empty database
// migration run fails with PostgreSQL 42723 before runtime assertions begin.
const sourceAuthorityMigration = await readFile(
  path.join(migrationsDir, '20260809010000_p0_3_source_and_clearspeak_authority.sql'),
  'utf8',
);
const snapshot10Signature =
  'public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT,BIGINT)';
const snapshot10Drop = sourceAuthorityMigration.indexOf(`DROP FUNCTION IF EXISTS ${snapshot10Signature};`);
const snapshot10Create = sourceAuthorityMigration.indexOf('CREATE FUNCTION public.create_grounding_snapshot_tx(');
if (snapshot10Drop === -1 || snapshot10Create === -1 || snapshot10Drop > snapshot10Create) {
  failures.push('The source-authority migration must safely replace the existing ten-argument create_grounding_snapshot_tx signature');
}

if (failures.length > 0) {
  console.error('Supabase migration static verification FAILED with errors:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[Static Check] All Supabase migration static & structural checks PASSED successfully!');
