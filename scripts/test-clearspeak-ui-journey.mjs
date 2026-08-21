import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

async function listenOnAvailablePort(server, preferredPort) {
  for (let port = preferredPort; port < preferredPort + 20; port++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListen);
          reject(error);
        };
        const onListen = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListen);
        server.listen(port, '127.0.0.1');
      });
      return port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error(`No free ports found starting at ${preferredPort}`);
}

const safety = 'A learner-selected communication style target; not a measure of correctness, identity, nationality, class, or native-ness.';
const profiles = [
  {
    contractVersion: 'accent-profile.v1', profileId: 'en-GB-general-v1', profileVersion: 1,
    locale: 'en-GB', displayName: 'General UK English',
    description: 'Practise toward a contemporary general UK reference style.',
    referenceSetVersion: 'synthetic-reference.v1', scoringPolicyVersion: 'synthetic-policy.v1', safetyStatement: safety,
  },
  {
    contractVersion: 'accent-profile.v1', profileId: 'en-US-general-v1', profileVersion: 1,
    locale: 'en-US', displayName: 'General US English',
    description: 'Practise toward a contemporary general US reference style.',
    referenceSetVersion: 'synthetic-reference.v1', scoringPolicyVersion: 'synthetic-policy.v1', safetyStatement: safety,
  },
];

const fixtures = {
  word: ['10000000-0000-4000-a000-000000000001', 'collaboration', 45000],
  phrase: ['10000000-0000-4000-a000-000000000002', 'Could we review the next steps?', 45000],
  sentence_reading: ['10000000-0000-4000-a000-000000000003', 'The project team will share a clear update tomorrow morning.', 45000],
  free_response: ['10000000-0000-4000-a000-000000000004', 'Describe a recent challenge and how you approached it.', 120000],
};

function promptFor(profile, mode) {
  const [promptId, displayText, maxDurationMs] = fixtures[mode];
  const canonical = JSON.stringify({ mode, profileId: profile.profileId, displayText, version: 1 });
  return {
    contractVersion: 'practice-prompt.v1',
    promptId,
    promptVersion: 1,
    mode,
    profileId: profile.profileId,
    profileVersion: 1,
    referenceSetVersion: profile.referenceSetVersion,
    displayText,
    ...(mode === 'free_response' ? {} : { expectedText: displayText }),
    maxDurationMs,
    contentHash: crypto.createHash('sha256').update(canonical).digest('hex'),
    referenceLabel: 'Synthetic CI fixture — not human- or provider-validated pronunciation.',
  };
}

const profile = {
  userId: 'ui-clearspeak-user', role: 'general_corporate', level: 2,
  goal: 'Speak clearly in interviews', audienceContext: 'Interview panels',
  mainStruggle: 'fear_of_judgment', comfortLanguage: 'English', practiceDuration: 3,
  createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z',
};
const progress = {
  userId: 'ui-clearspeak-user', streak: 4, lastPracticeDate: '2026-08-21',
  clarityTrend: [68, 74, 79], topicBestScores: { interviews: 79 }, bestPerformingTopic: 'interviews',
  hardWordCount: 7, totalSessionsCompleted: 6, updatedAt: '2026-08-21T00:00:00.000Z',
};

const promptRequests = [];
const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/clearspeak/profile', (_req, res) => res.json({ profile }));
app.get('/api/clearspeak/progress', (_req, res) => res.json({ progress }));
app.get('/api/clearspeak/beta/access', (_req, res) => res.json({ enabled: true }));
app.get('/api/clearspeak/v1/accent/catalog', (_req, res) => res.json({
  contractVersion: 'accent-profile-catalog.v1', profiles,
  practiceModes: ['word', 'phrase', 'sentence_reading', 'free_response'], fixture: true,
  retention: 'derived-results-only', realSpeechScoringAvailable: false,
}));
app.get('/api/clearspeak/v1/accent/attempts', (_req, res) => res.json({ attempts: [], retention: 'derived-results-only' }));
app.post('/api/clearspeak/v1/accent/prompts', (req, res) => {
  const selected = profiles.find(candidate => candidate.profileId === req.body.profileId);
  if (!selected || !fixtures[req.body.mode]) return res.status(400).json({ error: 'invalid selector' });
  promptRequests.push({ profileId: selected.profileId, mode: req.body.mode });
  res.json({ prompt: promptFor(selected, req.body.mode), scoringPolicyVersion: selected.scoringPolicyVersion, fixture: true });
});

const apiServer = http.createServer(app);
const apiPort = await listenOnAvailablePort(apiServer, 3127);
const apiBase = `http://127.0.0.1:${apiPort}`;

const viteDevServer = await createServer({
  configFile: path.resolve(process.cwd(), 'vite.config.ts'),
  root: process.cwd(),
  server: { host: '127.0.0.1', port: 4187, strictPort: false },
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.VITE_API_URL': JSON.stringify(apiBase),
    'process.env.VITE_SUPABASE_URL': JSON.stringify(apiBase),
    'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('ui-test-anon-key'),
    'process.env.VITE_ENABLE_DEV_AUTH': JSON.stringify('true'),
  },
});
await viteDevServer.listen();
const webBase = `http://127.0.0.1:${viteDevServer.config.server.port}`;

async function addProfile(context) {
  await context.addInitScript(() => {
    localStorage.setItem('mockmate_user_profile', JSON.stringify({
      name: 'UI Test Candidate', targetRole: 'Business Analyst', experienceLevel: 'mid', primaryGoal: 'skill_building',
    }));
  });
}

async function enterHub(page) {
  await page.goto(webBase, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  for (let attempt = 0; attempt < 10; attempt++) {
    const quick = page.getByRole('button', { name: /quick access/i }).first();
    if (await quick.isVisible({ timeout: 500 }).catch(() => false)) {
      await quick.click({ force: true });
      break;
    }
    const signIn = page.getByRole('button', { name: /sign in|start free/i }).first();
    if (await signIn.isVisible({ timeout: 500 }).catch(() => false)) await signIn.click({ force: true });
    await page.waitForTimeout(350);
  }
  const quick = page.getByRole('button', { name: /quick access/i }).first();
  if (await quick.isVisible({ timeout: 1500 }).catch(() => false)) await quick.click({ force: true });
  await page.getByRole('heading', { name: /welcome back/i }).waitFor({ state: 'visible', timeout: 15000 });
}

let browser;
try {
  console.log('[ClearSpeak UI Journey] Launching Chromium with fake microphone...');
  browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['microphone'] });
  await addProfile(context);
  const page = await context.newPage();
  page.on('pageerror', error => console.error('[ClearSpeak Browser PageError]', error));

  await enterHub(page);
  console.log('[ClearSpeak UI Journey] Opening Speaking coach...');
  const speakingHeading = page.getByRole('heading', { name: 'Speaking coach' });
  await speakingHeading.waitFor({ state: 'visible', timeout: 10000 });
  await speakingHeading.locator('xpath=ancestor::button[1]').click();
  await page.getByRole('heading', { name: /speak with confidence/i }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText('Hard words practiced').waitFor({ state: 'visible' });
  await page.getByText('7', { exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: /practice uk \/ us reference styles/i }).click();
  await page.getByRole('heading', { name: /accent practice v1/i }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText(/no real-speech scorer is currently authorized/i).waitFor({ state: 'visible' });
  await page.getByText(/raw audio is never retained/i).waitFor({ state: 'visible' });

  const uk = page.getByRole('button', { name: /general uk english/i });
  const us = page.getByRole('button', { name: /general us english/i });
  await uk.waitFor({ state: 'visible' });
  await us.waitFor({ state: 'visible' });
  if (await uk.getAttribute('aria-pressed') !== 'true') throw new Error('UK profile is not the default selected target.');
  await page.getByText('collaboration', { exact: true }).waitFor({ state: 'visible' });

  console.log('[ClearSpeak UI Journey] Switching UK -> US and all four practice modes...');
  await us.click();
  await page.waitForTimeout(250);
  const lastAfterUs = promptRequests.at(-1);
  if (lastAfterUs?.profileId !== 'en-US-general-v1') throw new Error('US profile selection did not propagate to prompt authority.');
  if (await us.getAttribute('aria-pressed') !== 'true') throw new Error('US profile did not become visibly selected.');

  await page.getByRole('button', { name: 'Phrase', exact: true }).click();
  await page.getByText('Could we review the next steps?', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Sentence', exact: true }).click();
  await page.getByText('The project team will share a clear update tomorrow morning.', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Free response', exact: true }).click();
  await page.getByText('Describe a recent challenge and how you approached it.', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Word', exact: true }).click();
  await page.getByText('collaboration', { exact: true }).waitFor({ state: 'visible' });

  console.log('[ClearSpeak UI Journey] Exercising microphone consent -> record -> preview -> discard...');
  await page.getByRole('button', { name: /i consent — start microphone/i }).click();
  const stop = page.getByRole('button', { name: /stop recording/i });
  await stop.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(900);
  await stop.click();
  await page.locator('audio[aria-label="Preview your recording"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: /check recording/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /discard and re-record/i }).click();
  await page.getByRole('button', { name: /i consent — start microphone/i }).waitFor({ state: 'visible', timeout: 5000 });

  console.log('[ClearSpeak UI Journey] Exercising microphone permission-denied recovery...');
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); },
    });
  });
  await page.getByRole('button', { name: /i consent — start microphone/i }).click();
  await page.getByRole('alert').filter({ hasText: /microphone access denied/i }).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /retry microphone/i }).waitFor({ state: 'visible' });

  console.log('[ClearSpeak UI Journey] Checking representative mobile navigation...');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  await addProfile(mobile);
  const mobilePage = await mobile.newPage();
  await enterHub(mobilePage);
  await mobilePage.getByRole('navigation', { name: 'Primary' }).waitFor({ state: 'visible', timeout: 10000 });
  await mobilePage.getByTestId('mobile-tab-speak').click();
  await mobilePage.getByRole('heading', { name: /speak with confidence/i }).waitFor({ state: 'visible', timeout: 10000 });
  await mobilePage.getByRole('button', { name: /practice uk \/ us reference styles/i }).waitFor({ state: 'visible' });
  await mobile.close();

  console.log('[ClearSpeak UI Journey] ALL UK/US SPEAKING UI CHECKS PASSED.');
} finally {
  if (browser) await browser.close();
  await viteDevServer.close();
  apiServer.close();
}
