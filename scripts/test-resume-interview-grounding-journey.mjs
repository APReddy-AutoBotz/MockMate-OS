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
  // 1. Rebuild context items from Resume
  const rebuildRes = await fetch(`${baseUrl}/api/career-context/rebuild`, {
    method: 'POST',
    headers,
  });
  if (rebuildRes.status !== 200) {
    throw new Error(`Rebuild failed with status ${rebuildRes.status}`);
  }

  // 2. Fetch context items
  const getRes = await fetch(`${baseUrl}/api/career-context`, { headers });
  const contextData = await getRes.json();
  if (!contextData.success) {
    throw new Error('Failed to fetch career context');
  }

  // 3. Create grounding snapshot
  const clientReqId = '66666666-6666-6666-6666-666666666666';
  const snapRes = await fetch(`${baseUrl}/api/career-context/snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      purpose: 'resume_to_interview',
      includedItemIds: contextData.activeItems.map(i => i.id),
      excludedItemIds: [],
      consent: { scope: 'one_time', sourceModules: ['resume'] },
      clientRequestId: clientReqId,
    }),
  });
  if (snapRes.status !== 200) {
    throw new Error(`Snapshot creation failed with status ${snapRes.status}`);
  }
  const snapData = await snapRes.json();
  const snapshotId = snapData.snapshot.id;

  // 4. Create module bridge
  const bridgeReqId = '77777777-7777-7777-7777-777777777777';
  const bridgeRes = await fetch(`${baseUrl}/api/career-context/bridges`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceModule: 'resume',
      targetModule: 'interview',
      purpose: 'resume_to_interview',
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
  const targetSessionId = '88888888-8888-8888-8888-888888888888';
  const consumeRes = await fetch(`${baseUrl}/api/career-context/bridges/${bridgeId}/consume`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ targetSessionId }),
  });
  if (consumeRes.status !== 200) {
    throw new Error(`Bridge consume failed with status ${consumeRes.status}`);
  }

  console.log('[Resume -> Interview Journey] PASSED: Real HTTP Resume to Interview Grounding flow verified 100%!');
} finally {
  server.close();
}
