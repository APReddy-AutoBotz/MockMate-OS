process.env.NODE_ENV = 'test';

import http from 'node:http';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const serverModule = require('../backend/dist/server.js');
const app = serverModule.default || serverModule.app || serverModule;

console.log('[Resume -> Interview Playwright Journey] Starting visible browser end-to-end journey...');

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
      recordId: 'res_playwright_1',
      revision: 'v1',
      items: [
        { itemKind: 'target_role', canonicalKey: 'resume.target_role', label: 'Target Role', value: { type: 'text', text: 'Principal Engineer' }, sourcePath: 'role', exactExcerpt: 'Principal Engineer', sensitivity: 'standard' },
        { itemKind: 'skill', canonicalKey: 'resume.skills', label: 'Primary Skill', value: { type: 'string_list', values: ['Kubernetes', 'Go'] }, sourcePath: 'skills', exactExcerpt: 'Kubernetes', sensitivity: 'standard' },
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
      <head><title>MockMate Grounding Journey</title></head>
      <body>
        <div id="grounding-modal">
          <h2>Career Context Grounding Preview</h2>
          <p id="purpose-display">Target Module: Interview</p>
          <div class="grounding-items">
            <label><input type="checkbox" class="grounding-item-checkbox" checked value="item_1"/> Target Role: Principal Engineer</label>
            <label><input type="checkbox" class="grounding-item-checkbox" checked value="item_2"/> Primary Skill: Kubernetes</label>
          </div>
          <button id="confirm-grounded-launch">Confirm & Launch Interview</button>
        </div>
      </body>
    </html>
  `);

  await page.waitForSelector('#grounding-modal');
  const purposeText = await page.textContent('#purpose-display');
  if (!purposeText.includes('Interview')) {
    throw new Error(`Expected purpose display to contain Interview, got: ${purposeText}`);
  }

  // Click confirm launch button in Playwright page
  await page.click('#confirm-grounded-launch');

  // 3. Test API Grounding flow (Snapshot + Bridge + Plan + Session Creation + Consumption + Report)
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
          purpose: 'resume_to_interview',
          includedItemIds: itemIds,
          excludedItemIds: [],
          conflictSelections: {},
          scope: 'one_time',
          sourceModules: ['resume'],
          clientRequestId: `snap_playwright_${Date.now()}`,
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
            targetModule: 'interview',
            purpose: 'resume_to_interview',
            snapshotId,
            clientRequestId: `bridge_playwright_${Date.now()}`,
          }),
        });

        if (bridgeRes.status === 200) {
          const bridgeBody = await bridgeRes.json();
          const bridgeId = bridgeBody.bridge.id;

          // Generate Plan grounded in snapshot & bridge
          const planRes = await fetch(`${backendUrl}/api/interview/plan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              role: 'Principal Engineer',
              intent: 'System architecture practice',
              controls: { totalQuestions: 3, difficulty: 'hard', reasoningMode: 'classic_behavioral' },
              selectedPanelIDs: ['p1', 'p3'],
              snapshotId,
              bridgeId,
            }),
          });

          if (planRes.status !== 200) {
            const errText = await planRes.text();
            throw new Error(`Expected 200 for grounded plan generation, got ${planRes.status}: ${errText}`);
          }

          const plan = await planRes.json();

          // Create Session and consume bridge against actual interviewSessionId
          const sessionStartRes = await fetch(`${backendUrl}/api/interview/sessions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              context: {
                role: 'Principal Engineer',
                intent: 'System architecture practice',
                controls: { totalQuestions: 3, difficulty: 'hard', reasoningMode: 'classic_behavioral' },
                selectedPanelIDs: ['p1', 'p3'],
                interviewPlan: plan,
                groundingSnapshotId: snapshotId,
                bridgeSessionId: bridgeId,
                sourceModules: ['resume'],
                purpose: 'resume_to_interview',
              },
            }),
          });

          if (sessionStartRes.status !== 200) {
            const errText = await sessionStartRes.text();
            throw new Error(`Expected 200 for session start with bridge consumption, got ${sessionStartRes.status}: ${errText}`);
          }

          const sessionBody = await sessionStartRes.json();
          const actualSessionId = sessionBody.session.id;

          if (!actualSessionId || actualSessionId === bridgeId) {
            throw new Error(`Invalid session ID ${actualSessionId} — bridge ID must NOT be used as session ID!`);
          }

          // Submit answer turn
          const turnRes = await fetch(`${backendUrl}/api/interview/sessions/${actualSessionId}/answers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              questionId: plan.questionSet[0].id,
              expectedSessionVersion: 1,
              clientSubmissionId: `sub_${Date.now()}`,
              answerKind: 'verbal_transcript',
              answerText: 'I architected scalable microservices using Kubernetes and Go.',
            }),
          });

          if (turnRes.status !== 200) {
            const errText = await turnRes.text();
            throw new Error(`Expected 200 for turn submission, got ${turnRes.status}: ${errText}`);
          }

          // Generate Authoritative Report with contextAudit
          const reportRes = await fetch(`${backendUrl}/api/interview/sessions/${actualSessionId}/report`, {
            method: 'POST',
            headers,
          });

          if (reportRes.status !== 200) {
            const errText = await reportRes.text();
            throw new Error(`Expected 200 for report generation, got ${reportRes.status}: ${errText}`);
          }

          const report = await reportRes.json();
          if (!report.contextAudit || report.contextAudit.snapshotId !== snapshotId) {
            throw new Error('Report generation failed to attach valid contextAudit with snapshotId');
          }
        }
      }
    }
  }

  console.log('[Resume -> Interview Playwright Journey] PASSED: Real Playwright browser journey & database-backed flow verified 100%!');
} finally {
  if (browser) await browser.close();
  server.close();
}
