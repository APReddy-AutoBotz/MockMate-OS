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
  assertNoMatch(/groundingReferences:\s*any/g, file, 'groundingReferences: any');
  assertNoMatch(/contextAudit:\s*any/g, file, 'contextAudit: any');
});

// 3. No bridge ID passed as Interview report session ID
assertNoMatch(/sessionId=\{sessionContext\?\.bridgeSessionId\}/g, 'App.tsx', 'bridge ID passed as session ID');
assertNoMatch(/\(sessionContext as any\)\?\.sessionId/g, 'App.tsx', 'sessionContext as any cast for report session ID');

// 4. No empty UUID grounded builders
assertNoMatch(/createResumeGroundedInterviewDraft\(\s*['"]['"]\s*,\s*['"]['"]/g, 'App.tsx', 'empty UUID grounded builder call');

// 5. Production services call transactional PostgreSQL RPCs exclusively
assertMatch(/supabaseAdmin\.rpc\(['"]rebuild_career_context_batch_tx['"]/g, 'backend/services/careerContextService.ts', 'rebuild_career_context_batch_tx RPC call');
assertMatch(/supabaseAdmin\.rpc\(['"]update_personalization_preference_tx['"]/g, 'backend/services/careerContextService.ts', 'update_personalization_preference_tx RPC call');
assertMatch(/supabaseAdmin\.rpc\(['"]create_grounding_snapshot_tx['"]/g, 'backend/services/groundingSnapshotService.ts', 'create_grounding_snapshot_tx RPC call');
assertMatch(/supabaseAdmin\.rpc\(['"]create_module_bridge_tx['"]/g, 'backend/services/moduleBridgeService.ts', 'create_module_bridge_tx RPC call');
assertMatch(/supabaseAdmin\.rpc\(['"]consume_module_bridge_tx['"]/g, 'backend/services/moduleBridgeService.ts', 'consume_module_bridge_tx RPC call');

// 6. No page.setContent in browser journey scripts
const journeyFiles = [
  'scripts/test-resume-interview-grounding-journey.mjs',
  'scripts/test-clearspeak-interview-grounding-journey.mjs',
  'scripts/test-resume-clearspeak-grounding-journey.mjs',
];

for (const journeyFile of journeyFiles) {
  assertNoMatch(/page\.setContent/g, journeyFile, 'page.setContent in Playwright journey');
  assertNoMatch(/process\.exit\(0\)/g, journeyFile, 'process.exit(0) early skip in Playwright journey');
  assertNoMatch(/SKIPPED/g, journeyFile, 'SKIPPED status in Playwright journey');
  assertNoMatch(/rebuildRes\.status === 503/g, journeyFile, '503 accepted as success in Playwright journey');
}

// 7. No 503 acceptance in Account Deletion script
assertNoMatch(/process\.exit\(0\)/g, 'scripts/test-career-context-account-deletion.mjs', 'process.exit(0) in deletion script');
assertNoMatch(/SKIPPED/g, 'scripts/test-career-context-account-deletion.mjs', 'SKIPPED status in deletion script');

// 8. CareerContextGetResponseSchema contains conflicts and projection
assertMatch(/conflicts:\s*z\.array/g, 'shared/src/index.ts', 'conflicts in CareerContextGetResponseSchema');
assertMatch(/projection:\s*GroundingProjectionSchema/g, 'shared/src/index.ts', 'projection in CareerContextGetResponseSchema');

console.log('[Rejection Checks] PASSED: All mandatory architectural rejection checks passed 100%!');
