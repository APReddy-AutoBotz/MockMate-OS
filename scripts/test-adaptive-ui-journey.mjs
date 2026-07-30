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

const defaultControls = {
  difficulty: 'intermediate',
  totalQuestions: 1,
  includeBehavioral: true,
  includeCoding: false,
  timePerQuestion: 'none',
  deliveryMode: 'coach',
  reasoningMode: 'problem_framing',
};

app.post('/api/interview/calibrate', (req, res) => {
  res.json({
    recommendedRole: req.body.role || 'Software Architect',
    recommendedPanelIDs: ['p1'],
    matchReasons: { p1: 'Strong architecture focus' },
    suggestedControls: {
      ...defaultControls,
      reasoningMode: req.body.reasoningMode || 'problem_framing',
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
    fallbackUsed: false,
  });
});

app.post('/api/interview/plan', (req, res) => {
  const reqControls = req.body.controls || {};
  res.json({
    meta: {
      intent: req.body.intent || 'Architecture & Tradeoffs',
      controls: {
        ...defaultControls,
        ...reqControls,
        reasoningMode: reqControls.reasoningMode || 'problem_framing',
      },
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

app.post('/api/interview/transcribe', (req, res) => {
  res.json({
    status: 'transcribed',
    transcript: 'Candidate audio response'
  });
});

app.post('/api/interview/hint', (req, res) => {
  res.json({ hint: 'Focus on eventual consistency trade-offs.' });
});

app.post('/api/interview/ideal-response', (req, res) => {
  res.json({ idealResponse: 'Explicitly quantify system partition boundaries and outbox pattern backoff.' });
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
  browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });
  const context = await browser.newContext({
    permissions: ['microphone']
  });
  await context.addInitScript(() => {
    localStorage.setItem('mockmate_user_profile', JSON.stringify({
      name: 'Test Candidate',
      targetRole: 'Software Architect',
      experienceLevel: 'mid',
      primaryGoal: 'skill_building'
    }));
  });
  const page = await context.newPage();
  page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[Browser PageError]`, err));

  // Add init script so localStorage profile is set BEFORE React mounts
  await context.addInitScript(() => {
    localStorage.setItem('mockmate_user_profile', JSON.stringify({
      name: 'Test Candidate',
      targetRole: 'Software Architect',
      experienceLevel: 'mid',
      primaryGoal: 'skill_building'
    }));
  });

  console.log(`[Adaptive UI Journey] 4. Navigating to ${webBase}...`);
  await page.goto(webBase, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Authenticate & enter Hub
  console.log('[Adaptive UI Journey] 5. Entering practice hub...');
  await page.waitForTimeout(3000);

  // Transition from Landing -> Login modal
  let loginAttempts = 0;
  while (!(await page.locator('input[type="email"], button:has-text("Quick access")').first().isVisible({ timeout: 1000 }).catch(() => false)) && loginAttempts < 10) {
    loginAttempts++;
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.innerText.includes('Sign In') || b.innerText.includes('START FREE PRACTICE') || b.innerText.includes('Start Free'));
      if (target) target.click();
    });
    await page.waitForTimeout(500);
  }

  // Authenticate on Login modal
  await page.waitForTimeout(500);
  const quickBtn = page.locator('button', { hasText: /quick access/i }).first();
  if (await quickBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await quickBtn.click({ force: true, noWaitAfter: true });
  } else {
    const emailInput = page.locator('input[type="email"]').first();
    const passInput = page.locator('input[type="password"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailInput.fill('candidate@mockmate.internal');
      await passInput.fill('password123');
      await submitBtn.click({ force: true });
      await page.waitForTimeout(1000);

      const isInvalid = await page.locator('text=/invalid email/i').isVisible({ timeout: 1000 }).catch(() => false);
      if (isInvalid) {
        console.log('[Adaptive UI Journey] Sign in failed, switching to Register...');
        const signUpToggle = page.locator('button', { hasText: /sign up/i }).first();
        if (await signUpToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
          await signUpToggle.click({ force: true });
          await page.waitForTimeout(500);
          await emailInput.fill('candidate@mockmate.internal');
          await passInput.fill('password123');
          await submitBtn.click({ force: true });
        }
      }
    }
  }

  const onboardSkipBtn = await page.waitForSelector('button:has-text("Skip"), button:has-text("Complete")', { timeout: 3000 }).catch(() => null);
  if (onboardSkipBtn) {
    await onboardSkipBtn.click({ force: true });
  }

  // Ensure Hub is rendered
  try {
    await page.locator('h3', { hasText: 'Mock interview' }).first().waitFor({ state: 'attached', timeout: 20000 });
  } catch (err) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => 'UNABLE_TO_GET_BODY_TEXT');
    console.error('[Adaptive UI Journey Debug] Hub locator failed. Current body innerText:\n' + text);
    throw err;
  }

  // Navigate to Interview Practice
  console.log('[Adaptive UI Journey] 6. Navigating to Mock Interview via visible UI control...');
  await page.waitForTimeout(1000);
  
  let attempts = 0;
  while (!(await page.locator('textarea').isVisible({ timeout: 1000 }).catch(() => false)) && attempts < 10) {
    attempts++;
    await page.evaluate(() => {
      const h3s = Array.from(document.querySelectorAll('h3'));
      const mockH3 = h3s.find(h => h.innerText.includes('Mock interview'));
      if (mockH3) {
        const cardBtn = mockH3.closest('button');
        if (cardBtn) cardBtn.click();
      }
    });
    await page.waitForTimeout(500);
  }

  // Role Capture screen
  console.log('[Adaptive UI Journey] 7. Submitting Target Role...');
  await page.waitForSelector('textarea', { timeout: 20000 });
  await page.locator('textarea').first().fill('Software Architect');
  const roleSubmitBtn = page.getByRole('button', { name: /question by question|start practice/i }).first();
  await roleSubmitBtn.click({ force: true });

  // Session Prep - Explicitly select Problem Framing reasoning mode
  console.log('[Adaptive UI Journey] 8. Selecting Problem Framing mode & Generating Interview Plan...');
  await page.waitForSelector('button:has-text("Generate Plan"), button:has-text("Start practice")', { timeout: 20000 });

  const problemFramingBtn = page.locator('button', { hasText: 'Problem Framing' }).first();
  await problemFramingBtn.waitFor({ state: 'visible', timeout: 5000 });
  await problemFramingBtn.click({ force: true });
  await page.waitForTimeout(300);

  // Hard Assertion 1: Selected control visibly indicates Problem Framing
  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => (b.innerText || '').toLowerCase().includes('problem framing'));
    return btn ? (btn.className.includes('border-brand-primary') || btn.className.includes('bg-brand-primary') || btn.className.includes('shadow-md')) : false;
  }, { timeout: 5000 }).catch(async (err) => {
    const debugInfo = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => (b.innerText || '').toLowerCase().includes('problem framing'));
      return btn ? { className: btn.className, html: btn.outerHTML } : { className: 'NOT_FOUND', html: '' };
    });
    console.error('[Adaptive UI Journey Debug] Problem Framing button state:', JSON.stringify(debugInfo));
    throw new Error(`Problem Framing mode button was not visibly selected in SessionPrep UI! Class: ${debugInfo.className}`);
  });
  console.log('   Hard Assertion 1 PASSED: Problem Framing mode button is visibly selected in UI.');

  const genPlanBtn = page.getByRole('button', { name: /generate.*plan|generate practice plan|start practice/i }).first();
  await genPlanBtn.click({ force: true });

  // Session Builder -> Start Session
  console.log('[Adaptive UI Journey] 9. Initializing Adaptive Interview Session in SessionBuilder...');
  await page.waitForSelector('button:has-text("Start my interview"), button:has-text("Start Interview"), button:has-text("Initialize Session")', { timeout: 15000 });
  await page.getByRole('button', { name: /start.*interview|initialize session/i }).first().click({ force: true, noWaitAfter: true });

  // Helper function to submit an interview turn via UI
  const submitTurnAnswer = async (answerText) => {
    if (!(await page.locator('textarea').isVisible({ timeout: 1500 }).catch(() => false))) {
      const startMicBtn = page.locator('button[aria-label="Start answer"], button[aria-label*="answer"]').first();
      await startMicBtn.waitFor({ state: 'visible', timeout: 5000 });
      await startMicBtn.click({ force: true, noWaitAfter: true });

      const finishMicBtn = page.locator('button[aria-label="Finish answer"]').first();
      await finishMicBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(async () => {
        // Fallback retry click if status didn't transition
        await startMicBtn.click({ force: true, noWaitAfter: true });
      });
      await finishMicBtn.click({ force: true, noWaitAfter: true }).catch(() => {});
    }
    await page.waitForSelector('textarea', { timeout: 15000 });
    await page.locator('textarea').fill(answerText);
    const submitBtn = page.getByRole('button', { name: /submit turn answer|confirm & submit|confirm answer|submit|finish/i }).first();
    await submitBtn.click({ force: true });

    // Wait for evaluation HTTP request to complete and "Continue practice" button to mount, then click it
    const continueBtn = page.getByRole('button', { name: /continue practice|next question|view report|finish session/i }).first();
    if (await continueBtn.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) {
      await continueBtn.click({ force: true });
    }
  };

  // MockSession - Verify Active Session Header
  console.log('[Adaptive UI Journey] 10. Asserting active session header displays Reasoning Mode: Problem Framing...');
  await page.getByText(/Reasoning Mode:.*problem framing/i).first().waitFor({ state: 'attached', timeout: 10000 }).catch(async (err) => {
    const text = await page.evaluate(() => document.body.innerText).catch(() => 'UNABLE_TO_GET_BODY_TEXT');
    console.error('[Adaptive UI Journey Debug] Active session header check failed. Current body innerText:\n' + text);
    throw err;
  });
  console.log('   Hard Assertion 2 PASSED: Active session header displays "Reasoning Mode: problem framing".');

  // Turn 1 (vague answer)
  console.log('[Adaptive UI Journey] 11. Submitting Turn 1 (vague answer) through visible UI...');
  await submitTurnAnswer('We use vague messaging queues and databases.');

  // Hard Assertion 3: Follow-up Probe appears
  console.log('[Adaptive UI Journey] 12. Asserting Follow-up Probe appears (hard assertion)...');
  await page.waitForSelector('text=Follow-up Probe', { timeout: 15000 });
  console.log('   Hard Assertion 3 PASSED: "Follow-up Probe" is visible in DOM.');

  // Turn 2 (grounded answer)
  console.log('[Adaptive UI Journey] 13. Submitting Turn 2 (grounded answer) through visible UI...');
  await submitTurnAnswer('We implement eventual consistency using asynchronous messaging with Kafka, outbox pattern, and strict idempotency keys.');

  // Hard Assertion 4: Challenge pushback banner appears
  console.log('[Adaptive UI Journey] 14. Asserting Challenge pushback banner appears (hard assertion)...');
  await page.waitForSelector('text=Challenge', { timeout: 15000 });
  console.log('   Hard Assertion 4 PASSED: "Challenge" banner is visible in DOM.');

  // Turn 3 (challenge response)
  console.log('[Adaptive UI Journey] 15. Submitting Turn 3 (challenge recovery) through visible UI...');
  await submitTurnAnswer('To address network partitions, we employ circuit breakers with exponential backoff and fallback read-replicas.');

  // Wait for either the next turn input (Turn 4 Reflection) or report transition
  console.log('[Adaptive UI Journey] 16. Waiting for next turn (Reflection) or session completion...');
  const micOrTextarea = page.locator('button[aria-label*="answer"], textarea');
  const reportHeading = page.locator('text=Reasoning Scorecard');

  await Promise.race([
    micOrTextarea.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
    reportHeading.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
  ]);

  if (await micOrTextarea.isVisible().catch(() => false)) {
    console.log('[Adaptive UI Journey] 16b. Submitting Turn 4 (reflection answer) through visible UI...');
    await page.waitForSelector('text=Reflection', { timeout: 5000 });
    console.log('   Hard Assertion 5 PASSED: "Reflection" stage is visible in DOM.');
    await submitTurnAnswer('I learned to quantify maximum acceptable latency before choosing consistency models.');
  }

  // Hard Assertion 6: Reasoning Scorecard is visible after completion
  console.log('[Adaptive UI Journey] 17. Waiting for actual InterviewReport component rendering in DOM...');
  await page.waitForSelector('text=Reasoning Scorecard', { timeout: 30000 }).catch(async (err) => {
    const text = await page.evaluate(() => document.body.innerText).catch(() => 'UNABLE_TO_GET_BODY_TEXT');
    console.error('[Adaptive UI Journey Debug] Step 17 failed. Current body innerText:\n' + text);
    throw err;
  });
  console.log('   Hard Assertion 6 PASSED: Report heading "Reasoning Scorecard" IS VISIBLE!');

  // Hard Assertion 7: Problem Framing dimension is visible
  console.log('[Adaptive UI Journey] 18. Verifying Problem Framing dimension card...');
  await page.waitForSelector('text=Problem Framing', { timeout: 5000 });
  console.log('   Hard Assertion 7 PASSED: Dimension card "Problem Framing" IS VISIBLE!');

  // Hard Assertion 8 & 9: Exact candidate evidence & View Source navigation
  console.log('[Adaptive UI Journey] 19. Verifying evidence-reference button and turn scroll navigation...');
  const evidenceBtn = page.getByRole('button', { name: /view source/i }).first();
  await evidenceBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('   Hard Assertion 8 PASSED: Exact candidate evidence button "View Source" is visible.');
  await evidenceBtn.click();
  await page.waitForSelector('[id^="turn-anchor-"]', { timeout: 5000 });
  console.log('   Hard Assertion 9 PASSED: Clicked View Source and navigated to turn scroll target anchor.');

  // Hard Assertion 10: Zero hire/no-hire or Interviewer Verdict text in DOM
  console.log('[Adaptive UI Journey] 20. Asserting zero "Interviewer Verdict" or "hire/no-hire" text in DOM...');
  const pageText = await page.evaluate(() => document.body.innerText);
  if (/Interviewer Verdict/i.test(pageText) || /hire\/no-hire/i.test(pageText) || /hiring recommendation/i.test(pageText)) {
    throw new Error('Forbidden legacy verdict or hiring recommendation text detected in browser DOM!');
  }
  console.log('   Hard Assertion 10 PASSED: Zero forbidden verdict/hiring text found in rendered browser DOM.');

  console.log('[Adaptive UI Journey] ALL REAL ADAPTIVE UI JOURNEY CHECKS PASSED 100%!');
} finally {
  if (browser) await browser.close();
  staticServer.close();
  apiServer.close();
}
