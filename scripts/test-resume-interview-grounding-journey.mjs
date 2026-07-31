process.env.NODE_ENV = 'test';

import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serverModule = require('../backend/dist/server.js');
const app = serverModule.default || serverModule.app || serverModule;

console.log('[Resume -> Interview Journey] Starting Real HTTP End-to-End Grounding Journey...');

const server = http.createServer(app);
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;
const baseUrl = `http://localhost:${port}`;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer dev_user_a',
};

try {
  // 1. Ingest Resume items
  const rebuildRes = await fetch(`${baseUrl}/api/career-context/rebuild`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceModule: 'resume',
      recordId: 'res_123',
      revision: 'v1',
      items: [
        { itemKind: 'target_role', canonicalKey: 'resume.target_role', label: 'Target Role', value: { type: 'text', text: 'Senior Staff Engineer' }, sourcePath: 'role', exactExcerpt: 'Senior Staff Engineer', sensitivity: 'standard' },
        { itemKind: 'skill', canonicalKey: 'resume.skills', label: 'Primary Skill', value: { type: 'string_list', values: ['Distributed Systems', 'PostgreSQL'] }, sourcePath: 'skills', exactExcerpt: 'Distributed Systems', sensitivity: 'standard' },
      ],
    }),
  });
  if (rebuildRes.status !== 200) {
    throw new Error(`Expected 200 for resume rebuild, got ${rebuildRes.status}`);
  }

  // 2. Fetch Career Context
  const getRes = await fetch(`${baseUrl}/api/career-context`, { headers });
  if (getRes.status !== 200) throw new Error(`Expected 200 for GET career-context, got ${getRes.status}`);
  const getBody = await getRes.json();
  const itemIds = getBody.activeItems.map(i => i.id).filter(id => id.includes('-'));

  // 3. Create Grounding Snapshot
  const snapRes = await fetch(`${baseUrl}/api/career-context/snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      purpose: 'resume_to_interview',
      includedItemIds: itemIds,
      excludedItemIds: [],
      conflictSelections: {},
      consent: {
        scope: 'one_time',
        purpose: 'resume_to_interview',
        includedItemIds: itemIds,
        excludedItemIds: [],
        sourceModules: ['resume'],
        acknowledgedAt: new Date().toISOString(),
      },
      clientRequestId: 'snap_resume_int_1',
    }),
  });
  if (snapRes.status !== 200) {
    const errText = await snapRes.text();
    throw new Error(`Expected 200 for snapshot creation, got ${snapRes.status}: ${errText}`);
  }
  const snapBody = await snapRes.json();
  const snapshotId = snapBody.snapshot.id;

  // 4. Create Module Bridge
  const bridgeRes = await fetch(`${baseUrl}/api/career-context/bridges`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceModule: 'resume',
      targetModule: 'interview',
      purpose: 'resume_to_interview',
      snapshotId,
      clientRequestId: 'bridge_resume_int_1',
    }),
  });
  if (bridgeRes.status !== 200) {
    const bridgeErr = await bridgeRes.text();
    throw new Error(`Expected 200 for bridge creation, got ${bridgeRes.status}: ${bridgeErr}`);
  }
  const bridgeBody = await bridgeRes.json();
  const bridgeId = bridgeBody.bridge.id;

  // 5. Consume Bridge into Interview Session
  const targetSessionId = '66666666-6666-6666-6666-666666666666';
  const consumeRes = await fetch(`${baseUrl}/api/career-context/bridges/${bridgeId}/consume`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ targetSessionId }),
  });
  if (consumeRes.status !== 200) {
    const consumeErr = await consumeRes.text();
    throw new Error(`Expected 200 for bridge consumption, got ${consumeRes.status}: ${consumeErr}`);
  }
  const consumeBody = await consumeRes.json();

  if (!consumeBody.projection || consumeBody.bridge.status !== 'consumed') {
    throw new Error('Bridge consumption failed to return valid projection or consumed status');
  }

  console.log('[Resume -> Interview Journey] PASSED: Real HTTP End-to-End Grounding Journey verified 100%!');
} finally {
  server.close();
}
