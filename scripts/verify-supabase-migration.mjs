import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../supabase/migrations');

const files = (await readdir(migrationsDir))
  .filter(file => file.endsWith('.sql'))
  .sort();

console.log(`Verifying ${files.length} Supabase migration file(s) in lexical order: ${files.join(', ')}`);

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

// 3. Verify corrective session columns
const sessionColumns = [
  'current_question_index',
  'pending_question_id',
  'pending_question',
  'evaluation_status',
  'evaluation_error_code',
  'engine_version',
  'session_version',
  'current_root_question_index',
  'current_turn_index',
  'current_stage',
  'pending_question_kind',
  'active_root_question_id',
  'probe_count_for_root',
  'challenge_count',
  'adaptive_policy',
  'dimension_state',
  'last_controller_decision',
];

for (const col of sessionColumns) {
  if (!normalizedSql.includes(col)) {
    failures.push(`Missing session column: ${col}`);
  }
}

// 4. Verify adaptive turn columns
const turnColumns = [
  'question_id',
  'client_submission_id',
  'question_blueprint',
  'question_kind',
  'root_question_id',
  'stage',
  'answer_kind',
  'evaluation_status',
  'turn_evaluation',
  'controller_decision',
  'challenge_event',
  'engine_version',
  'adaptive_response',
  'adaptive_request_hash',
];

for (const col of turnColumns) {
  if (!normalizedSql.includes(col)) {
    failures.push(`Missing turn column: ${col}`);
  }
}

// 5. Verify unique session/client_submission_id index
if (!normalizedSql.includes('idx_interview_turns_session_client_sub')) {
  failures.push('Missing unique index: idx_interview_turns_session_client_sub');
}

// 6. Verify RPC definitions & security properties
if (!normalizedSql.includes('create or replace function public.atomic_submit_answer')) {
  failures.push('Missing RPC definition: atomic_submit_answer');
}

if (!normalizedSql.includes('create or replace function public.atomic_submit_adaptive_turn')) {
  failures.push('Missing RPC definition: atomic_submit_adaptive_turn');
} else {
  const rpcStart = normalizedSql.indexOf('create or replace function public.atomic_submit_adaptive_turn');
  const rpcEnd = normalizedSql.indexOf('$$;', rpcStart);
  const rpcBody = rpcEnd !== -1 ? normalizedSql.substring(rpcStart, rpcEnd) : normalizedSql.substring(rpcStart);

  if (!rpcBody.includes('security definer')) {
    failures.push('RPC atomic_submit_adaptive_turn must be SECURITY DEFINER');
  }
  if (!rpcBody.includes('search_path = public, pg_temp')) {
    failures.push('RPC atomic_submit_adaptive_turn must set search_path = public, pg_temp');
  }
  if (rpcBody.includes('completed_at')) {
    failures.push('RPC atomic_submit_adaptive_turn must NOT assign completed_at timestamp');
  }
}

if (!normalizedSql.includes('from public')) {
  failures.push('RPCs must REVOKE permissions FROM PUBLIC');
}

if (!normalizedSql.includes('from anon')) {
  failures.push('RPCs must REVOKE permissions FROM anon');
}

if (!normalizedSql.includes('from authenticated')) {
  failures.push('RPCs must REVOKE permissions FROM authenticated');
}

if (!normalizedSql.includes('grant execute on function public.atomic_submit_adaptive_turn') || !normalizedSql.includes('to service_role')) {
  failures.push('RPC atomic_submit_adaptive_turn must GRANT EXECUTE TO service_role');
}

if (failures.length > 0) {
  console.error('Supabase migration verification FAILED with errors:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('All Supabase migration static & structural checks PASSED successfully!');
