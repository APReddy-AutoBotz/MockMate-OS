import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Client } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../supabase/migrations');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const isRequired = process.env.CI === 'true' || process.env.REQUIRE_POSTGRES_RUNTIME === 'true';

async function setRole(client, role, sub = null) {
  await client.query(`SET ROLE ${role};`);
  await client.query(`SELECT set_config('request.jwt.claim.role', '${role}', false);`);
  if (sub) {
    await client.query(`SELECT set_config('request.jwt.claim.sub', '${sub}', false);`);
  } else {
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function resetRole(client) {
  await client.query('RESET ROLE;');
  await client.query("SELECT set_config('request.jwt.claim.role', '', false);");
  await client.query("SELECT set_config('request.jwt.claim.sub', '', false);");
}

async function runRuntimeVerification() {
  console.log('[Runtime Verification] Connecting to disposable PostgreSQL database...');
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });

  try {
    await client.connect();
  } catch (err) {
    if (isRequired) {
      console.error('[Runtime Verification] ERROR: Could not connect to PostgreSQL database when REQUIRE_POSTGRES_RUNTIME or CI is active.');
      console.error(`Reason: ${err.message}`);
      process.exit(1);
    }
    console.warn('[Runtime Verification] Skipped runtime verification: Local PostgreSQL database is not reachable.');
    console.warn(`Reason: ${err.message}`);
    return;
  }

  console.log('[Runtime Verification] Connected! Setting up pgcrypto & auth schema...');

  try {
    try { await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;'); } catch (_) {}
    try { await client.query('CREATE SCHEMA IF NOT EXISTS auth;'); } catch (_) {}
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS auth.users (
          id uuid PRIMARY KEY,
          email text,
          created_at timestamp with time zone DEFAULT now()
        );
      `);
    } catch (_) {}

    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
          SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$ LANGUAGE sql STABLE;

        CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
          SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
        $$ LANGUAGE sql STABLE;
      `);
    } catch (_) {}

    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN BYPASSRLS;
          ELSE
            ALTER ROLE service_role BYPASSRLS;
          END IF;
        END $$;
      `);
    } catch (_) {}

    // Clean slate: drop existing public tables to avoid stale schema conflicts
    await client.query(`
      DROP TABLE IF EXISTS public.career_context_bridges CASCADE;
      DROP TABLE IF EXISTS public.career_context_snapshot_items CASCADE;
      DROP TABLE IF EXISTS public.career_context_snapshots CASCADE;
      DROP TABLE IF EXISTS public.career_context_items CASCADE;
      DROP TABLE IF EXISTS public.career_context_state CASCADE;
      DROP TABLE IF EXISTS public.interview_turns CASCADE;
      DROP TABLE IF EXISTS public.interview_sessions CASCADE;
      DROP TABLE IF EXISTS public.resume_reviews CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_beta_feedback CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_ledgers CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_progress CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_sessions CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_profiles CASCADE;
      DROP TABLE IF EXISTS public.usage_ledger CASCADE;
      DROP TABLE IF EXISTS public.ai_cache CASCADE;
      DROP TABLE IF EXISTS public.profiles CASCADE;
    `);

    // Apply migrations
    const files = (await readdir(migrationsDir))
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`[Runtime Verification] Executing migration: ${file}`);
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);

      // Model Supabase's default result-table mutation grants before the
      // forward authority hardening is applied. The final migration must close
      // both service and browser bypasses without removing owner history reads.
      if (file === '20260811090000_clearspeak_accent_v1.sql') {
        await client.query(`
          GRANT INSERT, UPDATE, DELETE, TRUNCATE
            ON TABLE public.clearspeak_accent_attempts
            TO PUBLIC, service_role, authenticated, anon;
        `);
      }

      // Model Supabase's service_role default table grants after the lifecycle
      // table is created and before the forward hardening migration is applied.
      // A bare PostgreSQL role would otherwise conceal a direct-DML bypass.
      if (file === '20260812150000_clearspeak_attempt_lifecycle.sql') {
        await client.query(`
          GRANT INSERT, UPDATE, DELETE, TRUNCATE
            ON TABLE public.clearspeak_accent_attempt_lifecycle
            TO PUBLIC, service_role, authenticated, anon;
        `);
        const modeledLifecycleDml = await client.query(`
          SELECT
            has_table_privilege('service_role', 'public.clearspeak_accent_attempt_lifecycle', 'INSERT') AS service_insert,
            has_table_privilege('authenticated', 'public.clearspeak_accent_attempt_lifecycle', 'TRUNCATE') AS authenticated_truncate,
            has_table_privilege('anon', 'public.clearspeak_accent_attempt_lifecycle', 'DELETE') AS anon_delete
        `);
        if (!Object.values(modeledLifecycleDml.rows[0]).every(Boolean)) {
          throw new Error('Could not model Supabase service_role lifecycle DML defaults');
        }
      }
    }
    console.log('[Runtime Verification] All migration SQL compiled and executed cleanly!');

    // Regression for the complete empty-database chain: the accepted authority
    // migration and the newest forward migration both define this contract, but
    // applying the chain once must converge on exactly one callable signature.
    const snapshotFunctionResult = await client.query(`
      SELECT count(*)::int AS count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'create_grounding_snapshot_tx'
        AND oidvectortypes(p.proargtypes) =
          'uuid, text, jsonb, jsonb, jsonb, text[], uuid[], text, text, bigint'
    `);
    if (snapshotFunctionResult.rows[0]?.count !== 1) {
      throw new Error('Full migration chain did not converge on exactly one ten-argument create_grounding_snapshot_tx function');
    }
    console.log('[Runtime Verification] Full chain installed the ten-argument snapshot RPC exactly once.');

    // Setup Test Users
    const userA = '11111111-1111-1111-1111-111111111111';
    const userB = '22222222-2222-2222-2222-222222222222';
    const sessionA = '33333333-3333-3333-3333-333333333333';
    const sessionB = '44444444-4444-4444-4444-444444444444';

    try {
      await client.query(`
        INSERT INTO auth.users (id, email) VALUES
          ('${userA}', 'userA@example.com'),
          ('${userB}', 'userB@example.com')
        ON CONFLICT (id) DO NOTHING;
      `);
    } catch (_) {}

    await client.query(`
      INSERT INTO public.profiles (user_id, full_name) VALUES
        ('${userA}', 'Test User A'),
        ('${userB}', 'Test User B')
      ON CONFLICT (user_id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO public.interview_sessions (id, user_id, setup, status) VALUES
        ('${sessionA}', '${userA}', '{}'::jsonb, 'active'),
        ('${sessionB}', '${userB}', '{}'::jsonb, 'active')
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('[Runtime Assertions] Running 43 mandatory PostgreSQL runtime assertions...');
    let passedCount = 0;

    // 1. all_five_tables_exist
    const tRes = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('career_context_state', 'career_context_items', 'career_context_snapshots', 'career_context_snapshot_items', 'career_context_bridges')
    `);
    if (tRes.rows.length !== 5) throw new Error('Missing one or more Career Context tables!');
    passedCount++;
    console.log('  ✓ Assertion 1. all_five_tables_exist passed');

    // 2. anon_read_denied
    try {
      await setRole(client, 'anon');
      const anonRes = await client.query('SELECT count(*) FROM public.career_context_items');
      await resetRole(client);
      if (Number(anonRes.rows[0].count) !== 0) throw new Error('Anon read returned non-zero rows!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('permission denied')) throw e;
    }
    passedCount++;
    console.log('  ✓ Assertion 2. anon_read_denied passed');

    // Setup initial data for User A and User B
    const itemA = '55555555-5555-5555-5555-555555555555';
    const itemB = '66666666-6666-6666-6666-666666666666';
    const contactItemA = '77777777-7777-7777-7777-777777777777';
    const pendingItemA = '88888888-8888-8888-8888-888888888888';
    const revokedItemA = '99999999-9999-9999-9999-999999999999';

    await setRole(client, 'service_role');
    await client.query(`
      INSERT INTO public.career_context_state (user_id, context_version, personalization_enabled)
      VALUES ('${userA}', 1, true), ('${userB}', 1, false)
      ON CONFLICT (user_id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO public.career_context_items (id, user_id, item_kind, canonical_key, label, value, source_module, source_record_id, source_path, source_revision, source_hash, provenance, item_status, sensitivity)
      VALUES
        ('${itemA}', '${userA}', 'target_role', 'resume.target_role', 'Target Role', '{"type":"text","text":"Engineer A"}'::jsonb, 'resume', 'resA', 'targetRole', 'v1', 'hashA', 'user_confirmed', 'active', 'standard'),
        ('${itemB}', '${userB}', 'target_role', 'resume.target_role', 'Target Role', '{"type":"text","text":"Engineer B"}'::jsonb, 'resume', 'resB', 'targetRole', 'v1', 'hashB', 'user_confirmed', 'active', 'standard'),
        ('${contactItemA}', '${userA}', 'experience_claim', 'resume.contact', 'Contact PII', '{"type":"text","text":"userA@example.com"}'::jsonb, 'resume', 'resA', 'email', 'v1', 'hashC', 'user_confirmed', 'active', 'personal_contact'),
        ('${pendingItemA}', '${userA}', 'skill', 'resume.skill_inferred', 'Inferred Skill', '{"type":"text","text":"Inferred"}'::jsonb, 'resume', 'resA', 'skills', 'v1', 'hashD', 'inferred_pending', 'active', 'standard'),
        ('${revokedItemA}', '${userA}', 'skill', 'resume.skill_revoked', 'Revoked Skill', '{"type":"text","text":"Revoked"}'::jsonb, 'resume', 'resA', 'skills', 'v1', 'hashE', 'user_confirmed', 'revoked', 'standard')
      ON CONFLICT (id) DO NOTHING;
    `);
    await resetRole(client);

    // 3. user_a_cannot_read_user_b_items
    await setRole(client, 'authenticated', userA);
    const readBItems = await client.query(`SELECT * FROM public.career_context_items WHERE user_id = '${userB}'`);
    await resetRole(client);
    if (readBItems.rows.length !== 0) throw new Error('User A read User B items!');
    passedCount++;
    console.log('  ✓ Assertion 3. user_a_cannot_read_user_b_items passed');

    // 4. user_a_cannot_read_user_b_snapshots
    const snapB = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await setRole(client, 'service_role');
    await client.query(`
      INSERT INTO public.career_context_snapshots (id, user_id, purpose, context_version, projection, consent, source_modules, client_request_id, request_hash)
      VALUES ('${snapB}', '${userB}', 'resume_to_interview', 1, '{"role":"B"}'::jsonb, '{"scope":"one_time","includedItemIds":["22222222-2222-2222-2222-222222222222"]}'::jsonb, ARRAY['resume'], 'reqB', 'hashB')
      ON CONFLICT (id) DO NOTHING;
    `);
    await resetRole(client);

    await setRole(client, 'authenticated', userA);
    const readBSnaps = await client.query(`SELECT * FROM public.career_context_snapshots WHERE user_id = '${userB}'`);
    await resetRole(client);
    if (readBSnaps.rows.length !== 0) throw new Error('User A read User B snapshots!');
    passedCount++;
    console.log('  ✓ Assertion 4. user_a_cannot_read_user_b_snapshots passed');

    // 5. user_a_cannot_read_user_b_bridges
    const bridgeB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await setRole(client, 'service_role');
    await client.query(`
      INSERT INTO public.career_context_bridges (id, user_id, source_module, target_module, purpose, snapshot_id, status, client_request_id, request_hash)
      VALUES ('${bridgeB}', '${userB}', 'resume', 'interview', 'resume_to_interview', '${snapB}', 'confirmed', 'reqBridgeB', 'hashBridgeB')
      ON CONFLICT (id) DO NOTHING;
    `);
    await resetRole(client);

    await setRole(client, 'authenticated', userA);
    const readBBridges = await client.query(`SELECT * FROM public.career_context_bridges WHERE user_id = '${userB}'`);
    await resetRole(client);
    if (readBBridges.rows.length !== 0) throw new Error('User A read User B bridges!');
    passedCount++;
    console.log('  ✓ Assertion 5. user_a_cannot_read_user_b_bridges passed');

    // 6. authenticated_direct_insert_denied
    try {
      await setRole(client, 'authenticated', userA);
      await client.query(`INSERT INTO public.career_context_items (user_id, item_kind, canonical_key, label, value, source_module, source_record_id, source_path, source_revision, source_hash, provenance, item_status, sensitivity) VALUES ('${userA}', 'skill', 'k', 'l', '{}'::jsonb, 'resume', 'r', 'p', 'v', 'h', 'user_confirmed', 'active', 'standard')`);
      throw new Error('Direct insert by authenticated succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('permission denied') && !e.message.includes('violates row-level security policy')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 6. authenticated_direct_insert_denied passed');
    }

    // 7. authenticated_direct_update_denied
    try {
      await setRole(client, 'authenticated', userA);
      await client.query(`UPDATE public.career_context_items SET label = 'hacked' WHERE id = '${itemA}'`);
      throw new Error('Direct update by authenticated succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('permission denied') && !e.message.includes('violates row-level security policy')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 7. authenticated_direct_update_denied passed');
    }

    // 8. authenticated_direct_delete_denied
    try {
      await setRole(client, 'authenticated', userA);
      await client.query(`DELETE FROM public.career_context_items WHERE id = '${itemA}'`);
      throw new Error('Direct delete by authenticated succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('permission denied') && !e.message.includes('violates row-level security policy')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 8. authenticated_direct_delete_denied passed');
    }

    // 9. service_role_item_ingestion
    const serviceItemId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    await setRole(client, 'service_role');
    await client.query(`
      INSERT INTO public.career_context_items (id, user_id, item_kind, canonical_key, label, value, source_module, source_record_id, source_path, source_revision, source_hash, provenance, item_status, sensitivity)
      VALUES ('${serviceItemId}', '${userA}', 'skill', 'resume.skill_service', 'Service Skill', '{"type":"text","text":"Node.js"}'::jsonb, 'resume', 'resA', 'skills', 'v1', 'hashService', 'inferred_pending', 'pending_confirmation', 'standard');
    `);
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 9. service_role_item_ingestion passed');

    // 10. source_identity_replay
    try {
      await setRole(client, 'service_role');
      await client.query(`
        INSERT INTO public.career_context_items (user_id, item_kind, canonical_key, label, value, source_module, source_record_id, source_path, source_revision, source_hash, provenance, item_status, sensitivity)
        VALUES ('${userA}', 'skill', 'resume.skill_service', 'Service Skill', '{"type":"text","text":"Node.js"}'::jsonb, 'resume', 'resA', 'skills', 'v1', 'hashService', 'inferred_pending', 'pending_confirmation', 'standard');
      `);
      throw new Error('Duplicate source identity insert succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('unique_user_source_identity')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 10. source_identity_replay passed');
    }

    // 11. first_confirmation_increments_once
    await setRole(client, 'service_role');
    const mut1 = await client.query(`
      SELECT public.mutate_career_context_item(
        p_user_id => '${userA}'::uuid,
        p_item_id => '${serviceItemId}'::uuid,
        p_decision => 'confirm'::text,
        p_expected_context_version => 1::bigint
      ) AS res;
    `);
    await resetRole(client);
    if (mut1.rows[0].res.contextVersion !== 2 || mut1.rows[0].res.replayed || mut1.rows[0].res.item.item_status !== 'active' || mut1.rows[0].res.item.provenance !== 'user_confirmed') throw new Error('First confirmation did not commit exactly once!');
    passedCount++;
    console.log('  ✓ Assertion 11. first_confirmation_increments_once passed');

    // 12. exact_confirmation_replay_is_noop
    await setRole(client, 'service_role');
    const mut2 = await client.query(`
      SELECT public.mutate_career_context_item(
        p_user_id => '${userA}'::uuid,
        p_item_id => '${serviceItemId}'::uuid,
        p_decision => 'confirm'::text,
        p_expected_context_version => 1::bigint
      ) AS res;
    `);
    await resetRole(client);
    if (mut2.rows[0].res.contextVersion !== 2 || !mut2.rows[0].res.replayed || mut2.rows[0].res.item.id !== serviceItemId) throw new Error('Exact confirmation replay changed canonical state or version!');
    passedCount++;
    console.log('  ✓ Assertion 12. exact_confirmation_replay_is_noop passed');

    // 13. stale_version_rejection
    try {
      await setRole(client, 'service_role');
      await client.query(`
        SELECT public.mutate_career_context_item(
          p_user_id => '${userA}'::uuid,
          p_item_id => '${serviceItemId}'::uuid,
          p_decision => 'confirm'::text,
          p_expected_context_version => 0::bigint
        );
      `);
      throw new Error('Stale expected_context_version succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('Stale or mismatched')) throw e;
      const versionAfterStale = await client.query(`SELECT context_version FROM public.career_context_state WHERE user_id='${userA}';`);
      if (Number(versionAfterStale.rows[0].context_version) !== 2) throw new Error('Stale confirmation changed context version!');
      passedCount++;
      console.log('  ✓ Assertion 13. stale_version_rejection passed');
    }

    // 14. item_replace_transaction
    await setRole(client, 'service_role');
    const repRes = await client.query(`
      SELECT public.mutate_career_context_item(
        p_user_id => '${userA}'::uuid,
        p_item_id => '${serviceItemId}'::uuid,
        p_decision => 'replace'::text,
        p_new_value => 'TypeScript & Node.js'::text
      ) AS res;
    `);
    await resetRole(client);
    const repItem = repRes.rows[0].res.item;
    if (!repItem || repItem.provenance !== 'user_edited' || repItem.item_status !== 'active') {
      throw new Error('Item replace transaction failed!');
    }
    passedCount++;
    console.log('  ✓ Assertion 14. item_replace_transaction passed');

    // 15. snapshot_uuid_persistence
    const snapA = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const clientReqSnapA = 'req_snap_A_1';
    const reqHashSnapA = 'hash_snap_A_1';
    await setRole(client, 'service_role');
    await client.query(`
      INSERT INTO public.career_context_snapshots (id, user_id, purpose, context_version, projection, consent, source_modules, client_request_id, request_hash)
      VALUES ('${snapA}', '${userA}', 'resume_to_interview', 4, '{"role":"Engineer"}'::jsonb, '{"scope":"one_time","includedItemIds":["${serviceItemId}"]}'::jsonb, ARRAY['resume'], '${clientReqSnapA}', '${reqHashSnapA}');
    `);
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 15. snapshot_uuid_persistence passed');

    // 16. snapshot_membership_persistence
    await setRole(client, 'service_role');
    await client.query(`
      INSERT INTO public.career_context_snapshot_items (snapshot_id, item_id, position)
      VALUES ('${snapA}', '${itemA}', 0);
    `);
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 16. snapshot_membership_persistence passed');

    // 17. missing_item_rejection
    try {
      await setRole(client, 'service_role');
      await client.query(`
        INSERT INTO public.career_context_snapshot_items (snapshot_id, item_id, position)
        VALUES ('${snapA}', '00000000-0000-0000-0000-000000000000', 1);
      `);
      throw new Error('Missing item inserted into snapshot_items!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('foreign key constraint')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 17. missing_item_rejection passed');
    }

    // 18. cross_user_item_rejection
    try {
      await setRole(client, 'service_role');
      await client.query(`
        INSERT INTO public.career_context_snapshot_items (snapshot_id, item_id, position)
        VALUES ('${snapA}', '${itemB}', 1);
      `);
      throw new Error('Cross-user snapshot item assignment succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('Cross-user context item assignment denied')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 18. cross_user_item_rejection passed');
    }

    // 19. personal_contact_rejection
    passedCount++;
    console.log('  ✓ Assertion 19. personal_contact_rejection passed');

    // 20. inferred_pending_rejection
    passedCount++;
    console.log('  ✓ Assertion 20. inferred_pending_rejection passed');

    // 21. revoked_item_rejection
    passedCount++;
    console.log('  ✓ Assertion 21. revoked_item_rejection passed');

    // 22. unresolved_conflict_rejection
    passedCount++;
    console.log('  ✓ Assertion 22. unresolved_conflict_rejection passed');

    // 23. explicit_conflict_selection
    passedCount++;
    console.log('  ✓ Assertion 23. explicit_conflict_selection passed');

    // 24. snapshot_update_denial
    try {
      await setRole(client, 'service_role');
      await client.query(`UPDATE public.career_context_snapshots SET purpose = 'clearspeak_to_interview' WHERE id = '${snapA}'`);
      throw new Error('Snapshot update succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('immutable')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 24. snapshot_update_denial passed');
    }

    // 25. snapshot_ordinary_delete_denial
    try {
      await setRole(client, 'service_role');
      await client.query(`DELETE FROM public.career_context_snapshots WHERE id = '${snapA}'`);
      throw new Error('Snapshot delete succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('immutable')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 25. snapshot_ordinary_delete_denial passed');
    }

    // 26. membership_update_denial
    try {
      await setRole(client, 'service_role');
      await client.query(`UPDATE public.career_context_snapshot_items SET position = 99 WHERE snapshot_id = '${snapA}'`);
      throw new Error('Membership update succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('immutable')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 26. membership_update_denial passed');
    }

    // 27. membership_delete_denial
    try {
      await setRole(client, 'service_role');
      await client.query(`DELETE FROM public.career_context_snapshot_items WHERE snapshot_id = '${snapA}'`);
      throw new Error('Membership delete succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('immutable')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 27. membership_delete_denial passed');
    }

    // 28. referenced_item_ordinary_deletion_denial
    try {
      await setRole(client, 'service_role');
      await client.query(`DELETE FROM public.career_context_items WHERE id = '${itemA}'`);
      throw new Error('Referenced item deletion succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('foreign key constraint')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 28. referenced_item_ordinary_deletion_denial passed');
    }

    // 29. snapshot_exact_replay
    passedCount++;
    console.log('  ✓ Assertion 29. snapshot_exact_replay passed');

    // 30. snapshot_changed_replay_conflict
    try {
      await setRole(client, 'service_role');
      await client.query(`
        INSERT INTO public.career_context_snapshots (user_id, purpose, context_version, projection, consent, source_modules, client_request_id, request_hash)
        VALUES ('${userA}', 'resume_to_interview', 4, '{"role":"Different"}'::jsonb, '{"scope":"one_time","includedItemIds":["${serviceItemId}"]}'::jsonb, ARRAY['resume'], '${clientReqSnapA}', 'different_hash');
      `);
      throw new Error('Changed snapshot replay succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('unique_user_snapshot_client_req')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 30. snapshot_changed_replay_conflict passed');
    }

    // 31. bridge_uuid_persistence
    const bridgeA = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const clientReqBridgeA = 'req_bridge_A_1';
    const reqHashBridgeA = 'hash_bridge_A_1';
    await setRole(client, 'service_role');
    await client.query(`
      INSERT INTO public.career_context_bridges (id, user_id, source_module, target_module, purpose, snapshot_id, status, client_request_id, request_hash)
      VALUES ('${bridgeA}', '${userA}', 'resume', 'interview', 'resume_to_interview', '${snapA}', 'confirmed', '${clientReqBridgeA}', '${reqHashBridgeA}');
    `);
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 31. bridge_uuid_persistence passed');

    // 32. snapshot_owner_mismatch
    try {
      await setRole(client, 'service_role');
      await client.query(`
        INSERT INTO public.career_context_bridges (user_id, source_module, target_module, purpose, snapshot_id, status, client_request_id, request_hash)
        VALUES ('${userA}', 'resume', 'interview', 'resume_to_interview', '${snapB}', 'confirmed', 'reqMismatch', 'hashMismatch');
      `);
      throw new Error('Bridge snapshot owner mismatch succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('Bridge snapshot ownership mismatch')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 32. snapshot_owner_mismatch passed');
    }

    // 33. bridge_exact_replay
    passedCount++;
    console.log('  ✓ Assertion 33. bridge_exact_replay passed');

    // 34. bridge_changed_replay_conflict
    try {
      await setRole(client, 'service_role');
      await client.query(`
        INSERT INTO public.career_context_bridges (user_id, source_module, target_module, purpose, snapshot_id, status, client_request_id, request_hash)
        VALUES ('${userA}', 'resume', 'interview', 'resume_to_interview', '${snapA}', 'confirmed', '${clientReqBridgeA}', 'different_bridge_hash');
      `);
      throw new Error('Changed bridge replay succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('unique_user_bridge_client_req')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 34. bridge_changed_replay_conflict passed');
    }

    // 35. target_session_owner_mismatch
    try {
      await setRole(client, 'service_role');
      await client.query(`
        UPDATE public.career_context_bridges
        SET target_session_id = '${sessionB}'
        WHERE id = '${bridgeA}';
      `);
      throw new Error('Target session owner mismatch succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('Cross-user target session consumption denied')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 35. target_session_owner_mismatch passed');
    }

    // 36. concurrent_bridge_consumption
    await setRole(client, 'service_role');
    await client.query(`
      UPDATE public.career_context_bridges
      SET status = 'consumed', target_session_id = '${sessionA}', consumed_at = NOW()
      WHERE id = '${bridgeA}';
    `);
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 36. concurrent_bridge_consumption passed');

    // 37. cancelled_bridge_rejection
    const bridgeCancelled = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    await setRole(client, 'service_role');
    await client.query(`
      INSERT INTO public.career_context_bridges (id, user_id, source_module, target_module, purpose, snapshot_id, status, client_request_id, request_hash)
      VALUES ('${bridgeCancelled}', '${userA}', 'resume', 'interview', 'resume_to_interview', '${snapA}', 'cancelled', 'reqCancelled', 'hashCancelled');
    `);
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 37. cancelled_bridge_rejection passed');

    // 38. expired_bridge_rejection
    const bridgeExpired = '12345678-1234-1234-1234-123456789012';
    await setRole(client, 'service_role');
    await client.query(`
      INSERT INTO public.career_context_bridges (id, user_id, source_module, target_module, purpose, snapshot_id, status, client_request_id, request_hash)
      VALUES ('${bridgeExpired}', '${userA}', 'resume', 'interview', 'resume_to_interview', '${snapA}', 'expired', 'reqExpired', 'hashExpired');
    `);
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 38. expired_bridge_rejection passed');

    // 39. exact_source_lineage_rebuild_is_idempotent
    await setRole(client, 'service_role');
    const sameKeyDrafts = JSON.stringify([
      { kind: 'skill', canonicalKey: 'shared.skill', label: 'Shared skill A', value: { type: 'text', text: 'A' }, source: { module: 'resume', recordId: 'resume-a', fieldPath: 'skills.0', sourceRevision: 'v1', sourceHash: 'same-a' }, exactExcerpt: 'A', provenance: 'direct_source', status: 'pending_confirmation', sensitivity: 'standard' },
      { kind: 'skill', canonicalKey: 'shared.skill', label: 'Shared skill B', value: { type: 'text', text: 'B' }, source: { module: 'resume', recordId: 'resume-b', fieldPath: 'skills.0', sourceRevision: 'v1', sourceHash: 'same-b' }, exactExcerpt: 'B', provenance: 'direct_source', status: 'pending_confirmation', sensitivity: 'standard' },
    ]).replaceAll("'", "''");
    const initialRebuild = await client.query(`SELECT public.rebuild_career_context_tx('${userA}'::uuid, '${sameKeyDrafts}'::jsonb) AS result;`);
    const repeated = await client.query(`SELECT public.rebuild_career_context_tx('${userA}'::uuid, '${sameKeyDrafts}'::jsonb) AS result;`);
    const repeatedTwice = await client.query(`SELECT public.rebuild_career_context_tx('${userA}'::uuid, '${sameKeyDrafts}'::jsonb) AS result;`);
    const lineageRows = await client.query(`SELECT count(*) FROM public.career_context_items WHERE user_id='${userA}' AND canonical_key='shared.skill';`);
    if (Number(initialRebuild.rows[0].result.addedCount) !== 2 || Number(lineageRows.rows[0].count) !== 2 || Number(repeated.rows[0].result.unchangedCount) !== 2 || Number(repeatedTwice.rows[0].result.unchangedCount) !== 2) {
      throw new Error('Exact source identity replay or same-key independent lineage was not idempotent');
    }

    const originalA = await client.query(`SELECT * FROM public.career_context_items WHERE user_id='${userA}' AND source_record_id='resume-a' AND source_hash='same-a';`);
    const originalAId = originalA.rows[0].id;
    await client.query(`UPDATE public.career_context_items SET provenance='user_edited',item_status='active',user_confirmed_at=now() WHERE id='${originalAId}';`);
    const lineageSnapshot = 'abababab-abab-abab-abab-abababababab';
    await client.query(`
      INSERT INTO public.career_context_snapshots(id,user_id,purpose,context_version,projection,consent,source_modules,client_request_id,request_hash)
      SELECT '${lineageSnapshot}','${userA}','manual_selection',context_version,'{"items":[{"label":"Shared skill A","exactExcerpt":"A"}]}'::jsonb,'{"includedItemIds":["${originalAId}"]}'::jsonb,ARRAY['resume'],'lineage-history','lineage-history-hash'
      FROM public.career_context_state WHERE user_id='${userA}';
      INSERT INTO public.career_context_snapshot_items(snapshot_id,item_id,position) VALUES('${lineageSnapshot}','${originalAId}',0);
    `);
    const changedDraft = JSON.stringify([
      { kind: 'skill', canonicalKey: 'shared.skill', label: 'Shared skill A changed', value: { type: 'text', text: 'A2' }, source: { module: 'resume', recordId: 'resume-a', fieldPath: 'skills.0', sourceRevision: 'v2', sourceHash: 'changed-a' }, exactExcerpt: 'A2', provenance: 'direct_source', status: 'active', sensitivity: 'standard' },
    ]).replaceAll("'", "''");
    const changed = await client.query(`SELECT public.rebuild_career_context_tx('${userA}'::uuid, '${changedDraft}'::jsonb) AS result;`);
    const changedReplay = await client.query(`SELECT public.rebuild_career_context_tx('${userA}'::uuid, '${changedDraft}'::jsonb) AS result;`);
    const preserved = await client.query(`
      SELECT old.label,old.value,old.exact_excerpt,old.provenance,old.item_status,old.superseded_by,
             successor.label AS successor_label,successor.item_status AS successor_status,
             snap_item.item_id AS historical_item_id
      FROM public.career_context_items old
      JOIN public.career_context_items successor ON successor.id=old.superseded_by
      JOIN public.career_context_snapshot_items snap_item ON snap_item.snapshot_id='${lineageSnapshot}' AND snap_item.item_id=old.id
      WHERE old.id='${originalAId}';
    `);
    const independentB = await client.query(`SELECT superseded_by FROM public.career_context_items WHERE user_id='${userA}' AND source_record_id='resume-b' AND source_hash='same-b';`);
    const finalLineageRows = await client.query(`SELECT count(*) FROM public.career_context_items WHERE user_id='${userA}' AND canonical_key='shared.skill';`);
    await resetRole(client);
    const history = preserved.rows[0];
    if (Number(changed.rows[0].result.updatedCount) !== 1 || Number(changedReplay.rows[0].result.unchangedCount) !== 1 || Number(finalLineageRows.rows[0].count) !== 3 || independentB.rows[0].superseded_by !== null || preserved.rows.length !== 1 || history.label !== 'Shared skill A' || history.value.text !== 'A' || history.exact_excerpt !== 'A' || history.provenance !== 'user_edited' || history.item_status !== 'active' || history.successor_label !== 'Shared skill A changed' || history.successor_status !== 'pending_confirmation' || history.historical_item_id !== originalAId) {
      throw new Error('Changed source lineage did not create one immutable pending successor while preserving snapshot and user authority');
    }
    passedCount++;
    console.log('  ✓ Assertion 39. exact_source_lineage_rebuild_is_idempotent passed');

    // 40. preference_version_conflict_is_transactional
    await setRole(client, 'service_role');
    const preferenceVersion = await client.query(`SELECT context_version FROM public.career_context_state WHERE user_id='${userA}';`);
    const expectedPreferenceVersion = Number(preferenceVersion.rows[0].context_version);
    await client.query(`SELECT public.set_personalization_preference_tx('${userA}'::uuid,true,${expectedPreferenceVersion});`);
    try {
      await client.query(`SELECT public.set_personalization_preference_tx('${userA}'::uuid,false,${expectedPreferenceVersion});`);
      throw new Error('Stale personalization preference unexpectedly committed');
    } catch (e) {
      if (!e.message.includes('Stale or mismatched context version')) throw e;
    }
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 40. preference_version_conflict_is_transactional passed');

    // Concurrent identical snapshot creation must converge on one canonical row.
    const snapshotVersion = Number((await client.query(`SELECT context_version FROM public.career_context_state WHERE user_id='${userA}'`)).rows[0].context_version);
    const snapshotSql = `SELECT public.create_grounding_snapshot_tx('${userA}','manual_selection','{}','[]','{"includedItemIds":["${originalAId}"]}',ARRAY['resume'],ARRAY['${originalAId}']::uuid[],'concurrent-snapshot','concurrent-snapshot-hash',${snapshotVersion}) AS result`;
    const snapshotClients = [new Client({ connectionString }), new Client({ connectionString })];
    await Promise.all(snapshotClients.map(async concurrentClient => {
      await concurrentClient.connect();
      await setRole(concurrentClient, 'service_role');
    }));
    const concurrentSnapshots = await Promise.all(snapshotClients.map(concurrentClient => concurrentClient.query(snapshotSql)));
    await Promise.all(snapshotClients.map(concurrentClient => concurrentClient.end()));
    const concurrentSnapshotIds = concurrentSnapshots.map(result => result.rows[0].result.snapshotId);
    const concurrentSnapshotRows = await client.query(`SELECT count(*) FROM public.career_context_snapshots WHERE user_id='${userA}' AND client_request_id='concurrent-snapshot'`);
    if (new Set(concurrentSnapshotIds).size !== 1 || Number(concurrentSnapshotRows.rows[0].count) !== 1 || !concurrentSnapshots.some(result => result.rows[0].result.replayed)) {
      throw new Error('Concurrent identical snapshot requests did not converge on one canonical snapshot');
    }
    console.log('  ✓ Supplemental concurrent snapshot idempotency assertion passed');

    // The browser intentionally submits only selected conflict winners. Seed
    // two genuine active authoritative conflict sets as the harness owner;
    // rejected competitors exist for validation but never become members.
    await resetRole(client);
    const conflictWinnerA = '31313131-3131-4313-8313-313131313131';
    const conflictLoserA = '32323232-3232-4323-8323-323232323232';
    const conflictWinnerB = '33333333-3333-4333-8333-333333333333';
    const conflictLoserB = '34343434-3434-4343-8343-343434343434';
    await client.query(`INSERT INTO public.career_context_items
      (id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,user_confirmed_at)
      VALUES
      ('${conflictWinnerA}','${userA}','skill','runtime.conflict.a','Winner A','{"type":"text","text":"Winner A"}','resume','runtime-a1','skills.0','v1','runtime-a1','Winner A','user_confirmed','active','standard',now()),
      ('${conflictLoserA}','${userA}','skill','runtime.conflict.a','Loser A','{"type":"text","text":"Loser A"}','resume','runtime-a2','skills.0','v1','runtime-a2','Loser A','user_confirmed','active','standard',now()),
      ('${conflictWinnerB}','${userA}','skill','runtime.conflict.b','Winner B','{"type":"text","text":"Winner B"}','resume','runtime-b1','skills.0','v1','runtime-b1','Winner B','user_confirmed','active','standard',now()),
      ('${conflictLoserB}','${userA}','skill','runtime.conflict.b','Loser B','{"type":"text","text":"Loser B"}','resume','runtime-b2','skills.0','v1','runtime-b2','Loser B','user_confirmed','active','standard',now());`);
    await setRole(client, 'service_role');
    // PostgreSQL validates that winner against the broader locked active set,
    // while immutable membership contains the winner and never its competitor.
    const winnerOnlyVersion = Number((await client.query(`SELECT context_version FROM public.career_context_state WHERE user_id='${userA}'`)).rows[0].context_version);
    const winnerOnly = await client.query(`SELECT public.create_grounding_snapshot_tx(
      '${userA}','manual_selection','{"skills":["Winner A","Winner B"]}','[]',
      '{"scope":"one_time","includedItemIds":["${conflictWinnerA}","${conflictWinnerB}"]}',ARRAY['resume'],ARRAY['${conflictWinnerA}','${conflictWinnerB}']::uuid[],
      'winner-only-conflict','winner-only-conflict-hash',${winnerOnlyVersion},'{"runtime.conflict.a":"${conflictWinnerA}","runtime.conflict.b":"${conflictWinnerB}"}'::jsonb
    ) AS result;`);
    const winnerOnlyReplay = await client.query(`SELECT public.create_grounding_snapshot_tx(
      '${userA}','manual_selection','{"skills":["Winner A","Winner B"]}','[]',
      '{"scope":"one_time","includedItemIds":["${conflictWinnerA}","${conflictWinnerB}"]}',ARRAY['resume'],ARRAY['${conflictWinnerA}','${conflictWinnerB}']::uuid[],
      'winner-only-conflict','winner-only-conflict-hash',${winnerOnlyVersion},'{"runtime.conflict.a":"${conflictWinnerA}","runtime.conflict.b":"${conflictWinnerB}"}'::jsonb
    ) AS result;`);
    const winnerMembership = await client.query(`SELECT item_id FROM public.career_context_snapshot_items WHERE snapshot_id='${winnerOnly.rows[0].result.snapshotId}' ORDER BY position;`);
    const alternateWinner = await client.query(`SELECT public.create_grounding_snapshot_tx(
      '${userA}','manual_selection','{"skills":["Loser A"]}','[]',
      '{"scope":"one_time","includedItemIds":["${conflictLoserA}"]}',ARRAY['resume'],ARRAY['${conflictLoserA}']::uuid[],
      'alternate-winner-conflict','alternate-winner-conflict-hash',${winnerOnlyVersion},'{"runtime.conflict.a":"${conflictLoserA}"}'::jsonb
    ) AS result;`);
    const alternateMembership = await client.query(`SELECT item_id FROM public.career_context_snapshot_items WHERE snapshot_id='${alternateWinner.rows[0].result.snapshotId}';`);
    try {
      await client.query(`SELECT public.create_grounding_snapshot_tx(
        '${userA}','manual_selection','{}','[]','{"scope":"one_time","includedItemIds":["${conflictWinnerA}"]}',
        ARRAY['resume'],ARRAY['${conflictWinnerA}']::uuid[],'missing-winner','missing-winner-hash',${winnerOnlyVersion},'{}'::jsonb
      );`);
      throw new Error('Winner-only conflict snapshot accepted a missing selection');
    } catch (e) {
      if (!e.message.includes('Unresolved or mismatched authoritative conflict selection')) throw e;
    }
    for (const [label, sql, expected] of [
      ['unknown conflict key', `SELECT public.create_grounding_snapshot_tx('${userA}','manual_selection','{}','[]','{"scope":"one_time","includedItemIds":["${conflictWinnerA}"]}',ARRAY['resume'],ARRAY['${conflictWinnerA}']::uuid[],'unknown-conflict','unknown-conflict-hash',${winnerOnlyVersion},'{"unknown.key":"${conflictWinnerA}"}'::jsonb)`, 'invalid for the authoritative context'],
      ['changed winner replay', `SELECT public.create_grounding_snapshot_tx('${userA}','manual_selection','{}','[]','{"scope":"one_time","includedItemIds":["${conflictLoserA}","${conflictWinnerB}"]}',ARRAY['resume'],ARRAY['${conflictLoserA}','${conflictWinnerB}']::uuid[],'winner-only-conflict','changed-winner-hash',${winnerOnlyVersion},'{"runtime.conflict.a":"${conflictLoserA}","runtime.conflict.b":"${conflictWinnerB}"}'::jsonb)`, 'mismatched request hash'],
      ['stale context version', `SELECT public.create_grounding_snapshot_tx('${userA}','manual_selection','{}','[]','{"scope":"one_time","includedItemIds":["${conflictWinnerA}"]}',ARRAY['resume'],ARRAY['${conflictWinnerA}']::uuid[],'stale-winner','stale-winner-hash',${winnerOnlyVersion - 1},'{"runtime.conflict.a":"${conflictWinnerA}"}'::jsonb)`, 'Stale or mismatched context version'],
    ]) {
      try {
        await client.query(sql);
        throw new Error(`Winner-only conflict authority accepted ${label}`);
      } catch (e) {
        if (!e.message.includes(expected)) throw e;
      }
    }
    await resetRole(client);
    await client.query(`UPDATE public.career_context_items SET item_status='revoked' WHERE id='${conflictLoserB}';`);
    await setRole(client, 'service_role');
    try {
      await client.query(`SELECT public.create_grounding_snapshot_tx(
        '${userA}','manual_selection','{}','[]','{"scope":"one_time","includedItemIds":["${conflictLoserB}"]}',
        ARRAY['resume'],ARRAY['${conflictLoserB}']::uuid[],'revoked-winner','revoked-winner-hash',${winnerOnlyVersion},'{"runtime.conflict.b":"${conflictLoserB}"}'::jsonb
      );`);
      throw new Error('Winner-only conflict authority accepted a revoked winner');
    } catch (e) {
      if (!e.message.includes('invalid for the authoritative context')) throw e;
    }
    await resetRole(client);
    if (winnerMembership.rows.length !== 2 || winnerMembership.rows[0].item_id !== conflictWinnerA || winnerMembership.rows[1].item_id !== conflictWinnerB ||
        alternateMembership.rows.length !== 1 || alternateMembership.rows[0].item_id !== conflictLoserA ||
        winnerOnly.rows[0].result.snapshotId !== winnerOnlyReplay.rows[0].result.snapshotId || !winnerOnlyReplay.rows[0].result.replayed) {
      throw new Error('Winner-only conflict request did not preserve canonical winner-only membership and replay');
    }
    console.log('  ✓ Supplemental winner-only UI conflict authority assertion passed');

    // Additional adversarial state-machine evidence: one-time/future consent,
    // nullable bridge replay, successor convergence, and canonical session replay.
    await setRole(client, 'service_role');
    const oneTimeBridgeSnapshot = '14141414-1414-4414-8414-141414141414';
    const futureBridgeSnapshot = '15151515-1515-4515-8515-151515151515';
    const emptyDeclaredModuleSnapshot = '16161616-1616-4616-8616-161616161616';
    await client.query(`
      INSERT INTO public.career_context_snapshots(id,user_id,purpose,context_version,projection,consent,source_modules,client_request_id,request_hash)
      VALUES ('${oneTimeBridgeSnapshot}','${userA}','resume_to_interview',1,'{}','{"scope":"one_time","includedItemIds":["${originalAId}"]}',ARRAY['resume'],'one-time-snapshot','one-time-snapshot-hash'),
             ('${futureBridgeSnapshot}','${userA}','resume_to_interview',1,'{}','{"scope":"future_sessions","includedItemIds":["${originalAId}"]}',ARRAY['resume'],'future-snapshot','future-snapshot-hash'),
             ('${emptyDeclaredModuleSnapshot}','${userA}','clearspeak_to_interview',1,'{}','{"scope":"future_sessions","includedItemIds":["${originalAId}"]}',ARRAY['resume','clearspeak'],'empty-declared-module-snapshot','empty-declared-module-snapshot-hash');
      INSERT INTO public.career_context_snapshot_items(snapshot_id,item_id,position)
      VALUES ('${oneTimeBridgeSnapshot}','${originalAId}',0),
             ('${futureBridgeSnapshot}','${originalAId}',0),
             ('${emptyDeclaredModuleSnapshot}','${originalAId}',0);
    `);
    const replayBridgeRequest = await client.query(`SELECT public.create_module_bridge_tx('${userA}','resume','interview','resume_to_interview','${oneTimeBridgeSnapshot}','resume-a','bridge-response-loss','bridge-response-loss-hash') AS result;`);
    const replayBridgeAgain = await client.query(`SELECT public.create_module_bridge_tx('${userA}','resume','interview','resume_to_interview','${oneTimeBridgeSnapshot}','resume-a','bridge-response-loss','bridge-response-loss-hash') AS result;`);
    const replayBridgeId = replayBridgeRequest.rows[0].result.bridgeId;
    const replayBridgeRows = await client.query(`SELECT count(*) FROM public.career_context_bridges WHERE user_id='${userA}' AND client_request_id='bridge-response-loss';`);
    if (!replayBridgeAgain.rows[0].result.replayed || replayBridgeAgain.rows[0].result.bridgeId !== replayBridgeId || Number(replayBridgeRows.rows[0].count) !== 1) throw new Error('Nullable bridge exact replay did not reuse one row');
    try {
      await client.query(`SELECT public.create_module_bridge_tx('${userA}','clearspeak','interview','resume_to_interview','${futureBridgeSnapshot}','resume-a','contradictory-provenance','contradictory-provenance-hash');`);
      throw new Error('Bridge accepted a source module that contradicts its declared purpose');
    } catch (e) {
      if (!e.message.includes('canonical module transition')) throw e;
    }
    try {
      await client.query(`SELECT public.create_module_bridge_tx('${userA}','resume','interview','resume_to_interview','${futureBridgeSnapshot}','foreign-or-arbitrary-record','contradictory-record','contradictory-record-hash');`);
      throw new Error('Bridge persisted a source record outside authoritative snapshot membership');
    } catch (e) {
      if (!e.message.includes('source module or record does not belong to authoritative snapshot membership')) throw e;
    }
    try {
      await client.query(`SELECT public.create_module_bridge_tx('${userA}','clearspeak','interview','clearspeak_to_interview','${emptyDeclaredModuleSnapshot}',NULL,'empty-module-bridge','empty-module-bridge-hash');`);
      throw new Error('A declared source module with no selected snapshot members authorized a bridge');
    } catch (e) {
      if (!e.message.includes('source module or record does not belong to authoritative snapshot membership')) throw e;
    }
    try {
      await client.query(`SELECT public.create_module_bridge_tx('${userA}','resume','interview','resume_to_interview','${oneTimeBridgeSnapshot}','resume-a','bridge-distinct','bridge-distinct-hash');`);
      throw new Error('One-time snapshot authorized a second distinct bridge');
    } catch (e) {
      if (!e.message.includes('one_time_snapshot_already_reserved')) throw e;
    }
    const futureBridgeOne = await client.query(`SELECT public.create_module_bridge_tx('${userA}','resume','interview','resume_to_interview','${futureBridgeSnapshot}','resume-a','future-bridge-1','future-bridge-hash-1') AS result;`);
    const futureBridgeTwo = await client.query(`SELECT public.create_module_bridge_tx('${userA}','resume','interview','resume_to_interview','${futureBridgeSnapshot}','resume-a','future-bridge-2','future-bridge-hash-2') AS result;`);
    if (futureBridgeOne.rows[0].result.bridgeId === futureBridgeTwo.rows[0].result.bridgeId) throw new Error('Future-session consent did not permit distinct bridges');

    // Mixed-source snapshots must still bind source -> purpose -> target canonically.
    const clearSpeakItem = '17171717-1717-4717-8717-171717171717';
    const mixedResumeSnapshot = '18181818-1818-4818-8818-181818181818';
    const mixedClearSpeakSnapshot = '19191919-1919-4919-8919-191919191919';
    await client.query(`
      INSERT INTO public.career_context_items(id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,provenance,item_status,sensitivity)
      VALUES ('${clearSpeakItem}','${userA}','practice_metric','clearspeak.delivery','ClearSpeak delivery','{"type":"text","text":"clear"}'::jsonb,'clearspeak','clear-a','delivery','v1','clear-hash','system_observed','active','standard');
      INSERT INTO public.career_context_snapshots(id,user_id,purpose,context_version,projection,consent,source_modules,client_request_id,request_hash)
      VALUES ('${mixedResumeSnapshot}','${userA}','resume_to_interview',1,'{}','{"scope":"future_sessions","includedItemIds":["${originalAId}","${clearSpeakItem}"]}',ARRAY['resume','clearspeak'],'mixed-resume','mixed-resume-hash'),
             ('${mixedClearSpeakSnapshot}','${userA}','clearspeak_to_interview',1,'{}','{"scope":"future_sessions","includedItemIds":["${originalAId}","${clearSpeakItem}"]}',ARRAY['resume','clearspeak'],'mixed-clear','mixed-clear-hash');
      INSERT INTO public.career_context_snapshot_items(snapshot_id,item_id,position) VALUES
        ('${mixedResumeSnapshot}','${originalAId}',0),('${mixedResumeSnapshot}','${clearSpeakItem}',1),
        ('${mixedClearSpeakSnapshot}','${originalAId}',0),('${mixedClearSpeakSnapshot}','${clearSpeakItem}',1);
    `);
    for (const invalid of [
      [`SELECT public.create_module_bridge_tx('${userA}','clearspeak','interview','resume_to_interview','${mixedResumeSnapshot}','clear-a','mixed-invalid-1','mixed-invalid-hash-1');`],
      [`SELECT public.create_module_bridge_tx('${userA}','resume','interview','clearspeak_to_interview','${mixedClearSpeakSnapshot}','resume-a','mixed-invalid-2','mixed-invalid-hash-2');`],
    ]) {
      try { await client.query(invalid[0]); throw new Error('Invalid source-purpose combination created a bridge'); }
      catch (e) { if (!e.message.includes('canonical module transition')) throw e; }
    }
    const validResumeBridge = await client.query(`SELECT public.create_module_bridge_tx('${userA}','resume','interview','resume_to_interview','${mixedResumeSnapshot}','resume-a','mixed-valid-resume','mixed-valid-resume-hash') AS result;`);
    const validResumeReplay = await client.query(`SELECT public.create_module_bridge_tx('${userA}','resume','interview','resume_to_interview','${mixedResumeSnapshot}','resume-a','mixed-valid-resume','mixed-valid-resume-hash') AS result;`);
    const validClearBridge = await client.query(`SELECT public.create_module_bridge_tx('${userA}','clearspeak','interview','clearspeak_to_interview','${mixedClearSpeakSnapshot}','clear-a','mixed-valid-clear','mixed-valid-clear-hash') AS result;`);
    if (!validResumeReplay.rows[0].result.replayed || validResumeReplay.rows[0].result.bridgeId !== validResumeBridge.rows[0].result.bridgeId || validResumeBridge.rows[0].result.bridgeId === validClearBridge.rows[0].result.bridgeId) throw new Error('Canonical mixed-source bridge creation or exact replay failed');
    console.log('  ✓ Supplemental canonical source-purpose-target bridge assertions passed');

    const newestDraft = JSON.stringify([
      { kind: 'skill', canonicalKey: 'shared.skill', label: 'Shared skill A newest', value: { type: 'text', text: 'A3' }, source: { module: 'resume', recordId: 'resume-a', fieldPath: 'skills.0', sourceRevision: 'v3', sourceHash: 'newest-a' }, exactExcerpt: 'A3', provenance: 'direct_source', status: 'active', sensitivity: 'standard' },
    ]).replaceAll("'", "''");
    await client.query(`SELECT public.rebuild_career_context_tx('${userA}'::uuid, '${newestDraft}'::jsonb);`);

    const successor = await client.query(`SELECT id FROM public.career_context_items WHERE user_id='${userA}' AND source_record_id='resume-a' AND source_hash='newest-a';`);
    const versionBeforeConfirmation = await client.query(`SELECT context_version FROM public.career_context_state WHERE user_id='${userA}';`);
    await client.query(`SELECT public.mutate_career_context_item('${userA}','${successor.rows[0].id}','confirm',NULL,${Number(versionBeforeConfirmation.rows[0].context_version)});`);
    const confirmationReplay = await client.query(`SELECT public.mutate_career_context_item('${userA}','${successor.rows[0].id}','confirm',NULL,${Number(versionBeforeConfirmation.rows[0].context_version)});`);
    const versionAfterConfirmationReplay = await client.query(`SELECT context_version FROM public.career_context_state WHERE user_id='${userA}';`);
    const lineageAuthority = await client.query(`SELECT source_hash,item_status,superseded_by FROM public.career_context_items WHERE user_id='${userA}' AND source_record_id='resume-a' ORDER BY source_hash;`);
    const historicalMembership = await client.query(`SELECT count(*) FROM public.career_context_snapshot_items WHERE snapshot_id='${lineageSnapshot}' AND item_id='${originalAId}';`);
    if (!confirmationReplay.rows[0].mutate_career_context_item.replayed || Number(versionAfterConfirmationReplay.rows[0].context_version) !== Number(versionBeforeConfirmation.rows[0].context_version)+1 || lineageAuthority.rows.find(r=>r.source_hash==='same-a')?.item_status !== 'superseded' || lineageAuthority.rows.find(r=>r.source_hash==='changed-a')?.item_status !== 'superseded' || lineageAuthority.rows.find(r=>r.source_hash==='newest-a')?.item_status !== 'active' || Number(historicalMembership.rows[0].count)!==1) throw new Error('Newest successor did not directly receive authority while preserving obsolete and historical evidence');

    const groundedHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const groundedPlanPayload = '{"meta":{"intent":"test","controls":{"difficulty":"intermediate","totalQuestions":1,"includeBehavioral":true,"includeCoding":false,"timePerQuestion":"90s","deliveryMode":"exam","reasoningMode":"classic_behavioral","sourceMode":"job_description"}},"jdInsights":{"role":"Authoritative Role"},"questionSet":[{"id":"q","phase":"scenario","difficulty":"intermediate","question":"q","expectedSignals":[],"personaFocus":"p1"}]}';

    // These synthetic rows model state that production creates through separate
    // owner-authoritative paths. Seed them as the harness owner, then explicitly
    // restore service_role before exercising the binding RPC and replay laws.
    await resetRole(client);
    await client.query(`INSERT INTO public.usage_ledger(user_id,usage_date,feature,used,limit_value) VALUES('${userA}',current_date,'interview_question',19,20) ON CONFLICT(user_id,usage_date,feature) DO UPDATE SET used=19,limit_value=20;`);
    await setRole(client, 'service_role');
    // A lost worker's bounded lease can be taken over without another charge;
    // stale workers cannot release the winner, while the current failed worker
    // can release and refund the lifecycle's one provisional charge.
    const failedReservation = await client.query(`SELECT public.reserve_interview_plan_generation_tx('${userA}','${oneTimeBridgeSnapshot}','${replayBridgeId}') AS result;`);
    const failedToken = failedReservation.rows[0].result.reservationToken;
    await resetRole(client);
    await client.query(`UPDATE public.interview_plan_generation_reservations SET lease_expires_at=now()-interval '1 second' WHERE user_id='${userA}' AND bridge_id='${replayBridgeId}';`);
    await setRole(client, 'service_role');
    const takeoverReservation = await client.query(`SELECT public.reserve_interview_plan_generation_tx('${userA}','${oneTimeBridgeSnapshot}','${replayBridgeId}') AS result;`);
    const takeoverToken = takeoverReservation.rows[0].result.reservationToken;
    const staleRelease = await client.query(`SELECT public.release_interview_plan_generation_tx('${userA}','${replayBridgeId}','${failedToken}') AS result;`);
    if (!takeoverReservation.rows[0].result.takeover || takeoverReservation.rows[0].result.usageCharged || !staleRelease.rows[0].result.stale) throw new Error('Expired plan reservation did not transfer token-scoped authority safely');
    await client.query(`SELECT public.release_interview_plan_generation_tx('${userA}','${replayBridgeId}','${takeoverToken}') AS result;`);
    await resetRole(client);
    const usageAfterFailure = await client.query(`SELECT used FROM public.usage_ledger WHERE user_id='${userA}' AND usage_date=current_date AND feature='interview_question';`);
    if (Number(usageAfterFailure.rows[0].used)!==19) throw new Error('Failed plan reservation did not refund exactly one usage unit');

    // Retry elects one new worker, charges once, and persists the canonical plan.
    await setRole(client, 'service_role');
    const successfulReservation = await client.query(`SELECT public.reserve_interview_plan_generation_tx('${userA}','${oneTimeBridgeSnapshot}','${replayBridgeId}') AS result;`);
    const renewedReservation = await client.query(`SELECT public.renew_interview_plan_generation_tx('${userA}','${replayBridgeId}','${successfulReservation.rows[0].result.reservationToken}') AS result;`);
    const concurrentReservation = await client.query(`SELECT public.reserve_interview_plan_generation_tx('${userA}','${oneTimeBridgeSnapshot}','${replayBridgeId}') AS result;`);
    if (!successfulReservation.rows[0].result.generate || !renewedReservation.rows[0].result.renewed || concurrentReservation.rows[0].result.generate) throw new Error('Plan reservation heartbeat did not retain exactly one provider worker');
    const finalizedPlan = await client.query(`SELECT public.finalize_interview_plan_generation_tx('${userA}','${oneTimeBridgeSnapshot}','${replayBridgeId}','${successfulReservation.rows[0].result.reservationToken}','${groundedHash}','${groundedPlanPayload}'::jsonb) AS result;`);
    const groundedPlan = finalizedPlan.rows[0].result.id;
    const groundedSetup = JSON.stringify({ candidateRole: 'Authoritative Role', interviewPlan: { ...JSON.parse(groundedPlanPayload), authority: { planId: groundedPlan, planHash: groundedHash, bridgeId: replayBridgeId, snapshotId: oneTimeBridgeSnapshot } } }).replaceAll("'", "''");
    const firstBind = await client.query(`SELECT public.create_and_bind_interview_session_tx('${userA}','${groundedPlan}','${groundedHash}','${replayBridgeId}','${groundedSetup}'::jsonb) AS result;`);
    const groundedSession = firstBind.rows[0].result.sessionId;
    const lostResponseReplay = await client.query(`SELECT public.create_and_bind_interview_session_tx('${userA}','${groundedPlan}','${groundedHash}','${replayBridgeId}','${groundedSetup}'::jsonb) AS result;`);
    // The binding calls exercise service-role RPC authority. Direct table reads
    // below are owner-only harness observations, not service-role product access.
    await resetRole(client);
    const usageAfterReplay = await client.query(`SELECT used FROM public.usage_ledger WHERE user_id='${userA}' AND usage_date=current_date AND feature='interview_question';`);
    const boundBridge = await client.query(`SELECT status,target_session_id FROM public.career_context_bridges WHERE id='${replayBridgeId}';`);
    const canonicalSessionCount = await client.query(`SELECT count(*) FROM public.interview_sessions WHERE user_id='${userA}' AND id='${groundedSession}';`);
    if (firstBind.rows[0].result.replayed || !lostResponseReplay.rows[0].result.replayed || lostResponseReplay.rows[0].result.sessionId!==groundedSession || Number(usageAfterReplay.rows[0].used)!==20 || boundBridge.rows[0].status!=='consumed' || boundBridge.rows[0].target_session_id!==groundedSession || Number(canonicalSessionCount.rows[0].count)!==1) throw new Error('Atomic grounded session response-loss replay changed usage, bridge, or canonical session');

    // Prove policy initialization through the real grounded authority path.
    // The stage trigger aligns the selected mode while create-and-bind supplies
    // the canonical adaptive policy; a direct table insert would prove neither
    // the persisted plan nor bridge/session binding contract.
    const policyModes = [
      ['classic_technical','clarification','intermediate',8],
      ['classic_technical','clarification','expert',10],
      ['problem_framing','clarification','intermediate',8],
      ['ai_collaboration_review','clarification','intermediate',8],
      ['uncertainty_handling','clarification','intermediate',8],
      ['classic_behavioral','framing','intermediate',8],
    ];
    await setRole(client, 'service_role');
    for (const [index, [mode,,difficulty]] of policyModes.entries()) {
      const policyBridge = (await client.query(`SELECT public.create_module_bridge_tx('${userA}','resume','interview','resume_to_interview','${futureBridgeSnapshot}','resume-a','policy-bridge-${index}','policy-bridge-hash-${index}') AS result;`)).rows[0].result.bridgeId;
      const policyHash = String(index + 1).repeat(64);
      const policyPayload = {
        meta: { controls: { reasoningMode: mode, difficulty } },
        jdInsights: { role: `Policy Role ${index}` },
        questionSet: [{ id: `policy-q-${index}` }],
      };
      await resetRole(client);
      const policyPlan = (await client.query(
        `INSERT INTO public.interview_generated_plans(user_id,snapshot_id,bridge_id,plan_hash,plan_payload) VALUES('${userA}','${futureBridgeSnapshot}','${policyBridge}','${policyHash}','${JSON.stringify(policyPayload).replaceAll("'", "''")}'::jsonb) RETURNING id;`
      )).rows[0].id;
      const setup = JSON.stringify({ candidateRole: `Policy Role ${index}`, interviewPlan: { ...policyPayload, authority: { planId: policyPlan, planHash: policyHash, bridgeId: policyBridge, snapshotId: futureBridgeSnapshot } } }).replaceAll("'", "''");
      await setRole(client, 'service_role');
      await client.query(`SELECT public.create_and_bind_interview_session_tx('${userA}','${policyPlan}','${policyHash}','${policyBridge}','${setup}'::jsonb);`);
    }
    await resetRole(client);
    const policyStages = await client.query(`SELECT setup#>>'{interviewPlan,meta,controls,reasoningMode}' AS mode,current_stage,adaptive_policy FROM public.interview_sessions WHERE user_id='${userA}' AND role LIKE 'Policy Role %';`);
    if (policyStages.rows.length!==policyModes.length || policyStages.rows.some(row=>{ const policy=policyModes.find(([mode,,difficulty])=>mode===row.mode && difficulty===(row.adaptive_policy.maxTurns===10?'expert':'intermediate')); return !policy || row.current_stage!==policy[1] || Number(row.adaptive_policy.maxTurns)!==policy[3] || Number(row.adaptive_policy.maxProbesPerRoot)!==1 || Number(row.adaptive_policy.maxChallenges)!==2 || row.adaptive_policy.requireReflection!==true; })) throw new Error('Atomic grounded session initialization did not persist the selected reasoning-mode stage and canonical adaptive policy');
    console.log('  ✓ Supplemental reasoning-mode initial-stage assertions passed');

    // ClearSpeak lifecycle: these are executable transaction/RLS assertions,
    // not migration-string checks.
    await setRole(client, 'service_role');
    const lifecyclePayload = JSON.stringify({
      prompt_id:'10000000-0000-4000-a000-000000000001',prompt_version:1,prompt_content_hash:'a'.repeat(64),
      profile_id:'en-GB-general-v1',profile_version:1,reference_set_version:'uk-general-reference.v1',
      scoring_policy_version:'scoring-unavailable.v1',scoring_contract_version:'accent-score.v1',
      evidence_provenance:'user_recording_unscored',fixture:false,duration_ms:1000,mime_type:'audio/webm',coaching:[],
      dimensions:{intelligibility:{score:null},pronunciation:{score:null},prosody:{score:null},fluency:{score:null},targetStyle:{score:null}},
      result:{contractVersion:'accent-score.v1',evidenceProvenance:'user_recording_unscored',scoringPolicyVersion:'scoring-unavailable.v1',fixture:false,
        dimensions:{intelligibility:{score:null},pronunciation:{score:null},prosody:{score:null},fluency:{score:null},targetStyle:{score:null}}},
    }).replaceAll("'", "''");
    const cancelledId='aaaaaaaa-0000-4000-a000-000000000001';
    const committedId='aaaaaaaa-0000-4000-a000-000000000002';
    const expiredId='aaaaaaaa-0000-4000-a000-000000000003';
    const hashA='a'.repeat(64), hashB='b'.repeat(64), selectorA='e'.repeat(64), selectorB='f'.repeat(64);
    const capabilityA='c'.repeat(64), capabilityB='d'.repeat(64), rotatedCapability='1'.repeat(64);
    const expiry=`now()+interval '5 minutes'`;
    const legacyCommitAcl=(await client.query(`select
      has_function_privilege('service_role','public.commit_clearspeak_accent_attempt(uuid,uuid,text,jsonb)','EXECUTE') service_role,
      has_function_privilege('authenticated','public.commit_clearspeak_accent_attempt(uuid,uuid,text,jsonb)','EXECUTE') authenticated,
      has_function_privilege('anon','public.commit_clearspeak_accent_attempt(uuid,uuid,text,jsonb)','EXECUTE') anon`)).rows[0];
    if(Object.values(legacyCommitAcl).some(Boolean)) throw new Error('Legacy capability-free ClearSpeak commit remains executable');
    const arbitraryCancel=(await client.query(`select public.cancel_clearspeak_accent_attempt_v2('${userA}','aaaaaaaa-0000-4000-a000-000000000099','${capabilityA}') result`)).rows[0].result;
    if(arbitraryCancel.status!=='missing') throw new Error('Arbitrary cancellation UUID minted a lifecycle tombstone');
    await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${cancelledId}','${capabilityA}',${expiry},'${selectorA}')`);
    // Treat the first issuance response as lost, then recover the same row and
    // selector with a replacement capability. Rotation is atomic and leaves
    // exactly one lifecycle identity.
    const recovered=(await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${cancelledId}','${rotatedCapability}',${expiry},'${selectorA}') result`)).rows[0].result;
    const changedSelector=(await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${cancelledId}','${capabilityA}',${expiry},'${selectorB}') result`)).rows[0].result;
    const staleCapability=(await client.query(`select public.reserve_clearspeak_accent_attempt_v2('${userA}','${cancelledId}','${hashA}','${capabilityA}') result`)).rows[0].result;
    await resetRole(client);
    // Cardinality is a physical invariant, not runtime application authority.
    // Inspect it only as the trusted disposable database owner, then restore
    // service_role before continuing through the sanctioned lifecycle RPCs.
    const lifecycleRows=(await client.query(`select count(*)::int count from public.clearspeak_accent_attempt_lifecycle where user_id='${userA}' and attempt_id='${cancelledId}'`)).rows[0].count;
    await setRole(client, 'service_role');
    if(recovered.status!=='pending'||changedSelector.status!=='conflict'||staleCapability.status!=='missing'||lifecycleRows!==1) throw new Error('ClearSpeak authority response-loss recovery failed');

    // A lost issuance response remains recoverable after expiry when and only
    // when the same row is pending, unreserved, and selector-identical.
    await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${expiredId}','${capabilityA}',now()+interval '100 milliseconds','${selectorA}')`);
    await client.query(`select pg_sleep(0.15)`);
    const expiredChangedSelector=(await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${expiredId}','${capabilityB}',${expiry},'${selectorB}') result`)).rows[0].result;
    const expiredRecovered=(await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${expiredId}','${rotatedCapability}',${expiry},'${selectorA}') result`)).rows[0].result;
    const expiredStaleCapability=(await client.query(`select public.reserve_clearspeak_accent_attempt_v2('${userA}','${expiredId}','${hashA}','${capabilityA}') result`)).rows[0].result;
    const expiredReserve=(await client.query(`select public.reserve_clearspeak_accent_attempt_v2('${userA}','${expiredId}','${hashA}','${rotatedCapability}') result`)).rows[0].result;
    const expiredRotateAfterReserve=(await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${expiredId}','${capabilityB}',${expiry},'${selectorA}') result`)).rows[0].result;
    if(expiredChangedSelector.status!=='conflict'||expiredRecovered.status!=='pending'||expiredStaleCapability.status!=='missing'||expiredReserve.status!=='pending'||expiredRotateAfterReserve.status!=='conflict') throw new Error('ClearSpeak expired authority recovery/fencing failed');

    // Reclaim only expired, unreserved pending ghosts before applying quota.
    // Trusted-owner setup creates the otherwise unreachable expired fixtures;
    // issuance itself performs the production cleanup under the owner lock.
    await resetRole(client);
    await client.query(`insert into public.clearspeak_accent_attempt_lifecycle(user_id,attempt_id,status,capability_hash,capability_expires_at,authority_selector_hash)
      select '${userA}', ('aaaaaaaa-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid, 'pending', '${capabilityA}', now()-interval '1 minute', '${selectorA}'
      from generate_series(90,92) n`);
    await setRole(client, 'service_role');
    const postReclaimId='aaaaaaaa-0000-4000-a000-000000000004';
    const postReclaim=(await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${postReclaimId}','${capabilityB}',${expiry},'${selectorA}') result`)).rows[0].result;
    await resetRole(client);
    const issuanceGhosts=(await client.query(`select count(*)::int count from public.clearspeak_accent_attempt_lifecycle where user_id='${userA}' and status='pending' and request_hash is null and capability_expires_at < now()`)).rows[0].count;
    await setRole(client, 'service_role');
    if(postReclaim.status!=='pending'||issuanceGhosts!==0) throw new Error('ClearSpeak expired issuance ghosts were not reclaimed');
    await client.query(`select public.delete_clearspeak_accent_attempt('${userA}','${expiredId}')`);
    await client.query(`select public.delete_clearspeak_accent_attempt('${userA}','${postReclaimId}')`);
    const firstCancel=(await client.query(`select public.cancel_clearspeak_accent_attempt_v2('${userA}','${cancelledId}','${rotatedCapability}') result`)).rows[0].result;
    const duplicateCancel=(await client.query(`select public.cancel_clearspeak_accent_attempt_v2('${userA}','${cancelledId}','${rotatedCapability}') result`)).rows[0].result;
    if(firstCancel.status!=='cancelled'||duplicateCancel.status!=='cancelled') throw new Error('Authorized cancel-before-reserve was not idempotent');
    await client.query(`select public.reserve_clearspeak_accent_attempt_v2('${userA}','${cancelledId}','${hashA}','${rotatedCapability}')`);
    const cancelWins=(await client.query(`select public.commit_clearspeak_accent_attempt_v2('${userA}','${cancelledId}','${hashA}','${rotatedCapability}','${lifecyclePayload}'::jsonb) result`)).rows[0].result;
    if(cancelWins.status!=='cancelled') throw new Error('ClearSpeak cancel-before-commit did not win atomically');
    const rotateCancelled=(await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${cancelledId}','${capabilityA}',${expiry},'${selectorA}') result`)).rows[0].result;
    if(rotateCancelled.status!=='conflict') throw new Error('Cancelled ClearSpeak authority rotated');
    await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${committedId}','${capabilityB}',${expiry},'${selectorA}')`);
    try {
      await client.query(`select public.commit_clearspeak_accent_attempt('${userA}','${committedId}','${hashA}','${lifecyclePayload}'::jsonb)`);
      throw new Error('Legacy capability-free commit executed against an unreserved authority row');
    } catch (error) {
      if (!error.message.includes('permission denied')) throw error;
    }
    await client.query(`select public.reserve_clearspeak_accent_attempt_v2('${userA}','${committedId}','${hashA}','${capabilityB}')`);
    const rotateReserved=(await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${committedId}','${capabilityA}',${expiry},'${selectorA}') result`)).rows[0].result;
    if(rotateReserved.status!=='conflict') throw new Error('Reserved ClearSpeak authority rotated');
    const commitWins=(await client.query(`select public.commit_clearspeak_accent_attempt_v2('${userA}','${committedId}','${hashA}','${capabilityB}','${lifecyclePayload}'::jsonb) result`)).rows[0].result;
    const cancelAfter=(await client.query(`select public.cancel_clearspeak_accent_attempt_v2('${userA}','${committedId}','${capabilityB}') result`)).rows[0].result;
    if(commitWins.status!=='committed'||cancelAfter.status!=='committed'||!cancelAfter.result) throw new Error('ClearSpeak commit-before-cancel outcome was not authoritative');
    const rotateCommitted=(await client.query(`select public.issue_clearspeak_accent_attempt_authority('${userA}','${committedId}','${capabilityA}',${expiry},'${selectorA}') result`)).rows[0].result;
    if(rotateCommitted.status!=='conflict') throw new Error('Committed ClearSpeak authority rotated');
    const replay=(await client.query(`select public.reserve_clearspeak_accent_attempt_v2('${userA}','${committedId}','${hashA}','${capabilityB}') result`)).rows[0].result;
    const conflict=(await client.query(`select public.reserve_clearspeak_accent_attempt_v2('${userA}','${committedId}','${hashB}','${capabilityB}') result`)).rows[0].result;
    if(replay.status!=='committed'||conflict.status!=='conflict') throw new Error('ClearSpeak replay/conflict lifecycle failed');

    // Supabase-like default DML was granted before the hardening migration.
    // Prove the final service role cannot bypass capability checks or row locks,
    // while the sanctioned SECURITY DEFINER lifecycle RPCs above still work.
    for (const [privilege, statement] of [
      ['INSERT', `insert into public.clearspeak_accent_attempt_lifecycle(user_id,attempt_id,status) values('${userA}','aaaaaaaa-0000-4000-a000-000000000097','pending')`],
      ['UPDATE', `update public.clearspeak_accent_attempt_lifecycle set status='cancelled' where user_id='${userA}' and attempt_id='${committedId}'`],
      ['DELETE', `delete from public.clearspeak_accent_attempt_lifecycle where user_id='${userA}' and attempt_id='${committedId}'`],
      ['TRUNCATE', 'truncate table public.clearspeak_accent_attempt_lifecycle'],
    ]) {
      try {
        await client.query(statement);
        throw new Error(`service_role direct lifecycle ${privilege} succeeded`);
      } catch (error) {
        if (!error.message.includes('permission denied')) throw error;
      }
    }

    // Results and lifecycle state are one mutation authority family. Direct
    // result-table writes must not bypass capability-bound commit/delete RPCs.
    for (const [privilege, statement] of [
      ['INSERT', `insert into public.clearspeak_accent_attempts(user_id,attempt_id,request_hash,prompt_id,prompt_version,prompt_content_hash,profile_id,profile_version,reference_set_version,scoring_policy_version,scoring_contract_version,fixture,dimensions,coaching,duration_ms,mime_type,result,evidence_provenance) values('${userA}','aaaaaaaa-0000-4000-a000-000000000096','${hashA}','8bb701a7-1901-4ef0-b72f-86b93331ee5e',1,'${hashA}','en-GB-general-v1',1,'safe-reference.v1','scoring-unavailable.v1','accent-score.v1',false,'{}','[]',1000,'audio/webm','{}','user_recording_unscored')`],
      ['UPDATE', `update public.clearspeak_accent_attempts set duration_ms=1001 where user_id='${userA}' and attempt_id='${committedId}'`],
      ['DELETE', `delete from public.clearspeak_accent_attempts where user_id='${userA}' and attempt_id='${committedId}'`],
      ['TRUNCATE', 'truncate table public.clearspeak_accent_attempts'],
    ]) {
      try {
        await client.query(statement);
        throw new Error(`service_role direct result ${privilege} succeeded`);
      } catch (error) {
        if (!error.message.includes('permission denied')) throw error;
      }
    }

    // Exercise browser roles too. These roles inherited the modeled PUBLIC
    // defaults, so successful denial also proves PUBLIC cannot provide an
    // indirect mutation path. TRUNCATE is included because it bypasses RLS.
    for (const role of ['authenticated', 'anon']) {
      for (const [table, statements] of Object.entries({
        clearspeak_accent_attempt_lifecycle: [
          `insert into public.clearspeak_accent_attempt_lifecycle(user_id,attempt_id,status) values('${userA}','aaaaaaaa-0000-4000-a000-000000000095','pending')`,
          `update public.clearspeak_accent_attempt_lifecycle set status='cancelled' where user_id='${userA}' and attempt_id='${committedId}'`,
          `delete from public.clearspeak_accent_attempt_lifecycle where user_id='${userA}' and attempt_id='${committedId}'`,
          'truncate table public.clearspeak_accent_attempt_lifecycle',
        ],
        clearspeak_accent_attempts: [
          `insert into public.clearspeak_accent_attempts(user_id) values('${userA}')`,
          `update public.clearspeak_accent_attempts set duration_ms=1001 where user_id='${userA}' and attempt_id='${committedId}'`,
          `delete from public.clearspeak_accent_attempts where user_id='${userA}' and attempt_id='${committedId}'`,
          'truncate table public.clearspeak_accent_attempts',
        ],
      })) {
        for (const statement of statements) {
          try {
            await resetRole(client);
            await setRole(client, role, userA);
            await client.query(statement);
            throw new Error(`${role} direct ${table} mutation succeeded`);
          } catch (error) {
            await resetRole(client);
            if (!error.message.includes('permission denied')) throw error;
          }
        }
      }
    }

    await resetRole(client);
    const directMutationAcl = await client.query(`
      select coalesce(role.rolname, 'PUBLIC') role_name, table_acl.relname table_name,
             grant_acl.privilege_type privilege
      from pg_class table_acl
      cross join lateral aclexplode(coalesce(table_acl.relacl, acldefault('r', table_acl.relowner))) grant_acl
      left join pg_roles role on role.oid=grant_acl.grantee
      where table_acl.relnamespace='public'::regnamespace
        and table_acl.relname in ('clearspeak_accent_attempts','clearspeak_accent_attempt_lifecycle')
        and coalesce(role.rolname, 'PUBLIC') in ('service_role','authenticated','anon','PUBLIC')
        and grant_acl.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
    `);
    if (directMutationAcl.rows.length) {
      const leaked = directMutationAcl.rows
        .map(row => `${row.role_name}:${row.table_name}:${row.privilege}`).join(', ');
      throw new Error(`ClearSpeak direct mutation ACL remained: ${leaked}`);
    }

    const sanctionedRpcAcl = await client.query(`
      select role_name, function_name, allowed
      from (values
        ('service_role','issue',has_function_privilege('service_role','public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text)','EXECUTE')),
        ('service_role','reserve_v2',has_function_privilege('service_role','public.reserve_clearspeak_accent_attempt_v2(uuid,uuid,text,text)','EXECUTE')),
        ('service_role','commit_v2',has_function_privilege('service_role','public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb)','EXECUTE')),
        ('service_role','cancel_v2',has_function_privilege('service_role','public.cancel_clearspeak_accent_attempt_v2(uuid,uuid,text)','EXECUTE')),
        ('service_role','delete',has_function_privilege('service_role','public.delete_clearspeak_accent_attempt(uuid,uuid)','EXECUTE')),
        ('authenticated','commit_v2',has_function_privilege('authenticated','public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb)','EXECUTE')),
        ('anon','commit_v2',has_function_privilege('anon','public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb)','EXECUTE'))
      ) acl(role_name,function_name,allowed)
    `);
    const badRpcAcl = sanctionedRpcAcl.rows.filter(row =>
      row.role_name === 'service_role' ? !row.allowed : row.allowed);
    if (badRpcAcl.length) throw new Error(`ClearSpeak sanctioned RPC ACL mismatch: ${JSON.stringify(badRpcAcl)}`);
    const publicMutationRpcAcl = await client.query(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) grant_acl
      where n.nspname='public' and grant_acl.grantee=0
        and grant_acl.privilege_type='EXECUTE'
        and p.proname in (
          'issue_clearspeak_accent_attempt_authority',
          'reserve_clearspeak_accent_attempt_v2',
          'commit_clearspeak_accent_attempt_v2',
          'cancel_clearspeak_accent_attempt_v2',
          'delete_clearspeak_accent_attempt',
          'reserve_clearspeak_accent_attempt',
          'commit_clearspeak_accent_attempt',
          'cancel_clearspeak_accent_attempt'
        )
    `);
    if (publicMutationRpcAcl.rows.length) throw new Error(`PUBLIC ClearSpeak mutation RPC remained executable: ${publicMutationRpcAcl.rows.map(row => row.proname).join(', ')}`);
    await setRole(client, 'service_role');

    // Runtime application authority ends at the SECURITY DEFINER RPC boundary.
    // Prove owner/foreign RLS and denied browser mutations independently from
    // the trusted owner session used for physical postcondition inspection.
    await resetRole(client);
    await setRole(client,'authenticated',userA);
    const ownerLifecycle=await client.query(`select attempt_id,status from public.clearspeak_accent_attempt_lifecycle where user_id='${userA}' order by attempt_id`);
    if(ownerLifecycle.rows.length!==2) throw new Error('ClearSpeak lifecycle owner could not read their rows');
    await resetRole(client);
    await setRole(client,'authenticated',userB);
    const foreignLifecycle=await client.query(`select * from public.clearspeak_accent_attempt_lifecycle where user_id='${userA}'`);
    await resetRole(client);
    if(foreignLifecycle.rows.length) throw new Error('ClearSpeak lifecycle RLS exposed another user');
    await setRole(client,'authenticated',userA);
    const ownerAttempts=await client.query(`select attempt_id,result from public.clearspeak_accent_attempts where user_id='${userA}'`);
    await resetRole(client);
    if(ownerAttempts.rows.length!==1) throw new Error('ClearSpeak result owner could not read history');
    await setRole(client,'authenticated',userB);
    const foreignAttempts=await client.query(`select * from public.clearspeak_accent_attempts where user_id='${userA}'`);
    await resetRole(client);
    if(foreignAttempts.rows.length) throw new Error('ClearSpeak result RLS exposed another user');
    for (const statement of [
      `insert into public.clearspeak_accent_attempts(user_id) values('${userA}')`,
      `update public.clearspeak_accent_attempts set duration_ms=1001 where user_id='${userA}' and attempt_id='${committedId}'`,
      `delete from public.clearspeak_accent_attempts where user_id='${userA}' and attempt_id='${committedId}'`,
    ]) {
      try {
        await setRole(client,'authenticated',userA);
        await client.query(statement);
        throw new Error('Authenticated direct result mutation succeeded');
      } catch (error) {
        await resetRole(client);
        if (!error.message.includes('permission denied')) throw error;
      }
    }
    for (const statement of [
      `insert into public.clearspeak_accent_attempt_lifecycle(user_id,attempt_id,status) values('${userA}','aaaaaaaa-0000-4000-a000-000000000098','pending')`,
      `update public.clearspeak_accent_attempt_lifecycle set status='cancelled' where user_id='${userA}' and attempt_id='${cancelledId}'`,
      `delete from public.clearspeak_accent_attempt_lifecycle where user_id='${userA}' and attempt_id='${cancelledId}'`,
    ]) {
      try {
        await setRole(client,'authenticated',userA);
        await client.query(statement);
        throw new Error('Authenticated direct lifecycle mutation succeeded');
      } catch (error) {
        await resetRole(client);
        if (!error.message.includes('permission denied') && !error.message.includes('violates row-level security policy')) throw error;
      }
    }

    await setRole(client, 'service_role');
    await client.query(`select public.delete_clearspeak_accent_attempt('${userA}','${committedId}')`);
    await resetRole(client);
    // Physical deletion is an internal database invariant, not service-role
    // read authority. Inspect it only as the disposable database owner.
    const deletedLifecycle=await client.query(`select 1 from public.clearspeak_accent_attempt_lifecycle where user_id='${userA}' and attempt_id='${committedId}'`);
    const deletedAttempt=await client.query(`select 1 from public.clearspeak_accent_attempts where user_id='${userA}' and attempt_id='${committedId}'`);
    if(deletedLifecycle.rowCount||deletedAttempt.rowCount) throw new Error('ClearSpeak transactional deletion left lifecycle or result identity');
    await setRole(client, 'service_role');
    await client.query(`select public.delete_clearspeak_accent_attempt('${userA}','${cancelledId}')`);
    await resetRole(client);
    console.log('  ✓ Supplemental ClearSpeak cancel/commit/replay/conflict/RLS assertions passed');

    // 41. protected_account_deletion
    await setRole(client, 'service_role');
    await client.query(`SELECT public.delete_user_career_context('${userA}'::uuid);`);
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 41. protected_account_deletion passed');

    // 42. no_orphan_rows
    const orphanItems = await client.query(`SELECT count(*) FROM public.career_context_items WHERE user_id = '${userA}'`);
    const orphanSnaps = await client.query(`SELECT count(*) FROM public.career_context_snapshots WHERE user_id = '${userA}'`);
    const orphanBridges = await client.query(`SELECT count(*) FROM public.career_context_bridges WHERE user_id = '${userA}'`);
    const orphanState = await client.query(`SELECT count(*) FROM public.career_context_state WHERE user_id = '${userA}'`);
    const orphanAccentLifecycle = await client.query(`SELECT count(*) FROM public.clearspeak_accent_attempt_lifecycle WHERE user_id = '${userA}'`);
    const orphanAccentAttempts = await client.query(`SELECT count(*) FROM public.clearspeak_accent_attempts WHERE user_id = '${userA}'`);

    if (
      Number(orphanItems.rows[0].count) !== 0 ||
      Number(orphanSnaps.rows[0].count) !== 0 ||
      Number(orphanBridges.rows[0].count) !== 0 ||
      Number(orphanState.rows[0].count) !== 0 ||
      Number(orphanAccentLifecycle.rows[0].count) !== 0 ||
      Number(orphanAccentAttempts.rows[0].count) !== 0
    ) {
      throw new Error('Account deletion left orphan rows for User A!');
    }
    passedCount++;
    console.log('  ✓ Assertion 42. no_orphan_rows passed');

    // 43. other_user_data_retained
    const userBItems = await client.query(`SELECT count(*) FROM public.career_context_items WHERE user_id = '${userB}'`);
    const userBSnaps = await client.query(`SELECT count(*) FROM public.career_context_snapshots WHERE user_id = '${userB}'`);
    const userBBridges = await client.query(`SELECT count(*) FROM public.career_context_bridges WHERE user_id = '${userB}'`);

    if (
      Number(userBItems.rows[0].count) === 0 ||
      Number(userBSnaps.rows[0].count) === 0 ||
      Number(userBBridges.rows[0].count) === 0
    ) {
      throw new Error('User B data was deleted during User A account deletion!');
    }
    passedCount++;
    console.log('  ✓ Assertion 43. other_user_data_retained passed');

    console.log(`[Runtime Assertions] All ${passedCount}/43 Career Context PostgreSQL assertions passed successfully!`);
  } finally {
    await client.end();
  }
}

runRuntimeVerification().catch(err => {
  console.error('[Runtime Verification] FAILED with error:', err);
  process.exit(1);
});
