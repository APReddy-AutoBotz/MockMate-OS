import pkg from 'pg';
import { ensureTestDatabase } from './init-test-db.mjs';
const { Client } = pkg;

console.log('[Account Deletion Journey] Starting PostgreSQL Account Deletion Verification...');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });

try {
  await client.connect();
  await ensureTestDatabase(client);
} catch (err) {
  console.error('[Account Deletion Journey] FAILED: Could not connect to disposable PostgreSQL database:', err.message);
  process.exit(1);
}

const userA = '11111111-1111-1111-1111-111111111111';
const userB = '22222222-2222-2222-2222-222222222222';
const now = new Date().toISOString();

try {
  // 1. Seed data for User A across all 5 tables
  await client.query(`
    INSERT INTO public.career_context_state (user_id, context_version, personalization_enabled, updated_at)
    VALUES ('${userA}', 1, true, '${now}')
    ON CONFLICT (user_id) DO UPDATE SET context_version = 1;
  `);

  const itemIdA = '33333333-3333-3333-3333-333333333333';
  await client.query(`
    INSERT INTO public.career_context_items (id, user_id, item_kind, canonical_key, label, value, source_module, source_record_id, source_path, source_revision, source_hash, provenance, item_status, sensitivity, created_at, updated_at)
    VALUES ('${itemIdA}', '${userA}', 'target_role', 'resume.target_role', 'Target Role', '{"type":"text","text":"Software Architect"}'::jsonb, 'resume', 'rec_a', 'target_role', 'v1', 'hash_a', 'user_confirmed', 'active', 'standard', '${now}', '${now}')
    ON CONFLICT (id) DO NOTHING;
  `);

  const snapIdA = '44444444-4444-4444-4444-444444444444';
  await client.query(`
    INSERT INTO public.career_context_snapshots (id, user_id, purpose, context_version, projection, conflicts, consent, source_modules, client_request_id, request_hash, created_at)
    VALUES ('${snapIdA}', '${userA}', 'resume_to_interview', 1, '{"role":"Software Architect"}'::jsonb, '[]'::jsonb, '{"scope":"one_time"}'::jsonb, '{"resume"}'::text[], 'req_del_snap_a', 'hash_del_snap_a', '${now}')
    ON CONFLICT (id) DO NOTHING;
  `);

  await client.query(`
    INSERT INTO public.career_context_snapshot_items (snapshot_id, item_id, position)
    VALUES ('${snapIdA}', '${itemIdA}', 0)
    ON CONFLICT (snapshot_id, item_id) DO NOTHING;
  `);

  const bridgeIdA = '55555555-5555-5555-5555-555555555555';
  await client.query(`
    INSERT INTO public.career_context_bridges (id, user_id, source_module, target_module, purpose, snapshot_id, status, client_request_id, request_hash, created_at, updated_at)
    VALUES ('${bridgeIdA}', '${userA}', 'resume', 'interview', 'resume_to_interview', '${snapIdA}', 'confirmed', 'req_del_bridge_a', 'hash_del_bridge_a', '${now}', '${now}')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 2. Seed data for User B across all 5 tables
  await client.query(`
    INSERT INTO public.career_context_state (user_id, context_version, personalization_enabled, updated_at)
    VALUES ('${userB}', 1, false, '${now}')
    ON CONFLICT (user_id) DO UPDATE SET context_version = 1;
  `);

  const itemIdB = '66666666-6666-6666-6666-666666666666';
  await client.query(`
    INSERT INTO public.career_context_items (id, user_id, item_kind, canonical_key, label, value, source_module, source_record_id, source_path, source_revision, source_hash, provenance, item_status, sensitivity, created_at, updated_at)
    VALUES ('${itemIdB}', '${userB}', 'skill', 'resume.skills', 'Skill', '{"type":"string_list","values":["TypeScript"]}'::jsonb, 'resume', 'rec_b', 'skills', 'v1', 'hash_b', 'user_confirmed', 'active', 'standard', '${now}', '${now}')
    ON CONFLICT (id) DO NOTHING;
  `);

  const snapIdB = '77777777-7777-7777-7777-777777777777';
  await client.query(`
    INSERT INTO public.career_context_snapshots (id, user_id, purpose, context_version, projection, conflicts, consent, source_modules, client_request_id, request_hash, created_at)
    VALUES ('${snapIdB}', '${userB}', 'resume_to_interview', 1, '{"skills":["TypeScript"]}'::jsonb, '[]'::jsonb, '{"scope":"one_time"}'::jsonb, '{"resume"}'::text[], 'req_del_snap_b', 'hash_del_snap_b', '${now}')
    ON CONFLICT (id) DO NOTHING;
  `);

  await client.query(`
    INSERT INTO public.career_context_snapshot_items (snapshot_id, item_id, position)
    VALUES ('${snapIdB}', '${itemIdB}', 0)
    ON CONFLICT (snapshot_id, item_id) DO NOTHING;
  `);

  const bridgeIdB = '88888888-8888-8888-8888-888888888888';
  await client.query(`
    INSERT INTO public.career_context_bridges (id, user_id, source_module, target_module, purpose, snapshot_id, status, client_request_id, request_hash, created_at, updated_at)
    VALUES ('${bridgeIdB}', '${userB}', 'resume', 'interview', 'resume_to_interview', '${snapIdB}', 'confirmed', 'req_del_bridge_b', 'hash_del_bridge_b', '${now}', '${now}')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 3. Execute delete_user_career_context RPC for User A
  await client.query(`SELECT public.delete_user_career_context('${userA}'::uuid);`);

  // 4. Verify User A records cleared across all 5 tables
  const stateA = await client.query(`SELECT count(*) FROM public.career_context_state WHERE user_id = '${userA}'`);
  const itemsA = await client.query(`SELECT count(*) FROM public.career_context_items WHERE user_id = '${userA}'`);
  const snapsA = await client.query(`SELECT count(*) FROM public.career_context_snapshots WHERE user_id = '${userA}'`);
  const snapItemsA = await client.query(`SELECT count(*) FROM public.career_context_snapshot_items WHERE snapshot_id = '${snapIdA}'`);
  const bridgesA = await client.query(`SELECT count(*) FROM public.career_context_bridges WHERE user_id = '${userA}'`);

  if (
    Number(stateA.rows[0].count) !== 0 ||
    Number(itemsA.rows[0].count) !== 0 ||
    Number(snapsA.rows[0].count) !== 0 ||
    Number(snapItemsA.rows[0].count) !== 0 ||
    Number(bridgesA.rows[0].count) !== 0
  ) {
    throw new Error(`Account deletion failed: orphan records remain for User A.`);
  }

  // 5. Verify User B records intact across all 5 tables
  const stateB = await client.query(`SELECT count(*) FROM public.career_context_state WHERE user_id = '${userB}'`);
  const itemsB = await client.query(`SELECT count(*) FROM public.career_context_items WHERE user_id = '${userB}'`);
  const snapsB = await client.query(`SELECT count(*) FROM public.career_context_snapshots WHERE user_id = '${userB}'`);
  const snapItemsB = await client.query(`SELECT count(*) FROM public.career_context_snapshot_items WHERE snapshot_id = '${snapIdB}'`);
  const bridgesB = await client.query(`SELECT count(*) FROM public.career_context_bridges WHERE user_id = '${userB}'`);

  if (
    Number(stateB.rows[0].count) === 0 ||
    Number(itemsB.rows[0].count) === 0 ||
    Number(snapsB.rows[0].count) === 0 ||
    Number(snapItemsB.rows[0].count) === 0 ||
    Number(bridgesB.rows[0].count) === 0
  ) {
    throw new Error('Account deletion regression: User B records were incorrectly modified or deleted.');
  }

  // Clean up User B
  await client.query(`SELECT public.delete_user_career_context('${userB}'::uuid);`);

  console.log('[Account Deletion Journey] PASSED: All 5 tables cleared for target user, 0 orphan records, recipient records 100% preserved!');
} catch (err) {
  console.error('[Account Deletion Journey] FAILED:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
