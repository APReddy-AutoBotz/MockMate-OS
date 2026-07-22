import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { PERSONAS_CONFIG } from '../config/personas';
import { 
  InterviewTurn, 
  InterviewSessionContext as SessionContext, 
  FinalReport, 
  SessionControls, 
  InterviewPlan,
  InterviewPlanSchema,
  RawInterviewPlanSchema,
  FinalReportSchema,
  CalibrateResponse,
  CalibrateResponseSchema
} from 'mockmate-shared';
import * as sessionService from './sessionService';
import { APPROVED_DIMENSIONS, ACTIVE_DIMENSIONS_BY_MODE, DEFAULT_WEIGHTS_BY_MODE } from '../config/evaluationConfig';

// Initialize Primary (Gemini)
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI({ apiKey: geminiApiKey || 'dummy' });

// Initialize Fallback (Groq via OpenAI Client)
const groqApiKey = process.env.GROQ_API_KEY;
const groq = groqApiKey ? new OpenAI({
  apiKey: groqApiKey,
  baseURL: 'https://api.groq.com/openai/v1'
}) : null;

const PROVIDER_CONFIG = {
  primary: { id: 'gemini', model: 'gemini-2.0-flash' },
  fallback: { id: 'groq', model: 'llama-3.3-70b-versatile' }
};

const FEATURE_FLAGS = {
  ENABLE_GROQ_FALLBACK: true
};

// --- Helpers ---

const getResponseText = (response: any): string => {
  if (!response) return '';
  if (typeof response.text === 'function') return response.text();
  if (typeof response.text === 'string') return response.text;
  const candidateText = response?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text)?.filter(Boolean)?.join('');
  return candidateText || '';
};

const extractJson = (text: string): any => {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
};

const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> => {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await operation(); }
    catch (error: any) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, initialDelay * Math.pow(2, attempt)));
    }
  }
  throw lastError;
};

export async function callProvider(providerId: string, prompt: string): Promise<{ text: string, provider: string, model: string }> {
  const isPrimary = providerId === 'gemini';
  const config = isPrimary ? PROVIDER_CONFIG.primary : PROVIDER_CONFIG.fallback;

  if (isPrimary) {
    const response = await ai.models.generateContent({
      model: config.model,
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.3, maxOutputTokens: 5000, responseMimeType: 'application/json' }
    });
    return { text: getResponseText(response), provider: 'gemini', model: config.model };
  } else {
    if (!groq) throw new Error("Groq client not initialized");
    const response = await groq.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: 'You are a world-class Interview Bar Raiser. Respond strictly in valid JSON matching the requested schema.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });
    return { text: response.choices[0]?.message?.content || '', provider: 'groq', model: config.model };
  }
}

export async function callWithFallback(prompt: string): Promise<{ text: string, provider: string, model: string, fallbackTriggered: boolean }> {
  const forceProvider = process.env.MOCKMATE_FORCE_PROVIDER;

  try {
    if (forceProvider === 'groq') throw new Error("Forced Groq for testing");
    const result = await retryOperation(() => callProvider('gemini', prompt));
    return { ...result, fallbackTriggered: false };
  } catch (primaryErr) {
    if ((FEATURE_FLAGS.ENABLE_GROQ_FALLBACK || forceProvider === 'groq') && groq) {
      try {
        const fallbackResult = await retryOperation(() => callProvider('groq', prompt));
        return { ...fallbackResult, fallbackTriggered: true };
      } catch (fallbackErr) {
        throw new Error("Resilient AI stack failure - Check API keys and quota.");
      }
    } else {
      throw primaryErr;
    }
  }
}

// --- Intent Calibration ---

export const calibrateIntent = async (role: string, jobDescription?: string): Promise<CalibrateResponse> => {
  const intentText = role;
  if (!intentText || intentText.trim().length < 2) {
    throw new Error('Please provide a more detailed job description or career goal.');
  }

  const defaultControls: SessionControls = {
    difficulty: 'intermediate',
    totalQuestions: 5,
    includeBehavioral: true,
    includeCoding: false,
    timePerQuestion: '90s',
    deliveryMode: 'exam',
    reasoningMode: 'classic_behavioral',
    sourceMode: jobDescription ? 'job_description' : 'question_bank'
  };

  const defaultJdInsights = {
    role,
    level: 'L4',
    mustHaveSkills: ['Problem Solving', 'Communication'],
    niceToHave: ['Domain Knowledge'],
    domains: ['Engineering'],
    tools: ['Git'],
    softSkills: ['Teamwork'],
    competencyWeights: { PROBLEM_FRAMING: 0.5, TRADEOFF_CLARITY: 0.5 }
  };

  const masterPrompt = `You are an expert talent acquisition strategist.
CANDIDATE GOAL/ROLE: "${role}"
JOB DESCRIPTION: "${jobDescription || 'None'}"

OUTPUT JSON SCHEMA:
{
  "role": "Normalized Role Title",
  "suggestedControls": {
    "difficulty": "starter|intermediate|expert",
    "totalQuestions": 5,
    "includeBehavioral": true,
    "includeCoding": false,
    "timePerQuestion": "90s",
    "deliveryMode": "exam",
    "reasoningMode": "classic_behavioral"
  },
  "jdInsights": {
    "role": "Normalized Role Title",
    "level": "L4/Senior",
    "mustHaveSkills": ["Skill 1"],
    "niceToHave": ["Skill 2"],
    "domains": ["Domain 1"],
    "tools": ["Tool 1"],
    "softSkills": ["Communication"],
    "competencyWeights": { "PROBLEM_FRAMING": 0.5, "TRADEOFF_CLARITY": 0.5 }
  }
}`;

  try {
    const { text } = await callWithFallback(masterPrompt);
    const parsed = extractJson(text || '{}');
    if (!parsed || !parsed.role) throw new Error("AI returned invalid calibration");

    return CalibrateResponseSchema.parse({
      role: parsed.role || role,
      suggestedControls: {
        ...defaultControls,
        ...(parsed.suggestedControls || {})
      },
      jdInsights: {
        ...defaultJdInsights,
        ...(parsed.jdInsights || {})
      }
    });
  } catch (err) {
    return CalibrateResponseSchema.parse({
      role: role || 'Software Engineer',
      suggestedControls: defaultControls,
      jdInsights: defaultJdInsights
    });
  }
};

// --- Plan Generation ---

export const generateInterviewPlan = async (
  role: string,
  intentText: string,
  sessionControls: SessionControls,
  jdText?: string,
  resumeText?: string
): Promise<InterviewPlan> => {
  if (!intentText || intentText.trim().length < 2) throw new Error('Goal too short');

  const sessionMode = sessionControls.reasoningMode || 'classic_behavioral';
  const activeDimensions = ACTIVE_DIMENSIONS_BY_MODE[sessionMode] || ACTIVE_DIMENSIONS_BY_MODE['classic_behavioral'];
  const dimensionWeights = DEFAULT_WEIGHTS_BY_MODE[sessionMode] || DEFAULT_WEIGHTS_BY_MODE['classic_behavioral'];

  const masterPrompt = `You are an expert interview strategist. Create a comprehensive interview plan.
  
  CONTEXT:
  Role: "${role}"
  Intent: "${intentText}"
  Difficulty: ${sessionControls.difficulty}
  Session Mode: ${sessionMode}
  Total Questions: ${sessionControls.totalQuestions}
  
  INPUT MATERIAL:
  JD: ${jdText ? `"""${jdText}"""` : 'None'}
  Resume: ${resumeText ? `"""${resumeText}"""` : 'None'}

  ACTIVE DIMENSIONS:
  ${activeDimensions.map(d => `- ${APPROVED_DIMENSIONS[d].name}: ${APPROVED_DIMENSIONS[d].definition}`).join('\n')}

  OUTPUT SCHEMA (JSON):
  {
    "meta": {
      "intent": "${intentText}"
    },
    "jdInsights": { 
      "source": "job_description",
      "role": "${role}", 
      "level": "Senior", 
      "mustHaveSkills": ["Problem Solving"],
      "niceToHave": ["System Architecture"],
      "domains": ["Software"],
      "tools": ["Git"],
      "softSkills": ["Leadership"],
      "competencyWeights": ${JSON.stringify(dimensionWeights)}
    },
    "questionSet": [
      {
        "phase": "behavioral|scenario|technical",
        "difficulty": "${sessionControls.difficulty}",
        "question": "string question text",
        "expectedSignals": ["signal 1", "signal 2"],
        "personaFocus": "Lead Evaluator"
      }
    ]
  }`;

  const { text } = await callWithFallback(masterPrompt);
  const rawData = extractJson(text || '{}');
  
  // 1. Parse with RawInterviewPlanSchema (strictly typed without z.any)
  const rawParsed = RawInterviewPlanSchema.parse(rawData);

  // 2. Create stable deterministic question IDs & normalize questions
  const normalizedQuestions = rawParsed.questionSet.map((q, idx) => ({
    id: `q_${Date.now()}_${idx + 1}`,
    phase: q.phase || 'scenario',
    difficulty: q.difficulty || sessionControls.difficulty,
    question: q.question,
    expectedSignals: q.expectedSignals && q.expectedSignals.length > 0 ? q.expectedSignals : ['Clear reasoning', 'Structured response'],
    personaFocus: q.personaFocus || 'Interviewer',
    type: q.type,
    failureModes: q.failureModes,
    evaluationCriteria: q.evaluationCriteria,
    rubric: q.rubric,
    sourceBullets: q.sourceBullets,
    language: q.language,
    timeAllocation: q.timeAllocation
  }));

  // 3. Assemble normalized interview plan
  const normalizedPlan = {
    meta: {
      intent: intentText,
      controls: sessionControls,
    },
    jdInsights: {
      source: (rawParsed.jdInsights?.source as string) || 'job_description',
      role: (rawParsed.jdInsights?.role as string) || role,
      level: (rawParsed.jdInsights?.level as string) || 'Intermediate',
      mustHaveSkills: Array.isArray(rawParsed.jdInsights?.mustHaveSkills) ? rawParsed.jdInsights.mustHaveSkills as string[] : ['Communication'],
      niceToHave: Array.isArray(rawParsed.jdInsights?.niceToHave) ? rawParsed.jdInsights.niceToHave as string[] : [],
      domains: Array.isArray(rawParsed.jdInsights?.domains) ? rawParsed.jdInsights.domains as string[] : ['Engineering'],
      tools: Array.isArray(rawParsed.jdInsights?.tools) ? rawParsed.jdInsights.tools as string[] : [],
      softSkills: Array.isArray(rawParsed.jdInsights?.softSkills) ? rawParsed.jdInsights.softSkills as string[] : ['Teamwork'],
      competencyWeights: dimensionWeights,
    },
    questionSet: normalizedQuestions,
  };

  // 4. Validate and parse with final InterviewPlanSchema
  return InterviewPlanSchema.parse(normalizedPlan);
};

// --- Report Generation ---

export const generateFinalReport = async (
  history: InterviewTurn[],
  context: SessionContext
): Promise<FinalReport> => {
  if (!history || history.length === 0) throw new Error('No interview history to analyze.');

  const roleParam = context.candidateRole || "Candidate";
  const sessionMode = context.controls?.reasoningMode || 'classic_behavioral';
  const activeDimensions = ACTIVE_DIMENSIONS_BY_MODE[sessionMode] || ACTIVE_DIMENSIONS_BY_MODE['classic_behavioral'];

  const transcriptText = history.map((turn, i) => `
  TURN ${i + 1}:
  Interviewer (${turn.interviewer}): "${turn.question}"
  Candidate: "${turn.candidateResponse || '[No response provided]'}"
  `).join('\n');

  const masterPrompt = `You are a world-class Interview Bar Raiser. Analyze this mock interview session and generate a canonical report.

  TRANSCRIPT:
  ${transcriptText}

  ACTIVE DIMENSIONS:
  ${activeDimensions.map(d => `- ${APPROVED_DIMENSIONS[d].name}`).join('\n')}

  REQUIRED OUTPUT SCHEMA (JSON):
  {
    "overallSummary": "Executive summary of interview performance",
    "evaluationModel": "mockmate_v1_canonical",
    "readiness": { "status": "INTERVIEW_READY|ALMOST_READY|NOT_READY|NOT_ASSESSED", "reasoning": "Reasoning summary" },
    "quantitativeAnalysis": {
      "dimension_scores": [
        {
          "dimension": "PROBLEM_FRAMING",
          "score_status": "scored|insufficient_evidence|not_tested",
          "anchor_score": 4,
          "normalized_score": 80,
          "reason": "Clear structured approach",
          "evidence": ["Candidate outlined assumptions"],
          "confidence": "high"
        }
      ]
    },
    "advisoryPanel": [
      { "name": "Lead Evaluator", "assessment": "Performance assessment", "hireRecommendation": true }
    ],
    "questionPerformance": [
      { 
        "question_text": "Q1 text", 
        "user_transcript": "Candidate text", 
        "feedback": "Detailed feedback",
        "strengths": ["Structured response"],
        "improvements": ["More specific metrics"]
      }
    ],
    "biggestRiskArea": { "title": "Risk Title", "observation": "Observed gap", "mitigation": "Recommended fix" },
    "coachPack": {
      "title": "Action Plan",
      "redoNow": { "question": "Q1", "instruction": "Try again with STAR format" },
      "micro_drills": [{ "weakness": "System bounds", "drill_prompt": "Practice scale limits", "focus_point": "Latency constraints" }]
    },
    "trajectoryReplay": [
      { "summary": "Turn 1-2 summary", "keyMoments": ["Key moment 1"] }
    ],
    "auditLayer": [
      { "biasDetected": false, "notes": "No evaluation bias detected" }
    ],
    "simplifiedScore": 80,
    "quickWins": ["Actionable quick win"],
    "prioritizedActions": [{ "action": "Practice STAR method", "impact": "high" }]
  }`;

  const { text } = await exports.callWithFallback(masterPrompt);
  const reportData = extractJson(text || '{}');
  if (!reportData || !reportData.overallSummary) throw new Error("Incomplete or invalid report returned by provider");

  // Validate readiness status strictly
  const validStatuses = ['INTERVIEW_READY', 'ALMOST_READY', 'NOT_READY', 'NOT_ASSESSED'];
  const providerStatus = reportData.readiness?.status;
  const readinessStatus = validStatuses.includes(providerStatus) ? providerStatus : 'NOT_ASSESSED';

  // Process dimension scores without injecting fake scores
  const rawDimensionScores = reportData.quantitativeAnalysis?.dimension_scores || [];
  let scoredTotal = 0;
  let scoredCount = 0;

  const dimensionScores = rawDimensionScores.map((ds: any) => {
    const isScored = ds.score_status === 'scored' && typeof ds.anchor_score === 'number' && typeof ds.normalized_score === 'number' && ds.reason;
    if (isScored) {
      scoredTotal += ds.normalized_score;
      scoredCount++;
      return {
        dimension: ds.dimension || 'PROBLEM_FRAMING',
        dimensionName: ds.dimensionName || APPROVED_DIMENSIONS[ds.dimension as keyof typeof APPROVED_DIMENSIONS]?.name || 'Problem Framing',
        score_status: 'scored' as const,
        anchor_score: ds.anchor_score,
        normalized_score: ds.normalized_score,
        reason: String(ds.reason),
        evidence: Array.isArray(ds.evidence) && ds.evidence.length > 0 ? ds.evidence.map(String) : [String(ds.reason)],
        confidence: ['high', 'medium', 'low'].includes(ds.confidence) ? ds.confidence : 'medium'
      };
    } else {
      return {
        dimension: ds.dimension || 'PROBLEM_FRAMING',
        dimensionName: ds.dimensionName || APPROVED_DIMENSIONS[ds.dimension as keyof typeof APPROVED_DIMENSIONS]?.name || 'Problem Framing',
        score_status: (ds.score_status === 'not_tested' ? 'not_tested' : 'insufficient_evidence') as any,
        anchor_score: null,
        normalized_score: null,
        reason: ds.reason ? String(ds.reason) : 'Insufficient evidence to evaluate dimension.',
        evidence: [],
        confidence: 'low' as const
      };
    }
  });

  const finalSimplifiedScore = scoredCount > 0 ? Math.round(scoredTotal / scoredCount) : null;
  const finalReadinessStatus = scoredCount === 0 ? 'NOT_ASSESSED' : readinessStatus;
  const finalReadinessReasoning = scoredCount === 0 
    ? 'Evaluation could not be completed due to insufficient evidence or unscored dimensions.'
    : (reportData.readiness?.reasoning || 'Session evaluation complete.');

  const normalizedReport = {
    overallSummary: reportData.overallSummary,
    evaluationModel: 'mockmate_v1_canonical' as const,
    readiness: {
      status: finalReadinessStatus as any,
      reasoning: finalReadinessReasoning
    },
    quantitativeAnalysis: {
      dimension_scores: dimensionScores
    },
    advisoryPanel: (reportData.advisoryPanel || []).map((ap: any) => ({
      name: ap.name || ap.persona || 'Lead Evaluator',
      assessment: ap.assessment || ap.summary || 'Assessment completed.',
      hireRecommendation: scoredCount === 0 ? null : (typeof ap.hireRecommendation === 'boolean' ? ap.hireRecommendation : null)
    })),
    questionPerformance: (reportData.questionPerformance || []).map((qp: any, idx: number) => ({
      question_text: qp.question_text || history[idx]?.question || 'Question',
      question_phase: qp.question_phase || 'scenario',
      user_transcript: qp.user_transcript || history[idx]?.candidateResponse || '',
      max_impact_response: qp.max_impact_response,
      feedback: qp.feedback || 'Response analyzed.',
      strengths: Array.isArray(qp.strengths) ? qp.strengths : [],
      improvements: Array.isArray(qp.improvements) ? qp.improvements : []
    })),
    biggestRiskArea: {
      title: reportData.biggestRiskArea?.title || 'Area for Growth',
      observation: reportData.biggestRiskArea?.observation || 'No critical risks identified.',
      mitigation: reportData.biggestRiskArea?.mitigation || 'Continue practicing structured responses.'
    },
    coachPack: {
      title: reportData.coachPack?.title || 'Coaching Micro-Drills',
      redoNow: typeof reportData.coachPack?.redoNow === 'object' ? {
        question: reportData.coachPack.redoNow.question || history[0]?.question || 'Question',
        instruction: reportData.coachPack.redoNow.instruction || 'Practice giving a structured answer.'
      } : {
        question: history[0]?.question || 'Question',
        instruction: String(reportData.coachPack?.redoNow || 'Practice structured answers.')
      },
      micro_drills: (reportData.coachPack?.micro_drills || []).map((md: any) => ({
        weakness: typeof md === 'string' ? md : md.weakness || 'General Polish',
        drill_prompt: typeof md === 'string' ? 'Practice response structure' : md.drill_prompt || 'Practice structured summary',
        focus_point: typeof md === 'string' ? 'Clarity' : md.focus_point || 'Clarity'
      }))
    },
    trajectoryReplay: (reportData.trajectoryReplay || []).map((tr: any) => ({
      summary: tr.summary || tr.observation || 'Session completed.',
      keyMoments: Array.isArray(tr.keyMoments) ? tr.keyMoments : ['Turn answered.']
    })),
    auditLayer: (reportData.auditLayer || []).map((al: any) => ({
      biasDetected: typeof al.biasDetected === 'boolean' ? al.biasDetected : false,
      notes: al.notes || al.gap || 'Standard evaluation applied.'
    })),
    simplifiedScore: finalSimplifiedScore,
    topStrength: reportData.topStrength,
    topWeakness: reportData.topWeakness,
    estimatedSessionsToReady: scoredCount === 0 ? null : (typeof reportData.estimatedSessionsToReady === 'number' ? reportData.estimatedSessionsToReady : null),
    quickWins: Array.isArray(reportData.quickWins) ? reportData.quickWins : [],
    prioritizedActions: (reportData.prioritizedActions || []).map((pa: any) => ({
      action: pa.action || pa.title || 'Practice STAR framework',
      impact: pa.impact || 'high'
    }))
  };

  return FinalReportSchema.parse(normalizedReport);
};

export const generateAuthoritativeReport = async (userId: string, sessionId: string): Promise<FinalReport> => {
  const session = await sessionService.getSession(userId, sessionId);
  if (!session) throw new Error('Session not found');

  const history = session.history || [];
  if (history.length === 0) throw new Error('No interview history to analyze.');

  try {
    const report = await generateFinalReport(history, session.context);
    const parsedReport = FinalReportSchema.parse(report);
    await sessionService.completeSession(userId, sessionId, parsedReport);
    return parsedReport;
  } catch (err: any) {
    await sessionService.markSessionEvaluationFailed(userId, sessionId, 'REPORT_GENERATION_FAILED');
    throw err;
  }
};

export const analyzeCode = async (blueprint: any, code: string): Promise<{ status: 'analyzed' | 'unavailable'; feedback: string; passed: boolean | null }> => {
  if (!code || code.trim().length < 10) {
    return { status: 'unavailable', feedback: "Code input too short for analysis.", passed: null };
  }

  const masterPrompt = `You are a Senior Staff Engineer. Analyze the following candidate code for a job interview.
  LANGUAGE: ${blueprint?.language || 'python'}
  QUESTION: "${blueprint?.question || 'Code problem'}"
  CANDIDATE CODE:
  \`\`\`
  ${code}
  \`\`\`
  OUTPUT JSON SCHEMA:
  {
    "feedback": "Detailed code review feedback",
    "passed": true|false
  }`;

  try {
    const { text } = await exports.callWithFallback(masterPrompt);
    const parsed = extractJson(text || '{}');
    if (!parsed || typeof parsed.feedback !== 'string') {
      return { status: 'unavailable', feedback: 'Code analysis unavailable.', passed: null };
    }
    return {
      status: 'analyzed',
      feedback: parsed.feedback,
      passed: typeof parsed.passed === 'boolean' ? parsed.passed : null
    };
  } catch (e) {
    return { status: 'unavailable', feedback: 'Code analysis unavailable.', passed: null };
  }
};

export const simulateExecution = async (code: string, language: string): Promise<{ status: 'success' | 'unavailable'; stdout: string; stderr: string }> => {
  if (!code || code.trim().length === 0) {
    return { status: 'unavailable', stdout: '', stderr: 'No code provided for simulation.' };
  }

  const prompt = `Mental-run the following code and return standard output and standard error in JSON format:
  LANGUAGE: ${language}
  CODE: ${code}
  OUTPUT JSON SCHEMA: { "stdout": "...", "stderr": "..." }`;

  try {
    const { text } = await exports.callWithFallback(prompt);
    const parsed = extractJson(text);
    if (!parsed) {
      return { status: 'unavailable', stdout: '', stderr: 'Code simulation unavailable.' };
    }
    return {
      status: 'success',
      stdout: String(parsed.stdout || ''),
      stderr: String(parsed.stderr || '')
    };
  } catch (e) {
    return { status: 'unavailable', stdout: '', stderr: 'Code simulation unavailable.' };
  }
};

export const getHintForQuestion = async (question: string, expectedSignals?: string[]): Promise<string> => {
  try {
    const hintPrompt = `Provide a short 1-2 sentence hint for an interviewee answering this question: "${question}". Do not give away the answer.`;
    const { text } = await exports.callWithFallback(hintPrompt);
    const trimmed = text.trim();
    if (!trimmed) return 'Hint unavailable.';
    return trimmed;
  } catch (error) {
    return 'Hint unavailable.';
  }
};

export const generateIdealAnswer = async (
  question: string,
  expectedSignals?: string[],
  userAnswer?: string
): Promise<string> => {
  const prompt = `Generate a high-bar sample answer (2-4 sentences) for this interview question: "${question}". Answer provided by candidate: "${userAnswer || 'None'}".`;
  try {
    const { text } = await exports.callWithFallback(prompt);
    const trimmed = text.trim();
    if (!trimmed) return 'Sample response unavailable.';
    return trimmed;
  } catch (e) {
    return 'Sample response unavailable.';
  }
};

export const transcribeAudio = async (base64Audio: string, mimeType: string = 'audio/webm'): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          { text: "Transcribe this interview answer exactly as spoken. Return ONLY the text, no intro/outro." }
        ]
      }],
      config: { temperature: 0.1 }
    });

    const transcript = getResponseText(response).trim();
    if (transcript) return transcript;
    throw new Error("Gemini returned empty transcript");
  } catch (primaryError) {
    if (groq && groqApiKey) {
      try {
        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        
        const tempDir = os.tmpdir();
        const ext = mimeType.split('/')[1]?.split(';')[0] || 'webm';
        const tempFilePath = path.join(tempDir, `mockmate_audio_${Date.now()}.${ext}`);
        
        const buffer = Buffer.from(base64Audio, 'base64');
        fs.writeFileSync(tempFilePath, buffer);
        
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(tempFilePath),
          model: 'whisper-large-v3',
          language: 'en',
          response_format: 'text',
        });
        
        try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }
        
        if (typeof transcription === 'string') return transcription.trim();
        return (transcription as any).text?.trim() || "";
      } catch (fallbackError) {
        return "";
      }
    }
    return "";
  }
};
