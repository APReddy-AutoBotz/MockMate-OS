process.env.NODE_ENV = 'test';

import http from 'node:http';
import { createRequire } from 'node:module';
import pkg from 'pg';
import { ensureTestDatabase } from './init-test-db.mjs';
const { Client } = pkg;

const require = createRequire(import.meta.url);

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const pgClient = new Client({ connectionString, connectionTimeoutMillis: 3000 });

try {
  await pgClient.connect();
  await ensureTestDatabase(pgClient);
} catch (err) {
  console.error('[API Journey] FAILED: Could not connect to disposable PostgreSQL database:', err.message);
  process.exit(1);
}

const userA = '11111111-1111-1111-1111-111111111111';
const itemA = '33333333-3333-3333-3333-333333333333';
const now = new Date().toISOString();

// Seed active item for User A in PostgreSQL
await pgClient.query(`
  INSERT INTO public.career_context_state (user_id, context_version, personalization_enabled, updated_at)
  VALUES ('${userA}', 1, true, '${now}')
  ON CONFLICT (user_id) DO UPDATE SET context_version = 1;
`);

await pgClient.query(`
  INSERT INTO public.career_context_items (id, user_id, item_kind, canonical_key, label, value, source_module, source_record_id, source_path, source_revision, source_hash, provenance, item_status, sensitivity, created_at, updated_at)
  VALUES ('${itemA}', '${userA}', 'target_role', 'resume.target_role', 'Target Role', '{"type":"text","text":"Senior Architect"}'::jsonb, 'resume', 'rec_api_1', 'target_role', 'v1', 'hash_api_1', 'user_confirmed', 'active', 'standard', '${now}', '${now}')
  ON CONFLICT (id) DO NOTHING;
`);

const serverModule = require('../backend/dist/server.js');
const app = serverModule.default || serverModule.app || serverModule;

console.log('[API Journey] Starting Real HTTP Server for Career Context API tests...');

const server = http.createServer(app);
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;
const baseUrl = `http://localhost:${port}`;

const headersUserA = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer dev_user_a',
};

const headersUserB = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer dev_user_b',
};

try {
  // 1. Unauthenticated Request -> 401
  const resUnauth = await fetch(`${baseUrl}/api/career-context`);
  if (resUnauth.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated request, got ${resUnauth.status}`);
  }

  // 2. GET /api/career-context for User A -> 200 OK
  const resGetA = await fetch(`${baseUrl}/api/career-context`, { headers: headersUserA });
  if (resGetA.status !== 200) {
    const text = await resGetA.text();
    throw new Error(`Expected 200 for GET /api/career-context, got ${resGetA.status}: ${text}`);
  }
  const getBodyA = await resGetA.json();
  if (!getBodyA.success || !getBodyA.state) {
    throw new Error('GET /api/career-context response missing success or state');
  }

  // 3. POST /api/career-context/preference -> 200 OK (FAIL ON 503!)
  const resPref = await fetch(`${baseUrl}/api/career-context/preference`, {
    method: 'POST',
    headers: headersUserA,
    body: JSON.stringify({ personalizationEnabled: true, expectedContextVersion: getBodyA.state.contextVersion }),
  });
  if (resPref.status !== 200) {
    const errText = await resPref.text();
    throw new Error(`Expected 200 OK for preference update, got ${resPref.status} (503 is forbidden!): ${errText}`);
  }

  // Verify database row for preference update directly
  const prefDbRow = await pgClient.query(`SELECT personalization_enabled FROM public.career_context_state WHERE user_id = '${userA}'`);
  if (prefDbRow.rows.length === 0 || !prefDbRow.rows[0].personalization_enabled) {
    throw new Error('Database row verification failed for preference update.');
  }

  // 4. POST /api/career-context/snapshots -> 200 OK (FAIL ON 503!)
  const clientReqId = '33333333-3333-3333-3333-333333333333';
  const resSnap = await fetch(`${baseUrl}/api/career-context/snapshots`, {
    method: 'POST',
    headers: headersUserA,
    body: JSON.stringify({
      purpose: 'resume_to_interview',
      includedItemIds: [itemA],
      excludedItemIds: [],
      conflictSelections: {},
      consent: {
        scope: 'one_time',
        purpose: 'resume_to_interview',
        includedItemIds: [itemA],
        excludedItemIds: [],
        sourceModules: ['resume'],
        acknowledgedAt: new Date().toISOString(),
      },
      clientRequestId: clientReqId,
    }),
  });

  if (resSnap.status !== 200) {
    const snapErr = await resSnap.text();
    throw new Error(`Expected 200 for snapshot creation, got ${resSnap.status} (503 is forbidden!): ${snapErr}`);
  }

  const snapBody = await resSnap.json();
  const snapshotId = snapBody.snapshot.id;

  // Verify database row for snapshot directly
  const snapDbRow = await pgClient.query(`SELECT id, purpose FROM public.career_context_snapshots WHERE id = '${snapshotId}' AND user_id = '${userA}'`);
  if (snapDbRow.rows.length === 0) {
    throw new Error(`Database row verification failed for snapshot '${snapshotId}'.`);
  }

  // 5. POST /api/career-context/bridges -> 200 OK
  const bridgeReqId = '44444444-4444-4444-4444-444444444444';
  const resBridge = await fetch(`${baseUrl}/api/career-context/bridges`, {
    method: 'POST',
    headers: headersUserA,
    body: JSON.stringify({
      sourceModule: 'resume',
      targetModule: 'interview',
      purpose: 'resume_to_interview',
      snapshotId,
      clientRequestId: bridgeReqId,
    }),
  });

  if (resBridge.status !== 200) {
    const bridgeErr = await resBridge.text();
    throw new Error(`Expected 200 for bridge creation, got ${resBridge.status}: ${bridgeErr}`);
  }
  const bridgeBody = await resBridge.json();
  const bridgeId = bridgeBody.bridge.id;

  // Verify database row for bridge directly
  const bridgeDbRow = await pgClient.query(`SELECT id, status FROM public.career_context_bridges WHERE id = '${bridgeId}' AND user_id = '${userA}'`);
  if (bridgeDbRow.rows.length === 0 || bridgeDbRow.rows[0].status !== 'confirmed') {
    throw new Error(`Database row verification failed for bridge '${bridgeId}'.`);
  }

  // 6. Cross-User Isolation -> User B accessing User A bridge -> 404/403
  const resConsumeB = await fetch(`${baseUrl}/api/career-context/bridges/${bridgeId}/consume`, {
    method: 'POST',
    headers: headersUserB,
    body: JSON.stringify({ targetSessionId: '77777777-7777-7777-7777-777777777777' }),
  });
  if (resConsumeB.status !== 404 && resConsumeB.status !== 403) {
    throw new Error(`Expected 404/403 for cross-user bridge consumption, got ${resConsumeB.status}`);
  }

  console.log('[API Journey] PASSED: Real HTTP Server and Career Context API verified 100% against disposable PostgreSQL database!');
} finally {
  server.close();
  await pgClient.end();
}
