import http from 'http';
import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const llmGateway = require('../backend/dist/services/llmProviderGateway.js');
const sessionService = require('../backend/dist/services/sessionService.js');
const aiService = require('../backend/dist/services/aiService.js');

llmGateway.callWithFallback = async (prompt) => {
  const normPrompt = (prompt || '').toLowerCase();
  const candAns = normPrompt.includes('candidate response:')
    ? normPrompt.split('candidate response:')[1].split('active dimensions')[0]
    : normPrompt;

  if (candAns.includes('circuit breakers')) {
    return {
      text: JSON.stringify({
        evaluationStatus: 'evaluated',
        answerSummary: 'Strong recovery under network partition challenge.',
        observations: [
          {
            dimension: 'NARRATIVE_COHERENCE',
            anchorScore: 4,
            confidence: 'high',
            evidenceExcerpt: 'circuit breakers',
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
            dimension: 'DECISION_QUALITY',
            anchorScore: 4,
            confidence: 'high',
            evidenceExcerpt: 'eventual consistency',
            signal: 'Eventual consistency architecture',
            rationale: 'Candidate explicitly articulates outbox pattern and idempotency.',
            stage: 'exploration',
            turnKind: 'probe',
          },
          {
            dimension: 'NARRATIVE_COHERENCE',
            anchorScore: 3,
            confidence: 'high',
            evidenceExcerpt: 'asynchronous messaging',
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

  if (candAns.includes('messaging queues')) {
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
          dimension: 'DECISION_QUALITY',
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

console.log('[Adaptive Journey Test] 1. Initializing Adaptive Interview Journey verifier...');

// Build minimal Express app for journey verification
const app = express();
app.use(cors());
app.use(express.json());

// In-memory test auth middleware
app.use((req, res, next) => {
  req.user = { uid: 'test-user-journey-1' };
  next();
});

app.post('/api/interview/sessions', async (req, res) => {
  try {
    const result = await sessionService.createSession('test-user-journey-1', req.body.context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/interview/sessions/:sessionId', async (req, res) => {
  try {
    const session = await sessionService.getSession('test-user-journey-1', req.params.sessionId);
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
      'test-user-journey-1',
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
    const report = await aiService.generateAuthoritativeReport('test-user-journey-1', req.params.sessionId);
    res.json(report);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

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

// Deliberately attempt occupying port 3098 to test dynamic port allocation fallback
const blockerServer = http.createServer((_, res) => res.end('blocked'));
try {
  await new Promise((resolve, reject) => {
    blockerServer.once('error', reject);
    blockerServer.listen(3098, '127.0.0.1', resolve);
  });
  console.log('[Adaptive API Journey] Occupied port 3098 to test dynamic port fallback...');
} catch {
  console.log('[Adaptive API Journey] Port 3098 already occupied, proceeding with dynamic port fallback...');
}

const server = http.createServer(app);
const apiPort = await listenOnAvailablePort(server, 3098);
const apiBase = `http://127.0.0.1:${apiPort}`;
console.log(`   Test Express API server running on ${apiBase} (dynamic fallback successful!)`);

let browser;
try {
  console.log('[Adaptive Journey Test] 2. Launching Chromium via Playwright...');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('[Adaptive Journey Test] 3. Starting structured adaptive session in classic_behavioral mode...');
  const sampleContext = {
    candidateRole: 'Senior Backend Architect',
    intentText: 'Architecture & Tradeoffs',
    selectedPanelIDs: ['p1'],
    sessionType: 'structured',
    controls: {
      difficulty: 'intermediate',
      totalQuestions: 2,
      includeBehavioral: true,
      includeCoding: false,
      reasoningMode: 'classic_behavioral',
      deliveryMode: 'exam',
    },
    interviewPlan: {
      meta: {
        targetRole: 'Senior Backend Architect',
        intent: 'Architecture & Tradeoffs',
        sessionType: 'structured',
        controls: {
          difficulty: 'intermediate',
          totalQuestions: 2,
          includeBehavioral: true,
          includeCoding: false,
          reasoningMode: 'classic_behavioral',
          deliveryMode: 'exam',
        },
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
        {
          id: 'q2_arch',
          phase: 'scenario',
          difficulty: 'intermediate',
          question: 'How do you handle database failover without data loss?',
          expectedSignals: ['WAL replication', 'Quorum consensus', 'Connection pooling'],
          personaFocus: 'p1',
          questionKind: 'root',
          rootQuestionId: 'q2_arch',
          stage: 'framing',
        },
      ],
    },
  };

  const startRes = await page.request.post(`${apiBase}/api/interview/sessions`, {
    data: { context: sampleContext },
  });
  const startData = await startRes.json();
  const sessionId = startData.sessionId;

  console.log(`   Session created with ID: ${sessionId}`);
  if (!startData.firstQuestion || startData.firstQuestion.id !== 'q1_arch') {
    throw new Error('Failed to present initial root question q1_arch');
  }
  if (startData.firstQuestion.stage !== 'framing') {
    throw new Error(`Expected stage framing, got ${startData.firstQuestion.stage}`);
  }

  // Step 4 & 5: Turn 1 - Vague answer -> Ask Probe in exploration stage
  console.log('[Adaptive Journey Test] 4. Submitting Turn 1 (vague answer) -> expecting ask_probe...');
  const turn1Res = await page.request.post(`${apiBase}/api/interview/sessions/${sessionId}/answers`, {
    data: {
      questionId: 'q1_arch',
      expectedSessionVersion: 1,
      clientSubmissionId: '40000000-0000-4000-8000-000000000001',
      answerKind: 'answered',
      answerText: 'We use messaging queues and databases.',
    },
  });
  const turn1Data = await turn1Res.json();
  if (turn1Data.nextAction !== 'ask_probe') {
    throw new Error(`Expected nextAction ask_probe, got ${turn1Data.nextAction}`);
  }
  if (turn1Data.stage !== 'exploration') {
    throw new Error(`Expected stage exploration, got ${turn1Data.stage}`);
  }

  // Step 6 & 7: Turn 2 - Grounded answer -> Introduce Challenge in challenge stage
  console.log('[Adaptive Journey Test] 5. Submitting Turn 2 (grounded answer) -> expecting introduce_challenge...');
  const turn2Res = await page.request.post(`${apiBase}/api/interview/sessions/${sessionId}/answers`, {
    data: {
      questionId: turn1Data.nextQuestion.id,
      expectedSessionVersion: turn1Data.sessionVersion,
      clientSubmissionId: '40000000-0000-4000-8000-000000000002',
      answerKind: 'answered',
      answerText: 'We implement eventual consistency using asynchronous messaging with Kafka, outbox pattern, and strict idempotency keys to guarantee at-least-once delivery.',
    },
  });
  const turn2Data = await turn2Res.json();
  if (turn2Data.nextAction !== 'introduce_challenge') {
    throw new Error(`Expected nextAction introduce_challenge, got ${turn2Data.nextAction}`);
  }
  if (!turn2Data.challengeEvent) {
    throw new Error('Expected ChallengeEvent in turn2 response');
  }

  // Step 8 & 9: Turn 3 - Robust challenge recovery answer -> expecting ask_reflection
  console.log('[Adaptive Journey Test] 6. Submitting Turn 3 (challenge recovery) -> expecting ask_reflection...');
  const turn3Res = await page.request.post(`${apiBase}/api/interview/sessions/${sessionId}/answers`, {
    data: {
      questionId: turn2Data.nextQuestion.id,
      expectedSessionVersion: turn2Data.sessionVersion,
      clientSubmissionId: '40000000-0000-4000-8000-000000000003',
      answerKind: 'answered',
      answerText: 'To address network partitions, we employ circuit breakers with exponential backoff and fallback read-replicas to maintain availability during pushback.',
    },
  });
  const turn3Data = await turn3Res.json();
  if (turn3Data.nextAction !== 'ask_reflection') {
    throw new Error(`Expected nextAction ask_reflection after challenge turn, got ${turn3Data.nextAction}`);
  }

  // Turn 4 - Reflection answer after challenge -> expecting advance_root_question to q2_arch
  console.log('[Adaptive Journey Test] 7. Submitting Turn 4 (challenge reflection) -> expecting advance_root_question...');
  const turn4Res = await page.request.post(`${apiBase}/api/interview/sessions/${sessionId}/answers`, {
    data: {
      questionId: turn3Data.nextQuestion.id,
      expectedSessionVersion: turn3Data.sessionVersion,
      clientSubmissionId: '40000000-0000-4000-8000-000000000004',
      answerKind: 'answered',
      answerText: 'I learned to always quantify the maximum acceptable latency before selecting consistency guarantees.',
    },
  });
  const turn4Data = await turn4Res.json();
  if (turn4Data.nextQuestion?.id !== 'q2_arch') {
    throw new Error(`Expected progression to root question 2 q2_arch, got ${turn4Data.nextQuestion?.id}`);
  }

  // Turn 5 - Second root question answer
  console.log('[Adaptive Journey Test] 8. Submitting Turn 5 (root 2 answer)...');
  const turn5Res = await page.request.post(`${apiBase}/api/interview/sessions/${sessionId}/answers`, {
    data: {
      questionId: turn4Data.nextQuestion.id,
      expectedSessionVersion: turn4Data.sessionVersion,
      clientSubmissionId: '40000000-0000-4000-8000-000000000005',
      answerKind: 'answered',
      answerText: 'We enforce synchronous WAL replication across 3 Availability Zones with automated leader election using Raft consensus.',
    },
  });
  const turn5Data = await turn5Res.json();

  let finalTurnData = turn5Data;
  let turnIdx = 6;
  while (!finalTurnData.isSessionComplete && finalTurnData.nextQuestion) {
    console.log(`[Adaptive Journey Test] Submitting Turn ${turnIdx} (${finalTurnData.nextQuestion.questionKind || 'turn'})...`);
    const nextRes = await page.request.post(`${apiBase}/api/interview/sessions/${sessionId}/answers`, {
      data: {
        questionId: finalTurnData.nextQuestion.id,
        expectedSessionVersion: finalTurnData.sessionVersion,
        clientSubmissionId: `40000000-0000-4000-8000-00000000000${turnIdx}`,
        answerKind: 'answered',
        answerText: 'Providing clear trade-off evaluation and system metrics verification.',
      },
    });
    finalTurnData = await nextRes.json();
    turnIdx++;
  }

  // Step 12 & 13: Verify session completed and status = awaiting_report
  console.log('[Adaptive Journey Test] 9. Verifying session completion & awaiting_report status...');
  if (!finalTurnData.isSessionComplete) {
    throw new Error('Expected isSessionComplete to be true after final turn');
  }

  const sessionStateRes = await page.request.get(`${apiBase}/api/interview/sessions/${sessionId}`);
  const sessionState = await sessionStateRes.json();
  if (sessionState.status !== 'awaiting_report') {
    throw new Error(`Expected session status awaiting_report, got ${sessionState.status}`);
  }

  // Step 14 & 15: Trigger report generation
  console.log('[Adaptive Journey Test] 10. Generating final report...');
  const reportRes = await page.request.post(`${apiBase}/api/interview/sessions/${sessionId}/report`);
  const reportData = await reportRes.json();

  // Step 16, 17, 18: Hard Assertions on Report Integrity
  console.log('[Adaptive Journey Test] 11. Running report evidence assertions...');
  if (!reportData.quantitativeAnalysis || !Array.isArray(reportData.quantitativeAnalysis.dimension_scores)) {
    throw new Error('Report quantitativeAnalysis.dimension_scores is missing');
  }

  const dimScores = reportData.quantitativeAnalysis.dimension_scores;
  if (dimScores.length === 0) {
    throw new Error('Dimension scores list is empty');
  }

  const problemFraming = dimScores.find(d => d.dimension === 'PROBLEM_FRAMING');
  if (!problemFraming) {
    throw new Error('Active reasoning dimension PROBLEM_FRAMING is missing from report');
  }
  if (!Array.isArray(problemFraming.evidenceReferences)) {
    throw new Error('Evidence references array is missing from PROBLEM_FRAMING dimension score');
  }

  // Verify zero forbidden default strings exist in report JSON
  const reportJsonStr = JSON.stringify(reportData);
  const forbiddenStrings = [
    'Turn evaluated from verified evidence.',
    'Articulate trade-offs clearly.',
    'Re-do scenario focusing on explicit problem framing.',
    'Unverified observation signal',
    'Practice scaling limits',
  ];

  for (const forbidden of forbiddenStrings) {
    if (reportJsonStr.includes(forbidden)) {
      throw new Error(`Forbidden generic default string found in report: "${forbidden}"`);
    }
  }

  console.log('   All 18 Adaptive Interview Journey steps and assertions PASSED 100%!');
} finally {
  if (browser) await browser.close();
  server.close();
  try { blockerServer.close(); } catch {}
}
