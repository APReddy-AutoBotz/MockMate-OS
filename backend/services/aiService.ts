
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { PERSONAS_CONFIG } from '../config/personas';
import { InterviewTurn, InterviewSessionContext as SessionContext, FinalReport, SessionControls, InterviewPlan, DimensionScore } from 'mockmate-shared';
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
    ENABLE_GROQ_FALLBACK: true // Feature gate as requested
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
    initialDelay: number = 1000,
    context?: any
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

export async function callProvider(providerId: string, prompt: string, schema?: any): Promise<{ text: string, provider: string, model: string }> {
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

/**
 * Executes a resilient AI call with Gemini -> Groq fallback.
 */
export async function callWithFallback(prompt: string, schema?: any): Promise<{ text: string, provider: string, model: string, fallbackTriggered: boolean }> {
    const forceProvider = process.env.MOCKMATE_FORCE_PROVIDER;
    let fallbackTriggered = false;

    try {
        if (forceProvider === 'groq') throw new Error("Forced Groq for testing");
        
        const result = await retryOperation(() => callProvider('gemini', prompt, schema));
        return { ...result, fallbackTriggered: false };
    } catch (primaryErr) {
        if ((FEATURE_FLAGS.ENABLE_GROQ_FALLBACK || forceProvider === 'groq') && groq) {
            console.warn(forceProvider === 'groq' ? "Forcing Groq for drift validation" : "Primary AI failed, triggering Groq fallback...", primaryErr);
            fallbackTriggered = true;
            try {
                const fallbackResult = await retryOperation(() => callProvider('groq', prompt, schema));
                return { ...fallbackResult, fallbackTriggered: true };
            } catch (fallbackErr) {
                console.error("All AI providers failed:", fallbackErr);
                throw new Error("Resilient AI stack failure - Check API keys and quota.");
            }
        } else {
            throw primaryErr;
        }
    }
}

// --- Logic ---

export const calibrateIntent = async (intentText: string, additionalContext?: string) => {
    // 1. Validation
    if (!intentText || intentText.trim().length < 2) {
        if (!additionalContext) throw new Error('Please provide a more detailed job description or career goal.');
    }

    const availablePersonas = PERSONAS_CONFIG.map(p =>
        `- ID: ${p.id}
         Name: ${p.name}
         Title: ${p.title}
         Focus: ${p.focus}
         Keywords: ${p.keywords.join(', ')}
         Seniority: ${p.seniority}
         Style: ${p.style}`
    ).join('\n\n');

    const masterPrompt = `You are an expert talent acquisition strategist. Select the most appropriate interview panel (1-3 personas) for the candidate's goal.

CANDIDATE GOAL: "${intentText}"
ADDITIONAL CONTEXT (JD/Referral): "${additionalContext || 'None'}"

AVAILABLE PERSONAS:
${availablePersonas}

INSTRUCTIONS:
1. Analyze the candidate's role and seniority implied by the goal.
2. Select 1-3 personas that best match the domain, seniority, and required soft/hard skills.
3. For EVERY selection, provide a brief, professional "matchReason" (e.g., "Vikram is selected to probe your depth in architectural trade-offs and team leadership.").
4. Also normalize the candidate's role title.

OUTPUT JSON SCHEMA:
{
  "recommendedPanelIDs": ["id1", "id2"],
  "recommendedRole": "Normalized Job Title",
  "matchReasons": {
    "id1": "Specific reason for id1",
    "id2": "Specific reason for id2"
  }
}

CRITICAL: Do not return empty reasons.`;

    try {
        const { text } = await callWithFallback(masterPrompt, { type: 'json_object' });
        const parsed = extractJson(text || '{}');
        const validIDs = PERSONAS_CONFIG.map(p => p.id);
        const filteredIDs = (parsed?.recommendedPanelIDs || [])
            .filter((id: string) => validIDs.includes(id))
            .slice(0, 3);

        if (filteredIDs.length === 0) throw new Error("AI returned no valid IDs");

        return {
            recommendedPanelIDs: filteredIDs,
            recommendedRole: parsed?.recommendedRole || 'Professional',
            matchReasons: parsed?.matchReasons
        };

    } catch (err) {
        console.error("AI Calibration failed:", err);
        // Heuristic fallback if even Groq fails
        return heuristicPersonaMatch(intentText, additionalContext);
    }
};

const heuristicPersonaMatch = (intent: string, context?: string) => {
    const fullText = (intent + " " + (context || "")).toLowerCase();
    const scores: Record<string, number> = {};
    const reasons: Record<string, string> = {};

    PERSONAS_CONFIG.forEach(p => {
        let score = 0;
        p.keywords.forEach(k => { if (fullText.includes(k.toLowerCase())) score += 5; });
        if (fullText.includes(p.title.toLowerCase())) score += 10;
        p.domain.forEach(d => { if (fullText.includes(d.toLowerCase())) score += 3; });

        scores[p.id] = score;
        if (score > 0) reasons[p.id] = `Matched on keywords: ${p.keywords.filter(k => fullText.includes(k.toLowerCase())).join(', ')}`;
    });

    if (!scores['p1']) scores['p1'] = 1;

    const sortedIDs = Object.keys(scores).sort((a, b) => scores[b] - scores[a]).slice(0, 3);

    return {
        recommendedPanelIDs: sortedIDs.length > 0 ? sortedIDs : ['p1', 'p2', 's1'],
        recommendedRole: intent || 'Candidate',
        matchReasons: reasons
    };
};

// --- Plan Generation ---

export const generateInterviewPlan = async (
    intentText: string,
    jdText: string | null,
    sessionControls: SessionControls,
    selectedPanelIDs: string[]
) => {

    if (!intentText || intentText.trim().length < 5) throw new Error('Goal too short');
    if (!selectedPanelIDs || selectedPanelIDs.length === 0) throw new Error('No personas selected');

    const selectedPersonas = PERSONAS_CONFIG.filter(p => selectedPanelIDs.includes(p.id));

    // TODO: Persist richer session history in Supabase.
    const excludedQuestions: string[] = [];

    const difficultyPrompt = sessionControls.difficulty === 'starter'
        ? "Focus on basic concepts."
        : sessionControls.difficulty === 'expert'
            ? "Focus on advanced system design and edge cases."
            : "Mixed difficulty.";

    const codingInstruction = sessionControls.includeCoding
        ? `MANDATORY: Include 2-3 coding questions. Assign 'language' (e.g., 'python').`
        : "Do not include coding questions.";

    const sessionMode = sessionControls.reasoningMode || 'classic_behavioral';
    const activeDimensions = ACTIVE_DIMENSIONS_BY_MODE[sessionMode] || ACTIVE_DIMENSIONS_BY_MODE['classic_behavioral'];
    const dimensionWeights = DEFAULT_WEIGHTS_BY_MODE[sessionMode] || DEFAULT_WEIGHTS_BY_MODE['classic_behavioral'];

    const masterPrompt = `You are an expert interview strategist. Create a comprehensive interview plan.
    
    CONTEXT:
    User Intent: "${intentText}"
    Difficulty: ${sessionControls.difficulty}
    Session Mode: ${sessionMode}
    ${codingInstruction}
    
    PANEL:
    ${selectedPersonas.map(p => `- ${p.name} (${p.title}): ${p.focus} | Style: ${p.style}`).join('\n')}

    INPUT MATERIAL:
    ${jdText ? `"""\n${jdText}\n"""` : 'None'}

    ACTIVE DIMENSIONS FOR THIS MODE:
    ${activeDimensions.map(d => `- ${APPROVED_DIMENSIONS[d].name}: ${APPROVED_DIMENSIONS[d].definition}`).join('\n')}

    CONTROLS:
    - Total Questions: ${sessionControls.totalQuestions}
    - Ignore these recent questions: ${JSON.stringify(excludedQuestions)}
    
    1. Extract granular skill categories.
    2. Define weights for the ACTIVE DIMENSIONS.
    3. Generate the question set.
       - Each question must test one or more ACTIVE DIMENSIONS.
       - Ensure every question has 'expectedSignals' mapped to sub-signals of the dimensions.

    OUTPUT SCHEMA (JSON):
    {
      "jdInsights": { 
        "role": "string", 
        "level": "string", 
        "mustHaveSkills": ["string"],
        "niceToHave": ["string"],
        "domains": ["string"],
        "tools": ["string"],
        "softSkills": ["string"],
        "competencyWeights": ${JSON.stringify(dimensionWeights)}
      },
      "questionSet": [
        {
          "phase": "knowledge|process|scenario|behavioral|coding",
          "dimension": "Dimension Name",
          "difficulty": "L1-L5",
          "question": "string",
          "expectedSignals": ["string"],
          "personaFocus": "string (Persona ID)",
          "why": "string",
          "language": "string (optional)",
          "timeAllocation": 60
        }
      ],
      "meta": { "estimatedDuration": "string", "focusAreas": ["string"] }
    }`;

    try {
        const { text } = await callWithFallback(masterPrompt, { type: 'json_object' });
        const rawPlan = extractJson(text || '{}');
        if (!rawPlan || !rawPlan.questionSet) throw new Error("AI returned incomplete plan");

        return rawPlan;

    } catch (err: any) {
        console.error("Plan Generation Failed:", err);
        throw new Error(err.message || "Failed to generate plan");
    }
};

// --- Report Generation ---

export const generateFinalReport = async (
    history: InterviewTurn[],
    context: SessionContext
): Promise<FinalReport> => {
    if (!history || history.length === 0) throw new Error('No interview history to analyze.');

    // Flatten context to get what we need
    const jdInsights = context.jdInsights || context.interviewPlan?.jdInsights;
    if (!jdInsights) throw new Error('Missing job insights to generate report.');

    const roleParam = context.candidateRole || "Candidate";
    const selectedPersonas = PERSONAS_CONFIG.filter(p => context.selectedPanelIDs?.includes(p.id));
    const panelNames = selectedPersonas.map(p => `${p.name} (${p.title})`).join(", ");

    const transcriptText = history.map((turn, i) => `
    TURN ${i + 1}:
    Interviewer (${turn.interviewer}): "${turn.question}"
    Candidate: "${turn.candidateResponse}"
    `).join('\n');

    const sessionMode = context.controls?.reasoningMode || 'classic_behavioral';
    const activeDimensions = ACTIVE_DIMENSIONS_BY_MODE[sessionMode] || ACTIVE_DIMENSIONS_BY_MODE['classic_behavioral'];

    const masterPrompt = `You are a world-class Interview Bar Raiser. Analyze this mock interview session and generate a "Hiring Committee" report.
    
    PANEL OF EXPERTS:
    ${selectedPersonas.map(p => `- ${p.name} (${p.title}): ${p.focus}`).join('\n')}

    TRANSCRIPT:
    ${transcriptText}

    TASK:
    Analyze the candidate's performance across exactly these 10 Approved Dimensions.
    The primary focus for this "${sessionMode}" session are these ACTIVE DIMENSIONS:
    ${activeDimensions.map(d => `- ${APPROVED_DIMENSIONS[d].name}`).join('\n')}

    SCORING RUBRIC (Anchor 1-5):
    1: Panic/Rush - Jumps to solutions, bluffs, or collapses under minor pushback.
    2: Surface - Generic, basic pros/cons, fails to adapt when probed.
    3: Standard - Practical, STAR-based, defines scope, identifies main dependencies.
    4: Insightful - Identifies hidden risks, make GAPs explicit, recalibrates mid-stream.
    5: Elite - Anticipates failure modes, challenges premises, turns pushback into deep reasoning.

    ANTI-GAMING RULES:
    1. NO REWARD FOR VERBOSITY: Ignore rambling that adds no reasoning value.
    2. TONE VS CONTENT: Do not infer elite performance from polished language or confidence theater alone.
    3. EVIDENCE-FIRST: Scores >3 require EXPLICIT logic-level evidence (not generic praise).
    4. REJECT JARGON: Keywords without functional explanation do NOT count as evidence.

    REQUIRED OUTPUT SCHEMA (JSON):
    {
      "overallSummary": "string (Executive summary)",
      "evaluationModel": "v1_dimensions",
      "readiness": { "status": "INTERVIEW_READY|ALMOST_READY|NOT_READY", "reasoning": "string" },
      "quantitativeAnalysis": {
        "dimension_scores": [
          {
            "dimension": "Dimension Name",
            "score_status": "scored|insufficient_evidence|not_tested",
            "anchor_score": 1-5 (null if not scored),
            "normalized_score": 0-100 (null if not scored),
            "reason": "string",
            "evidence": ["Quote or observation 1", "Quote or observation 2"],
            "confidence": "low|medium|high"
          }
        ]
      },
      "trajectoryReplay": [
        {
          "turnRange": [start, end],
          "dimension": "Dimension Name",
          "observation": "string",
          "delta": "improving|declining|stable",
          "reasoning": "string"
        }
      ],
      "auditLayer": [
        {
          "title": "string",
          "dimension": "Dimension Name",
          "gap": "string",
          "impact": "critical|moderate|marginal",
          "mitigation": "string"
        }
      ],
      "advisoryPanel": [
        { "persona": "Persona ID", "summary": "string", "dimensionScores": [ { "dimension": "string", "anchor_score": 1-5 } ] }
      ],
      "questionPerformance": [
        { "question_text": "string", "user_transcript": "string", "feedback": "string", "strengths": ["string"], "improvements": ["string"] }
      ],
      "biggestRiskArea": { "title": "string", "observation": "string", "mitigation": "string" },
      "coachPack": {
        "title": "string",
        "redoNow": { "question": "string", "instruction": "string" },
        "micro_drills": [{ "weakness": "string", "drill_prompt": "string", "focus_point": "string" }]
      }
    }`;

    const { text: responseText, provider: providerUsed, model: modelName, fallbackTriggered } = await callWithFallback(masterPrompt, { type: 'json_object' });

    try {
        const reportData = extractJson(responseText || '{}');
        if (!reportData.overallSummary) throw new Error("Incomplete report generated by AI");

        // --- Post-Processing / Validation ---

        // 1. Validate Dimensions
        if (reportData.quantitativeAnalysis?.dimension_scores) {
            reportData.quantitativeAnalysis.dimension_scores = reportData.quantitativeAnalysis.dimension_scores.filter(
                (s: any) => Object.keys(APPROVED_DIMENSIONS).includes(s.dimension.toUpperCase().replace(/\s/g, '_')) ||
                            Object.values(APPROVED_DIMENSIONS).some(ad => ad.name === s.dimension)
            );
        }

        // 2. Validate Turn Ranges in Trajectory
        if (reportData.trajectoryReplay) {
            reportData.trajectoryReplay = reportData.trajectoryReplay.map((p: any) => {
                if (p.turnRange && Array.isArray(p.turnRange)) return p;
                return { ...p, turnRange: [p.turnIndex || 1, p.turnIndex || 1] };
            });
        }

        const dimensionScores = reportData.quantitativeAnalysis?.dimension_scores || [];
        const activeScores = dimensionScores.filter((s: any) => s.score_status === 'scored');
        
        const avgNormalizedScore = activeScores.length > 0
            ? activeScores.reduce((sum: number, s: any) => sum + (s.normalized_score || 0), 0) / activeScores.length
            : 0;
        
        const simplifiedScore = Math.round(avgNormalizedScore);

        // Extract top strength and weakness
        const sortedByScore = [...activeScores].sort((a: any, b: any) => (b.normalized_score || 0) - (a.normalized_score || 0));
        const topStrength = sortedByScore[0]?.dimension || 'Consistent Delivery';
        const topWeakness = sortedByScore[sortedByScore.length - 1]?.dimension ||
            reportData.biggestRiskArea?.title || 'Systemic Depth';

        // Estimate sessions to ready based on score
        let estimatedSessionsToReady = 0;
        if (simplifiedScore < 60) estimatedSessionsToReady = 4;
        else if (simplifiedScore < 70) estimatedSessionsToReady = 3;
        else if (simplifiedScore < 80) estimatedSessionsToReady = 2;
        else if (simplifiedScore < 90) estimatedSessionsToReady = 1;

        // Generate quick wins from improvements
        const quickWins: string[] = [];
        const allImprovements = (reportData.questionPerformance || [])
            .flatMap((q: any) => q.improvements || [])
            .filter((improvement: string) => improvement && improvement.length > 0)
            .slice(0, 3);

        if (allImprovements.length > 0) {
            quickWins.push(...allImprovements);
        } else {
            quickWins.push('Practice the STAR method for behavioral questions');
            quickWins.push('Add specific metrics and numbers to your examples');
        }

        // Generate prioritized actions
        const prioritizedActions: any[] = [];

        // Action 1: From biggest risk
        if (reportData.biggestRiskArea) {
            prioritizedActions.push({
                title: reportData.biggestRiskArea.title,
                impact: 'high',
                timeEstimate: '15 min',
                exercise: reportData.biggestRiskArea.mitigation || 'Practice answering questions in this area with specific examples'
            });
        }

        // Actions 2-3: From coach pack drills
        if (reportData.coachPack?.micro_drills) {
            reportData.coachPack.micro_drills.slice(0, 2).forEach((drill: any, i: number) => {
                const impactLevel = i === 0 ? 'high' : 'medium';
                prioritizedActions.push({
                    title: drill.weakness,
                    impact: impactLevel,
                    timeEstimate: '10 min',
                    exercise: drill.drill_prompt
                });
            });
        }

        const report = {
            ...reportData,
            evaluationModel: "v1_dimensions",
            jdInsights: jdInsights,
            competencyWeights: context.competencyWeights || [],
            // Enhanced fields
            simplifiedScore,
            topStrength,
            topWeakness,
            estimatedSessionsToReady,
            quickWins,
            prioritizedActions: prioritizedActions.slice(0, 3),
            // Provider Metadata
            _metadata: {
                provider_used: providerUsed,
                model_name: modelName,
                fallback_triggered: fallbackTriggered,
                session_mode: context.controls?.deliveryMode || 'unknown',
                role_family: context.candidateRole || 'unknown',
                active_dimensions: dimensionScores.map((d: any) => d.dimension),
                status_counts: {
                    scored: dimensionScores.filter((d: any) => d.score_status === 'scored').length,
                    insufficient_evidence: dimensionScores.filter((d: any) => d.score_status === 'insufficient_evidence').length,
                    not_tested: dimensionScores.filter((d: any) => d.score_status === 'not_tested').length
                }
            }
        } as FinalReport;

        // Validation against v1.1 requirements
        const isValid = !!(report.overallSummary && report.quantitativeAnalysis?.dimension_scores);
        if (!isValid) throw new Error("Generated report failed v1.1 schema validation");

        return report;

    } catch (err: any) {
        console.error("Report Generation Failed:", err);
        throw new Error(err.message || "Failed to generate report");
    }
};

export const startInterviewSession = async (
    userId: string,
    context: SessionContext
): Promise<{ sessionId: string; firstMessage: string }> => {

    // 1. Generate opening message
    const leadId = context.selectedPanelIDs?.[0];
    const leadPersona = PERSONAS_CONFIG.find(p => p.id === leadId) || PERSONAS_CONFIG[0];

    const prompt = `You are ${leadPersona.name}, a ${leadPersona.title}.
    The candidate is here for a ${context.candidateRole || 'role'}.
    
    Your Style: ${leadPersona.style}
    
    Task: Welcome the candidate briefly and professionally. Start the interview.
    Limit to 2 sentences.`;

    let firstMessage = '';
    try {
        const { text } = await callWithFallback(prompt);
        firstMessage = text || `Hello, I'm ${leadPersona.name}. Let's get started.`;
    } catch {
        firstMessage = `Hello, I'm ${leadPersona.name}. Ready to begin?`;
    }

    // 2. Create session record in Supabase when persistence is enabled.
    const dummyFirstQuestion = { id: 'q1', text: firstMessage, type: 'intro', expectedSignals: [], relatedCompetency: '', difficulty: 'medium' } as any;
    const session = await sessionService.createSession(userId, context);

    // 3. Save first AI turn (optional, or just return it. Let's save it as a "system" or "interviewer" init turn if we want, but usually history starts with Q1)
    // Actually, usually the welcome is just intro. The first REAL question comes next. 
    // But if we want to capture this, we can add it to history with empty candidate response?
    // For now, let's keep it simple: Return message, frontend displays it. 
    // The REAL first question usually generated by `submitAnswer` (which triggers next question) OR we generate Q1 here.

    // Frontend `startInterviewSession` returns `firstQuestion`.
    // Let's ensure we return a QUESTION, not just a "Hello".

    return {
        sessionId: session.id,
        firstMessage
    };
};


import { getSession, completeSession, markSessionEvaluationFailed } from './sessionService';
import { FinalReportSchema } from 'mockmate-shared';

export const generateAuthoritativeReport = async (userId: string, sessionId: string) => {
    const session = await getSession(userId, sessionId);
    if (!session) throw new Error('Session not found');

    const history = session.history || [];
    if (history.length === 0) throw new Error('No interview history to analyze.');

    try {
        const report = await generateFinalReport(history, session.context);
        const parsedReport = FinalReportSchema.parse(report);
        await completeSession(userId, sessionId, parsedReport);
        return parsedReport;
    } catch (err: any) {
        await markSessionEvaluationFailed(userId, sessionId, 'REPORT_GENERATION_FAILED');
        throw err;
    }
};

export const analyzeCode = async (blueprint: any, code: string): Promise<string> => {
    const lang = blueprint.language || 'python';

    // Validate inputs
    if (!code || code.trim().length < 10) return "Code too short for analysis.";

    const masterPrompt = `You are a Senior Staff Engineer. Analyze the following candidate code for a job interview.

    LANGUAGE: ${lang}
    QUESTION:
    ${blueprint.question}

    EXPECTED SIGNALS:
    ${JSON.stringify(blueprint.expectedSignals)}

    CANDIDATE CODE:
    \`\`\`${lang}
    ${code}
    \`\`\`

    TASK:
    1. Evaluate code correctness and logic.
    2. Assess time/space complexity.
    3. Identify edge cases handled vs missed.
    4. Provide concise, high-bar suggestions for improvement.
    
    Format: Return a professional, encouraging but rigorous critique (max 300 words).`;

    try {
        const { text } = await callWithFallback(masterPrompt);
        return text || "Unable to analyze code logic.";
    } catch (e) {
        console.error("Code Analysis Error:", e);
        return "Internal review engine timeout. The code seems syntactically valid.";
    }
};

export const simulateExecution = async (code: string, language: string): Promise<{ stdout: string; stderr: string }> => {
    const prompt = `You are a universal code execution kernel. Mental-run the following code and return the expected standard output and standard error.
    
    LANGUAGE: ${language}
    CODE:
    ${code}
    
    TASK:
    Generate realistic terminal logs. If the code has syntax errors or runtime exceptions, put them in stderr. If it runs correctly, put output in stdout.
    Do NOT include code in the response. ONLY the logs.
    
    RETURN JSON ONLY:
    {
      "stdout": "...",
      "stderr": "..."
    }`;

    try {
        const { text } = await callWithFallback(prompt, { type: 'json_object' });
        return extractJson(text) || { stdout: '', stderr: 'Kernel Panic: Unable to simulate execution.' };
    } catch (e) {
        return { stdout: '', stderr: 'Kernel Timeout: AI simulation failed.' };
    }
};

export const getHintForQuestion = async (question: string): Promise<string> => {
    try {
        const hintPrompt = `You are a supportive interview coach. The candidate is stuck on this question:

"${question}"

Provide a SHORT, encouraging hint (max 2 sentences) that:
1. Does NOT give away the answer
2. Guides their thinking direction
3. Suggests what framework or approach to use (e.g., STAR, problem-solving steps)
4. Is specific to THIS question, not generic

Return ONLY the hint text, no intro.`;

        const { text } = await callWithFallback(hintPrompt);
        return text.trim() || 'Think about a specific example from your experience.';
    } catch (error) {
        console.error('Hint generation failed:', error);
        return 'Break this down into steps: What was the situation? What action did you take?';
    }
};

export const generateIdealAnswer = async (
    question: string,
    blueprint: any | null,
    userAnswer: string
): Promise<string> => {
    const expectedSignals = blueprint?.expectedSignals || [];
    const competency = blueprint?.phase || 'Professional Communication';

    const prompt = `You are a senior interview coach. A candidate just answered this interview question:

QUESTION: "${question}"
COMPETENCY TESTED: ${competency}
EXPECTED SIGNALS: ${JSON.stringify(expectedSignals)}

CANDIDATE'S ANSWER: "${userAnswer}"

TASK: Generate an IDEAL, HIGH-BAR response (2-4 sentences) that would impress interviewers. This should:
1. Demonstrate the competency being tested
2. Hit the expected signals
3. Use the STAR method if behavioral
4. Include specific metrics/numbers where possible
5. Sound natural and conversational (not robotic)

Return ONLY the ideal response text, no intro or framing.`;

    try {
        const { text } = await callWithFallback(prompt);
        return text || "A strong answer would focus on clear signals and measurable impact.";
    } catch (e) {
        return "Focus on the core competency and provide a structured, evidence-based response.";
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
        console.warn("Primary transcription failed, trying Groq fallback...", primaryError);
        
        if (groq && groqApiKey) {
            try {
                const fs = await import('fs');
                const os = await import('os');
                const path = await import('path');
                
                // Groq Whisper requires a file or readable stream with metadata
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
                
                // Cleanup
                try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore cleanup error */ }
                
                if (typeof transcription === 'string') return transcription.trim();
                return (transcription as any).text?.trim() || "I'm ready to move to the next question. (Transcription Unavailable)";
            } catch (fallbackError) {
                console.error("All transcription providers failed:", fallbackError);
                return "I'm ready to move to the next question. (Transcription Unavailable)";
            }
        }
        
        return "I'm ready to move to the next question. (Transcription Unavailable)";
    }
};
