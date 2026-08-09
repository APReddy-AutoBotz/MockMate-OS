import fs from 'fs';
import path from 'path';

console.log('[Rejection Checks] Starting mandatory CI architectural rejection assertions...');

function assertNoMatch(pattern, filePath, label) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  if (pattern.test(content)) {
    throw new Error(`[REJECTION CHECK FAILED] ${label} found in ${filePath}`);
  }
}

function assertMatch(pattern, filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[REJECTION CHECK FAILED] File ${filePath} missing`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (!pattern.test(content)) {
    throw new Error(`[REJECTION CHECK FAILED] ${label} missing in ${filePath}`);
  }
}

// 1. No frontend snapshot/bridge randomUUID generation
const appContent = fs.readFileSync('App.tsx', 'utf8');
const appUUIDMatches = appContent.match(/crypto\.randomUUID/g) || [];
if (appUUIDMatches.length > 0) {
  throw new Error(`[REJECTION CHECK FAILED] App.tsx contains ${appUUIDMatches.length} crypto.randomUUID() calls.`);
}

// 2. No inMemorySnapshots or inMemoryBridges in backend
function scanDir(dir, fn) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') scanDir(full, fn);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
      fn(full);
    }
  }
}

scanDir('backend', (file) => {
  assertNoMatch(/inMemorySnapshots/g, file, 'inMemorySnapshots');
  assertNoMatch(/inMemoryBridges/g, file, 'inMemoryBridges');
  assertNoMatch(/groundingSnapshot:\s*any/g, file, 'groundingSnapshot: any');
});

// 3. No bridge ID passed as Interview report session ID
assertNoMatch(/sessionId=\{sessionContext\?\.bridgeSessionId\}/g, 'App.tsx', 'bridge ID passed as session ID');

// 4. Production services call transactional PostgreSQL RPCs
assertMatch(/supabaseAdmin\.rpc\(['"]mutate_career_context_item['"]/g, 'backend/services/careerContextService.ts', 'mutate_career_context_item RPC call');
assertMatch(/supabaseAdmin\.rpc\(['"]create_grounding_snapshot_tx['"]/g, 'backend/services/groundingSnapshotService.ts', 'create_grounding_snapshot_tx RPC call');
assertMatch(/supabaseAdmin\.rpc\(['"]create_module_bridge_tx['"]/g, 'backend/services/moduleBridgeService.ts', 'create_module_bridge_tx RPC call');
assertMatch(/supabaseAdmin\.rpc\(['"]consume_module_bridge_tx['"]/g, 'backend/services/moduleBridgeService.ts', 'consume_module_bridge_tx RPC call');

// 5. P0-3 authority/atomicity regression guards (runtime PostgreSQL tests run in CI).
const correctionMigration = 'supabase/migrations/20260808000000_p0_3_authority_atomicity_corrections.sql';
assertMatch(/v_bridge\.status <> 'confirmed'/g, correctionMigration, 'single-use exact confirmed bridge guard');
assertMatch(/FOR UPDATE[\s\S]*p_expected_context_version/g, correctionMigration, 'locked expected snapshot version guard');
assertMatch(/item_status <> 'active'[\s\S]*inferred_pending[\s\S]*personal_contact/g, correctionMigration, 'snapshot consent eligibility guards');
assertMatch(/rebuild_career_context_tx/g, 'backend/services/careerContextService.ts', 'transactional rebuild RPC');
assertMatch(/set_personalization_preference_tx/g, 'backend/services/careerContextService.ts', 'transactional personalization preference RPC');
assertMatch(/source_record_id=v_draft#>>'\{source,recordId\}'/g, 'supabase/migrations/20260808020000_p0_3_plan_serialization_lineage_preference.sql', 'exact source-record lineage matching');
assertMatch(/JSON\.parse\(JSON\.stringify\(parsed\)\)/g, 'backend/services/interviewPlanService.ts', 'JSON-persistence-equivalent plan hashing');
assertNoMatch(/falling back to direct delete/g, 'backend/routes/meRoutes.ts', 'partial Career Context account deletion fallback');
assertMatch(/cleanup could not be verified/g, 'backend/routes/interviewRoutes.ts', 'orphan session cleanup failure response');
assertMatch(/hashInterviewPlan\(browserPlanPayload\)/g, 'backend/routes/interviewRoutes.ts', 'browser plan tamper rejection');
assertMatch(/bind_interview_plan_session_tx/g, 'backend/services/interviewPlanService.ts', 'atomic plan/session/bridge binding');
assertMatch(/INSERT INTO public\.career_context_items[\s\S]*pending_confirmation/g, 'supabase/migrations/20260808010000_p0_3_plan_and_item_lineage_corrections.sql', 'immutable successor item creation');
assertMatch(/career_context_snapshot_items/g, 'backend/services/groundingSnapshotService.ts', 'persisted snapshot membership lineage');


assertMatch(/v_existing_found:=FOUND/, 'supabase/migrations/20260808040000_p0_3_grounded_session_replay_authority.sql', 'bridge replay FOUND capture');
assertMatch(/usageCharged',false/, 'supabase/migrations/20260808040000_p0_3_grounded_session_replay_authority.sql', 'zero-charge canonical grounded replay');
assertMatch(/item_status='superseded'/, 'supabase/migrations/20260808040000_p0_3_grounded_session_replay_authority.sql', 'atomic predecessor supersession');
assertMatch(/Grounding snapshots and authoritative plan selectors require a valid bridgeSessionId/, 'backend/routes/interviewRoutes.ts', 'grounded bridge requirement');
assertMatch(/candidateRole: authoritativePlan\.plan\.jdInsights\.role/, 'backend/routes/interviewRoutes.ts', 'authoritative grounded role');
assertNoMatch(/'inferred',\s*'pending_confirmation'/g, 'scripts/verify-supabase-runtime.mjs', 'non-canonical pending provenance fixture');
assertMatch(/'inferred_pending',\s*'pending_confirmation'/g, 'scripts/verify-supabase-runtime.mjs', 'canonical first-confirmation fixture provenance');
const closureMigration = 'supabase/migrations/20260809000000_p0_3_consent_lineage_audit_closure.sql';
assertMatch(/consent->>'scope'='one_time'[\s\S]*snapshot_id=p_snapshot_id/g, closureMigration, 'one-time snapshot bridge reservation');
assertMatch(/item_status='pending_confirmation'[\s\S]*item_status='superseded'[\s\S]*superseded_by=v_new_id/g, closureMigration, 'obsolete pending successor convergence');
assertMatch(/superseded_by=p_item_id AND item_status='active'/g, closureMigration, 'newest successor active predecessor binding');
assertNoMatch(/questionSet\?\.\[idx\]\?\.groundingReferences/g, 'backend/services/aiService.ts', 'adaptive root-index grounding fallback');
const sourceClosureMigration = 'supabase/migrations/20260809010000_p0_3_source_and_clearspeak_authority.sql';
assertMatch(/p_source_manifest[\s\S]*provenance<>'user_edited'[\s\S]*item_status=CASE/, sourceClosureMigration, 'successful-source omission reconciliation preserving user edits');
assertMatch(/source_hash=COALESCE[\s\S]*item_status IN \('active','pending_confirmation'\)/, sourceClosureMigration, 'active lineage value replay detection');
assertMatch(/:reconcile:/, sourceClosureMigration, 'immutable source reversion successor identity');
assertMatch(/source_module=ANY\(p_source_modules\)/, sourceClosureMigration, 'transactional snapshot source-module validation');
assertMatch(/create_clearspeak_grounded_session_tx[\s\S]*status='consumed'[\s\S]*target_session_id=v_session_id/, sourceClosureMigration, 'atomic ClearSpeak session bridge consumption');
assertMatch(/sourceModules\.includes\(i\.source\.module\)/, 'App.tsx', 'frontend source-module filtering');
assertMatch(/conflictSelections/, 'components/GroundingPreviewModal.tsx', 'explicit grounding conflict selection');
assertNoMatch(/Failed to create grounding snapshot\/bridge:[\s\S]{0,180}onSkip\(\)/, 'App.tsx', 'silent ungrounded fallback after grounded confirmation');
const replayArtifactMigration = 'supabase/migrations/20260809020000_p0_3_replay_grounding_artifact_authority.sql';
assertMatch(/reserve_clearspeak_grounded_score_tx[\s\S]*content_hash<>p_submitted_hash/, replayArtifactMigration, 'generated-content integrity reservation before scoring');
assertMatch(/status='completed'[\s\S]*canonical_response/, replayArtifactMigration, 'canonical grounded score replay');
assertMatch(/groundingInput[\s\S]*generateSession\(profile, recentTopics, sessionAttemptLength, groundingInput\)/, 'backend/clearspeak/routes.ts', 'snapshot-grounded ClearSpeak generation');
assertNoMatch(/evaluateBridgeTrigger\(userId, prior\.score, false\)/, 'backend/clearspeak/routes.ts', 'hard-coded replay bridge trigger');
assertMatch(/getAuthoritativePlanForBridge[\s\S]*consumeUsage\(userId, 'interview_question'\)/, 'backend/routes/interviewRoutes.ts', 'Interview plan replay before usage charging');
const replayConvergenceMigration = 'supabase/migrations/20260809030000_p0_3_replay_grounding_convergence.sql';
assertMatch(/scoring_lease_expires_at[\s\S]*reservation_token/, replayConvergenceMigration, 'recoverable leased scoring reservation');
assertMatch(/status='scoring'[\s\S]*scoring_lease_expires_at>now\(\)/, replayConvergenceMigration, 'bounded scoring takeover');
assertMatch(/clearspeak_progress[\s\S]*FOR UPDATE[\s\S]*canonical_response/, replayConvergenceMigration, 'exactly-once grounded progress and canonical response');
assertMatch(/pg_advisory_xact_lock[\s\S]*client_request_id/, replayConvergenceMigration, 'serialized snapshot idempotency lookup');
assertMatch(/hashArtifactContent\(canonical\)/, 'backend/clearspeak/routes.ts', 'stable generated artifact content hash');
assertMatch(/generationArtifactId[\s\S]*generationArtifactHash/, 'shared/src/index.ts', 'grounded ClearSpeak content selectors in shared schema');
assertMatch(/All AI providers failed[\s\S]*grounding\?\.summary[\s\S]*passageData/, 'backend/clearspeak/generateService.ts', 'grounded final provider safety fallback');
const finalAuthorityMigration = 'supabase/migrations/20260809040000_p0_3_snapshot_replay_bridge_provenance.sql';
assertMatch(/sm\.module_name=p_source_module[\s\S]*VALUES\(v_bridge_id,p_user_id,v_source_module/, finalAuthorityMigration, 'bridge provenance derived from locked snapshot manifest');
assertMatch(/existingRequest[\s\S]*requestHashForVersion\(originalVersion\)[\s\S]*return replayed/, 'backend/services/groundingSnapshotService.ts', 'snapshot replay before live context validation');
assertMatch(/onGroundingConsumed[\s\S]*setClearSpeakGrounding/, 'App.tsx', 'consumed ClearSpeak grounding cleared after canonical completion');
assertMatch(/Using your selected experience[\s\S]*groundingReferences: grounded/, 'backend/services/aiService.ts', 'deterministic questions use referenced snapshot facts');
const launchReplayMigration = 'supabase/migrations/20260809050000_p0_3_launch_replay_record_authority.sql';
assertMatch(/career_context_snapshot_items[\s\S]*source_module=v_source_module[\s\S]*source_record_id=p_source_record_id/, launchReplayMigration, 'bridge source record validated against locked snapshot membership');
assertMatch(/snapshotClientRequestId[\s\S]*bridgeClientRequestId[\s\S]*clientRequestId: snapshotClientRequestId[\s\S]*clientRequestId: bridgeClientRequestId/, 'App.tsx', 'grounded launch request IDs survive response-loss retries');
assertMatch(/handleInterviewBridge[\s\S]*notifyGroundingConsumed[\s\S]*onInterviewBridge\(payload\)/, 'components/clearspeak/ClearSpeakDashboard.tsx', 'bridge acceptance clears consumed Resume grounding');
assertMatch(/const sessionGrounding = useRef\(grounding\)\.current/, 'components/clearspeak/ClearSpeakSession.tsx', 'mounted ClearSpeak session retains immutable grounding identity after parent handoff cleanup');
assertMatch(/const shouldRetry = !sessionGrounding/, 'components/clearspeak/ClearSpeakSession.tsx', 'completed grounded score cannot offer a misleading audio retry after parent handoff cleanup');
assertMatch(/state\.phase !== 'score_card'[\s\S]*onCanonicalGroundedScore/, 'components/clearspeak/ClearSpeakSession.tsx', 'grounding clears at canonical score completion');
assertMatch(/notifiedGroundingBridge[\s\S]*notifyGroundingConsumed/, 'components/clearspeak/ClearSpeakDashboard.tsx', 'canonical grounding completion notifies parent once');
assertMatch(/isValid && result\.content[\s\S]*applyAuthoritativeGrounding\(result\.content, profile, grounding\)[\s\S]*passageCache\.set\(cacheKey, \{ content: acceptedContent/, 'backend/clearspeak/generateService.ts', 'schema-valid provider content is deterministically grounded before cache/persistence');
assertMatch(/applyAuthoritativeGrounding\(fallback, profile, grounding\)/, 'backend/clearspeak/generateService.ts', 'provider and safety fallback share the authoritative grounding transformation');
const groundingFinalMigration = 'supabase/migrations/20260809060000_p0_3_grounding_authority_final_closure.sql';
assertMatch(/reserve_interview_plan_generation_tx[\s\S]*pg_advisory_xact_lock[\s\S]*usage_ledger/, groundingFinalMigration, 'grounded plan generation serialized before one usage charge');
assertMatch(/require_nonempty_grounding_snapshot/, groundingFinalMigration, 'database rejects empty grounded snapshots');
assertNoMatch(/bridges\/:bridgeId\/consume/, 'backend/routes/careerContextRoutes.ts', 'browser-directed generic bridge consumption');
assertMatch(/providerQuestionsAreGrounded[\s\S]*buildDeterministicInterviewPlan/, 'backend/services/aiService.ts', 'provider questions must materially use cited facts or fall back grounded');

console.log('[Rejection Checks] PASSED: mandatory architecture and P0-3 authority/atomicity guards passed.');
