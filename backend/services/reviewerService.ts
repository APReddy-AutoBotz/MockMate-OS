
import OpenAI from 'openai';
import { FinalReport, InterviewTurn } from '../types';

// Use Groq for the Reviewer to ensure provider independence from Gemini (Primary Scorer)
const groqApiKey = process.env.GROQ_API_KEY;
const groq = groqApiKey ? new OpenAI({
    apiKey: groqApiKey,
    baseURL: 'https://api.groq.com/openai/v1'
}) : null;

export interface SyntheticReview {
    synthetic_proxy_trustworthiness_score: number; // 1-5
    synthetic_proxy_helpfulness_score: number; // 1-5
    synthetic_proxy_evidence_traceability: 'high' | 'medium' | 'low';
    synthetic_proxy_bias_detected: boolean;
    synthetic_proxy_jargon_rewarded: boolean;
    synthetic_proxy_reasoning_gap: string;
    synthetic_proxy_role_specific_value: string;
}

export const runSyntheticReview = async (
    report: FinalReport,
    transcript: InterviewTurn[]
): Promise<SyntheticReview | null> => {
    if (!groq) {
        console.warn("Synthetic Reviewer skipped: Missing GROQ_API_KEY");
        return null;
    }

    const transcriptSnippet = transcript.map(t => `${t.interviewer}: ${t.question}\nCandidate: ${t.candidateResponse}`).join('\n---\n');

    const reviewerPrompt = `You are an independent Senior Audit Lead for a premium coaching platform. 
    Your task is to conduct a "Synthetic Trustworthiness Check" and a "Role-Based Proxy Review" on an AI-generated interview report.
    
    You must NOT be biased by the report's confidence or polished language. Your goal is to find proof of failure or excellence.

    --- TRANSCRIPT ---
    ${transcriptSnippet}

    --- AI GENERATED REPORT ---
    Overall Summary: ${report.overallSummary}
    Scores: ${JSON.stringify(report.quantitativeAnalysis?.dimension_scores)}
    Risks: ${report.biggestRiskArea?.title} - ${report.biggestRiskArea?.mitigation}

    --- AUDIT CRITERIA ---
    1. EVIDENCE TRACEABILITY: Does the report credit the candidate with insights NOT present in the transcript? (Hallucinated excellence)
    2. JARGON INFLATION: Did the report give a high score (>3) to a candidate who used many buzzwords but explained zero logic?
    3. NON-NATIVE BIAS: Did the report penalize a candidate for "poor English" despite their logical reasoning being elite?
    4. SPECIFICITY: Is the coaching feedback "generic advice" or "surgical guidance" based on the candidate's exact words?

    --- OUTPUT FORMAT ---
    Return valid JSON matching this schema:
    {
      "synthetic_proxy_trustworthiness_score": number (1-5),
      "synthetic_proxy_helpfulness_score": number (1-5),
      "synthetic_proxy_evidence_traceability": "high" | "medium" | "low",
      "synthetic_proxy_bias_detected": boolean,
      "synthetic_proxy_jargon_rewarded": boolean,
      "synthetic_proxy_reasoning_gap": "string describing any hallucinations or missed logic",
      "synthetic_proxy_role_specific_value": "string describing how helpful this is for a real candidate in this role"
    }
    `;

    try {
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "You are an independent auditor. Analyze the report against the raw transcript. Be extremely critical." },
                { role: "user", content: reviewerPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        const content = response.choices[0]?.message?.content;
        return content ? JSON.parse(content) : null;
    } catch (err) {
        console.error("Synthetic Review Failed:", err);
        return null;
    }
};
