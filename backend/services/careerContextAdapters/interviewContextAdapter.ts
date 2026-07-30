import { FinalReport, CareerContextItem } from 'mockmate-shared';
import crypto from 'crypto';

export interface InterviewAdapterInput {
  sessionId: string;
  report: FinalReport;
  revision?: string;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export function buildInterviewContextItems(input: InterviewAdapterInput): CareerContextItem[] {
  const { sessionId, report, revision = 'v1' } = input;
  const items: CareerContextItem[] = [];
  const capturedAt = new Date().toISOString();

  // 1. Quantitative dimension signals (practice evidence)
  const dimensionScores = report.quantitativeAnalysis?.dimension_scores || [];
  dimensionScores.forEach((dimScore) => {
    if (dimScore.score_status !== 'scored') return;
    const evidenceIds = (dimScore.evidenceReferences || []).map(r => r.turnId).filter(Boolean);
    const summary = `${dimScore.dimension}: score ${dimScore.normalized_score ?? dimScore.anchor_score}/100. ${dimScore.reason}`;
    const isStrength = (dimScore.normalized_score ?? dimScore.anchor_score ?? 0) >= 75;

    items.push({
      id: `ctx_int_${sessionId}_dim_${dimScore.dimension.toLowerCase()}`,
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
        capturedAt,
      },
      exactExcerpt: dimScore.reason,
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  });

  // 2. Biggest Risk Area -> development_priority
  if (report.biggestRiskArea?.observation) {
    const riskSummary = `Risk: ${report.biggestRiskArea.title} - ${report.biggestRiskArea.observation}`;
    items.push({
      id: `ctx_int_${sessionId}_risk_area`,
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
        capturedAt,
      },
      exactExcerpt: report.biggestRiskArea.observation,
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  }

  // 3. Prioritized Actions -> development_priority
  if (report.prioritizedActions && report.prioritizedActions.length > 0) {
    const actions = report.prioritizedActions.map(a => `${a.action} (${a.impact} impact)`).filter(Boolean);
    if (actions.length > 0) {
      items.push({
        id: `ctx_int_${sessionId}_prioritized_actions`,
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
          capturedAt,
        },
        exactExcerpt: actions.join(', '),
        provenance: 'system_observed',
        status: 'active',
        sensitivity: 'standard',
        createdAt: capturedAt,
        updatedAt: capturedAt,
      });
    }
  }

  return items;
}
