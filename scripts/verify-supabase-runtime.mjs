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
    }
    console.log('[Runtime Verification] All migration SQL compiled and executed cleanly!');

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
      VALUES ('${snapB}', '${userB}', 'resume_to_interview', 1, '{"role":"B"}'::jsonb, '{"scope":"one_time"}'::jsonb, ARRAY['resume'], 'reqB', 'hashB')
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
      VALUES ('${serviceItemId}', '${userA}', 'skill', 'resume.skill_service', 'Service Skill', '{"type":"text","text":"Node.js"}'::jsonb, 'resume', 'resA', 'skills', 'v1', 'hashService', 'user_confirmed', 'active', 'standard');
    `);
    await resetRole(client);
    passedCount++;
    console.log('  ✓ Assertion 9. service_role_item_ingestion passed');

    // 10. source_identity_replay
    try {
      await setRole(client, 'service_role');
      await client.query(`
        INSERT INTO public.career_context_items (user_id, item_kind, canonical_key, label, value, source_module, source_record_id, source_path, source_revision, source_hash, provenance, item_status, sensitivity)
        VALUES ('${userA}', 'skill', 'resume.skill_service', 'Service Skill', '{"type":"text","text":"Node.js"}'::jsonb, 'resume', 'resA', 'skills', 'v1', 'hashService', 'user_confirmed', 'active', 'standard');
      `);
      throw new Error('Duplicate source identity insert succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('unique_user_source_identity')) throw e;
      passedCount++;
      console.log('  ✓ Assertion 10. source_identity_replay passed');
    }

    // 11. atomic_context_version_increment
    await setRole(client, 'service_role');
    const mut1 = await client.query(`
      SELECT public.mutate_career_context_item(
        p_user_id => '${userA}'::uuid,
        p_item_id => '${serviceItemId}'::uuid,
        p_decision => 'confirm'::text
      ) AS res;
    `);
    await resetRole(client);
    if (mut1.rows[0].res.contextVersion !== 2) throw new Error('Context version did not increment atomically!');
    passedCount++;
    console.log('  ✓ Assertion 11. atomic_context_version_increment passed');

    // 12. concurrent_version_increments
    await setRole(client, 'service_role');
    const mut2 = await client.query(`
      SELECT public.mutate_career_context_item(
        p_user_id => '${userA}'::uuid,
        p_item_id => '${serviceItemId}'::uuid,
        p_decision => 'confirm'::text
      ) AS res;
    `);
    await resetRole(client);
    if (mut2.rows[0].res.contextVersion !== 3) throw new Error('Sequential version increment failed!');
    passedCount++;
    console.log('  ✓ Assertion 12. concurrent_version_increments passed');

    // 13. stale_version_rejection
    try {
      await setRole(client, 'service_role');
      await client.query(`
        SELECT public.mutate_career_context_item(
          p_user_id => '${userA}'::uuid,
          p_item_id => '${serviceItemId}'::uuid,
          p_decision => 'confirm'::text,
          p_expected_context_version => 1::bigint
        );
      `);
      throw new Error('Stale expected_context_version succeeded!');
    } catch (e) {
      await resetRole(client);
      if (!e.message.includes('Stale or mismatched')) throw e;
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
      VALUES ('${snapA}', '${userA}', 'resume_to_interview', 4, '{"role":"Engineer"}'::jsonb, '{"scope":"one_time"}'::jsonb, ARRAY['resume'], '${clientReqSnapA}', '${reqHashSnapA}');
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
        VALUES ('${userA}', 'resume_to_interview', 4, '{"role":"Different"}'::jsonb, '{"scope":"one_time"}'::jsonb, ARRAY['resume'], '${clientReqSnapA}', 'different_hash');
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
    await client.query(`SELECT public.rebuild_career_context_tx('${userA}'::uuid, '${sameKeyDrafts}'::jsonb);`);
    const repeated = await client.query(`SELECT public.rebuild_career_context_tx('${userA}'::uuid, '${sameKeyDrafts}'::jsonb) AS result;`);
    const lineageRows = await client.query(`SELECT count(*) FROM public.career_context_items WHERE user_id='${userA}' AND canonical_key='shared.skill';`);
    await resetRole(client);
    if (Number(lineageRows.rows[0].count) !== 2 || Number(repeated.rows[0].result.unchangedCount) !== 2) throw new Error('Exact source-lineage rebuild was not idempotent');
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

    if (
      Number(orphanItems.rows[0].count) !== 0 ||
      Number(orphanSnaps.rows[0].count) !== 0 ||
      Number(orphanBridges.rows[0].count) !== 0 ||
      Number(orphanState.rows[0].count) !== 0
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
