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

// 3. Verify corrective columns in migration 20260721
const requiredColumns = [
  'current_question_index',
  'pending_question_id',
  'pending_question',
  'evaluation_status',
  'evaluation_error_code',
];

for (const col of requiredColumns) {
  if (!normalizedSql.includes(col)) {
    failures.push(`Missing corrective column in interview_sessions: ${col}`);
  }
}

// 4. Verify question_id column in interview_turns
if (!normalizedSql.includes('add column if not exists question_id')) {
  failures.push('Missing question_id column in interview_turns');
}

// 5. Verify RPC atomic_submit_answer requirements
if (!normalizedSql.includes('create or replace function public.atomic_submit_answer')) {
  failures.push('Missing RPC definition: atomic_submit_answer');
}

if (!normalizedSql.includes('insert into public.interview_turns')) {
  failures.push('RPC atomic_submit_answer must insert into public.interview_turns');
}

if (!normalizedSql.includes('user_id,')) {
  failures.push('RPC atomic_submit_answer must insert user_id into interview_turns');
}

if (normalizedSql.includes('interview_sessions.history') || normalizedSql.includes('sessions.history')) {
  failures.push('RPC atomic_submit_answer must NOT reference interview_sessions.history');
}

if (!normalizedSql.includes("status = case when p_is_last then 'awaiting_report' else 'active' end")) {
  failures.push('RPC atomic_submit_answer must set status to awaiting_report on final answer');
}

// Verify completed_at is NOT set during answer submission
if (normalizedSql.includes('completed_at = now()')) {
  failures.push('RPC atomic_submit_answer must not set completed_at during answer submission');
}

if (failures.length > 0) {
  console.error('Supabase migration verification FAILED with errors:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('All Supabase migration static & structural checks PASSED successfully!');
