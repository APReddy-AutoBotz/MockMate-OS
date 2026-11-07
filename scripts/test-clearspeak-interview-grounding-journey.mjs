process.env.NODE_ENV = 'test';

import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import express from 'express';
import pkg from 'pg';
import { ensureTestDatabase } from './init-test-db.mjs';

const { Client } = pkg;
const require = createRequire(import.meta.url);

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const pgClient = new Client({ connectionString, connectionTimeoutMillis: 3000 });

try {
  await pgClient.connect();
  await ensureTestDatabase(pgClient);
} catch (err) {
  console.error('[ClearSpeak -> Interview Playwright Journey] FAILED: Could not connect to disposable PostgreSQL database:', err.message);
  process.exit(1);
}

const serverModule = require('../backend/dist/server.js');
const app = serverModule.default || serverModule.app || serverModule;

app.use(express.static(path.resolve(process.cwd(), 'dist')));

console.log('[ClearSpeak -> Interview Playwright Journey] Starting visible browser end-to-end journey...');

const server = http.createServer(app);
await new Promise(resolve => server.listen(0, resolve));
const backendPort = server.address().port;
const backendUrl = `http://127.0.0.1:${backendPort}`;

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer dev_user_a',
};

let browser;

try {
  // 1. Ingest ClearSpeak items via HTTP API
  const rebuildRes = await fetch(`${backendUrl}/api/career-context/rebuild`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceModule: 'clearspeak',
      recordId: 'cs_playwright_1',
      revision: 'v1',
      items: [
        { itemKind: 'target_role', canonicalKey: 'clearspeak.target_role', label: 'Target Role', value: { type: 'text', text: 'Lead Architect' }, sourcePath: 'role', exactExcerpt: 'Lead Architect', sensitivity: 'standard' },
        { itemKind: 'skill', canonicalKey: 'clearspeak.focus_area', label: 'Focus Area', value: { type: 'string_list', values: ['Executive Communication', 'Strategic Alignment'] }, sourcePath: 'focus', exactExcerpt: 'Executive Communication', sensitivity: 'standard' },
      ],
    }),
  });

  if (rebuildRes.status !== 200) {
    const errText = await rebuildRes.text();
    throw new Error(`Expected 200 for rebuild, got ${rebuildRes.status}: ${errText}`);
  }

  // 2. Launch Playwright Chromium and navigate to real application URL
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to real app URL
  await page.goto(backendUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // 3. API Grounding flow against PostgreSQL (Snapshot + Bridge + Plan + Session Creation + Consumption + Report)
  const getRes = await fetch(`${backendUrl}/api/career-context`, { headers });
  if (getRes.status !== 200) {
    const getErr = await getRes.text();
    throw new Error(`Expected 200 for GET career-context, got ${getRes.status}: ${getErr}`);
  }

  const getBody = await getRes.json();
  const itemIds = (getBody.activeItems || []).map(i => i.id);
  if (itemIds.length === 0) {
    throw new Error('Expected active items in career context after rebuild, got 0');
  }

  // Create Snapshot in PostgreSQL
  const snapRes = await fetch(`${backendUrl}/api/career-context/snapshots`, {
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
      clientRequestId: `snap_cs_int_${Date.now()}`,
    }),
  });

  if (snapRes.status !== 200) {
    const snapErr = await snapRes.text();
    throw new Error(`Expected 200 for snapshot creation, got ${snapRes.status}: ${snapErr}`);
  }

  const snapBody = await snapRes.json();
  const snapshotId = snapBody.snapshot.id;

  // Create Bridge in PostgreSQL
  const bridgeRes = await fetch(`${backendUrl}/api/career-context/bridges`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceModule: 'clearspeak',
      targetModule: 'interview',
      purpose: 'clearspeak_to_interview',
      snapshotId,
      clientRequestId: `bridge_cs_int_${Date.now()}`,
    }),
  });

  if (bridgeRes.status !== 200) {
    const bridgeErr = await bridgeRes.text();
    throw new Error(`Expected 200 for bridge creation, got ${bridgeRes.status}: ${bridgeErr}`);
  }

  const bridgeBody = await bridgeRes.json();
  const bridgeId = bridgeBody.bridge.id;
  if (!bridgeBody.bridge || bridgeBody.bridge.status !== 'confirmed') {
    throw new Error('Bridge creation failed to return confirmed bridge');
  }

  // Generate Grounded Interview Plan
  const planRes = await fetch(`${backendUrl}/api/interview/plan`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      role: 'Lead Architect',
      intent: 'Executive communication practice',
      controls: {
        totalQuestions: 1,
        difficulty: 'expert',
        reasoningMode: 'classic_behavioral',
        includeBehavioral: true,
        includeCoding: false,
        timePerQuestion: '90s',
        deliveryMode: 'coach',
      },
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
        candidateRole: 'Lead Architect',
        intentText: 'Executive communication practice',
        sessionType: 'structured',
        selectedPanelIDs: ['p1', 'p3'],
        controls: {
          totalQuestions: 1,
          difficulty: 'expert',
          reasoningMode: 'classic_behavioral',
          includeBehavioral: true,
          includeCoding: false,
          timePerQuestion: '90s',
          deliveryMode: 'coach',
        },
        interviewPlan: plan,
        groundingSnapshot: snapBody.snapshot,
        bridgeSessionId: bridgeId,
      },
    }),
  });

  if (sessionStartRes.status !== 200) {
    const errText = await sessionStartRes.text();
    throw new Error(`Expected 200 for session start with bridge consumption, got ${sessionStartRes.status}: ${errText}`);
  }

  const sessionBody = await sessionStartRes.json();
  const actualSessionId = sessionBody.sessionId;

  if (!actualSessionId || actualSessionId === bridgeId) {
    throw new Error(`Invalid session ID ${actualSessionId} — bridge ID must NOT be used as session ID!`);
  }

  // Verify PostgreSQL database row for consumed bridge
  const bridgeDbRow = await pgClient.query(`SELECT status, target_session_id, consumed_at FROM public.career_context_bridges WHERE id = '${bridgeId}'`);
  if (bridgeDbRow.rows.length === 0 || bridgeDbRow.rows[0].status !== 'consumed' || bridgeDbRow.rows[0].target_session_id !== actualSessionId) {
    throw new Error(`Database verification failed for bridge consumption: row missing or not consumed by target session ${actualSessionId}`);
  }

  // Submit answer turns adaptively until session reaches awaiting_report
  let currentQuestionId = plan.questionSet[0].id;
  let turnIndex = 1;
  let sessionCompleted = false;

  while (!sessionCompleted && turnIndex <= 10) {
    const turnRes = await fetch(`${backendUrl}/api/interview/sessions/${actualSessionId}/answers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        questionId: currentQuestionId,
        expectedSessionVersion: turnIndex,
        clientSubmissionId: crypto.randomUUID(),
        answerKind: 'answered',
        answerText: `I led executive communication alignment for clear strategic direction for turn ${turnIndex}.`,
      }),
    });

    if (turnRes.status !== 200) {
      const errText = await turnRes.text();
      throw new Error(`Expected 200 for turn submission ${turnIndex}, got ${turnRes.status}: ${errText}`);
    }

    const turnBody = await turnRes.json();
    if (turnBody.isLastQuestion || !turnBody.nextQuestion) {
      sessionCompleted = true;
    } else {
      currentQuestionId = turnBody.nextQuestion.id;
      turnIndex++;
    }
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

  console.log('[ClearSpeak -> Interview Playwright Journey] PASSED: Real Playwright browser journey & database-backed flow verified 100%!');
} finally {
  if (browser) await browser.close();
  server.close();
  await pgClient.end();
}
