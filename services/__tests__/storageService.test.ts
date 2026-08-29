import type { FinalReport } from 'mockmate-shared';
import { getSessionHistory, saveSessionToHistory } from '../storageService';

const reportWith = (simplifiedScore: number | null, dimensionScore: number | null = simplifiedScore): FinalReport => ({
  overallSummary: 'Evidence-backed summary',
  evaluationModel: 'mockmate_v1_canonical',
  readiness: { status: simplifiedScore === null ? 'NOT_ASSESSED' : 'ALMOST_READY', reasoning: 'Evidence status.' },
  quantitativeAnalysis: {
    dimension_scores: [{
      dimension: 'PROBLEM_FRAMING',
      dimensionName: 'Problem framing',
      score_status: dimensionScore === null ? 'insufficient_evidence' : 'scored',
      anchor_score: dimensionScore === null ? null : 3,
      normalized_score: dimensionScore,
      reason: 'Observed evidence.',
      evidence: [],
      evidenceReferences: [],
      trajectory: dimensionScore === null ? null : 'stable',
      distinctTurnCount: dimensionScore === null ? 0 : 2,
      confidence: 'medium',
    } as any],
  },
  advisoryPanel: [],
  questionPerformance: [],
  biggestRiskArea: null,
  coachPack: null,
  trajectoryReplay: [],
  auditLayer: [],
  simplifiedScore,
  quickWins: [],
  prioritizedActions: [],
});

describe('practice journal storage truth', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => key in storage ? storage[key] : null,
        setItem: (key: string, value: string) => { storage[key] = value; },
        removeItem: (key: string) => { delete storage[key]; },
        key: (index: number) => Object.keys(storage)[index] || null,
        get length() { return Object.keys(storage).length; },
      },
    });
  });

  it('uses the canonical overall score and writes a stable server session idempotently', () => {
    expect(saveSessionToHistory(reportWith(64, 99), 'Engineer', 'structured', 'server-123')).toBe(true);
    expect(saveSessionToHistory(reportWith(71, 15), 'Engineer', 'structured', 'server-123')).toBe(true);

    expect(getSessionHistory()).toHaveLength(1);
    expect(getSessionHistory()[0]).toMatchObject({
      id: 'interview_server-123',
      avgScore: 71,
    });
  });

  it('stores null for an unscored report even when a dimension happens to be scored', () => {
    expect(saveSessionToHistory(reportWith(null, 88), 'Engineer', 'structured', 'server-unscored')).toBe(true);
    expect(getSessionHistory()[0].avgScore).toBeNull();
  });

  it('reports a denied browser write without throwing', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw new Error('storage denied'); },
      },
    });
    expect(saveSessionToHistory(reportWith(80), 'Engineer', 'structured', 'server-denied')).toBe(false);
  });
});
