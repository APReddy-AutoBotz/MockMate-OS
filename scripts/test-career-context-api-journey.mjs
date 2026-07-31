process.env.NODE_ENV = 'test';

import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
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
    throw new Error(`Expected 200 for GET /api/career-context, got ${resGetA.status}`);
  }
  const getBodyA = await resGetA.json();
  if (!getBodyA.success || !getBodyA.state) {
    throw new Error('GET /api/career-context response missing success or state');
  }

  // 3. POST /api/career-context/preference -> 200 OK
  const resPref = await fetch(`${baseUrl}/api/career-context/preference`, {
    method: 'POST',
    headers: headersUserA,
    body: JSON.stringify({ personalizationEnabled: true, expectedContextVersion: getBodyA.state.contextVersion }),
  });
  if (resPref.status !== 200) {
    throw new Error(`Expected 200 for preference update, got ${resPref.status}`);
  }

  // 4. POST /api/career-context/snapshots -> 200 OK
  const validUuid = '55555555-5555-5555-5555-555555555555';
  const clientReqId = '33333333-3333-3333-3333-333333333333';
  const resSnap = await fetch(`${baseUrl}/api/career-context/snapshots`, {
    method: 'POST',
    headers: headersUserA,
    body: JSON.stringify({
      purpose: 'resume_to_interview',
      includedItemIds: [validUuid],
      excludedItemIds: [],
      conflictSelections: {},
      consent: {
        scope: 'one_time',
        purpose: 'resume_to_interview',
        includedItemIds: [validUuid],
        excludedItemIds: [],
        sourceModules: ['resume'],
        acknowledgedAt: new Date().toISOString(),
      },
      clientRequestId: clientReqId,
    }),
  });
  if (resSnap.status !== 200) {
    const snapErr = await resSnap.text();
    throw new Error(`Expected 200 for snapshot creation, got ${resSnap.status}: ${snapErr}`);
  }
  const snapBody = await resSnap.json();
  const snapshotId = snapBody.snapshot.id;

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

  // 6. User B attempting to consume User A bridge -> 404 or 403
  const targetSessionId = '55555555-5555-5555-5555-555555555555';
  const resCrossConsume = await fetch(`${baseUrl}/api/career-context/bridges/${bridgeId}/consume`, {
    method: 'POST',
    headers: headersUserB,
    body: JSON.stringify({ targetSessionId }),
  });
  if (resCrossConsume.status !== 404 && resCrossConsume.status !== 403) {
    throw new Error(`Expected 404/403 for cross-user bridge consume, got ${resCrossConsume.status}`);
  }

  // 7. User A consuming own bridge -> 200 OK
  const resConsumeA = await fetch(`${baseUrl}/api/career-context/bridges/${bridgeId}/consume`, {
    method: 'POST',
    headers: headersUserA,
    body: JSON.stringify({ targetSessionId }),
  });
  if (resConsumeA.status !== 200) {
    const consumeErr = await resConsumeA.text();
    throw new Error(`Expected 200 for User A bridge consume, got ${resConsumeA.status}: ${consumeErr}`);
  }

  console.log('[API Journey] PASSED: Real HTTP API Career Context end-to-end suite verified 100%!');
} finally {
  server.close();
}
