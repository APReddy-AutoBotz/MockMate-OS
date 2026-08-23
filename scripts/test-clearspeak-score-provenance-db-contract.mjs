import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('[ClearSpeak score provenance DB] POSTGRES_URL is required.');
  process.exit(1);
}

const client = new Client({ connectionString });
const userId = '90000000-0000-4000-8000-000000000001';
const itemId = '95000000-0000-4000-8000-000000000001';
const hash = '9'.repeat(64);

const score = (clarity, evidenceBasis = 'transcript_timing_heuristic') => ({
  clarity,
  pacing: 88,
  rhythm: 89,
  composite: clarity,
  hardWordBonus: 0,
  feedbackTip: 'Database provenance fixture.',
  measuredWpm: 120,
  retrySuccess: false,
  ...(evidenceBasis ? { evidenceBasis, pronunciationAssessed: false } : {}),
});

const ids = index => ({
  snapshotId: `91000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  bridgeId: `92000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  artifactId: `93000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  token: `94000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
});

async function createGroundedFixture(index) {
  const fixture = ids(index);
  await client.query(
    `insert into public.career_context_snapshots
      (id,user_id,purpose,context_version,projection,conflicts,consent,source_modules,client_request_id,request_hash)
     values ($1::uuid,$2::uuid,'resume_to_clearspeak',1,$3::jsonb,'[]'::jsonb,$4::jsonb,array['resume'],$5,$6)`,
    [
      fixture.snapshotId,
      userId,
      JSON.stringify({ targetRoles: ['QA'] }),
      JSON.stringify({ includedItemIds: [itemId], excludedItemIds: [], scope: 'one_time' }),
      `score-provenance-snapshot-${index}`,
      hash,
    ],
  );
  await client.query(
    `insert into public.career_context_snapshot_items (snapshot_id,item_id,position)
     values ($1::uuid,$2::uuid,0)`,
    [fixture.snapshotId, itemId],
  );
  await client.query(
    `insert into public.career_context_bridges
      (id,user_id,source_module,target_module,purpose,snapshot_id,status,client_request_id,request_hash,confirmed_at)
     values ($1::uuid,$2::uuid,'resume','clearspeak','resume_to_clearspeak',$3::uuid,'confirmed',$4,$5,now())`,
    [fixture.bridgeId, userId, fixture.snapshotId, `score-provenance-bridge-${index}`, hash],
  );
  await client.query(
    `insert into public.clearspeak_generated_artifacts
      (id,user_id,bridge_id,snapshot_id,content,content_hash,status,reservation_token,scoring_lease_expires_at)
     values ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6,'scoring',$7::uuid,now()+interval '2 minutes')`,
    [
      fixture.artifactId,
      userId,
      fixture.bridgeId,
      fixture.snapshotId,
      JSON.stringify({ topicTag: `topic_${index}`, passageData: [] }),
      hash,
      fixture.token,
    ],
  );
  return fixture;
}

async function finalize(fixture, index, sessionScore) {
  const result = await client.query(
    `select public.finalize_clearspeak_grounded_score_tx(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::jsonb,$7::text[],$8::jsonb,$9::uuid
    ) result`,
    [
      userId,
      fixture.bridgeId,
      fixture.snapshotId,
      fixture.artifactId,
      `topic_${index}`,
      JSON.stringify(sessionScore),
      ['practice'],
      JSON.stringify({ bridgeReadyFlag: true }),
      fixture.token,
    ],
  );
  return result.rows[0].result;
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  await client.connect();
  await client.query('begin');
  await client.query(
    `insert into auth.users (id,email) values ($1::uuid,'score-provenance@example.test')`,
    [userId],
  );
  await client.query(
    `insert into public.career_context_items
      (id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,user_confirmed_at)
     values ($1::uuid,$2::uuid,'target_role','resume.target_role','Target role',$3::jsonb,'resume','score-provenance-resume','targetRole','1',$4,'QA','user_confirmed','active','standard',now())`,
    [itemId, userId, JSON.stringify({ text: 'QA' }), hash],
  );

  const acl = await client.query(`
    select
      has_function_privilege('service_role','public.finalize_clearspeak_grounded_score_tx(uuid,uuid,uuid,uuid,text,jsonb,text[],jsonb,uuid)','EXECUTE') service_execute,
      has_function_privilege('authenticated','public.finalize_clearspeak_grounded_score_tx(uuid,uuid,uuid,uuid,text,jsonb,text[],jsonb,uuid)','EXECUTE') authenticated_execute,
      has_function_privilege('anon','public.finalize_clearspeak_grounded_score_tx(uuid,uuid,uuid,uuid,text,jsonb,text[],jsonb,uuid)','EXECUTE') anon_execute
  `);
  assert(acl.rows[0]?.service_execute && !acl.rows[0]?.authenticated_execute && !acl.rows[0]?.anon_execute,
    'Grounded score finalization RPC is not service-role-only');
  console.log('  ✓ grounded score finalization RPC is service-role-only');

  await client.query(
    `insert into public.clearspeak_progress
      (user_id,streak,last_practice_date,clarity_trend,topic_best_scores,best_performing_topic,total_sessions_completed,score_evidence_basis)
     values ($1::uuid,2,current_date-1,'[99,99]'::jsonb,'{"legacy":99}'::jsonb,'legacy',2,null)`,
    [userId],
  );

  const first = await createGroundedFixture(1);
  await client.query('savepoint unprovenanced_score');
  let rejected = false;
  try {
    await finalize(first, 1, score(99, null));
  } catch (error) {
    rejected = /score evidence is not eligible/i.test(error.message);
    await client.query('rollback to savepoint unprovenanced_score');
  }
  assert(rejected, 'Unprovenanced score was unexpectedly accepted');
  const unchanged = await client.query(
    `select
      (select count(*)::int from public.clearspeak_sessions where user_id=$1::uuid) session_count,
      (select count(*)::int from public.usage_ledger where user_id=$1::uuid and feature='clearspeak_session') usage_count,
      (select status from public.clearspeak_generated_artifacts where id=$2::uuid) artifact_status`,
    [userId, first.artifactId],
  );
  assert(unchanged.rows[0]?.session_count === 0 && unchanged.rows[0]?.usage_count === 0 && unchanged.rows[0]?.artifact_status === 'scoring',
    'Rejected score changed session, usage, or artifact state');
  console.log('  ✓ unprovenanced score rejected without session, quota, or lifecycle mutation');

  const firstResult = await finalize(first, 1, score(88));
  assert(firstResult.response?.progress?.scoreEvidenceBasis === 'transcript_timing_heuristic',
    'Canonical response omitted score provenance');
  assert(firstResult.response?.bridgeTrigger?.rollingAvgMet === false && firstResult.response?.bridgeTrigger?.shouldSurface === false,
    'Legacy score history was improperly promoted into bridge readiness');
  const resetProgress = await client.query(
    `select clarity_trend,topic_best_scores,best_performing_topic,score_evidence_basis
       from public.clearspeak_progress where user_id=$1::uuid`,
    [userId],
  );
  assert(JSON.stringify(resetProgress.rows[0]?.clarity_trend) === '[88]'
      && JSON.stringify(resetProgress.rows[0]?.topic_best_scores) === '{"topic_1":88}'
      && resetProgress.rows[0]?.best_performing_topic === 'topic_1'
      && resetProgress.rows[0]?.score_evidence_basis === 'transcript_timing_heuristic',
    'First verified score did not reset legacy score-derived progress');
  console.log('  ✓ first verified score reset legacy score-derived trend and topic fields');

  const second = await createGroundedFixture(2);
  const secondResult = await finalize(second, 2, score(86));
  assert(secondResult.response?.bridgeTrigger?.rollingAvgMet === false && secondResult.response?.bridgeTrigger?.shouldSurface === false,
    'Two verified observations unexpectedly satisfied bridge readiness');

  const third = await createGroundedFixture(3);
  const thirdResult = await finalize(third, 3, score(90));
  assert(thirdResult.response?.progress?.clarityTrend?.length === 3
      && thirdResult.response?.bridgeTrigger?.rollingAvgMet === true
      && thirdResult.response?.bridgeTrigger?.shouldSurface === true,
    'Three verified observations did not satisfy the governed bridge policy');
  const totals = await client.query(
    `select
      (select count(*)::int from public.clearspeak_sessions where user_id=$1::uuid) sessions,
      (select used from public.usage_ledger where user_id=$1::uuid and usage_date=current_date and feature='clearspeak_session') used`,
    [userId],
  );
  assert(totals.rows[0]?.sessions === 3 && totals.rows[0]?.used === 3,
    'Verified finalizations did not consume exactly one session and quota each');
  console.log('  ✓ bridge readiness required exactly three verified observations with exactly-once quota');

  await client.query('rollback');
  console.log('[ClearSpeak score provenance DB] PASSED: fail-closed provenance, legacy reset, and three-observation bridge policy verified.');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  console.error(`[ClearSpeak score provenance DB] FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
