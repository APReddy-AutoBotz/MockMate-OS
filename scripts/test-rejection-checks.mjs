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
assertNoMatch(/falling back to direct delete/g, 'backend/routes/meRoutes.ts', 'partial Career Context account deletion fallback');
assertMatch(/cleanup could not be verified/g, 'backend/routes/interviewRoutes.ts', 'orphan session cleanup failure response');
assertMatch(/hashInterviewPlan\(browserPlanPayload\)/g, 'backend/routes/interviewRoutes.ts', 'browser plan tamper rejection');
assertMatch(/bind_interview_plan_session_tx/g, 'backend/services/interviewPlanService.ts', 'atomic plan/session/bridge binding');
assertMatch(/INSERT INTO public\.career_context_items[\s\S]*pending_confirmation/g, 'supabase/migrations/20260808010000_p0_3_plan_and_item_lineage_corrections.sql', 'immutable successor item creation');
assertMatch(/career_context_snapshot_items/g, 'backend/services/groundingSnapshotService.ts', 'persisted snapshot membership lineage');

console.log('[Rejection Checks] PASSED: mandatory architecture and P0-3 authority/atomicity guards passed.');
