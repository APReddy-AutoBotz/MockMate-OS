import app from '../backend/dist/server.js';
import http from 'node:http';

console.log('[Resume -> ClearSpeak Journey] Starting Real HTTP Resume to ClearSpeak Grounding Journey...');

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

  // 2. Create Resume to ClearSpeak grounding snapshot
  const clientReqId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const snapRes = await fetch(`${baseUrl}/api/career-context/snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      purpose: 'resume_to_clearspeak',
      includedItemIds: contextData.activeItems.filter(i => i.source.module === 'resume').map(i => i.id),
      excludedItemIds: [],
      consent: { scope: 'one_time', sourceModules: ['resume'] },
      clientRequestId: clientReqId,
    }),
  });
  if (snapRes.status !== 200) {
    throw new Error(`Resume to ClearSpeak snapshot creation failed with status ${snapRes.status}`);
  }
  const snapData = await snapRes.json();

  // 3. Verify personal contact PII is absent from projection
  const textPayload = JSON.stringify(snapData.snapshot.projection);
  if (textPayload.includes('alice@example.com') || textPayload.includes('555-1234')) {
    throw new Error('Personal contact PII detected in projection!');
  }

  console.log('[Resume -> ClearSpeak Journey] PASSED: Real HTTP Resume to ClearSpeak PII-Safe Grounding verified 100%!');
} finally {
  server.close();
}
