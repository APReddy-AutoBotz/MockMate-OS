process.env.NODE_ENV = 'test';

import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serverModule = require('../backend/dist/server.js');
const app = serverModule.default || serverModule.app || serverModule;

console.log('[ClearSpeak -> Interview Journey] Starting Real HTTP ClearSpeak Grounding Journey...');

const server = http.createServer(app);
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;
const baseUrl = `http://localhost:${port}`;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer dev_user_a',
};

try {
  // 1. Fetch Career Context items
  const getRes = await fetch(`${baseUrl}/api/career-context`, { headers });
  if (getRes.status !== 200) throw new Error(`Expected 200 for GET career-context, got ${getRes.status}`);
  const getBody = await getRes.json();
  const itemIds = getBody.activeItems.map(i => i.id).filter(id => id.includes('-'));

  // 2. Create Grounding Snapshot for ClearSpeak -> Interview
  const snapRes = await fetch(`${baseUrl}/api/career-context/snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      purpose: 'clearspeak_to_interview',
      includedItemIds: itemIds,
      excludedItemIds: [],
      conflictSelections: {},
      consent: {
        scope: 'one_time',
        purpose: 'clearspeak_to_interview',
        includedItemIds: itemIds,
        excludedItemIds: [],
        sourceModules: ['clearspeak'],
        acknowledgedAt: new Date().toISOString(),
      },
      clientRequestId: 'snap_cs_int_1',
    }),
  });
  if (snapRes.status !== 200) {
    const errText = await snapRes.text();
    throw new Error(`Expected 200 for snapshot creation, got ${snapRes.status}: ${errText}`);
  }
  const snapBody = await snapRes.json();
  const snapshotId = snapBody.snapshot.id;

  // 3. Create Module Bridge
  const bridgeRes = await fetch(`${baseUrl}/api/career-context/bridges`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceModule: 'clearspeak',
      targetModule: 'interview',
      purpose: 'clearspeak_to_interview',
      snapshotId,
      clientRequestId: 'bridge_cs_int_1',
    }),
  });
  if (bridgeRes.status !== 200) {
    const bridgeErr = await bridgeRes.text();
    throw new Error(`Expected 200 for bridge creation, got ${bridgeRes.status}: ${bridgeErr}`);
  }
  const bridgeBody = await bridgeRes.json();
  const bridgeId = bridgeBody.bridge.id;

  // 4. Consume Bridge
  const targetSessionId = '77777777-7777-7777-7777-777777777777';
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
    throw new Error('ClearSpeak to Interview bridge consumption failed');
  }

  console.log('[ClearSpeak -> Interview Journey] PASSED: Real HTTP Grounding Journey verified 100%!');
} finally {
  server.close();
}
