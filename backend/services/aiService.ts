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
  CodeAnalysisResponse,
  TranscribeAudioResponseSchema,
  TranscribeAudioResponse
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
    tools: isTechRole ? ['Git'] : [],
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
      domains: isTechRole ? ['Software Engineering'] : (candidateRole ? [candidateRole] : []),
      tools: isTechRole ? ['Git'] : [],
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

import fs from 'fs';
import path from 'path';
import os from 'os';

export const transcribeAudio = async (
  audioBase64: string,
  mimeType: string = 'audio/webm'
): Promise<TranscribeAudioResponse> => {
  if (!audioBase64 || !audioBase64.trim()) {
    return TranscribeAudioResponseSchema.parse({
      status: 'unavailable',
      transcript: null,
    });
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: audioBase64,
                  mimeType: mimeType || 'audio/webm',
                },
              },
              {
                text: 'Transcribe the spoken speech in this audio clip accurately. Return JSON strictly: { "transcript": "exact spoken text" }',
              },
            ],
          },
        ],
        config: { responseMimeType: 'application/json' },
      });
      if (response.text) {
        const parsed = extractJson(response.text);
        const text = (parsed?.transcript || '').trim();
        if (text) {
          return TranscribeAudioResponseSchema.parse({
            status: 'transcribed',
            transcript: text,
          });
        }
      }
    } catch (err: any) {
      console.warn('[AI Service] Gemini audio transcription failed, trying Groq fallback...', err.message);
    }
  }

  if (groqKey) {
    let tmpFilePath: string | null = null;
    try {
      const ext = mimeType.includes('wav') ? '.wav' : mimeType.includes('mp3') ? '.mp3' : mimeType.includes('m4a') ? '.m4a' : '.webm';
      tmpFilePath = path.join(os.tmpdir(), `mockmate_audio_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
      const buffer = Buffer.from(audioBase64, 'base64');
      fs.writeFileSync(tmpFilePath, buffer);

      const formData = new FormData();
      const fileBlob = new Blob([buffer], { type: mimeType });
      formData.append('file', fileBlob, path.basename(tmpFilePath));
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'json');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const text = (data.text || '').trim();
        if (text) {
          return TranscribeAudioResponseSchema.parse({
            status: 'transcribed',
            transcript: text,
          });
        }
      }
    } catch (err: any) {
      console.warn('[AI Service] Groq Whisper audio transcription failed...', err.message);
    } finally {
      if (tmpFilePath && fs.existsSync(tmpFilePath)) {
        try {
          fs.unlinkSync(tmpFilePath);
        } catch (_) {}
      }
    }
  }

  return TranscribeAudioResponseSchema.parse({
    status: 'unavailable',
    transcript: null,
  });
};

// --- Report Generation ---

import { aggregateTurnEvidence } from './evidenceAggregationService';

export const generateFinalReport = async (
  history: InterviewTurn[],
  context: InterviewSessionContext
): Promise<FinalReport> => {
  if (!history || history.length === 0) throw new Error('No interview history to analyze.');

  const roleParam = context.candidateRole || "Candidate";
  const sessionMode = context.controls?.reasoningMode || 'classic_behavioral';

  // 1. Aggregate dimension scores deterministically from turn evidence
  const turnsForAgg = history.map((t: any) => ({
    turnId: t.id,
    evaluation: t.turnEvaluation,
    stage: t.stage,
  }));

  const scorecard = aggregateTurnEvidence(turnsForAgg, sessionMode);

  // 2. Format transcript for qualitative summary prompt
  const transcriptText = history.map((turn, i) => `
  TURN ${i + 1} (${turn.questionKind || 'root'} - Stage: ${turn.stage || 'framing'}):
  Interviewer (${turn.interviewer}): "${turn.question}"
  Candidate: "${turn.candidateResponse || '[No response provided]'}"
  Evaluation Status: ${turn.evaluationStatus || 'not_tested'}
  `).join('\n');

  const scorecardSummary = scorecard.dimensionScores.map(d => `- ${d.dimensionName} (${d.dimension}): ${d.score_status} (Score: ${d.normalized_score ?? 'N/A'}, Anchor: ${d.anchor_score ?? 'N/A'})`).join('\n');

  const masterPrompt = `You are a world-class Interview Coach for MockMate.
Synthesize qualitative feedback and growth recommendations for this interview session.

CONTEXT:
Role: "${roleParam}"
Reasoning Mode: "${sessionMode}"

DETERMINISTIC SCORECARD SUMMARY (IMMUTABLE DATA - DO NOT ALTER SCORES):
${scorecardSummary}

TURN TRANSCRIPT:
${transcriptText}

REQUIRED OUTPUT SCHEMA (JSON):
{
  "overallSummary": "Structured executive summary focused on practice readiness and reasoning strengths/gaps.",
  "topStrength": "One main reasoning strength demonstrated in the session",
  "topWeakness": "One main reasoning area for improvement",
  "quickWins": ["Immediate actionable advice 1", "Immediate actionable advice 2"],
  "prioritizedActions": [
    { "action": "Specific practice exercise", "impact": "high|medium|low" }
  ],
  "biggestRiskArea": { "title": "Key Risk", "observation": "Observed gap in transcript", "mitigation": "How to fix it" },
  "coachPack": {
    "title": "Targeted Drill Pack",
    "redoNow": { "question": "Question text to re-try", "instruction": "Step-by-step guidance to articulate a stronger answer" },
    "micro_drills": [{ "weakness": "Gap", "drill_prompt": "Practice prompt", "focus_point": "Key signal" }]
  },
  "trajectoryReplay": [
    { "summary": "Turn progression summary", "keyMoments": ["Key moment"] }
  ]
}`;

  let qualitativeNarrative: any = {};
  try {
    const { text, provider, model } = await callWithFallback(masterPrompt);
    qualitativeNarrative = extractJson(text || '{}');
  } catch (err: any) {
    console.warn('[AI Service] Narrative provider call failed, using fallback qualitative summary...', err.message);
  }

  const overallSummary = typeof qualitativeNarrative.overallSummary === 'string' && qualitativeNarrative.overallSummary.trim().length > 0
    ? qualitativeNarrative.overallSummary.trim()
    : (scorecard.simplifiedScore !== null
        ? `Session complete. Calculated practice score: ${scorecard.simplifiedScore}/100 based on verified candidate turn evidence.`
        : 'Session completed with insufficient evidence to generate a full readiness score.');

  const topStrength = typeof qualitativeNarrative.topStrength === 'string' && qualitativeNarrative.topStrength.trim().length > 0
    ? qualitativeNarrative.topStrength.trim()
    : (scorecard.dimensionScores.find(d => d.score_status === 'scored')?.dimensionName ? `Demonstrated signals in ${scorecard.dimensionScores.find(d => d.score_status === 'scored')?.dimensionName}` : undefined);

  const topWeakness = typeof qualitativeNarrative.topWeakness === 'string' && qualitativeNarrative.topWeakness.trim().length > 0
    ? qualitativeNarrative.topWeakness.trim()
    : 'State underlying assumptions and evaluation criteria more explicitly.';

  const quickWins = Array.isArray(qualitativeNarrative.quickWins) && qualitativeNarrative.quickWins.length > 0
    ? qualitativeNarrative.quickWins.filter((qw: any) => typeof qw === 'string' && qw.trim().length > 0)
    : ['State assumptions explicitly before solving', 'Compare alternative approaches using trade-offs'];

  const prioritizedActions = Array.isArray(qualitativeNarrative.prioritizedActions) && qualitativeNarrative.prioritizedActions.length > 0
    ? qualitativeNarrative.prioritizedActions.filter((pa: any) => pa && typeof pa.action === 'string' && pa.action.trim().length > 0)
    : [{ action: 'Practice trade-off articulation in technical scenarios', impact: 'high' as const }];

  const questionPerformance = history.map((turn, idx) => ({
    question_text: turn.question || `Scenario ${idx + 1}`,
    question_phase: turn.stage || 'framing',
    user_transcript: turn.candidateResponse || '',
    feedback: turn.turnEvaluation?.answerSummary || (turn.candidateResponse ? 'Turn evaluated from verified evidence.' : 'No response provided.'),
    strengths: turn.turnEvaluation?.observations?.filter(o => typeof o.anchorScore === 'number' && o.anchorScore >= 3).map(o => o.signal) || [],
    improvements: turn.turnEvaluation?.missingSignals || [],
  }));

  // Build advisory panel assessments without hire/no-hire recommendations (hireRecommendation: null)
  const advisoryPanel = [
    {
      name: 'Reasoning Evaluator',
      assessment: scorecard.readinessReasoning,
      hireRecommendation: null,
    }
  ];

  const biggestRiskArea = (scorecard.readinessStatus === 'NOT_ASSESSED') ? null : (qualitativeNarrative.biggestRiskArea && typeof qualitativeNarrative.biggestRiskArea === 'object' && qualitativeNarrative.biggestRiskArea.title ? {
    title: String(qualitativeNarrative.biggestRiskArea.title).trim(),
    observation: String(qualitativeNarrative.biggestRiskArea.observation || '').trim(),
    mitigation: String(qualitativeNarrative.biggestRiskArea.mitigation || '').trim(),
  } : null);

  const coachPack = (scorecard.readinessStatus === 'NOT_ASSESSED') ? null : (qualitativeNarrative.coachPack && typeof qualitativeNarrative.coachPack === 'object' && qualitativeNarrative.coachPack.title ? {
    title: String(qualitativeNarrative.coachPack.title).trim(),
    redoNow: typeof qualitativeNarrative.coachPack.redoNow === 'object' && qualitativeNarrative.coachPack.redoNow?.question ? {
      question: String(qualitativeNarrative.coachPack.redoNow.question).trim(),
      instruction: String(qualitativeNarrative.coachPack.redoNow.instruction || 'Articulate trade-offs clearly.').trim(),
    } : {
      question: history[0]?.question || 'Scenario 1',
      instruction: typeof qualitativeNarrative.coachPack.redoNow === 'string' ? qualitativeNarrative.coachPack.redoNow : 'Re-do scenario focusing on explicit problem framing.',
    },
    micro_drills: (qualitativeNarrative.coachPack.micro_drills || []).map((md: any) => ({
      weakness: String(md.weakness || 'Constraint handling').trim(),
      drill_prompt: String(md.drill_prompt || 'Practice scaling limits').trim(),
      focus_point: String(md.focus_point || 'Resilience').trim(),
    })),
  } : null);

  const normalizedReport = {
    overallSummary,
    evaluationModel: 'mockmate_v1_canonical' as const,
    readiness: {
      status: scorecard.readinessStatus,
      reasoning: scorecard.readinessReasoning,
    },
    quantitativeAnalysis: {
      dimension_scores: scorecard.dimensionScores,
    },
    advisoryPanel,
    questionPerformance,
    biggestRiskArea,
    coachPack,
    trajectoryReplay: [],
    auditLayer: [
      { biasDetected: false, notes: 'Evaluated using verified evidence aggregation rules.' }
    ],
    simplifiedScore: scorecard.simplifiedScore,
    topStrength,
    topWeakness,
    estimatedSessionsToReady: scorecard.simplifiedScore !== null ? Math.max(1, Math.ceil((100 - scorecard.simplifiedScore) / 10)) : null,
    quickWins,
    prioritizedActions,
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
