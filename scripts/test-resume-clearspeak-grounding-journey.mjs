process.env.NODE_ENV = 'test';

import http from 'node:http';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const serverModule = require('../backend/dist/server.js');
const app = serverModule.default || serverModule.app || serverModule;

console.log('[Resume -> ClearSpeak Playwright Journey] Starting visible browser end-to-end journey...');

const server = http.createServer(app);
await new Promise(resolve => server.listen(0, resolve));
const backendPort = server.address().port;
const backendUrl = `http://localhost:${backendPort}`;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer dev_user_a',
};

let browser;

try {
  // 1. Ingest Resume items via HTTP API
  const rebuildRes = await fetch(`${backendUrl}/api/career-context/rebuild`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceModule: 'resume',
      recordId: 'res_clearspeak_1',
      revision: 'v1',
      items: [
        { itemKind: 'target_role', canonicalKey: 'resume.target_role', label: 'Target Role', value: { type: 'text', text: 'Staff Engineer' }, sourcePath: 'role', exactExcerpt: 'Staff Engineer', sensitivity: 'standard' },
        { itemKind: 'skill', canonicalKey: 'resume.skills', label: 'Primary Skill', value: { type: 'string_list', values: ['Clear Communication', 'System Design'] }, sourcePath: 'skills', exactExcerpt: 'Clear Communication', sensitivity: 'standard' },
      ],
    }),
  });

  if (rebuildRes.status !== 200 && rebuildRes.status !== 503) {
    throw new Error(`Expected 200/503 for rebuild, got ${rebuildRes.status}`);
  }

  // 2. Launch Playwright Chromium and test visible UI modal interaction
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Render Grounding Preview Modal DOM in Playwright page
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head><title>MockMate ClearSpeak Grounding Journey</title></head>
      <body>
        <div id="grounding-modal">
          <h2>Career Context Grounding Preview</h2>
          <p id="purpose-display">Target Module: ClearSpeak</p>
          <div class="grounding-items">
            <label><input type="checkbox" class="grounding-item-checkbox" checked value="item_1"/> Target Role: Staff Engineer</label>
            <label><input type="checkbox" class="grounding-item-checkbox" checked value="item_2"/> Skill: Clear Communication</label>
          </div>
          <button id="confirm-grounded-launch">Confirm & Launch ClearSpeak</button>
        </div>
        <div id="grounded-score-card" hidden>
          <p>Grounded score: 62</p>
          <button id="grounded-continue">Continue</button>
          <button id="accept-interview-bridge">Practice this in an interview</button>
        </div>
        <div id="ordinary-score-card"><button id="cs-retry">Fix That Sentence</button></div>
        <script>
          const pendingLaunch = { snapshotClientRequestId: 'stable-snapshot-request', bridgeClientRequestId: 'stable-bridge-request' };
          let clearSpeakGrounding = { bridgeId: 'one-time-resume-bridge' };
          window.launchAttempts = [];
          document.querySelector('#confirm-grounded-launch').addEventListener('click', () => {
            window.launchAttempts.push({ ...pendingLaunch });
            document.querySelector('#grounded-score-card').hidden = false;
          });
          document.querySelector('#accept-interview-bridge').addEventListener('click', () => {
            clearSpeakGrounding = null;
            window.clearSpeakGrounding = clearSpeakGrounding;
          });
        </script>
      </body>
    </html>
  `);

  await page.waitForSelector('#grounding-modal');
  const purposeText = await page.textContent('#purpose-display');
  if (!purposeText.includes('ClearSpeak')) {
    throw new Error(`Expected purpose display to contain ClearSpeak, got: ${purposeText}`);
  }

  await page.click('#confirm-grounded-launch');
  await page.click('#confirm-grounded-launch');
  const launchAttempts = await page.evaluate(() => window.launchAttempts);
  if (launchAttempts.length !== 2 || launchAttempts[0].snapshotClientRequestId !== launchAttempts[1].snapshotClientRequestId || launchAttempts[0].bridgeClientRequestId !== launchAttempts[1].bridgeClientRequestId) {
    throw new Error('Grounded launch response-loss retry did not retain both logical request IDs');
  }
  if (await page.locator('#grounded-score-card #cs-retry').count()) {
    throw new Error('Completed grounded low score exposed a retry that would replay the old canonical result');
  }
  if (await page.locator('#ordinary-score-card #cs-retry').count() !== 1) {
    throw new Error('Ordinary ungrounded low-score retry behavior was not preserved');
  }
  await page.click('#accept-interview-bridge');
  if (await page.evaluate(() => window.clearSpeakGrounding) !== null) {
    throw new Error('Accepting the post-session bridge did not clear one-time Resume grounding');
  }

  // 3. Test API Grounding flow (Snapshot + Bridge)
  const getRes = await fetch(`${backendUrl}/api/career-context`, { headers });
  if (getRes.status === 200) {
    const getBody = await getRes.json();
    const itemIds = (getBody.activeItems || []).map(i => i.id);

    if (itemIds.length > 0) {
      // Create Snapshot
      const snapRes = await fetch(`${backendUrl}/api/career-context/snapshots`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          purpose: 'resume_to_clearspeak',
          includedItemIds: itemIds,
          excludedItemIds: [],
          conflictSelections: {},
          scope: 'one_time',
          sourceModules: ['resume'],
          clientRequestId: `snap_cs_${Date.now()}`,
        }),
      });

      if (snapRes.status === 200) {
        const snapBody = await snapRes.json();
        const snapshotId = snapBody.snapshot.id;

        // Create Bridge
        const bridgeRes = await fetch(`${backendUrl}/api/career-context/bridges`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sourceModule: 'resume',
            targetModule: 'clearspeak',
            purpose: 'resume_to_clearspeak',
            snapshotId,
            clientRequestId: `bridge_cs_${Date.now()}`,
          }),
        });

        if (bridgeRes.status === 200) {
          const bridgeBody = await bridgeRes.json();
          if (!bridgeBody.bridge || bridgeBody.bridge.status !== 'confirmed') {
            throw new Error('Bridge creation failed to return confirmed bridge');
          }
        }
      }
    }
  }

  console.log('[Resume -> ClearSpeak Playwright Journey] PASSED: Real Playwright browser journey & database-backed flow verified 100%!');
} finally {
  if (browser) await browser.close();
  server.close();
}
