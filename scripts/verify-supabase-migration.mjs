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

// 5. Resume-score cache responses must remain subordinate to one durable,
// user-owned source record and must follow account/auth-identity deletion.
const resumeScoreProvenanceMigration = (
  await readFile(
    path.join(migrationsDir, '20260828110000_p0_8_resume_score_provenance.sql'),
    'utf8',
  )
).toLowerCase().replace(/\s+/g, ' ');
if (!resumeScoreProvenanceMigration.includes('add column if not exists request_hash text')) {
  failures.push('Resume reviews must record exact governed score request identity');
}
if (!/unique \(user_id, request_hash\)/.test(resumeScoreProvenanceMigration)) {
  failures.push('Resume review request identity must be unique per user');
}
if (!resumeScoreProvenanceMigration.includes('add column if not exists user_id uuid')) {
  failures.push('AI cache must support explicit user ownership');
}
if (!/foreign key \(user_id\) references auth\.users\(id\) on delete cascade/.test(resumeScoreProvenanceMigration)) {
  failures.push('Owned AI cache must follow Auth identity deletion');
}
if (!resumeScoreProvenanceMigration.includes("where kind in ('resume_score_governed_v2', 'resume_suggest_governed_v1')")) {
  failures.push('Legacy ownerless resume score and suggestion cache entries must be purged');
}
if (!resumeScoreProvenanceMigration.includes('create policy "resume reviews owner read"')) {
  failures.push('Resume reviews must retain an owner-only read policy');
}
if (!resumeScoreProvenanceMigration.includes('revoke all on public.resume_reviews, public.ai_cache')) {
  failures.push('Authenticated clients must not mutate server-authored resume review provenance');
}
if (!resumeScoreProvenanceMigration.includes('grant select on public.resume_reviews to authenticated')) {
  failures.push('Authenticated owners must retain read access to resume reviews');
}
if (!resumeScoreProvenanceMigration.includes('grant select, insert, update, delete on public.resume_reviews, public.ai_cache to service_role')) {
  failures.push('Service role must retain explicit resume review and owned-cache persistence privileges');
}

if (failures.length > 0) {
  console.error('Supabase migration static verification FAILED with errors:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[Static Check] All Supabase migration static & structural checks PASSED successfully!');
