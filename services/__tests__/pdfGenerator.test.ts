import type { FinalReport } from 'mockmate-shared';
import { buildPdfDimensionRows, PDF_REPORT_HEADER } from '../pdfGenerator';

describe('PDF mixed-evidence truth', () => {
  it('labels unsupported dimensions without percentages or risk coloring', () => {
    const report = {
      quantitativeAnalysis: {
        dimension_scores: [
          {
            dimension: 'PROBLEM_FRAMING',
            dimensionName: 'Problem framing',
            score_status: 'scored',
            normalized_score: 84,
            reason: 'Observed across multiple turns.',
          },
          {
            dimension: 'SYSTEMS_REASONING',
            dimensionName: 'Systems reasoning',
            score_status: 'insufficient_evidence',
            normalized_score: null,
            reason: 'Not enough distinct evidence.',
          },
          {
            dimension: 'TRADEOFF_REASONING',
            dimensionName: 'Tradeoff reasoning',
            score_status: 'not_tested',
            normalized_score: null,
            reason: 'No relevant prompt was presented.',
          },
        ],
      },
    } as FinalReport;

    const rows = buildPdfDimensionRows(report);
    expect(rows).toEqual([
      expect.objectContaining({ scoreLabel: '84%', tone: 'strong' }),
      expect.objectContaining({ scoreLabel: 'Insufficient evidence', tone: 'unscored' }),
      expect.objectContaining({ scoreLabel: 'Not tested', tone: 'unscored' }),
    ]);
    expect(rows.map(row => row.scoreLabel).join(' ')).not.toContain('null%');
    expect(PDF_REPORT_HEADER).toContain('Practice Report');
    expect(PDF_REPORT_HEADER).not.toContain('AI Assessment');
  });
});
