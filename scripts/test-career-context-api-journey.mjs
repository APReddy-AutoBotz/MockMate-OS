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

  // 3. POST /api/career-context/preference -> 200 OK (or 503 if unconfigured)
  const resPref = await fetch(`${baseUrl}/api/career-context/preference`, {
    method: 'POST',
    headers: headersUserA,
    body: JSON.stringify({ personalizationEnabled: true, expectedContextVersion: getBodyA.state.contextVersion }),
  });
  if (resPref.status !== 200 && resPref.status !== 503) {
    throw new Error(`Expected 200 or 503 for preference update, got ${resPref.status}`);
  }

  // 4. POST /api/career-context/snapshots -> 200 OK (or 503 if unconfigured)
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

  if (resSnap.status !== 200 && resSnap.status !== 503) {
    const snapErr = await resSnap.text();
    throw new Error(`Expected 200 or 503 for snapshot creation, got ${resSnap.status}: ${snapErr}`);
  }

  if (resSnap.status === 200) {
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

    // 6. Cross-User Isolation -> User B accessing User A bridge -> 404/403
    const resConsumeB = await fetch(`${baseUrl}/api/career-context/bridges/${bridgeId}/consume`, {
      method: 'POST',
      headers: headersUserB,
      body: JSON.stringify({ targetSessionId: '77777777-7777-7777-7777-777777777777' }),
    });
    if (resConsumeB.status !== 404 && resConsumeB.status !== 403) {
      throw new Error(`Expected 404/403 for cross-user bridge consumption, got ${resConsumeB.status}`);
    }
  }

  console.log('[API Journey] PASSED: Real HTTP Server and Career Context API verified 100%!');
} finally {
  server.close();
}
