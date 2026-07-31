process.env.NODE_ENV = 'test';

import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serverModule = require('../backend/dist/server.js');
const app = serverModule.default || serverModule.app || serverModule;

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
  // 1. Fetch Career Context items
  const getRes = await fetch(`${baseUrl}/api/career-context`, { headers });
  if (getRes.status !== 200) throw new Error(`Expected 200 for GET career-context, got ${getRes.status}`);
  const getBody = await getRes.json();
  const itemIds = getBody.activeItems.map(i => i.id).filter(id => id.includes('-'));

  // 2. Create Grounding Snapshot for ClearSpeak
  const snapRes = await fetch(`${baseUrl}/api/career-context/snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      purpose: 'resume_to_clearspeak',
      includedItemIds: itemIds,
      excludedItemIds: [],
      conflictSelections: {},
      consent: {
        scope: 'one_time',
        purpose: 'resume_to_clearspeak',
        includedItemIds: itemIds,
        excludedItemIds: [],
        sourceModules: ['resume'],
        acknowledgedAt: new Date().toISOString(),
      },
      clientRequestId: 'snap_resume_cs_1',
    }),
  });
  if (snapRes.status !== 200) {
    const errText = await snapRes.text();
    throw new Error(`Expected 200 for snapshot creation, got ${snapRes.status}: ${errText}`);
  }
  const snapBody = await snapRes.json();
  const snapshot = snapBody.snapshot;

  if (!snapshot || snapshot.purpose !== 'resume_to_clearspeak') {
    throw new Error('Resume to ClearSpeak snapshot creation failed');
  }

  console.log('[Resume -> ClearSpeak Journey] PASSED: Real HTTP Grounding Journey verified 100%!');
} finally {
  server.close();
}
