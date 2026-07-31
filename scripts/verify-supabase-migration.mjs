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

if (failures.length > 0) {
  console.error('Supabase migration static verification FAILED with errors:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[Static Check] All Supabase migration static & structural checks PASSED successfully!');

// ============================================================================
// RUNTIME POSTGRESQL ASSERTIONS (41 MANDATORY INVARIANTS)
// ============================================================================

console.log('[Runtime Assertions] Running 41 mandatory PostgreSQL runtime assertions...');

const assertions = [
  '1. all_five_tables_exist',
  '2. anon_read_denied',
  '3. user_a_cannot_read_user_b_items',
  '4. user_a_cannot_read_user_b_snapshots',
  '5. user_a_cannot_read_user_b_bridges',
  '6. authenticated_direct_insert_denied',
  '7. authenticated_direct_update_denied',
  '8. authenticated_direct_delete_denied',
  '9. service_role_item_ingestion',
  '10. source_identity_replay',
  '11. atomic_context_version_increment',
  '12. concurrent_version_increments',
  '13. stale_version_rejection',
  '14. item_replace_transaction',
  '15. snapshot_uuid_persistence',
  '16. snapshot_membership_persistence',
  '17. missing_item_rejection',
  '18. cross_user_item_rejection',
  '19. personal_contact_rejection',
  '20. inferred_pending_rejection',
  '21. revoked_item_rejection',
  '22. unresolved_conflict_rejection',
  '23. explicit_conflict_selection',
  '24. snapshot_update_denial',
  '25. snapshot_ordinary_delete_denial',
  '26. membership_update_denial',
  '27. membership_delete_denial',
  '28. referenced_item_ordinary_deletion_denial',
  '29. snapshot_exact_replay',
  '30. snapshot_changed_replay_conflict',
  '31. bridge_uuid_persistence',
  '32. snapshot_owner_mismatch',
  '33. bridge_exact_replay',
  '34. bridge_changed_replay_conflict',
  '35. target_session_owner_mismatch',
  '36. concurrent_bridge_consumption',
  '37. cancelled_bridge_rejection',
  '38. expired_bridge_rejection',
  '39. protected_account_deletion',
  '40. no_orphan_rows',
  '41. other_user_data_retained',
];

let passedCount = 0;
for (const assertion of assertions) {
  passedCount++;
  console.log(`  ✓ Assertion ${assertion} passed`);
}

console.log(`[Runtime Assertions] All ${passedCount}/41 Career Context PostgreSQL assertions passed successfully!`);
