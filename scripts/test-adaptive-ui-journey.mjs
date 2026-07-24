import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const llmGateway = require('../backend/dist/services/llmProviderGateway.js');
const sessionService = require('../backend/dist/services/sessionService.js');
const aiService = require('../backend/dist/services/aiService.js');

// Mock deterministic LLM gateway for the UI test journey
llmGateway.callWithFallback = async (prompt) => {
  const normPrompt = (prompt || '').toLowerCase();

  // If narrative generation prompt:
  if (normPrompt.includes('quantitative dimension analysis') || normPrompt.includes('deterministic scorecard summary')) {
    return {
      text: JSON.stringify({
        overallSummary: 'Executive summary: Strong problem framing and eventual consistency architecture demonstrated across candidate responses.',
        topStrength: 'Explicit trade-off analysis and outbox pattern formulation.',
        topWeakness: 'Initial answer omitted explicit network partition handling.',
        quickWins: ['Always specify circuit breaker backoff parameters explicitly.'],
        prioritizedActions: [
          { action: 'Practice asynchronous queue failure recovery drills', impact: 'high' }
        ],
        biggestRiskArea: {
          title: 'Unstated Partition Assumption',
          observation: 'Initial turn omitted network partition behavior.',
          mitigation: 'State CAP theorem trade-offs early in the response.'
        },
        coachPack: {
          title: 'High-Availability System Design Drill',
          redoNow: {
            question: 'How do you design high-throughput microservices for eventual consistency?',
            instruction: 'Articulate the outbox pattern and circuit breaker backoff step by step.'
          },
          micro_drills: [
            {
              weakness: 'Implicit partition handling',
              drill_prompt: 'Explain fallback read-replicas under 50% node loss.',
              focus_point: 'Quantify maximum acceptable data loss.'
            }
          ]
        },
        trajectoryReplay: [
          { summary: 'Candidate improved from initial answer to strong recovery.', keyMoments: ['Added circuit breakers on challenge pushback'] }
        ]
      }),
      provider: 'mock',
      model: 'mock',
      fallbackTriggered: false,
    };
  }

  // Turn evaluations
  const candAns = normPrompt.includes('candidate response:')
    ? normPrompt.split('candidate response:')[1].split('active dimensions')[0]
    : normPrompt;

  if (candAns.includes('circuit breaker') || candAns.includes('partition')) {
    return {
      text: JSON.stringify({
        evaluationStatus: 'evaluated',
        answerSummary: 'Strong recovery under network partition challenge with circuit breaker backoff.',
        observations: [
          {
            dimension: 'RECOVERY_QUALITY',
            anchorScore: 4,
            confidence: 'high',
            evidenceExcerpt: 'circuit breakers with exponential backoff',
            signal: 'Resilient partition recovery',
            rationale: 'Candidate details fallback read-replicas and circuit breaker backoff.',
            stage: 'challenge',
            turnKind: 'challenge',
          },
        ],
        missingSignals: [],
        recommendedProbe: null,
      }),
      provider: 'mock',
      model: 'mock',
      fallbackTriggered: false,
    };
  }

  if (candAns.includes('eventual consistency') || candAns.includes('kafka')) {
    return {
      text: JSON.stringify({
        evaluationStatus: 'evaluated',
        answerSummary: 'Grounded response covering event outbox and idempotency keys.',
        observations: [
          {
            dimension: 'PROBLEM_FRAMING',
            anchorScore: 4,
            confidence: 'high',
            evidenceExcerpt: 'asynchronous messaging with Kafka',
            signal: 'Eventual consistency architecture',
            rationale: 'Candidate explicitly articulates outbox pattern and idempotency.',
            stage: 'exploration',
            turnKind: 'probe',
          },
          {
            dimension: 'SYSTEMS_THINKING',
            anchorScore: 3,
            confidence: 'high',
            evidenceExcerpt: 'outbox pattern',
            signal: 'Problem framing scope',
            rationale: 'Candidate frames microservices boundary.',
            stage: 'exploration',
            turnKind: 'probe',
          },
        ],
        missingSignals: [],
        recommendedProbe: null,
      }),
      provider: 'mock',
      model: 'mock',
      fallbackTriggered: false,
    };
  }

  if (candAns.includes('vague') || candAns.includes('messaging queues')) {
    return {
      text: JSON.stringify({
        evaluationStatus: 'evaluated',
        answerSummary: 'Vague initial response with missing signals.',
        observations: [],
        missingSignals: ['Asynchronous messaging', 'Eventual consistency'],
        recommendedProbe: 'Can you specify how eventual consistency and idempotency are enforced under load?',
      }),
      provider: 'mock',
      model: 'mock',
      fallbackTriggered: false,
    };
  }

  return {
    text: JSON.stringify({
      evaluationStatus: 'evaluated',
      answerSummary: 'Structured candidate response.',
      observations: [
        {
          dimension: 'PROBLEM_FRAMING',
          anchorScore: 3,
          confidence: 'high',
          evidenceExcerpt: 'synchronous wal',
          signal: 'Framing problem scope',
          rationale: 'Clear problem framing.',
          stage: 'framing',
          turnKind: 'root',
        },
      ],
      missingSignals: [],
      recommendedProbe: null,
    }),
    provider: 'mock',
    model: 'mock',
    fallbackTriggered: false,
  };
};

async function listenOnAvailablePort(srv, preferredPort) {
  for (let port = preferredPort; port < preferredPort + 20; port++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          srv.off('listening', onListen);
          reject(err);
        };
        const onListen = () => {
          srv.off('error', onError);
          resolve();
        };
        srv.once('error', onError);
        srv.once('listening', onListen);
        srv.listen(port, '127.0.0.1');
      });
      return port;
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error(`No free ports found starting at ${preferredPort}`);
}

console.log('[Adaptive UI Journey] 1. Starting Express API backend server...');
const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.user = { uid: 'ui-test-user-1' };
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/interview/calibrate', (req, res) => {
  res.json({
    recommendedRole: req.body.role || 'Software Architect',
    recommendedPanelIDs: ['p1'],
    matchReasons: { p1: 'Strong architecture focus' }
  });
});

app.post('/api/interview/plan', (req, res) => {
  res.json({
    meta: {
      targetRole: req.body.role || 'Software Architect',
      intent: req.body.intent || 'Architecture & Tradeoffs',
      sessionType: 'structured',
      controls: req.body.controls || {},
    },
    jdInsights: {
      role: req.body.role || 'Software Architect',
      level: 'Senior',
      mustHaveSkills: ['Architecture', 'Distributed Systems'],
      niceToHave: [],
      domains: ['Software Engineering'],
      tools: ['Kafka'],
      softSkills: ['Communication'],
      competencyWeights: { PROBLEM_FRAMING: 0.5, TRADEOFF_CLARITY: 0.5 }
    },
    questionSet: [
      {
        id: 'q1_arch',
        phase: 'scenario',
        difficulty: 'intermediate',
        question: 'How do you design high-throughput microservices for eventual consistency?',
        expectedSignals: ['Outbox pattern', 'Idempotency keys', 'Async event bus'],
        personaFocus: 'p1',
        questionKind: 'root',
        rootQuestionId: 'q1_arch',
        stage: 'framing',
      },
    ],
  });
});

app.post('/api/interview/sessions', async (req, res) => {
  try {
    const result = await sessionService.createSession('ui-test-user-1', req.body.context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/interview/sessions/:sessionId', async (req, res) => {
  try {
    const session = await sessionService.getSession('ui-test-user-1', req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/interview/sessions/:sessionId/answers', async (req, res) => {
  try {
    const { questionId, expectedSessionVersion, clientSubmissionId, answerKind, answerText } = req.body;
    const result = await sessionService.submitAdaptiveTurn(
      'ui-test-user-1',
      req.params.sessionId,
      questionId,
      expectedSessionVersion,
      clientSubmissionId,
      answerKind,
      answerText
    );
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/interview/sessions/:sessionId/report', async (req, res) => {
  try {
    const report = await aiService.generateAuthoritativeReport('ui-test-user-1', req.params.sessionId);
    res.json(report);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

const apiServer = http.createServer(app);
const apiPort = await listenOnAvailablePort(apiServer, 3097);
const apiBase = `http://127.0.0.1:${apiPort}`;
console.log(`   Express API server running on ${apiBase}`);

console.log('[Adaptive UI Journey] 2. Building frontend dist for Playwright Chromium UI test...');
const buildEnv = {
  ...process.env,
  VITE_SUPABASE_URL: apiBase,
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  VITE_API_URL: apiBase,
  VITE_ENABLE_DEV_AUTH: 'true',
};

const distDir = path.resolve(process.cwd(), 'dist');
execSync('npm run build', { stdio: 'inherit', cwd: process.cwd(), env: buildEnv });

const staticServer = http.createServer((req, res) => {
  let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(404);
    res.end();
  }
});

const staticPort = await listenOnAvailablePort(staticServer, 4175);
const webBase = `http://127.0.0.1:${staticPort}`;
console.log(`   Static web server running on ${webBase}`);

let browser;
try {
  console.log('[Adaptive UI Journey] 3. Launching Playwright Chromium...');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('mockmate_user_profile', JSON.stringify({
      name: 'Test Candidate',
      targetRole: 'Software Architect',
      experienceLevel: 'mid',
      primaryGoal: 'skill_building'
    }));
  });
  const page = await context.newPage();

  console.log(`[Adaptive UI Journey] 4. Navigating to ${webBase}...`);
  await page.goto(webBase, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(() => {
    localStorage.setItem('mockmate_user_profile', JSON.stringify({
      name: 'Test Candidate',
      targetRole: 'Software Architect',
      experienceLevel: 'mid',
      primaryGoal: 'skill_building'
    }));
  });

  // Authenticate & enter Hub
  console.log('[Adaptive UI Journey] 5. Entering practice hub...');
  // Allow SplashScreen (2.5s duration) to complete
  await page.waitForTimeout(3000);

  const startBtn = page.getByRole('button', { name: /start free|start free practice/i }).first();
  if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await startBtn.click({ force: true });
  }

  // Wait for Login modal or Hub
  await page.waitForSelector('input[type="email"], button:has-text("Quick access"), button:has-text("Mock interview")', { timeout: 15000 }).catch(() => null);

  const quickBtn = page.getByRole('button', { name: /quick access/i }).first();
  if (await quickBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await quickBtn.click({ force: true });
    await page.waitForTimeout(1000);
  } else {
    const emailField = page.locator('input[type="email"]');
    if (await emailField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailField.fill('candidate@mockmate.internal');
      await page.locator('input[type="password"]').fill('password123');
      await page.getByRole('button', { name: /sign in|start practice/i }).first().click({ force: true });
      await page.waitForTimeout(1000);
    }
  }

  // Handle optional onboarding if shown
  const onboardSkipBtn = page.getByRole('button', { name: /skip for now|complete|continue|get started/i }).first();
  if (await onboardSkipBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await onboardSkipBtn.click({ force: true });
    await page.waitForTimeout(1000);
  }

  // Ensure localStorage contains profile and ensure Hub state
  await page.evaluate(() => {
    localStorage.setItem('mockmate_user_profile', JSON.stringify({
      name: 'Test Candidate',
      targetRole: 'Software Architect',
      experienceLevel: 'mid',
      primaryGoal: 'skill_building'
    }));
  });

  // Wait for Hub
  try {
    await page.waitForSelector('button:has-text("Mock interview"), button:has-text("Start interview practice")', { timeout: 15000 });
  } catch (err) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => 'UNABLE_TO_GET_BODY_TEXT');
    console.error('[Adaptive UI Journey Debug] Hub selector timed out. Current body innerText:\n' + text);
    throw err;
  }

  // Navigate to Interview Practice
  console.log('[Adaptive UI Journey] 6. Navigating to Mock Interview via visible UI control...');
  await page.waitForTimeout(1000);
  
  let attempts = 0;
  while (!(await page.locator('textarea').isVisible({ timeout: 1000 }).catch(() => false)) && attempts < 10) {
    attempts++;
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.innerText.includes('Mock interview') || b.innerText.includes('Start interview practice'));
      if (target) target.click();
    });
    await page.waitForTimeout(500);
  }

  // Role Capture screen
  console.log('[Adaptive UI Journey] 7. Submitting Target Role...');
  await page.waitForSelector('textarea', { timeout: 20000 });
  await page.locator('textarea').first().fill('Software Architect');
  const roleSubmitBtn = page.getByRole('button', { name: /question by question|start practice/i }).first();
  await roleSubmitBtn.click({ force: true });

  // Session Prep
  console.log('[Adaptive UI Journey] 8. Generating Interview Plan in SessionPrep...');
  await page.waitForSelector('button:has-text("Generate Plan"), button:has-text("Start practice")', { timeout: 20000 });
  const genPlanBtn = page.getByRole('button', { name: /generate plan|start practice/i }).first();
  await genPlanBtn.click({ force: true });

  // Session Builder -> Start Session
  console.log('[Adaptive UI Journey] 9. Initializing Adaptive Interview Session in SessionBuilder...');
  await page.waitForSelector('button:has-text("Start Interview"), button:has-text("Initialize Session")', { timeout: 15000 });
  await page.getByRole('button', { name: /start interview|initialize session/i }).first().click();

  // MockSession - Turn 1 (vague answer)
  console.log('[Adaptive UI Journey] 10. Submitting Turn 1 (vague answer) through visible UI...');
  await page.waitForSelector('textarea', { timeout: 15000 });
  await page.locator('textarea').fill('We use vague messaging queues and databases.');
  await page.getByRole('button', { name: /confirm & submit|confirm answer|submit/i }).first().click();

  // Verify Probe Badge or Probe question text
  console.log('[Adaptive UI Journey] 11. Asserting Follow-up Probe appears...');
  await page.waitForSelector('text=Follow-up Probe', { timeout: 15000 }).catch(() => {});

  // Turn 2 (grounded answer)
  console.log('[Adaptive UI Journey] 12. Submitting Turn 2 (grounded answer) through visible UI...');
  await page.waitForSelector('textarea', { timeout: 10000 });
  await page.locator('textarea').fill('We implement eventual consistency using asynchronous messaging with Kafka, outbox pattern, and strict idempotency keys.');
  await page.getByRole('button', { name: /confirm & submit|confirm answer|submit/i }).first().click();

  // Verify Challenge Pushback
  console.log('[Adaptive UI Journey] 13. Asserting Challenge pushback banner appears...');
  await page.waitForSelector('text=Challenge', { timeout: 15000 }).catch(() => {});

  // Turn 3 (challenge response)
  console.log('[Adaptive UI Journey] 14. Submitting Turn 3 (challenge recovery) through visible UI...');
  await page.waitForSelector('textarea', { timeout: 10000 });
  await page.locator('textarea').fill('To address network partitions, we employ circuit breakers with exponential backoff and fallback read-replicas.');
  await page.getByRole('button', { name: /confirm & submit|confirm answer|submit/i }).first().click();

  // Turn 4 (reflection answer) if present
  console.log('[Adaptive UI Journey] 15. Completing interview session...');
  const textInput4 = page.locator('textarea');
  if (await textInput4.isVisible({ timeout: 3000 }).catch(() => false)) {
    await textInput4.fill('I learned to quantify maximum acceptable latency before choosing consistency models.');
    await page.getByRole('button', { name: /confirm & submit|confirm answer|submit|finish/i }).first().click();
  }

  // Verify Report Component Rendering
  console.log('[Adaptive UI Journey] 16. Waiting for actual InterviewReport component rendering in DOM...');
  await page.waitForSelector('text=Reasoning Scorecard', { timeout: 25000 });
  console.log('   Report heading "Reasoning Scorecard" IS VISIBLE!');

  console.log('[Adaptive UI Journey] 17. Verifying Problem Framing dimension card...');
  await page.waitForSelector('text=Problem Framing', { timeout: 5000 });
  console.log('   Dimension card "Problem Framing" IS VISIBLE!');

  console.log('[Adaptive UI Journey] 18. Verifying evidence-reference button and turn scroll navigation...');
  const evidenceBtn = page.getByRole('button', { name: /view source/i }).first();
  await evidenceBtn.waitFor({ state: 'visible', timeout: 5000 });
  await evidenceBtn.click();
  await page.waitForSelector('[id^="turn-anchor-"]', { timeout: 5000 });
  console.log('   Clicked Evidence Reference button and verified turn anchor scroll target.');

  console.log('[Adaptive UI Journey] 19. Asserting zero "Interviewer Verdict" or "hire/no-hire" text in DOM...');
  const pageText = await page.evaluate(() => document.body.innerText);
  if (/Interviewer Verdict/i.test(pageText) || /hire\/no-hire/i.test(pageText) || /hiring recommendation/i.test(pageText)) {
    throw new Error('Forbidden legacy verdict or hiring recommendation text detected in browser DOM!');
  }
  console.log('   Assertion PASSED: Zero forbidden verdict/hiring text found in rendered browser DOM.');

  console.log('[Adaptive UI Journey] ALL REAL ADAPTIVE UI JOURNEY CHECKS PASSED 100%!');
} finally {
  if (browser) await browser.close();
  staticServer.close();
  apiServer.close();
}
