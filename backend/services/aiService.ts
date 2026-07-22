import { 
  SessionControls, 
  JDInsights, 
  InterviewPlan, 
  InterviewPlanSchema, 
  InterviewSessionContext, 
  InterviewTurn, 
  FinalReport, 
  FinalReportSchema,
  RawFinalReportSchema,
  CalibrateResponseSchema,
  CalibrateResponse,
  RawCalibrateResponseSchema,
  RawInterviewPlanSchema,
  CodeSimulationResponseSchema,
  CodeSimulationResponse,
  CodeAnalysisResponseSchema,
  CodeAnalysisResponse
} from 'mockmate-shared';
import { PERSONAS_CONFIG } from '../config/personas';
import { GoogleGenAI } from '@google/genai';
import * as sessionService from './sessionService';

// Approved competency dimensions for MockMate v1 evaluation
export const APPROVED_DIMENSIONS = {
  PROBLEM_FRAMING: { name: 'Problem Framing & Structuring', definition: 'Ability to deconstruct ambiguous challenges and establish scope.' },
  TRADEOFF_CLARITY: { name: 'Trade-off & Constraint Clarity', definition: 'Explicit evaluation of technical and operational trade-offs.' },
  STAR_EXECUTION: { name: 'STAR & Result Execution', definition: 'Clear situation, task, action, and measurable outcome articulation.' },
  COMMUNICATION_PRESENCE: { name: 'Communication & Presence', definition: 'Concise, calm, and structured verbal delivery.' },
  TECHNICAL_DEPTH: { name: 'Technical Depth & Domain Rigor', definition: 'Appropriate domain depth, correct terminology, and architectural accuracy.' }
} as const;

export const ACTIVE_DIMENSIONS_BY_MODE: Record<string, (keyof typeof APPROVED_DIMENSIONS)[]> = {
  classic_behavioral: ['PROBLEM_FRAMING', 'STAR_EXECUTION', 'COMMUNICATION_PRESENCE'],
  classic_technical: ['PROBLEM_FRAMING', 'TRADEOFF_CLARITY', 'TECHNICAL_DEPTH'],
  tradeoff_decision: ['PROBLEM_FRAMING', 'TRADEOFF_CLARITY', 'TECHNICAL_DEPTH'],
  fast_check: ['PROBLEM_FRAMING', 'COMMUNICATION_PRESENCE']
};

export const DEFAULT_WEIGHTS_BY_MODE: Record<string, Record<string, number>> = {
  classic_behavioral: { PROBLEM_FRAMING: 0.35, STAR_EXECUTION: 0.35, COMMUNICATION_PRESENCE: 0.30 },
  classic_technical: { PROBLEM_FRAMING: 0.30, TRADEOFF_CLARITY: 0.40, TECHNICAL_DEPTH: 0.30 },
  tradeoff_decision: { PROBLEM_FRAMING: 0.30, TRADEOFF_CLARITY: 0.40, TECHNICAL_DEPTH: 0.30 },
  fast_check: { PROBLEM_FRAMING: 0.50, COMMUNICATION_PRESENCE: 0.50 }
};

export function extractJson(raw: string): any {
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (err) {
    const jsonMatch = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw err;
  }
}

export async function callWithFallback(prompt: string): Promise<{ text: string; provider: string; model: string; fallbackTriggered: boolean }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      if (response.text) {
        return { text: response.text, provider: 'gemini', model: 'gemini-2.5-flash', fallbackTriggered: false };
      }
    } catch (e: any) {
      console.warn('[AI Service] Gemini call failed, trying Groq fallback...', e.message);
    }
  }

  if (groqKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return { text, provider: 'groq', model: 'llama-3.3-70b-versatile', fallbackTriggered: true };
        }
      }
    } catch (e: any) {
      console.warn('[AI Service] Groq call failed...', e.message);
    }
  }

  throw new Error('All AI providers failed or no API keys configured.');
}

// --- Intent Calibration ---

export function getDeterministicPanelIDs(intentText: string): string[] {
  const text = (intentText || '').toLowerCase();
  const validIDs = PERSONAS_CONFIG.map(p => p.id);
  const matched: string[] = [];

  for (const persona of PERSONAS_CONFIG) {
    if (persona.keywords.some(kw => text.includes(kw.toLowerCase()))) {
      matched.push(persona.id);
    }
  }

  if (matched.length > 0) {
    return [...new Set(matched)].slice(0, 3);
  }

  return ['p1', 'p3'].filter(id => validIDs.includes(id));
}

export const calibrateIntent = async (role: string, jobDescription?: string): Promise<CalibrateResponse> => {
  const intentText = (role || '').trim();
  if (!intentText || intentText.length < 2) {
    throw new Error('Please provide a more detailed job description or career goal.');
  }

  const validPersonaIDs = PERSONAS_CONFIG.map(p => p.id);
  const isTechRole = /engineer|developer|software|coding|backend|frontend|fullstack|devops|data scientist|programmer/i.test(intentText);

  const defaultControls: SessionControls = {
    difficulty: 'intermediate',
    totalQuestions: 5,
    includeBehavioral: true,
    includeCoding: isTechRole,
    timePerQuestion: '90s',
    deliveryMode: 'exam',
    reasoningMode: isTechRole ? 'classic_technical' : 'classic_behavioral',
    sourceMode: jobDescription ? 'job_description' : 'question_bank'
  };

  const defaultJdInsights: JDInsights = {
    role: intentText,
    level: 'Mid-Level',
    mustHaveSkills: ['Problem Solving', 'Communication'],
    niceToHave: ['Domain Knowledge'],
    domains: isTechRole ? ['Software Engineering'] : [intentText],
    tools: isTechRole ? ['Git'] : ['Standard Tools'],
    softSkills: ['Teamwork', 'Communication'],
    competencyWeights: { PROBLEM_FRAMING: 0.5, TRADEOFF_CLARITY: 0.5 }
  };

  const personasSummary = PERSONAS_CONFIG.map(p => `- ID: ${p.id}, Name: ${p.name}, Title: ${p.title}, Focus: ${p.focus}, Domain: ${p.domain.join('/')}, Keywords: ${p.keywords.join(', ')}`).join('\n');

  const masterPrompt = `You are an expert talent acquisition strategist.
CANDIDATE GOAL/ROLE: "${intentText}"
JOB DESCRIPTION: "${jobDescription || 'None'}"

AVAILABLE INTERVIEW PANEL PERSONAS:
${personasSummary}

Select 1 to 3 best fitting panel persona IDs from the available list above.

OUTPUT STRICT JSON ONLY:
{
  "recommendedRole": "Normalized Role Title",
  "recommendedPanelIDs": ["p1", "p2"],
  "matchReasons": {
    "p1": "Reason for selecting p1",
    "p2": "Reason for selecting p2"
  },
  "suggestedControls": {
    "difficulty": "starter|intermediate|expert",
    "totalQuestions": 5,
    "includeBehavioral": true,
    "includeCoding": ${isTechRole},
    "timePerQuestion": "90s",
    "deliveryMode": "exam",
    "reasoningMode": "${isTechRole ? 'classic_technical' : 'classic_behavioral'}"
  },
  "jdInsights": {
    "role": "Normalized Role Title",
    "level": "Mid-Level",
    "mustHaveSkills": ["Skill 1"],
    "niceToHave": ["Skill 2"],
    "domains": ["Domain 1"],
    "tools": ["Tool 1"],
    "softSkills": ["Communication"],
    "competencyWeights": { "PROBLEM_FRAMING": 0.5, "TRADEOFF_CLARITY": 0.5 }
  }
}`;

  try {
    const { text } = await exports.callWithFallback(masterPrompt);
    const rawData = extractJson(text || '{}');
    const rawParsed = RawCalibrateResponseSchema.parse(rawData);

    const rawIDs = rawParsed.recommendedPanelIDs || rawParsed.panelIDs || [];
    let matchedIDs: string[] = [];
    if (Array.isArray(rawIDs)) {
      matchedIDs = [...new Set(rawIDs.filter((id: any) => typeof id === 'string' && validPersonaIDs.includes(id)))];
    }

    if (matchedIDs.length === 0) {
      matchedIDs = getDeterministicPanelIDs(intentText);
    }
    matchedIDs = matchedIDs.slice(0, 3);

    const matchReasons: Record<string, string> = {};
    for (const id of matchedIDs) {
      const persona = PERSONAS_CONFIG.find(p => p.id === id);
      if (rawParsed.matchReasons && rawParsed.matchReasons[id] && typeof rawParsed.matchReasons[id] === 'string') {
        matchReasons[id] = rawParsed.matchReasons[id];
      } else {
        matchReasons[id] = `Matched ${persona?.name || id} (${persona?.title || 'Evaluator'}) based on expertise in ${persona?.focus || intentText}.`;
      }
    }

    const payload = {
      recommendedPanelIDs: matchedIDs,
      recommendedRole: String(rawParsed.recommendedRole || rawParsed.role || intentText),
      matchReasons,
      suggestedControls: {
        ...defaultControls,
        ...(rawParsed.suggestedControls && typeof rawParsed.suggestedControls === 'object' ? rawParsed.suggestedControls : {})
      },
      jdInsights: {
        ...defaultJdInsights,
        ...(rawParsed.jdInsights && typeof rawParsed.jdInsights === 'object' ? rawParsed.jdInsights : {})
      },
      fallbackUsed: false,
    };

    return CalibrateResponseSchema.parse(payload);
  } catch (err) {
    const fallbackIDs = getDeterministicPanelIDs(intentText);
    const fallbackMatchReasons: Record<string, string> = {};
    fallbackIDs.forEach(id => {
      const persona = PERSONAS_CONFIG.find(p => p.id === id);
      fallbackMatchReasons[id] = `Assigned ${persona?.name || id} for ${intentText} based on role keywords.`;
    });

    const fallbackPayload = {
      recommendedPanelIDs: fallbackIDs,
      recommendedRole: intentText,
      matchReasons: fallbackMatchReasons,
      suggestedControls: defaultControls,
      jdInsights: defaultJdInsights,
      fallbackUsed: true,
    };

    return CalibrateResponseSchema.parse(fallbackPayload);
  }
};

export function createDeterministicQuestionId(role: string, mode: string, questionText: string, index: number): string {
  const normRole = (role || 'role').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const normMode = (mode || 'mode').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const normText = (questionText || 'q').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
  let hash = 0;
  for (let i = 0; i < normText.length; i++) {
    hash = (hash * 31 + normText.charCodeAt(i)) >>> 0;
  }
  return `q_${normRole}_${normMode}_${index}_${hash.toString(16)}`;
}

// --- Plan Generation & Fallback ---

export const buildDeterministicInterviewPlan = (
  role: string,
  intentText: string,
  sessionControls: SessionControls,
  selectedPanelIDs: string[] = ['p1', 'p3']
): InterviewPlan => {
  const safePanelIDs = selectedPanelIDs.length ? selectedPanelIDs : ['p1', 'p3'];
  const total = Math.max(1, Math.min(sessionControls.totalQuestions || 5, 10));
  const candidateRole = role || intentText || 'Candidate';
  const isTechRole = /engineer|developer|software|coding|backend|frontend|fullstack|devops|data scientist|programmer/i.test(candidateRole);

  const bank = [
    {
      phase: 'introduction',
      question: `Walk me through your background and key experience relevant to the ${candidateRole} position.`,
      expectedSignals: ['Role alignment', 'Clear communication', 'Relevant experience'],
    },
    {
      phase: 'scenario',
      question: `Describe a challenging problem or project in your recent work. What approach did you take to frame and solve it?`,
      expectedSignals: ['Problem framing', 'Analytical thinking', 'Ownership'],
    },
    {
      phase: isTechRole ? 'technical' : 'situational',
      question: isTechRole
        ? `What key technical trade-offs do you evaluate when designing architecture or choosing tools for scale?`
        : `How do you prioritize competing tasks and manage stakeholder expectations when deadlines are tight?`,
      expectedSignals: isTechRole ? ['Technical trade-offs', 'Architectural rigor'] : ['Prioritization', 'Stakeholder management'],
    },
    {
      phase: 'behavioral',
      question: `Tell me about a situation where you experienced disagreement within your team. How did you handle it to reach consensus?`,
      expectedSignals: ['Conflict resolution', 'Empathy', 'Professionalism'],
    },
    {
      phase: 'reflection',
      question: `Looking back at a major project, what key lesson did you learn and what would you do differently next time?`,
      expectedSignals: ['Self-reflection', 'Growth mindset', 'Continuous improvement'],
    },
  ];

  const questionSet = Array.from({ length: total }, (_, i) => {
    const template = bank[i % bank.length];
    const personaFocus = safePanelIDs[i % safePanelIDs.length];
    return {
      id: createDeterministicQuestionId(candidateRole, sessionControls.reasoningMode || 'classic_behavioral', template.question, i + 1),
      phase: template.phase,
      difficulty: sessionControls.difficulty,
      question: template.question,
      expectedSignals: template.expectedSignals,
      personaFocus,
    };
  });

  const normalizedControls: SessionControls = {
    ...sessionControls,
    totalQuestions: questionSet.length,
  };

  const dimensionWeights = DEFAULT_WEIGHTS_BY_MODE[sessionControls.reasoningMode || 'classic_behavioral'] || DEFAULT_WEIGHTS_BY_MODE['classic_behavioral'];

  return InterviewPlanSchema.parse({
    meta: {
      intent: intentText,
      controls: normalizedControls,
      planSource: 'deterministic_fallback',
    },
    jdInsights: {
      source: 'question_bank',
      role: candidateRole,
      level: 'Mid-Level',
      mustHaveSkills: ['Problem Solving', 'Communication'],
      niceToHave: ['Domain Knowledge'],
      domains: isTechRole ? ['Software Engineering'] : [candidateRole],
      tools: isTechRole ? ['Git'] : ['Standard Tools'],
      softSkills: ['Teamwork', 'Communication'],
      competencyWeights: dimensionWeights,
    },
    questionSet,
  });
};

export const generateInterviewPlan = async (
  role: string,
  intentText: string,
  sessionControls: SessionControls,
  jdText?: string,
  resumeText?: string,
  selectedPanelIDs: string[] = ['p1', 'p3']
): Promise<InterviewPlan> => {
  if (!intentText || intentText.trim().length < 2) throw new Error('Goal too short');

  const validPersonaIDs = PERSONAS_CONFIG.map(p => p.id);
  const safePanelIDs = (selectedPanelIDs || []).filter(id => validPersonaIDs.includes(id));
  if (safePanelIDs.length === 0) {
    safePanelIDs.push('p1', 'p3');
  }

  const selectedPersonas = safePanelIDs.map(id => PERSONAS_CONFIG.find(p => p.id === id)).filter(Boolean);
  const panelSummary = selectedPersonas.map(p => `- ID: ${p!.id}, Name: ${p!.name}, Title: ${p!.title}, Focus: ${p!.focus}, Domain: ${p!.domain.join('/')}, Keywords: ${p!.keywords.join(', ')}`).join('\n');

  const sessionMode = sessionControls.reasoningMode || 'classic_behavioral';
  const activeDimensions = ACTIVE_DIMENSIONS_BY_MODE[sessionMode] || ACTIVE_DIMENSIONS_BY_MODE['classic_behavioral'];
  const dimensionWeights = DEFAULT_WEIGHTS_BY_MODE[sessionMode] || DEFAULT_WEIGHTS_BY_MODE['classic_behavioral'];

  const masterPrompt = `You are an expert interview strategist. Create a comprehensive interview plan.
  
  CONTEXT:
  Role: "${role}"
  Intent: "${intentText}"
  Difficulty: ${sessionControls.difficulty}
  Session Mode: ${sessionMode}
  Total Questions Requested: ${sessionControls.totalQuestions}
  
  SELECTED INTERVIEW PANEL PERSONAS (personaFocus MUST be one of these IDs):
  ${panelSummary}
  
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
        "personaFocus": "${safePanelIDs[0]}"
      }
    ]
  }`;

  try {
    const { text } = await exports.callWithFallback(masterPrompt);
    const rawData = extractJson(text || '{}');
    const rawParsed = RawInterviewPlanSchema.parse(rawData);

    if (!rawParsed.questionSet || rawParsed.questionSet.length === 0) {
      return buildDeterministicInterviewPlan(role, intentText, sessionControls, safePanelIDs);
    }

    const normalizedQuestions = rawParsed.questionSet.map((q, idx) => {
      let focus = (q.personaFocus || '').trim();
      if (!safePanelIDs.includes(focus)) {
        focus = safePanelIDs[idx % safePanelIDs.length];
      }
      return {
        id: createDeterministicQuestionId(role, sessionMode, q.question, idx + 1),
        phase: q.phase || 'scenario',
        difficulty: q.difficulty || sessionControls.difficulty,
        question: q.question,
        expectedSignals: q.expectedSignals && q.expectedSignals.length > 0 ? q.expectedSignals : ['Clear reasoning', 'Structured response'],
        personaFocus: focus,
        type: q.type,
        failureModes: q.failureModes,
        evaluationCriteria: q.evaluationCriteria,
        rubric: q.rubric,
        sourceBullets: q.sourceBullets,
        language: q.language,
        timeAllocation: q.timeAllocation
      };
    });

    const normalizedControls: SessionControls = {
      ...sessionControls,
      totalQuestions: normalizedQuestions.length,
    };

    const normalizedPlan = {
      meta: {
        intent: intentText,
        controls: normalizedControls,
        planSource: 'provider' as const,
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

    return InterviewPlanSchema.parse(normalizedPlan);
  } catch (err) {
    return buildDeterministicInterviewPlan(role, intentText, sessionControls, safePanelIDs);
  }
};

// --- Assistive Tools ---

export const getHintForQuestion = async (questionText: string, expectedSignals?: string[]): Promise<string> => {
  if (!questionText) return 'Hint unavailable.';
  try {
    const prompt = `Give a concise 1-2 sentence hint for answering this interview question effectively: "${questionText}". Expected signals: ${expectedSignals?.join(', ') || 'None'}. Return JSON: { "hint": "..." }`;
    const { text } = await exports.callWithFallback(prompt);
    const parsed = extractJson(text || '{}');
    return String(parsed.hint || 'Hint unavailable.');
  } catch (err) {
    return 'Hint unavailable.';
  }
};

export const generateIdealAnswer = async (questionText: string, expectedSignals?: string[], userAnswer?: string): Promise<string> => {
  if (!questionText) return 'Sample response unavailable.';
  try {
    const prompt = `Generate a top-tier STAR format ideal response for this interview question: "${questionText}". Expected signals: ${expectedSignals?.join(', ') || 'None'}. Return JSON: { "idealResponse": "..." }`;
    const { text } = await exports.callWithFallback(prompt);
    const parsed = extractJson(text || '{}');
    return String(parsed.idealResponse || 'Sample response unavailable.');
  } catch (err) {
    return 'Sample response unavailable.';
  }
};

export const transcribeAudio = async (audioBase64: string, mimeType?: string): Promise<string> => {
  if (!audioBase64) return '';
  return 'Audio transcription is currently operating in fallback mode.';
};

// --- Report Generation ---

export const generateFinalReport = async (
  history: InterviewTurn[],
  context: InterviewSessionContext
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
    "topStrength": "Clear problem structuring",
    "topWeakness": "Quantified result metrics",
    "estimatedSessionsToReady": 2,
    "quickWins": ["State assumptions early"],
    "prioritizedActions": [{ "action": "Practice metric articulation", "impact": "high" }]
  }`;

  const { text } = await exports.callWithFallback(masterPrompt);
  const reportData = extractJson(text || '{}');
  if (!reportData || !reportData.overallSummary) throw new Error("Incomplete or invalid report returned by provider");

  const rawReport = RawFinalReportSchema.parse(reportData);

  const validStatuses = ['INTERVIEW_READY', 'ALMOST_READY', 'NOT_READY', 'NOT_ASSESSED'];
  const providerStatus = rawReport.readiness?.status;
  const readinessStatus = validStatuses.includes(providerStatus || '') ? providerStatus : 'NOT_ASSESSED';

  const rawDimensionScores = rawReport.quantitativeAnalysis?.dimension_scores || [];
  let scoredTotal = 0;
  let scoredCount = 0;

  const dimensionScores = rawDimensionScores.map((ds: any) => {
    const hasCanonicalKey = Boolean(ds.dimension && APPROVED_DIMENSIONS[ds.dimension as keyof typeof APPROVED_DIMENSIONS]);
    const isScoreStatusScored = ds.score_status === 'scored';
    const isAnchorScoreValid = typeof ds.anchor_score === 'number' && ds.anchor_score >= 0 && ds.anchor_score <= 5;
    const isNormalizedScoreValid = typeof ds.normalized_score === 'number' && ds.normalized_score >= 0 && ds.normalized_score <= 100;
    const hasReason = typeof ds.reason === 'string' && ds.reason.trim().length > 0;
    const hasEvidence = Array.isArray(ds.evidence) && ds.evidence.length > 0 && ds.evidence.every((e: any) => typeof e === 'string' && e.trim().length > 0);
    const hasConfidence = typeof ds.confidence === 'string' && ['high', 'medium', 'low'].includes(ds.confidence);

    const isValidScored = hasCanonicalKey && isScoreStatusScored && isAnchorScoreValid && isNormalizedScoreValid && hasReason && hasEvidence && hasConfidence;

    if (isValidScored) {
      scoredTotal += ds.normalized_score;
      scoredCount++;
      return {
        dimension: ds.dimension as any,
        dimensionName: ds.dimensionName || APPROVED_DIMENSIONS[ds.dimension as keyof typeof APPROVED_DIMENSIONS]?.name || 'Dimension',
        score_status: 'scored' as const,
        anchor_score: ds.anchor_score,
        normalized_score: ds.normalized_score,
        reason: String(ds.reason).trim(),
        evidence: ds.evidence.map((e: any) => String(e).trim()),
        confidence: ds.confidence as any
      };
    } else {
      const dimKey = hasCanonicalKey ? ds.dimension : 'PROBLEM_FRAMING';
      return {
        dimension: dimKey as any,
        dimensionName: APPROVED_DIMENSIONS[dimKey as keyof typeof APPROVED_DIMENSIONS]?.name || 'Problem Framing',
        score_status: (ds.score_status === 'not_tested' ? 'not_tested' : 'insufficient_evidence') as any,
        anchor_score: null,
        normalized_score: null,
        reason: ds.reason ? String(ds.reason).trim() : 'Insufficient evidence to evaluate dimension.',
        evidence: [],
        confidence: 'low' as const
      };
    }
  });

  const isUnscored = scoredCount === 0;
  const finalSimplifiedScore = isUnscored ? null : Math.round(scoredTotal / scoredCount);
  const finalReadinessStatus = isUnscored ? 'NOT_ASSESSED' : readinessStatus;
  const finalReadinessReasoning = isUnscored 
    ? 'Session evaluation could not be completed due to insufficient evidence or unscored dimensions.'
    : (rawReport.readiness?.reasoning || 'Session evaluation complete.');
  const finalOverallSummary = isUnscored
    ? 'Session ended before a reliable evaluation could be completed.'
    : rawReport.overallSummary;

  const normalizedReport = {
    overallSummary: finalOverallSummary,
    evaluationModel: 'mockmate_v1_canonical' as const,
    readiness: {
      status: finalReadinessStatus as any,
      reasoning: finalReadinessReasoning
    },
    quantitativeAnalysis: {
      dimension_scores: dimensionScores
    },
    advisoryPanel: isUnscored ? [] : (rawReport.advisoryPanel || [])
      .filter((ap: any) => ap && typeof ap.name === 'string' && ap.name.trim().length > 0 && typeof ap.assessment === 'string' && ap.assessment.trim().length > 0)
      .map((ap: any) => ({
        name: String(ap.name).trim(),
        assessment: String(ap.assessment).trim(),
        hireRecommendation: typeof ap.hireRecommendation === 'boolean' ? ap.hireRecommendation : null
      })),
    questionPerformance: (rawReport.questionPerformance || []).map((qp: any, idx: number) => ({
      question_text: qp.question_text || history[idx]?.question || 'Question',
      question_phase: qp.question_phase || 'scenario',
      user_transcript: qp.user_transcript || history[idx]?.candidateResponse || '',
      max_impact_response: qp.max_impact_response,
      feedback: qp.feedback ? String(qp.feedback).trim() : 'Evaluation unavailable.',
      strengths: Array.isArray(qp.strengths) ? qp.strengths.filter((s: any) => typeof s === 'string' && s.trim().length > 0) : [],
      improvements: Array.isArray(qp.improvements) ? qp.improvements.filter((i: any) => typeof i === 'string' && i.trim().length > 0) : []
    })),
    biggestRiskArea: (isUnscored || !rawReport.biggestRiskArea || !rawReport.biggestRiskArea.title || !rawReport.biggestRiskArea.observation || !rawReport.biggestRiskArea.mitigation) ? null : {
      title: String(rawReport.biggestRiskArea.title).trim(),
      observation: String(rawReport.biggestRiskArea.observation).trim(),
      mitigation: String(rawReport.biggestRiskArea.mitigation).trim()
    },
    coachPack: (isUnscored || !rawReport.coachPack || !rawReport.coachPack.title || !rawReport.coachPack.redoNow) ? null : {
      title: String(rawReport.coachPack.title).trim(),
      redoNow: typeof rawReport.coachPack.redoNow === 'object' && rawReport.coachPack.redoNow?.question && rawReport.coachPack.redoNow?.instruction ? {
        question: String(rawReport.coachPack.redoNow.question).trim(),
        instruction: String(rawReport.coachPack.redoNow.instruction).trim()
      } : {
        question: history[0]?.question || 'Question',
        instruction: String(rawReport.coachPack.redoNow).trim()
      },
      micro_drills: (rawReport.coachPack.micro_drills || [])
        .filter((md: any) => md && typeof md === 'object' && md.weakness && md.drill_prompt)
        .map((md: any) => ({
          weakness: String(md.weakness).trim(),
          drill_prompt: String(md.drill_prompt).trim(),
          focus_point: String(md.focus_point || 'Clarity').trim()
        }))
    },
    trajectoryReplay: isUnscored ? [] : (rawReport.trajectoryReplay || [])
      .filter((tr: any) => tr && typeof tr.summary === 'string' && tr.summary.trim().length > 0)
      .map((tr: any) => ({
        summary: String(tr.summary).trim(),
        keyMoments: Array.isArray(tr.keyMoments) ? tr.keyMoments.filter((km: any) => typeof km === 'string' && km.trim().length > 0) : []
      })),
    auditLayer: isUnscored ? [] : (rawReport.auditLayer || [])
      .filter((al: any) => al && typeof al.notes === 'string' && al.notes.trim().length > 0 && typeof al.biasDetected === 'boolean')
      .map((al: any) => ({
        biasDetected: Boolean(al.biasDetected),
        notes: String(al.notes).trim()
      })),
    simplifiedScore: finalSimplifiedScore,
    topStrength: isUnscored ? undefined : (rawReport.topStrength ? String(rawReport.topStrength).trim() : undefined),
    topWeakness: isUnscored ? undefined : (rawReport.topWeakness ? String(rawReport.topWeakness).trim() : undefined),
    estimatedSessionsToReady: isUnscored ? null : (typeof rawReport.estimatedSessionsToReady === 'number' ? rawReport.estimatedSessionsToReady : null),
    quickWins: isUnscored ? [] : (Array.isArray(rawReport.quickWins) ? rawReport.quickWins.filter((qw: any) => typeof qw === 'string' && qw.trim().length > 0) : []),
    prioritizedActions: isUnscored ? [] : (rawReport.prioritizedActions || [])
      .filter((pa: any) => pa && typeof pa.action === 'string' && pa.action.trim().length > 0 && typeof pa.impact === 'string')
      .map((pa: any) => ({
        action: String(pa.action).trim(),
        impact: pa.impact as any
      }))
  };

  return FinalReportSchema.parse(normalizedReport);
};

export const generateAuthoritativeReport = async (userId: string, sessionId: string): Promise<FinalReport> => {
  await sessionService.markSessionEvaluationProcessing(userId, sessionId);
  const session = await sessionService.getSession(userId, sessionId);
  if (!session) throw new Error('Session not found');

  const history = session.history || [];
  if (history.length === 0) {
    await sessionService.markSessionEvaluationFailed(userId, sessionId, 'NO_HISTORY');
    throw new Error('No interview history to analyze.');
  }

  try {
    const report = await generateFinalReport(history, session.context);
    await sessionService.completeSession(userId, sessionId, report);
    return report;
  } catch (err: any) {
    await sessionService.markSessionEvaluationFailed(userId, sessionId, err.code || err.message || 'REPORT_FAILED');
    throw err;
  }
};

export const simulateExecution = async (code: string, language: string): Promise<CodeSimulationResponse> => {
  if (!code || !code.trim()) {
    return CodeSimulationResponseSchema.parse({
      status: 'unavailable',
      stdout: '',
      stderr: 'No code provided for execution.'
    });
  }

  try {
    const prompt = `Simulate execution of this ${language} code strictly and return JSON output:
    
    CODE:
    \`\`\`${language}
    ${code}
    \`\`\`
    
    OUTPUT SCHEMA (JSON):
    {
      "status": "success",
      "stdout": "output text",
      "stderr": ""
    }`;

    const { text } = await exports.callWithFallback(prompt);
    const parsed = extractJson(text || '{}');
    return CodeSimulationResponseSchema.parse({
      status: parsed.status === 'success' ? 'success' : 'unavailable',
      stdout: String(parsed.stdout || ''),
      stderr: String(parsed.stderr || '')
    });
  } catch (err) {
    return CodeSimulationResponseSchema.parse({
      status: 'unavailable',
      stdout: '',
      stderr: 'Code simulation unavailable.'
    });
  }
};

export const analyzeCode = async (blueprint: any, code: string): Promise<CodeAnalysisResponse> => {
  if (!code || !code.trim()) {
    return CodeAnalysisResponseSchema.parse({
      status: 'unavailable',
      feedback: 'No code provided for analysis.',
      passed: null
    });
  }

  try {
    const prompt = `Analyze this code against blueprint requirements.
    QUESTION: "${blueprint?.question || 'Technical Problem'}"
    CODE:
    \`\`\`
    ${code}
    \`\`\`
    
    OUTPUT SCHEMA (JSON):
    {
      "status": "analyzed",
      "feedback": "Detailed code analysis feedback",
      "passed": true
    }`;

    const { text } = await exports.callWithFallback(prompt);
    const parsed = extractJson(text || '{}');
    return CodeAnalysisResponseSchema.parse({
      status: parsed.status === 'analyzed' ? 'analyzed' : 'unavailable',
      feedback: String(parsed.feedback || 'Code analysis completed.'),
      passed: typeof parsed.passed === 'boolean' ? parsed.passed : null
    });
  } catch (err) {
    return CodeAnalysisResponseSchema.parse({
      status: 'unavailable',
      feedback: 'Code analysis unavailable.',
      passed: null
    });
  }
};
