import {
  DimensionKey,
  DimensionScore,
  DimensionObservation,
  DimensionEvidenceState,
  EvidenceConfidence,
  TrajectoryStatus,
  ReadinessStatus,
  ReasoningMode,
  InterviewStage,
  QuestionKind,
  TurnEvaluation,
  EvidenceReference,
} from 'mockmate-shared';
import { ACTIVE_DIMENSIONS_BY_MODE, APPROVED_DIMENSIONS } from '../config/evaluationConfig';

export type DimensionEvidenceReference = EvidenceReference;

export interface ScorecardResult {
  dimensionScores: DimensionScore[];
  dimensionStates: Record<DimensionKey, DimensionEvidenceState>;
  simplifiedScore: number | null;
  readinessStatus: ReadinessStatus;
  readinessReasoning: string;
}

const CONFIDENCE_WEIGHTS: Record<EvidenceConfidence, number> = {
  low: 0.5,
  medium: 0.75,
  high: 1.0,
};

export function computeTrajectory(observations: DimensionObservation[]): TrajectoryStatus {
  const scoredObs = observations.filter(o => typeof o.anchorScore === 'number' && o.anchorScore !== null);
  if (scoredObs.length < 2) return 'insufficient_evidence';

  const firstScore = scoredObs[0].anchorScore!;
  const lastScore = scoredObs[scoredObs.length - 1].anchorScore!;
  const diff = lastScore - firstScore;

  if (diff > 0) return 'improving';
  if (diff < 0) return 'declining';
  return 'stable';
}

export function aggregateTurnEvidence(
  turns: Array<{ turnId: string; evaluation?: TurnEvaluation; stage?: InterviewStage; questionKind?: QuestionKind }>,
  mode: ReasoningMode
): ScorecardResult {
  const activeDims = ACTIVE_DIMENSIONS_BY_MODE[mode] || ACTIVE_DIMENSIONS_BY_MODE.classic_behavioral;
  const allDimensionKeys = Object.keys(APPROVED_DIMENSIONS) as DimensionKey[];

  const dimensionStates: Record<DimensionKey, DimensionEvidenceState> = {} as any;
  const dimensionReferencesMap: Record<DimensionKey, DimensionEvidenceReference[]> = {} as any;

  for (const dimKey of allDimensionKeys) {
    const isActive = activeDims.includes(dimKey);
    const observations: DimensionObservation[] = [];
    const evidenceReferences: DimensionEvidenceReference[] = [];
    const validTurnIdsSet = new Set<string>();
    const stagesSet = new Set<InterviewStage>();
    let hasChallengeEvidence = false;
    let hasInitialNonChallenge = false;
    let hasLaterChallengeOrRecovery = false;

    for (const turn of turns) {
      if (!turn || !turn.turnId) continue;
      if (!turn.evaluation || turn.evaluation.evaluationStatus === 'unavailable') continue;
      if (!Array.isArray(turn.evaluation.observations)) continue;

      for (const obs of turn.evaluation.observations) {
        if (obs.dimension === dimKey) {
          observations.push(obs);

          // A turn counts ONLY when it contains a valid non-null anchorScore and valid non-null evidenceExcerpt
          if (obs.anchorScore !== null && typeof obs.evidenceExcerpt === 'string' && obs.evidenceExcerpt.trim().length > 0) {
            validTurnIdsSet.add(turn.turnId);
            if (obs.stage) stagesSet.add(obs.stage);

            evidenceReferences.push({
              turnId: turn.turnId,
              excerpt: obs.evidenceExcerpt,
              stage: obs.stage || turn.stage || 'framing',
              questionKind: obs.turnKind || turn.questionKind || 'root',
              signal: obs.signal,
              anchorScore: obs.anchorScore,
              confidence: obs.confidence,
            });

            const qKind = obs.turnKind || turn.questionKind || 'root';
            if (qKind === 'root' || qKind === 'probe') {
              hasInitialNonChallenge = true;
            }
            if (qKind === 'challenge' || qKind === 'reflection') {
              hasLaterChallengeOrRecovery = true;
              if (qKind === 'challenge') {
                hasChallengeEvidence = true;
              }
            }
          }
        }
      }
    }

    const distinctTurnIds = Array.from(validTurnIdsSet);
    const distinctStages = Array.from(stagesSet);
    const validObs = observations.filter(o => typeof o.anchorScore === 'number' && o.anchorScore !== null && o.evidenceExcerpt !== null);

    // Rule A: Valid scored observations from at least 2 distinct turns
    // OR Rule B: One valid initial observation and one valid later challenge/recovery observation from a DIFFERENT turn
    const hasEnoughTurns = distinctTurnIds.length >= 2;
    const hasChallengeCombo = hasInitialNonChallenge && hasLaterChallengeOrRecovery && distinctTurnIds.length >= 2;
    const isSufficient = isActive && (hasEnoughTurns || hasChallengeCombo);

    let anchorScore: number | null = null;
    let normalizedScore: number | null = null;
    let confidence: EvidenceConfidence = 'low';

    if (isSufficient && validObs.length > 0) {
      let totalWeight = 0;
      let weightedSum = 0;
      let confSum = 0;

      for (const obs of validObs) {
        const w = CONFIDENCE_WEIGHTS[obs.confidence] || 0.75;
        weightedSum += obs.anchorScore! * w;
        totalWeight += w;
        confSum += w;
      }

      anchorScore = Math.round((weightedSum / totalWeight) * 10) / 10;
      normalizedScore = Math.min(100, Math.max(0, Math.round((anchorScore / 4) * 100)));

      const avgConfWeight = confSum / validObs.length;
      confidence = avgConfWeight >= 0.9 ? 'high' : avgConfWeight >= 0.7 ? 'medium' : 'low';
    }

    const trajectory = computeTrajectory(observations);

    dimensionStates[dimKey] = {
      active: isActive,
      observations,
      distinctTurnIds,
      distinctStages,
      hasChallengeEvidence,
      anchorScore: isSufficient ? anchorScore : null,
      normalizedScore: isSufficient ? normalizedScore : null,
      confidence,
      trajectory: isSufficient ? trajectory : 'insufficient_evidence',
    };

    dimensionReferencesMap[dimKey] = evidenceReferences;
  }

  // Build DimensionScore list for final report
  const dimensionScores = allDimensionKeys.map(dimKey => {
    const st = dimensionStates[dimKey];
    const dimDef = APPROVED_DIMENSIONS[dimKey];
    const refs = dimensionReferencesMap[dimKey] || [];

    if (!st.active) {
      return {
        dimension: dimKey,
        dimensionName: dimDef.name,
        score_status: 'not_tested' as const,
        anchor_score: null,
        normalized_score: null,
        reason: 'Dimension not active for selected reasoning mode.',
        evidence: [],
        confidence: 'low' as const,
        evidenceReferences: [],
        trajectory: 'insufficient_evidence' as const,
        distinctTurnCount: 0,
        hasChallengeEvidence: false,
      };
    }

    if (st.anchorScore === null || st.normalizedScore === null) {
      return {
        dimension: dimKey,
        dimensionName: dimDef.name,
        score_status: 'insufficient_evidence' as const,
        anchor_score: null,
        normalized_score: null,
        reason: st.observations.length > 0
          ? 'Insufficient distinct turn evidence to form an authoritative dimension score.'
          : 'No observable candidate evidence recorded for this dimension.',
        evidence: [],
        confidence: 'low' as const,
        evidenceReferences: refs,
        trajectory: st.trajectory,
        distinctTurnCount: st.distinctTurnIds.length,
        hasChallengeEvidence: st.hasChallengeEvidence,
      };
    }

    const evidenceExcerpts = refs.map(r => r.excerpt);

    return {
      dimension: dimKey,
      dimensionName: dimDef.name,
      score_status: 'scored' as const,
      anchor_score: st.anchorScore,
      normalized_score: st.normalizedScore,
      reason: `Evaluated across ${st.distinctTurnIds.length} turn(s) with ${st.confidence} evidence confidence.`,
      evidence: [...new Set(evidenceExcerpts)],
      confidence: st.confidence,
      evidenceReferences: refs,
      trajectory: st.trajectory,
      distinctTurnCount: st.distinctTurnIds.length,
      hasChallengeEvidence: st.hasChallengeEvidence,
    };
  });

  // Calculate overall practice score (simplifiedScore) & readiness
  const activeScored = dimensionScores.filter(d => activeDims.includes(d.dimension) && d.score_status === 'scored');
  const activeCount = activeDims.length;
  const sufficientRatio = activeCount > 0 ? activeScored.length / activeCount : 0;

  let simplifiedScore: number | null = null;
  let readinessStatus: ReadinessStatus = 'NOT_ASSESSED';
  let readinessReasoning = 'Insufficient scored evidence across active reasoning dimensions.';

  if (activeScored.length >= 3 && sufficientRatio >= 0.6) {
    const sum = activeScored.reduce((acc, curr) => acc + (curr.normalized_score || 0), 0);
    simplifiedScore = Math.round(sum / activeScored.length);

    if (simplifiedScore >= 80) {
      readinessStatus = 'INTERVIEW_READY';
      readinessReasoning = 'Candidate demonstrates strong, well-supported reasoning across key dimensions.';
    } else if (simplifiedScore >= 60) {
      readinessStatus = 'ALMOST_READY';
      readinessReasoning = 'Candidate shows adequate reasoning but needs higher consistency under pushback.';
    } else {
      readinessStatus = 'NOT_READY';
      readinessReasoning = 'Key reasoning gaps or unsupported assumptions observed across multiple turns.';
    }
  }

  return {
    dimensionScores,
    dimensionStates,
    simplifiedScore,
    readinessStatus,
    readinessReasoning,
  };
}
