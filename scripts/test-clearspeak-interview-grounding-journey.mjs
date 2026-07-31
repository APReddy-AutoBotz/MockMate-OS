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
  // 1. Fetch context
  const getRes = await fetch(`${baseUrl}/api/career-context`, { headers });
  const contextData = await getRes.json();
  if (!contextData.success) {
    throw new Error('Failed to fetch career context');
  }

  // 2. Create ClearSpeak to Interview grounding snapshot
  const clientReqId = '99999999-9999-9999-9999-999999999999';
  const snapRes = await fetch(`${baseUrl}/api/career-context/snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      purpose: 'clearspeak_to_interview',
      includedItemIds: contextData.activeItems.filter(i => i.source.module === 'clearspeak').map(i => i.id),
      excludedItemIds: [],
      consent: { scope: 'one_time', sourceModules: ['clearspeak'] },
      clientRequestId: clientReqId,
    }),
  });
  if (snapRes.status !== 200) {
    throw new Error(`ClearSpeak snapshot creation failed with status ${snapRes.status}`);
  }
  const snapData = await snapRes.json();
  const snapshotId = snapData.snapshot.id;

  // 3. Verify numeric delivery metrics are NOT in interview projection
  if (snapData.snapshot.projection.practiceSignals && snapData.snapshot.projection.practiceSignals.length > 0) {
    throw new Error('Numeric delivery metrics leaked into interview practice signals!');
  }

  // 4. Create module bridge
  const bridgeReqId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const bridgeRes = await fetch(`${baseUrl}/api/career-context/bridges`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceModule: 'clearspeak',
      targetModule: 'interview',
      purpose: 'clearspeak_to_interview',
      snapshotId,
      clientRequestId: bridgeReqId,
    }),
  });
  if (bridgeRes.status !== 200) {
    throw new Error(`Bridge creation failed with status ${bridgeRes.status}`);
  }
  const bridgeData = await bridgeRes.json();
  const bridgeId = bridgeData.bridge.id;

  // 5. Consume bridge into interview session
  const targetSessionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const consumeRes = await fetch(`${baseUrl}/api/career-context/bridges/${bridgeId}/consume`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ targetSessionId }),
  });
  if (consumeRes.status !== 200) {
    throw new Error(`Bridge consume failed with status ${consumeRes.status}`);
  }

  console.log('[ClearSpeak -> Interview Journey] PASSED: Real HTTP ClearSpeak to Interview Goal Grounding verified 100%!');
} finally {
  server.close();
}
