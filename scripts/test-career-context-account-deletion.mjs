process.env.NODE_ENV = 'test';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { supabaseAdmin } = require('../backend/dist/supabaseAdmin.js');

console.log('[Account Deletion Journey] Starting PostgreSQL Account Deletion Verification...');

if (!supabaseAdmin) {
  console.log('[Account Deletion Journey] SKIPPED: Supabase admin not configured in environment.');
  process.exit(0);
}

const userA = '11111111-1111-1111-1111-111111111111';
const userB = '22222222-2222-2222-2222-222222222222';
const now = new Date().toISOString();

try {
  // 1. Seed data for User A across all 5 tables
  await supabaseAdmin.from('career_context_state').upsert({ user_id: userA, context_version: 1, personalization_enabled: true, updated_at: now });

  const itemIdA = '33333333-3333-3333-3333-333333333333';
  await supabaseAdmin.from('career_context_items').upsert({
    id: itemIdA,
    user_id: userA,
    item_kind: 'target_role',
    canonical_key: 'resume.target_role',
    label: 'Target Role',
    value: { type: 'text', text: 'Software Architect' },
    source_module: 'resume',
    provenance: 'user_confirmed',
    item_status: 'active',
    sensitivity: 'standard',
    created_at: now,
    updated_at: now,
  });

  const snapIdA = '44444444-4444-4444-4444-444444444444';
  await supabaseAdmin.from('career_context_snapshots').upsert({
    id: snapIdA,
    user_id: userA,
    purpose: 'resume_to_interview',
    context_version: 1,
    projection: { role: 'Software Architect' },
    conflicts: [],
    consent: { scope: 'one_time' },
    source_modules: ['resume'],
    client_request_id: 'req_del_snap_a',
    request_hash: 'hash_del_snap_a',
    created_at: now,
  });

  await supabaseAdmin.from('career_context_snapshot_items').upsert({
    snapshot_id: snapIdA,
    item_id: itemIdA,
    position: 0,
  });

  const bridgeIdA = '55555555-5555-5555-5555-555555555555';
  await supabaseAdmin.from('career_context_bridges').upsert({
    id: bridgeIdA,
    user_id: userA,
    source_module: 'resume',
    target_module: 'interview',
    purpose: 'resume_to_interview',
    snapshot_id: snapIdA,
    status: 'confirmed',
    client_request_id: 'req_del_bridge_a',
    request_hash: 'hash_del_bridge_a',
    created_at: now,
    updated_at: now,
  });

  // 2. Seed data for User B across all 5 tables
  await supabaseAdmin.from('career_context_state').upsert({ user_id: userB, context_version: 1, personalization_enabled: false, updated_at: now });

  const itemIdB = '66666666-6666-6666-6666-666666666666';
  await supabaseAdmin.from('career_context_items').upsert({
    id: itemIdB,
    user_id: userB,
    item_kind: 'skill',
    canonical_key: 'resume.skills',
    label: 'Skill',
    value: { type: 'string_list', values: ['TypeScript'] },
    source_module: 'resume',
    provenance: 'user_confirmed',
    item_status: 'active',
    sensitivity: 'standard',
    created_at: now,
    updated_at: now,
  });

  const snapIdB = '77777777-7777-7777-7777-777777777777';
  await supabaseAdmin.from('career_context_snapshots').upsert({
    id: snapIdB,
    user_id: userB,
    purpose: 'resume_to_interview',
    context_version: 1,
    projection: { skills: ['TypeScript'] },
    conflicts: [],
    consent: { scope: 'one_time' },
    source_modules: ['resume'],
    client_request_id: 'req_del_snap_b',
    request_hash: 'hash_del_snap_b',
    created_at: now,
  });

  await supabaseAdmin.from('career_context_snapshot_items').upsert({
    snapshot_id: snapIdB,
    item_id: itemIdB,
    position: 0,
  });

  const bridgeIdB = '88888888-8888-8888-8888-888888888888';
  await supabaseAdmin.from('career_context_bridges').upsert({
    id: bridgeIdB,
    user_id: userB,
    source_module: 'resume',
    target_module: 'interview',
    purpose: 'resume_to_interview',
    snapshot_id: snapIdB,
    status: 'confirmed',
    client_request_id: 'req_del_bridge_b',
    request_hash: 'hash_del_bridge_b',
    created_at: now,
    updated_at: now,
  });

  // 3. Execute delete_user_career_context RPC for User A
  const { error: delErr } = await supabaseAdmin.rpc('delete_user_career_context', { target_user_id: userA });
  if (delErr) {
    throw new Error(`delete_user_career_context RPC failed: ${delErr.message}`);
  }

  // 4. Verify User A records cleared across all 5 tables
  const { data: stateA } = await supabaseAdmin.from('career_context_state').select('*').eq('user_id', userA);
  const { data: itemsA } = await supabaseAdmin.from('career_context_items').select('*').eq('user_id', userA);
  const { data: snapsA } = await supabaseAdmin.from('career_context_snapshots').select('*').eq('user_id', userA);
  const { data: snapItemsA } = await supabaseAdmin.from('career_context_snapshot_items').select('*').eq('snapshot_id', snapIdA);
  const { data: bridgesA } = await supabaseAdmin.from('career_context_bridges').select('*').eq('user_id', userA);

  if ((stateA?.length || 0) > 0 || (itemsA?.length || 0) > 0 || (snapsA?.length || 0) > 0 || (snapItemsA?.length || 0) > 0 || (bridgesA?.length || 0) > 0) {
    throw new Error(`Account deletion failed: orphan records remain for User A. state: ${stateA?.length}, items: ${itemsA?.length}, snaps: ${snapsA?.length}, snapItems: ${snapItemsA?.length}, bridges: ${bridgesA?.length}`);
  }

  // 5. Verify User B records intact across all 5 tables
  const { data: stateB } = await supabaseAdmin.from('career_context_state').select('*').eq('user_id', userB);
  const { data: itemsB } = await supabaseAdmin.from('career_context_items').select('*').eq('user_id', userB);
  const { data: snapsB } = await supabaseAdmin.from('career_context_snapshots').select('*').eq('user_id', userB);
  const { data: snapItemsB } = await supabaseAdmin.from('career_context_snapshot_items').select('*').eq('snapshot_id', snapIdB);
  const { data: bridgesB } = await supabaseAdmin.from('career_context_bridges').select('*').eq('user_id', userB);

  if ((stateB?.length || 0) === 0 || (itemsB?.length || 0) === 0 || (snapsB?.length || 0) === 0 || (snapItemsB?.length || 0) === 0 || (bridgesB?.length || 0) === 0) {
    throw new Error('Account deletion regression: User B records were incorrectly modified or deleted.');
  }

  // Clean up User B
  await supabaseAdmin.rpc('delete_user_career_context', { target_user_id: userB });

  console.log('[Account Deletion Journey] PASSED: All 5 tables cleared for target user, 0 orphan records, recipient records 100% preserved!');
} catch (err) {
  console.error('[Account Deletion Journey] FAILED:', err.message);
  process.exit(1);
}
