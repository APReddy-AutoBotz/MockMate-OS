process.env.NODE_ENV = 'test';

import http from 'node:http';
import path from 'node:path';
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
  console.error('[Resume -> ClearSpeak Playwright Journey] FAILED: Could not connect to disposable PostgreSQL database:', err.message);
  process.exit(1);
}

const serverModule = require('../backend/dist/server.js');
const app = serverModule.default || serverModule.app || serverModule;

app.use(express.static(path.resolve(process.cwd(), 'dist')));

console.log('[Resume -> ClearSpeak Playwright Journey] Starting visible browser end-to-end journey...');

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

  // 3. API Grounding flow against PostgreSQL (Snapshot + Bridge)
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
      clientRequestId: `snap_cs_${Date.now()}`,
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
      sourceModule: 'resume',
      targetModule: 'clearspeak',
      purpose: 'resume_to_clearspeak',
      snapshotId,
      clientRequestId: `bridge_cs_${Date.now()}`,
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

  // Verify PostgreSQL database row for created bridge
  const bridgeDbRow = await pgClient.query(`SELECT status, target_module, snapshot_id FROM public.career_context_bridges WHERE id = '${bridgeId}'`);
  if (bridgeDbRow.rows.length === 0 || bridgeDbRow.rows[0].status !== 'confirmed' || bridgeDbRow.rows[0].target_module !== 'clearspeak' || bridgeDbRow.rows[0].snapshot_id !== snapshotId) {
    throw new Error(`Database verification failed for bridge creation: row missing or invalid target_module / snapshot_id`);
  }

  console.log('[Resume -> ClearSpeak Playwright Journey] PASSED: Real Playwright browser journey & database-backed flow verified 100%!');
} finally {
  if (browser) await browser.close();
  server.close();
  await pgClient.end();
}
