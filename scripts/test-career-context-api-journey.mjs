process.env.NODE_ENV = 'test';

import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { installSupabaseAdminForTest } = require('../backend/dist/supabaseAdmin.js');
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

const USER_A = '11111111-1111-1111-1111-111111111111';
const ITEM_ID = '55555555-5555-5555-5555-555555555555';
const now = new Date().toISOString();

function createAuthoritativePersistenceDouble() {
  const tables = {
    career_context_state: [{ user_id: USER_A, context_version: 7, personalization_enabled: false, updated_at: now }],
    career_context_items: [{
      id: ITEM_ID, user_id: USER_A, item_kind: 'skill', canonical_key: 'skill:typescript',
      label: 'TypeScript', value: { type: 'string_list', values: ['TypeScript'] }, source_module: 'resume',
      source_record_id: 'resume-record-1', source_path: 'skills[0]', source_revision: '1',
      source_hash: 'authoritative-source-hash', exact_excerpt: 'Built production TypeScript services',
      provenance: 'user_confirmed', item_status: 'active', sensitivity: 'standard',
      created_at: now, updated_at: now, user_confirmed_at: now,
    }],
    career_context_snapshots: [],
    career_context_snapshot_items: [],
    career_context_bridges: [],
    interview_sessions: [], interview_turns: [],
    interview_generated_plans: [],
    resume_reviews: [], clearspeak_profiles: [], clearspeak_sessions: [],
  };
  const calls = [];
  const sourceErrors = {};

  class Query {
    constructor(table) { this.table = table; this.filters = []; this.operation = 'select'; this.payload = null; }
    select() { return this; }
    eq(column, value) { this.filters.push(row => row[column] === value); return this; }
    in(column, values) { this.filters.push(row => values.includes(row[column])); return this; }
    order() { return this; }
    insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }
    upsert(payload) { this.operation = 'upsert'; this.payload = payload; return this; }
    rows() { return (tables[this.table] || []).filter(row => this.filters.every(filter => filter(row))); }
    async execute(single = false, maybe = false) {
      if (sourceErrors[this.table]) return { data: null, error: { message: sourceErrors[this.table] } };
      let writtenRows = null;
      if (this.operation === 'insert' || this.operation === 'upsert') {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(row => ({
          ...(this.table === 'interview_sessions' && !row.id ? { id: '77777777-7777-4777-8777-777777777777' } : {}),
          ...(this.table === 'interview_generated_plans' && !row.id ? { id: '66666666-6666-4666-8666-666666666666', plan_version: 1 } : {}),
          ...row,
        }));
        for (const row of rows) {
          const index = (tables[this.table] || []).findIndex(existing => existing.user_id && existing.user_id === row.user_id);
          if (this.operation === 'upsert' && index >= 0) tables[this.table][index] = { ...tables[this.table][index], ...row };
          else tables[this.table].push({ ...row });
        }
        writtenRows = rows;
      }
      let rows = writtenRows || this.rows();
      if (this.table === 'career_context_snapshot_items') {
        rows = rows.map(row => ({
          ...row,
          career_context_items: tables.career_context_items.find(item => item.id === row.item_id),
        }));
      }
      if (single || maybe) return { data: rows[0] || null, error: single && rows.length !== 1 ? { message: 'Row not found' } : null };
      return { data: rows, error: null };
    }
    single() { return this.execute(true, false); }
    maybeSingle() { return this.execute(false, true); }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }

  const client = {
    from(table) {
      if (!(table in tables)) throw new Error(`Unexpected authoritative table: ${table}`);
      return new Query(table);
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'rebuild_career_context_tx') {
        const state = tables.career_context_state.find(row => row.user_id === args.p_user_id);
        state.context_version += 1; state.updated_at = now;
        return { data: { addedCount: args.p_drafts.length, updatedCount: 0, unchangedCount: 0 }, error: null };
      }
      if (name === 'create_grounding_snapshot_tx') {
        const state = tables.career_context_state.find(row => row.user_id === args.p_user_id);
        if (!state || state.context_version !== args.p_expected_context_version) return { data: null, error: { message: 'Stale or mismatched context version' } };
        const items = tables.career_context_items.filter(item => args.p_item_ids.includes(item.id) && item.user_id === args.p_user_id);
        if (items.length !== args.p_item_ids.length || items.some(item => item.item_status !== 'active' || item.provenance !== 'user_confirmed' || item.sensitivity === 'personal_contact')) {
          return { data: null, error: { message: 'Snapshot item is not transactionally eligible' } };
        }
        const snapshotId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        tables.career_context_snapshots.push({
          id: snapshotId, user_id: args.p_user_id, purpose: args.p_purpose,
          context_version: state.context_version, projection: args.p_projection,
          conflicts: args.p_conflicts, consent: args.p_consent,
          source_modules: args.p_source_modules, created_at: now,
        });
        items.forEach((item, position) => tables.career_context_snapshot_items.push({ snapshot_id: snapshotId, item_id: item.id, position }));
        return { data: { snapshotId }, error: null };
      }
      if (name === 'create_module_bridge_tx') {
        const snapshot = tables.career_context_snapshots.find(row => row.id === args.p_snapshot_id && row.user_id === args.p_user_id);
        if (!snapshot || snapshot.purpose !== args.p_purpose) return { data: null, error: { message: 'Bridge snapshot ownership mismatch' } };
        const bridgeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        tables.career_context_bridges.push({
          id: bridgeId, user_id: args.p_user_id, source_module: args.p_source_module,
          target_module: args.p_target_module, purpose: args.p_purpose,
          snapshot_id: args.p_snapshot_id, source_record_id: args.p_source_record_id,
          client_request_id: args.p_client_request_id, status: 'confirmed',
          created_at: now, updated_at: now, confirmed_at: now,
        });
        return { data: { bridgeId }, error: null };
      }
      if (name === 'bind_interview_plan_session_tx') {
        const plan = tables.interview_generated_plans.find(row => row.id === args.p_plan_id && row.user_id === args.p_user_id);
        const bridge = tables.career_context_bridges.find(row => row.id === args.p_bridge_id && row.user_id === args.p_user_id);
        const session = tables.interview_sessions.find(row => row.id === args.p_session_id && row.user_id === args.p_user_id);
        if (!plan || !bridge || !session || plan.plan_hash !== args.p_plan_hash || plan.bridge_id !== bridge.id || plan.snapshot_id !== bridge.snapshot_id) return { data: null, error: { message: 'Plan lineage mismatch' } };
        if (plan.session_id) return plan.session_id === session.id ? { data: { sessionId: session.id, replayed: true }, error: null } : { data: null, error: { message: 'Plan already consumed' } };
        if (bridge.status !== 'confirmed') return { data: null, error: { message: 'Bridge already consumed' } };
        Object.assign(plan, { session_id: session.id, consumed_at: now });
        Object.assign(bridge, { status: 'consumed', target_session_id: session.id, consumed_at: now, updated_at: now });
        return { data: { sessionId: session.id, replayed: false }, error: null };
      }
      if (name === 'consume_module_bridge_tx') {
        const bridge = tables.career_context_bridges.find(row => row.id === args.p_bridge_id);
        if (!bridge) return { data: null, error: { message: 'Bridge not found' } };
        if (bridge.user_id !== args.p_user_id) return { data: null, error: { message: 'Bridge not owned or access denied' } };
        if (bridge.status !== 'confirmed') return { data: null, error: { message: 'Bridge has already been consumed' } };
        const session = tables.interview_sessions.find(row => row.id === args.p_target_session_id && row.user_id === args.p_user_id);
        if (!session) return { data: null, error: { message: 'Target session not found or access denied' } };
        Object.assign(bridge, { status: 'consumed', target_session_id: session.id, consumed_at: now, updated_at: now });
        return { data: { bridgeId: bridge.id }, error: null };
      }
      return { data: null, error: { message: `Unexpected authoritative RPC: ${name}` } };
    },
  };
  return { client, calls, tables, sourceErrors };
}

try {
  // 1. Unauthenticated Request -> 401
  const resUnauth = await fetch(`${baseUrl}/api/career-context`);
  if (resUnauth.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated request, got ${resUnauth.status}`);
  }

  // 2. Fail closed before authoritative persistence is installed.
  const resUnavailable = await fetch(`${baseUrl}/api/career-context`, { headers: headersUserA });
  if (resUnavailable.status !== 503) {
    throw new Error(`Expected retryable 503 without authoritative persistence, got ${resUnavailable.status}`);
  }

  // The positive journey uses a stateful server-authoritative contract double; it is
  // deliberately installed after the negative assertion and is never a product fallback.
  const authoritative = createAuthoritativePersistenceDouble();
  installSupabaseAdminForTest(authoritative.client);

  // 3. Every authoritative rebuild source fails closed before the rebuild mutation.
  for (const sourceTable of ['resume_reviews', 'clearspeak_profiles', 'clearspeak_sessions', 'interview_sessions']) {
    authoritative.sourceErrors[sourceTable] = `${sourceTable} unavailable`;
    const callsBefore = authoritative.calls.filter(call => call.name === 'rebuild_career_context_tx').length;
    const versionBefore = authoritative.tables.career_context_state[0].context_version;
    const failedRebuild = await fetch(`${baseUrl}/api/career-context/rebuild`, { method: 'POST', headers: headersUserA });
    if (failedRebuild.status !== 503 || authoritative.calls.filter(call => call.name === 'rebuild_career_context_tx').length !== callsBefore || authoritative.tables.career_context_state[0].context_version !== versionBefore) {
      throw new Error(`${sourceTable} failure did not abort rebuild with zero writes/version delta`);
    }
    delete authoritative.sourceErrors[sourceTable];
  }
  const successfulRebuild = await fetch(`${baseUrl}/api/career-context/rebuild`, { method: 'POST', headers: headersUserA });
  if (successfulRebuild.status !== 200 || authoritative.calls.filter(call => call.name === 'rebuild_career_context_tx').length !== 1) {
    throw new Error('All-source-success rebuild did not use exactly one authoritative atomic mutation');
  }

  // 4. GET /api/career-context for User A -> governed state and active item.
  const resGetA = await fetch(`${baseUrl}/api/career-context`, { headers: headersUserA });
  if (resGetA.status !== 200) {
    throw new Error(`Expected 200 for GET /api/career-context, got ${resGetA.status}`);
  }
  const getBodyA = await resGetA.json();
  if (!getBodyA.success || !getBodyA.state) {
    throw new Error('GET /api/career-context response missing success or state');
  }

  if (getBodyA.state.contextVersion !== 8 || getBodyA.activeItems[0]?.id !== ITEM_ID) {
    throw new Error('GET did not return authoritative versioned Career Context state');
  }

  // 4. Advance the authoritative context version through the preference API.
  const resPref = await fetch(`${baseUrl}/api/career-context/preference`, {
    method: 'POST',
    headers: headersUserA,
    body: JSON.stringify({ personalizationEnabled: true, expectedContextVersion: getBodyA.state.contextVersion }),
  });
  if (resPref.status !== 200) throw new Error(`Expected 200 for authoritative preference update, got ${resPref.status}`);
  const prefBody = await resPref.json();
  if (prefBody.state.contextVersion !== 9) throw new Error('Preference update did not advance context version');

  // 5. Create a transactionally validated consent snapshot at the new version.
  const clientReqId = '33333333-3333-3333-3333-333333333333';
  const resSnap = await fetch(`${baseUrl}/api/career-context/snapshots`, {
    method: 'POST',
    headers: headersUserA,
    body: JSON.stringify({
      purpose: 'resume_to_interview',
      includedItemIds: [ITEM_ID],
      excludedItemIds: [],
      conflictSelections: {},
      consent: {
        scope: 'one_time',
        purpose: 'resume_to_interview',
        includedItemIds: [ITEM_ID],
        excludedItemIds: [],
        sourceModules: ['resume'],
        acknowledgedAt: new Date().toISOString(),
      },
      expectedContextVersion: prefBody.state.contextVersion,
      clientRequestId: clientReqId,
    }),
  });

  if (resSnap.status !== 200) {
    const snapErr = await resSnap.text();
    throw new Error(`Expected 200 for authoritative snapshot creation, got ${resSnap.status}: ${snapErr}`);
  }

  const snapBody = await resSnap.json();
  const snapshotId = snapBody.snapshot.id;
  const reference = snapBody.snapshot.groundingReferences?.[0];
  if (snapBody.snapshot.contextVersion !== 9 || snapBody.snapshot.consent.includedItemIds[0] !== ITEM_ID ||
      reference?.contextItemId !== ITEM_ID || reference?.exactExcerpt !== 'Built production TypeScript services') {
    throw new Error('Snapshot did not preserve authoritative version, consent, and grounding-reference lineage');
  }

  // 6. Create an authoritative bridge bound to that snapshot.
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

  // 7. Cross-user isolation rejects User B before any bridge mutation.
  const resConsumeB = await fetch(`${baseUrl}/api/career-context/bridges/${bridgeId}/consume`, {
    method: 'POST',
    headers: headersUserB,
    body: JSON.stringify({ targetSessionId: '77777777-7777-4777-8777-777777777777' }),
  });
  if (resConsumeB.status !== 404 && resConsumeB.status !== 403) {
    throw new Error(`Expected 404/403 for cross-user bridge consumption, got ${resConsumeB.status}`);
  }

  // 8. Starting a real API session reconstructs question references from the
  // authoritative snapshot, persists that context, and consumes the bridge.
  const controls = {
    difficulty: 'intermediate', totalQuestions: 1, includeBehavioral: true,
    includeCoding: false, timePerQuestion: '90s', deliveryMode: 'exam',
    reasoningMode: 'classic_behavioral', sourceMode: 'job_description',
  };
  const planResponse = await fetch(`${baseUrl}/api/interview/plan`, { method: 'POST', headers: headersUserA, body: JSON.stringify({
    role: 'Backend Engineer', intent: 'Practice grounded examples', controls, selectedPanelIDs: ['p1'], snapshotId, bridgeId,
  }) });
  if (planResponse.status !== 200) throw new Error(`Expected authoritative plan, got ${planResponse.status}: ${await planResponse.text()}`);
  const authoritativePlan = await planResponse.json();
  const tamperedPlan = structuredClone(authoritativePlan);
  tamperedPlan.questionSet[0].question = 'Browser fabricated question';
  const tampered = await fetch(`${baseUrl}/api/interview/sessions`, { method: 'POST', headers: headersUserA, body: JSON.stringify({ context: {
    candidateRole: 'Backend Engineer', intentText: 'Practice grounded examples', selectedPanelIDs: ['p1'], sessionType: 'structured', controls,
    interviewPlan: tamperedPlan, groundingSnapshot: snapBody.snapshot, bridgeSessionId: bridgeId,
  } }) });
  if (tampered.status !== 422 || authoritative.tables.interview_sessions.length !== 0 || authoritative.tables.career_context_bridges[0].status !== 'confirmed') throw new Error('Tampered plan reached session creation or consumed bridge');

  const resSession = await fetch(`${baseUrl}/api/interview/sessions`, {
    method: 'POST', headers: headersUserA, body: JSON.stringify({
      context: {
        candidateRole: 'Backend Engineer', intentText: 'Practice grounded examples',
        selectedPanelIDs: ['p1'], sessionType: 'structured', controls,
        interviewPlan: authoritativePlan,
        groundingSnapshot: snapBody.snapshot,
        bridgeSessionId: bridgeId,
      },
    }),
  });
  if (resSession.status !== 200) {
    throw new Error(`Expected 200 for grounded authoritative session start, got ${resSession.status}: ${await resSession.text()}`);
  }
  const session = await resSession.json();
  const persistedSession = authoritative.tables.interview_sessions.find(row => row.id === session.sessionId);
  const persistedRef = persistedSession?.setup?.interviewPlan?.questionSet?.[0]?.groundingReferences?.[0];
  if (persistedRef?.contextItemId !== ITEM_ID || persistedRef?.exactExcerpt !== 'Built production TypeScript services') {
    throw new Error('Session did not persist authoritative snapshot grounding-reference lineage');
  }
  const consumedBridge = authoritative.tables.career_context_bridges[0];
  if (consumedBridge.status !== 'consumed' || consumedBridge.target_session_id !== session.sessionId) {
    throw new Error('Grounded session did not atomically bind the consumed bridge to its real session ID');
  }

  // 9. Exact response-loss replay returns the one canonical session without another write or bridge consumption.
  const exactReplay = await fetch(`${baseUrl}/api/interview/sessions`, { method: 'POST', headers: headersUserA, body: JSON.stringify({ context: {
    candidateRole: 'Backend Engineer', intentText: 'Practice grounded examples', selectedPanelIDs: ['p1'], sessionType: 'structured', controls,
    interviewPlan: authoritativePlan, groundingSnapshot: snapBody.snapshot, bridgeSessionId: bridgeId,
  } }) });
  const exactReplayBody = await exactReplay.json();
  if (exactReplay.status !== 200 || exactReplayBody.sessionId !== session.sessionId || authoritative.tables.interview_sessions.length !== 1) {
    throw new Error('Exact response-loss replay did not return one canonical session');
  }

  // Direct bridge replay remains rejected and cannot overwrite target_session_id.
  const replay = await fetch(`${baseUrl}/api/career-context/bridges/${bridgeId}/consume`, {
    method: 'POST', headers: headersUserA, body: JSON.stringify({ targetSessionId: session.sessionId }),
  });
  if (replay.status !== 409) throw new Error(`Expected 409 for consumed-bridge replay, got ${replay.status}`);
  if (authoritative.tables.career_context_bridges[0].target_session_id !== session.sessionId) {
    throw new Error('Consumed bridge target session was overwritten');
  }

  const rpcNames = authoritative.calls.map(call => call.name);
  for (const required of ['create_grounding_snapshot_tx', 'create_module_bridge_tx', 'bind_interview_plan_session_tx']) {
    if (!rpcNames.includes(required)) throw new Error(`Positive journey bypassed authoritative RPC ${required}`);
  }

  console.log('[API Journey] PASSED: Real HTTP Server and Career Context API verified 100%!');
} finally {
  installSupabaseAdminForTest(null);
  server.close();
}
