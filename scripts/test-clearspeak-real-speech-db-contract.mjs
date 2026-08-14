import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('[ClearSpeak P0-5 DB] POSTGRES_URL is required.');
  process.exit(1);
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const PROMPT_ID = '70000000-0000-4000-8000-000000000001';
const RESULT_ID = '70000000-0000-4000-8000-000000000002';

const dimension = (score, evidenceStatus = 'sufficient', confidence = 0.91, ref = 'segment.1') => ({
  score,
  confidence,
  evidenceStatus,
  summary: score === null ? 'Evidence is unavailable for this dimension.' : 'Bounded evidence supports this dimension.',
  evidenceRefs: score === null ? [] : [ref],
});

const buildResult = (attemptId) => ({
  contractVersion: 'accent-score.v2',
  attemptId,
  resultId: RESULT_ID,
  promptId: PROMPT_ID,
  promptVersion: 1,
  promptContentHash: HASH_A,
  profileId: 'en-GB-general-v1',
  profileVersion: 1,
  referenceSetVersion: 'uk-general-reference.v1',
  scoringPolicyVersion: 'real-speech-policy.v1',
  evidenceProvenance: 'user_recording_scored',
  fixture: false,
  evidenceLineage: {
    evidenceContractVersion: 'accent-scorer-evidence.v1',
    adapterId: 'db-contract-fixture-adapter',
    adapterVersion: 'v1',
    providerExecutionState: 'partial',
    audioSha256: HASH_B,
    evidenceSha256: HASH_C,
  },
  dimensions: {
    intelligibility: dimension(88, 'sufficient', 0.93, 'intelligibility.segment.1'),
    pronunciation: dimension(81, 'sufficient', 0.89, 'pronunciation.segment.1'),
    prosody: dimension(null, 'unsupported', 0, 'unused'),
    fluency: dimension(77, 'limited', 0.82, 'fluency.window.1'),
    targetStyle: dimension(null, 'unsupported', 0, 'unused'),
  },
  coaching: [{
    rank: 1,
    dimension: 'fluency',
    evidenceRefs: ['fluency.window.1'],
    action: 'Repeat the marked window at a steady pace against the learner-selected reference.',
  }],
  disclaimer: 'Evidence describes this recording against the learner-selected practice reference only.',
});

const buildEvaluatedUnscoredResult = (attemptId) => {
  const result = buildResult(attemptId);
  result.evidenceProvenance = 'user_recording_evaluated_unscored';
  result.evidenceLineage.providerExecutionState = 'completed';
  for (const key of Object.keys(result.dimensions)) {
    result.dimensions[key] = dimension(null, 'insufficient', 0.2, 'unused');
  }
  result.coaching = [];
  return result;
};

const buildLifecyclePayload = (result) => ({
  prompt_id: result.promptId,
  prompt_version: result.promptVersion,
  prompt_content_hash: result.promptContentHash,
  profile_id: result.profileId,
  profile_version: result.profileVersion,
  reference_set_version: result.referenceSetVersion,
  scoring_policy_version: result.scoringPolicyVersion,
  scoring_contract_version: result.contractVersion,
  evidence_provenance: result.evidenceProvenance,
  fixture: result.fixture,
  dimensions: result.dimensions,
  coaching: result.coaching,
  duration_ms: 1800,
  mime_type: 'audio/webm',
  result,
});

const client = new Client({ connectionString });

const insertAttempt = async ({ userId, attemptId, result }) => {
  await client.query(
    `insert into public.clearspeak_accent_attempts (
      user_id, attempt_id, request_hash, prompt_id, prompt_version,
      prompt_content_hash, profile_id, profile_version, reference_set_version,
      scoring_policy_version, scoring_contract_version, fixture,
      evidence_provenance, dimensions, coaching, duration_ms, mime_type, result
    ) values (
      $1::uuid, $2::uuid, $3, $4::uuid, 1,
      $5, 'en-GB-general-v1', 1, 'uk-general-reference.v1',
      'real-speech-policy.v1', 'accent-score.v2', false,
      $6, $7::jsonb, $8::jsonb, 1800, 'audio/webm', $9::jsonb
    )`,
    [
      userId,
      attemptId,
      HASH_A,
      PROMPT_ID,
      HASH_A,
      result.evidenceProvenance,
      JSON.stringify(result.dimensions),
      JSON.stringify(result.coaching),
      JSON.stringify(result),
    ],
  );
};

const issueAuthority = async (userId, attemptId, capabilityHash, selectorHash) => (
  await client.query(
    `select public.issue_clearspeak_accent_attempt_authority($1::uuid,$2::uuid,$3,$4::timestamptz,$5) result`,
    [userId, attemptId, capabilityHash, new Date(Date.now() + 5 * 60_000).toISOString(), selectorHash],
  )
).rows[0].result;

const reserveAttempt = async (userId, attemptId, requestHash, capabilityHash) => (
  await client.query(
    `select public.reserve_clearspeak_accent_attempt_v3($1::uuid,$2::uuid,$3,$4) result`,
    [userId, attemptId, requestHash, capabilityHash],
  )
).rows[0].result;

const commitAttempt = async (userId, attemptId, requestHash, capabilityHash, payload) => (
  await client.query(
    `select public.commit_clearspeak_accent_attempt_v3($1::uuid,$2::uuid,$3,$4,$5::jsonb) result`,
    [userId, attemptId, requestHash, capabilityHash, JSON.stringify(payload)],
  )
).rows[0].result;

const cancelAttempt = async (userId, attemptId, capabilityHash) => (
  await client.query(
    `select public.cancel_clearspeak_accent_attempt_v2($1::uuid,$2::uuid,$3) result`,
    [userId, attemptId, capabilityHash],
  )
).rows[0].result;

const expectProvenanceConstraintReject = async (name, input) => {
  await client.query(`savepoint ${name}`);
  let rejected = false;
  try {
    await insertAttempt(input);
  } catch (error) {
    if (error?.code !== '23514' || error?.constraint !== 'clearspeak_accent_attempts_provenance_check') {
      throw error;
    }
    rejected = true;
  } finally {
    await client.query(`rollback to savepoint ${name}`);
  }
  if (!rejected) throw new Error(`[ClearSpeak P0-5 DB] ${name} was unexpectedly accepted`);
  console.log(`  ✓ ${name} rejected by authoritative provenance constraint`);
};

try {
  await client.connect();
  const user = await client.query('select id from auth.users order by id limit 1');
  if (!user.rows[0]?.id) throw new Error('Disposable runtime verification did not create an auth.users fixture');
  const userId = user.rows[0].id;

  const acl = await client.query(`
    select
      has_function_privilege('service_role','public.reserve_clearspeak_accent_attempt_v3(uuid,uuid,text,text)','EXECUTE') as service_reserve,
      has_function_privilege('service_role','public.commit_clearspeak_accent_attempt_v3(uuid,uuid,text,text,jsonb)','EXECUTE') as service_commit,
      has_function_privilege('authenticated','public.reserve_clearspeak_accent_attempt_v3(uuid,uuid,text,text)','EXECUTE') as authenticated_reserve,
      has_function_privilege('anon','public.commit_clearspeak_accent_attempt_v3(uuid,uuid,text,text,jsonb)','EXECUTE') as anon_commit
  `);
  if (!acl.rows[0]?.service_reserve || !acl.rows[0]?.service_commit
      || acl.rows[0]?.authenticated_reserve || acl.rows[0]?.anon_commit) {
    throw new Error('Real-speech v3 lifecycle RPC ACL is not service-role-only');
  }
  console.log('  ✓ real-speech v3 reserve/commit RPCs are service-role-only');

  await client.query('begin');

  const validAttemptId = '70000000-0000-4000-8000-000000000010';
  const validResult = buildResult(validAttemptId);
  await insertAttempt({ userId, attemptId: validAttemptId, result: validResult });
  const stored = await client.query(
    `select evidence_provenance, scoring_policy_version, scoring_contract_version,
            result #>> '{evidenceLineage,adapterId}' as adapter_id,
            result ? 'overallScore' as has_overall_score,
            result ? 'nativeAccentScore' as has_native_accent_score
       from public.clearspeak_accent_attempts
      where user_id = $1::uuid and attempt_id = $2::uuid`,
    [userId, validAttemptId],
  );
  const row = stored.rows[0];
  if (!row
      || row.evidence_provenance !== 'user_recording_scored'
      || row.scoring_policy_version !== 'real-speech-policy.v1'
      || row.scoring_contract_version !== 'accent-score.v2'
      || row.adapter_id !== 'db-contract-fixture-adapter'
      || row.has_overall_score
      || row.has_native_accent_score) {
    throw new Error('Valid governed real-speech row did not preserve the required derived-only lineage');
  }
  console.log('  ✓ governed accent-score.v2 scored result accepted with lineage and no aggregate/native score');

  const evaluatedId = '70000000-0000-4000-8000-000000000015';
  const evaluated = buildEvaluatedUnscoredResult(evaluatedId);
  await insertAttempt({ userId, attemptId: evaluatedId, result: evaluated });
  const evaluatedStored = await client.query(
    `select evidence_provenance,
            result #> '{dimensions,intelligibility,score}' as intelligibility_score,
            jsonb_array_length(result->'coaching') as coaching_count
       from public.clearspeak_accent_attempts
      where user_id = $1::uuid and attempt_id = $2::uuid`,
    [userId, evaluatedId],
  );
  if (evaluatedStored.rows[0]?.evidence_provenance !== 'user_recording_evaluated_unscored'
      || evaluatedStored.rows[0]?.intelligibility_score !== null
      || evaluatedStored.rows[0]?.coaching_count !== 0) {
    throw new Error('Evaluated-unscored row did not retain truthful null-score semantics');
  }
  console.log('  ✓ provider-evaluated low-evidence result accepted with all dimensions null and no coaching');

  const lifecycleAttemptId = '70000000-0000-4000-8000-000000000017';
  const lifecycleResult = buildResult(lifecycleAttemptId);
  const lifecyclePayload = buildLifecyclePayload(lifecycleResult);
  const capabilityHash = 'd'.repeat(64);
  const selectorHash = 'e'.repeat(64);
  const requestHash = 'f'.repeat(64);

  const issued = await issueAuthority(userId, lifecycleAttemptId, capabilityHash, selectorHash);
  const reserved = await reserveAttempt(userId, lifecycleAttemptId, requestHash, capabilityHash);
  const committed = await commitAttempt(userId, lifecycleAttemptId, requestHash, capabilityHash, lifecyclePayload);
  const reserveReplay = await reserveAttempt(userId, lifecycleAttemptId, requestHash, capabilityHash);
  const commitReplay = await commitAttempt(userId, lifecycleAttemptId, requestHash, capabilityHash, lifecyclePayload);
  const changedRequest = await reserveAttempt(userId, lifecycleAttemptId, HASH_B, capabilityHash);
  const cancelAfterCommit = await cancelAttempt(userId, lifecycleAttemptId, capabilityHash);

  if (issued.status !== 'pending'
      || reserved.status !== 'pending'
      || !reserved.executionLeaseExpiresAt
      || committed.status !== 'committed'
      || committed.result?.contractVersion !== 'accent-score.v2'
      || reserveReplay.status !== 'committed'
      || commitReplay.status !== 'committed'
      || commitReplay.replayed !== true
      || changedRequest.status !== 'conflict'
      || cancelAfterCommit.status !== 'committed') {
    throw new Error('Governed accent-score.v2 did not preserve the leased lifecycle authority/replay contract');
  }
  console.log('  ✓ governed V2 result traversed v3 reserve/commit replay and shared terminal authority');

  const leaseCommitId = '70000000-0000-4000-8000-000000000018';
  const leaseCommitCap = '1'.repeat(64);
  const leaseCommitSelector = '2'.repeat(64);
  const leaseCommitRequest = '3'.repeat(64);
  const leaseCommitPayload = buildLifecyclePayload(buildResult(leaseCommitId));
  const leaseCommitIssued = await issueAuthority(userId, leaseCommitId, leaseCommitCap, leaseCommitSelector);
  const leaseCommitReserved = await reserveAttempt(userId, leaseCommitId, leaseCommitRequest, leaseCommitCap);
  await client.query(
    `update public.clearspeak_accent_attempt_lifecycle
        set capability_expires_at=now()-interval '1 second'
      where user_id=$1::uuid and attempt_id=$2::uuid`,
    [userId, leaseCommitId],
  );
  const leaseCommit = await commitAttempt(userId, leaseCommitId, leaseCommitRequest, leaseCommitCap, leaseCommitPayload);
  if (leaseCommitIssued.status !== 'pending'
      || leaseCommitReserved.status !== 'pending'
      || !leaseCommitReserved.executionLeaseExpiresAt
      || leaseCommit.status !== 'committed') {
    throw new Error('Execution lease did not preserve commit authority after issuance capability expiry');
  }
  console.log('  ✓ reserved provider execution committed after issuance capability expiry under bounded lease');

  const leaseCancelId = '70000000-0000-4000-8000-000000000019';
  const leaseCancelCap = '4'.repeat(64);
  const leaseCancelSelector = '5'.repeat(64);
  const leaseCancelRequest = '6'.repeat(64);
  await issueAuthority(userId, leaseCancelId, leaseCancelCap, leaseCancelSelector);
  const leaseCancelReserved = await reserveAttempt(userId, leaseCancelId, leaseCancelRequest, leaseCancelCap);
  await client.query(
    `update public.clearspeak_accent_attempt_lifecycle
        set capability_expires_at=now()-interval '1 second'
      where user_id=$1::uuid and attempt_id=$2::uuid`,
    [userId, leaseCancelId],
  );
  const leaseCancel = await cancelAttempt(userId, leaseCancelId, leaseCancelCap);
  if (leaseCancelReserved.status !== 'pending'
      || !leaseCancelReserved.executionLeaseExpiresAt
      || leaseCancel.status !== 'cancelled') {
    throw new Error('Execution lease did not preserve cancellation authority after issuance capability expiry');
  }
  console.log('  ✓ cancellation remained authoritative during the in-flight execution lease');

  const leaseRotateId = '70000000-0000-4000-8000-000000000020';
  const leaseOldCap = '7'.repeat(64);
  const leaseSelector = '8'.repeat(64);
  const leaseRequest = '9'.repeat(64);
  const leaseNewCap = 'a'.repeat(64);
  const leaseRotatePayload = buildLifecyclePayload(buildResult(leaseRotateId));
  await issueAuthority(userId, leaseRotateId, leaseOldCap, leaseSelector);
  const leaseRotateReserved = await reserveAttempt(userId, leaseRotateId, leaseRequest, leaseOldCap);
  await client.query(
    `update public.clearspeak_accent_attempt_lifecycle
        set capability_expires_at=now()-interval '1 second'
      where user_id=$1::uuid and attempt_id=$2::uuid`,
    [userId, leaseRotateId],
  );
  const rotationWhileActive = await issueAuthority(userId, leaseRotateId, leaseNewCap, leaseSelector);
  await client.query(
    `update public.clearspeak_accent_attempt_lifecycle
        set execution_lease_expires_at=now()-interval '1 second'
      where user_id=$1::uuid and attempt_id=$2::uuid`,
    [userId, leaseRotateId],
  );
  const rotationAfterLease = await issueAuthority(userId, leaseRotateId, leaseNewCap, leaseSelector);
  const reserveAfterRotation = await reserveAttempt(userId, leaseRotateId, leaseRequest, leaseNewCap);
  const oldCapabilityCommit = await commitAttempt(userId, leaseRotateId, leaseRequest, leaseOldCap, leaseRotatePayload);
  const newCapabilityCommit = await commitAttempt(userId, leaseRotateId, leaseRequest, leaseNewCap, leaseRotatePayload);
  if (leaseRotateReserved.status !== 'pending'
      || rotationWhileActive.status !== 'conflict'
      || rotationAfterLease.status !== 'pending'
      || rotationAfterLease.requestHash !== leaseRequest
      || reserveAfterRotation.status !== 'pending'
      || oldCapabilityCommit.status !== 'missing'
      || newCapabilityCommit.status !== 'committed') {
    throw new Error('Execution lease rotation/recovery did not preserve exact request and capability authority');
  }
  console.log('  ✓ active lease blocked capability rotation; post-lease recovery required a fresh exact reserve');

  const leaseExpiredId = '70000000-0000-4000-8000-000000000021';
  const leaseExpiredCap = 'b'.repeat(64);
  const leaseExpiredSelector = 'c'.repeat(64);
  const leaseExpiredRequest = 'd'.repeat(64);
  const leaseExpiredPayload = buildLifecyclePayload(buildResult(leaseExpiredId));
  await issueAuthority(userId, leaseExpiredId, leaseExpiredCap, leaseExpiredSelector);
  await reserveAttempt(userId, leaseExpiredId, leaseExpiredRequest, leaseExpiredCap);
  await client.query(
    `update public.clearspeak_accent_attempt_lifecycle
        set capability_expires_at=now()-interval '1 second',
            execution_lease_expires_at=now()-interval '1 second'
      where user_id=$1::uuid and attempt_id=$2::uuid`,
    [userId, leaseExpiredId],
  );
  const expiredLeaseCommit = await commitAttempt(userId, leaseExpiredId, leaseExpiredRequest, leaseExpiredCap, leaseExpiredPayload);
  if (expiredLeaseCommit.status !== 'missing') {
    throw new Error('Expired execution lease unexpectedly retained commit authority');
  }
  console.log('  ✓ expired execution lease fails closed instead of granting indefinite commit authority');

  const missingLineageId = '70000000-0000-4000-8000-000000000011';
  const missingLineage = buildResult(missingLineageId);
  delete missingLineage.evidenceLineage.adapterId;
  await expectProvenanceConstraintReject('missing_adapter_lineage', { userId, attemptId: missingLineageId, result: missingLineage });

  const overallId = '70000000-0000-4000-8000-000000000012';
  const withOverall = { ...buildResult(overallId), overallScore: 88 };
  await expectProvenanceConstraintReject('forbidden_overall_score', { userId, attemptId: overallId, result: withOverall });

  const nativeId = '70000000-0000-4000-8000-000000000013';
  const withNative = { ...buildResult(nativeId), nativeAccentScore: 91 };
  await expectProvenanceConstraintReject('forbidden_native_accent_score', { userId, attemptId: nativeId, result: withNative });

  const allNullId = '70000000-0000-4000-8000-000000000014';
  const allNullClaimedScored = buildEvaluatedUnscoredResult(allNullId);
  allNullClaimedScored.evidenceProvenance = 'user_recording_scored';
  await expectProvenanceConstraintReject('all_null_claimed_scored_result', { userId, attemptId: allNullId, result: allNullClaimedScored });

  const evaluatedWithScoreId = '70000000-0000-4000-8000-000000000016';
  const evaluatedWithScore = buildResult(evaluatedWithScoreId);
  evaluatedWithScore.evidenceProvenance = 'user_recording_evaluated_unscored';
  await expectProvenanceConstraintReject('evaluated_unscored_with_precise_score', { userId, attemptId: evaluatedWithScoreId, result: evaluatedWithScore });

  await client.query('rollback');
  console.log('[ClearSpeak P0-5 DB] PASSED: governed real-speech persistence, v3 lifecycle and execution-lease contracts verified in disposable PostgreSQL.');
} catch (error) {
  try { await client.query('rollback'); } catch {}
  console.error('[ClearSpeak P0-5 DB] FAILED:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
