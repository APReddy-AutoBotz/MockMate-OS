import { FinalReport, CareerContextItemDraft } from 'mockmate-shared';
import crypto from 'crypto';

export interface InterviewAdapterInput {
  sessionId: string;
  report: FinalReport;
  revision?: string;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export function buildInterviewContextItems(input: InterviewAdapterInput): CareerContextItemDraft[] {
  const { sessionId, report, revision = 'v1' } = input;
  const items: CareerContextItemDraft[] = [];

  // 1. Quantitative dimension signals (practice evidence)
  const dimensionScores = report.quantitativeAnalysis?.dimension_scores || [];
  dimensionScores.forEach((dimScore) => {
    if (dimScore.score_status !== 'scored') return;
    const evidenceIds = (dimScore.evidenceReferences || []).map(r => r.turnId).filter(Boolean);
    
    // Label using exact scale: normalized 0-100 or anchor 0-4
    const scoreStr = dimScore.normalized_score !== undefined && dimScore.normalized_score !== null
      ? `${dimScore.normalized_score}/100`
      : `${dimScore.anchor_score}/4`;
    
    const summary = `${dimScore.dimension}: score ${scoreStr}. ${dimScore.reason}`;
    const isStrength = (dimScore.normalized_score ?? (dimScore.anchor_score * 25)) >= 75;

    items.push({
      kind: isStrength ? 'interview_practice_signal' : 'development_priority',
      canonicalKey: `interview.practice_signal.${dimScore.dimension.toLowerCase()}`,
      label: `Interview Signal: ${dimScore.dimension}`,
      value: {
        type: 'evidence',
        summary,
        evidenceReferenceIds: evidenceIds,
      },
      source: {
        module: 'interview',
        recordId: sessionId,
        fieldPath: `quantitativeAnalysis.dimension_scores.${dimScore.dimension}`,
        sourceRevision: revision,
        sourceHash: computeHash(summary),
        capturedAt: new Date().toISOString(),
      },
      exactExcerpt: dimScore.reason,
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
    });
  });

  // 2. Biggest Risk Area -> development_priority
  if (report.biggestRiskArea?.observation) {
    const riskSummary = `Risk: ${report.biggestRiskArea.title} - ${report.biggestRiskArea.observation}`;
    items.push({
      kind: 'development_priority',
      canonicalKey: 'interview.development_priority.biggest_risk',
      label: `Development Priority: ${report.biggestRiskArea.title}`,
      value: {
        type: 'text',
        text: riskSummary,
      },
      source: {
        module: 'interview',
        recordId: sessionId,
        fieldPath: 'biggestRiskArea',
        sourceRevision: revision,
        sourceHash: computeHash(riskSummary),
        capturedAt: new Date().toISOString(),
      },
      exactExcerpt: report.biggestRiskArea.observation,
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
    });
  }

  // 3. Prioritized Actions -> development_priority
  if (report.prioritizedActions && report.prioritizedActions.length > 0) {
    const actions = report.prioritizedActions.map(a => `${a.action} (${a.impact} impact)`).filter(Boolean);
    if (actions.length > 0) {
      items.push({
        kind: 'development_priority',
        canonicalKey: 'interview.prioritized_actions',
        label: 'Interview Practice Prioritized Actions',
        value: {
          type: 'string_list',
          values: actions,
        },
        source: {
          module: 'interview',
          recordId: sessionId,
          fieldPath: 'prioritizedActions',
          sourceRevision: revision,
          sourceHash: computeHash(actions.join(';')),
          capturedAt: new Date().toISOString(),
        },
        exactExcerpt: actions.join(', '),
        provenance: 'system_observed',
        status: 'active',
        sensitivity: 'standard',
      });
    }
  }

  return items;
}
