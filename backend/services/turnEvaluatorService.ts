import {
  TurnEvaluation,
  DimensionObservation,
  TurnEvaluationSchema,
  QuestionBlueprint,
  ReasoningMode,
  InterviewStage,
  QuestionKind,
  ProviderMetadata,
} from 'mockmate-shared';
import { ACTIVE_DIMENSIONS_BY_MODE, APPROVED_DIMENSIONS } from '../config/evaluationConfig';
import { callWithFallback, extractJson } from './aiService';

export function normalizeWhitespace(str: string): string {
  return (str || '').replace(/\s+/g, ' ').trim();
}

export function isExactSubstring(excerpt: string, fullText: string): boolean {
  const normExcerpt = normalizeWhitespace(excerpt).toLowerCase();
  const normFullText = normalizeWhitespace(fullText).toLowerCase();
  if (!normExcerpt || !normFullText) return false;
  return normFullText.includes(normExcerpt);
}

export function sanitizeAndVerifyEvaluation(
  rawEval: any,
  candidateResponse: string,
  question: QuestionBlueprint,
  mode: ReasoningMode
): TurnEvaluation {
  const activeDims = ACTIVE_DIMENSIONS_BY_MODE[mode] || ACTIVE_DIMENSIONS_BY_MODE.classic_behavioral;
  const normCandidateText = normalizeWhitespace(candidateResponse);
  const normQuestionText = normalizeWhitespace(question.question);

  if (!normCandidateText || normCandidateText === '[Question Skipped]') {
    return TurnEvaluationSchema.parse({
      evaluationStatus: 'insufficient_evidence',
      answerSummary: 'Question skipped or no candidate response provided.',
      observations: [],
      missingSignals: question.expectedSignals || [],
      contradictions: [],
      recommendedProbe: null,
    });
  }

  const status = rawEval?.evaluationStatus === 'evaluated' ? 'evaluated' : 'insufficient_evidence';
  const rawObsArray = Array.isArray(rawEval?.observations) ? rawEval.observations : [];

  const verifiedObservations: DimensionObservation[] = [];

  for (const obs of rawObsArray) {
    if (!obs || typeof obs !== 'object') continue;
    const dim = obs.dimension;
    if (!dim || !activeDims.includes(dim)) continue;
    if (!APPROVED_DIMENSIONS[dim as keyof typeof APPROVED_DIMENSIONS]) continue;

    let anchorScore = typeof obs.anchorScore === 'number' && obs.anchorScore >= 0 && obs.anchorScore <= 4 ? obs.anchorScore : null;
    const confidence = ['high', 'medium', 'low'].includes(obs.confidence) ? obs.confidence : 'medium';
    let excerpt = typeof obs.evidenceExcerpt === 'string' ? obs.evidenceExcerpt.trim() : null;

    if (excerpt) {
      const normExcerpt = normalizeWhitespace(excerpt);
      const isCandidateExcerpt = isExactSubstring(normExcerpt, normCandidateText);
      const isQuestionExcerpt = isExactSubstring(normExcerpt, normQuestionText);

      // Rule: quote must be candidate's own text, not question prompt, and must exist in candidate text
      if (!isCandidateExcerpt || isQuestionExcerpt) {
        anchorScore = null;
        excerpt = null;
      }
    } else {
      anchorScore = null;
    }

    verifiedObservations.push({
      dimension: dim,
      anchorScore,
      confidence: confidence as any,
      evidenceExcerpt: excerpt,
      signal: typeof obs.signal === 'string' ? obs.signal.trim() : 'Observation',
      rationale: typeof obs.rationale === 'string' ? obs.rationale.trim() : 'Observed candidate response.',
      stage: (obs.stage || question.stage || 'framing') as InterviewStage,
      turnKind: (obs.turnKind || question.questionKind || 'root') as QuestionKind,
    });
  }

  const missingSignals = Array.isArray(rawEval?.missingSignals)
    ? rawEval.missingSignals.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const contradictions = Array.isArray(rawEval?.contradictions)
    ? rawEval.contradictions.filter((c: any) => typeof c === 'string' && c.trim().length > 0)
    : [];

  const recommendedProbe = typeof rawEval?.recommendedProbe === 'string' && rawEval.recommendedProbe.trim().length > 0
    ? rawEval.recommendedProbe.trim()
    : null;

  return TurnEvaluationSchema.parse({
    evaluationStatus: verifiedObservations.some(o => o.anchorScore !== null) ? 'evaluated' : status,
    answerSummary: typeof rawEval?.answerSummary === 'string' ? rawEval.answerSummary.trim() : null,
    observations: verifiedObservations,
    missingSignals,
    contradictions,
    recommendedProbe,
    providerMetadata: rawEval?.providerMetadata,
  });
}

export async function evaluateCandidateTurn(
  question: QuestionBlueprint,
  candidateResponse: string,
  mode: ReasoningMode,
  stage: InterviewStage
): Promise<TurnEvaluation> {
  const normAnswer = normalizeWhitespace(candidateResponse);
  if (!normAnswer || normAnswer === '[Question Skipped]') {
    return TurnEvaluationSchema.parse({
      evaluationStatus: 'insufficient_evidence',
      answerSummary: 'Question skipped.',
      observations: [],
      missingSignals: question.expectedSignals || [],
      contradictions: [],
      recommendedProbe: null,
    });
  }

  const activeDims = ACTIVE_DIMENSIONS_BY_MODE[mode] || ACTIVE_DIMENSIONS_BY_MODE.classic_behavioral;
  const activeDimDetails = activeDims.map(d => `- ${d}: ${APPROVED_DIMENSIONS[d].definition}`).join('\n');

  const prompt = `You are a strict, objective reasoning evaluator for MockMate.
Analyze the candidate's turn response to the interview question.

CONTEXT:
Reasoning Mode: ${mode}
Active Stage: ${stage}
Question Kind: ${question.questionKind || 'root'}
Question: "${question.question}"
Expected Signals: ${JSON.stringify(question.expectedSignals || [])}
CANDIDATE RESPONSE: "${normAnswer}"

ACTIVE DIMENSIONS TO EVALUATE:
${activeDimDetails}

STRICT EVIDENCE INTEGRITY RULES:
1. Every scored observation (anchorScore 0, 1, 2, 3, or 4) MUST specify "evidenceExcerpt" which is an EXACT substring from the CANDIDATE RESPONSE above.
2. DO NOT synthesize, paraphrase, or invent candidate quotes.
3. DO NOT quote the interviewer question text as evidence.
4. If no exact candidate quote exists for a dimension, set anchorScore to null and evidenceExcerpt to null.
5. Score strictly on reasoning quality, problem framing, trade-offs, systems thinking, and uncertainty handling—NOT answer length or speech fluency.

OUTPUT JSON SCHEMA:
{
  "evaluationStatus": "evaluated",
  "answerSummary": "Neutral 1-sentence summary of candidate turn",
  "observations": [
    {
      "dimension": "${activeDims[0]}",
      "anchorScore": 3,
      "confidence": "high",
      "evidenceExcerpt": "exact substring from candidate response",
      "signal": "Observed signal name",
      "rationale": "Clear explanation of anchor score grounding",
      "stage": "${stage}",
      "turnKind": "${question.questionKind || 'root'}"
    }
  ],
  "missingSignals": ["Missing signal 1"],
  "contradictions": [],
  "recommendedProbe": "Targeted probe draft if required signals are missing, otherwise null"
}`;

  try {
    const { text, provider, model } = await callWithFallback(prompt);
    const rawJson = extractJson(text || '{}');
    const providerMetadata: ProviderMetadata = { provider, model };
    rawJson.providerMetadata = providerMetadata;
    return sanitizeAndVerifyEvaluation(rawJson, normAnswer, question, mode);
  } catch (err: any) {
    console.warn('[TurnEvaluator] Provider call failed or unavailable:', err.message);
    return TurnEvaluationSchema.parse({
      evaluationStatus: 'unavailable',
      answerSummary: null,
      observations: [],
      missingSignals: [],
      contradictions: [],
      recommendedProbe: null,
    });
  }
}
