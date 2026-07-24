import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InterviewReport from '../InterviewReport';
import { FinalReport } from 'mockmate-shared';

const mockReport: FinalReport = {
  overallSummary: 'Candidate demonstrated structured problem framing and resilient recovery under pushback.',
  evaluationModel: 'mockmate_v1_canonical',
  readiness: {
    status: 'INTERVIEW_READY',
    reasoning: 'Strong evidence across active dimensions.',
  },
  quantitativeAnalysis: {
    dimension_scores: [
      {
        dimension: 'PROBLEM_FRAMING',
        dimensionName: 'Problem Framing',
        score_status: 'scored',
        anchor_score: 4,
        normalized_score: 100,
        reason: 'Evaluated across 2 turns.',
        evidence: ['outbox pattern'],
        evidenceReferences: [
          { turnId: '11111111-1111-1111-1111-111111111111', excerpt: 'outbox pattern', stage: 'framing', questionKind: 'root' },
        ],
        confidence: 'high',
        distinctTurnCount: 2,
        hasChallengeEvidence: true,
      },
      {
        dimension: 'SYSTEMS_THINKING',
        dimensionName: 'Systems Thinking',
        score_status: 'insufficient_evidence',
        anchor_score: null,
        normalized_score: null,
        reason: 'Insufficient distinct turn evidence.',
        evidence: [],
        confidence: 'low',
        distinctTurnCount: 1,
        hasChallengeEvidence: false,
      },
    ],
  },
  advisoryPanel: [
    { name: 'Reasoning Review', assessment: 'Strong problem framing.', hireRecommendation: null },
  ],
  questionPerformance: [
    {
      question_text: 'How do you design microservices for eventual consistency?',
      user_transcript: 'We implement eventual consistency using asynchronous messaging with Kafka.',
      feedback: 'Strong problem framing.',
      turnId: '11111111-1111-1111-1111-111111111111',
    },
    {
      question_text: 'How do you handle network partitions?',
      user_transcript: 'We employ circuit breakers with exponential backoff.',
      feedback: null, // Missing feedback omits feedback panel
      turnId: '22222222-2222-2222-2222-222222222222',
    },
  ],
  challengeRecoveryTimeline: [
    {
      rootQuestionId: 'q1',
      challengeTurnId: '22222222-2222-2222-2222-222222222222',
      recoveryTurnId: '33333333-3333-3333-3333-333333333333',
      challengeType: 'counterargument',
      beforeAnchor: 2,
      afterAnchor: 4,
      trajectory: 'improved',
    },
  ],
  simplifiedScore: 85,
  quickWins: [],
  prioritizedActions: [],
  trajectoryReplay: [],
  auditLayer: [],
};

describe('InterviewReport Frontend UI Component Tests', () => {

  it('1. Renders canonical dimension cards and scored dimension score/confidence', () => {
    render(<InterviewReport report={mockReport} onRestart={() => {}} />);

    expect(screen.getByText('Reasoning Scorecard')).toBeInTheDocument();
    expect(screen.getByText('Problem Framing')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
  });

  it('2. Renders insufficient evidence card without numeric score', () => {
    render(<InterviewReport report={mockReport} onRestart={() => {}} />);

    expect(screen.getByText('Systems Thinking')).toBeInTheDocument();
    expect(screen.getByText('Insufficient Evidence')).toBeInTheDocument();
  });

  it('3. Evidence reference button is clickable and scrolls turn into view', () => {
    const scrollIntoViewMock = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    render(<InterviewReport report={mockReport} onRestart={() => {}} />);

    const evidenceBtn = screen.getByText('View Source ↵');
    expect(evidenceBtn).toBeInTheDocument();
    fireEvent.click(evidenceBtn);

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it('4. Missing feedback omits the feedback panel for that question', () => {
    render(<InterviewReport report={mockReport} onRestart={() => {}} />);

    expect(screen.getByText('Strong problem framing.')).toBeInTheDocument();
    // Second question has feedback: null, so zero feedback panel should render for Q2
    expect(screen.queryByText('Candidate response recorded and evaluated.')).not.toBeInTheDocument();
  });

  it('5. Challenge/recovery timeline renders only when populated', () => {
    const { rerender } = render(<InterviewReport report={mockReport} onRestart={() => {}} />);

    expect(screen.getByText('Response to Challenge & Recovery Trajectory')).toBeInTheDocument();
    expect(screen.getByText('Pushback: counterargument')).toBeInTheDocument();
    expect(screen.getByText('improved')).toBeInTheDocument();

    const emptyReport = { ...mockReport, challengeRecoveryTimeline: undefined };
    rerender(<InterviewReport report={emptyReport} onRestart={() => {}} />);

    expect(screen.queryByText('Response to Challenge & Recovery Trajectory')).not.toBeInTheDocument();
  });

  it('6. Asserts zero forbidden verdict/hire text or filler strings', () => {
    const { container } = render(<InterviewReport report={mockReport} onRestart={() => {}} />);
    const text = container.textContent || '';

    expect(text).not.toMatch(/Interviewer Verdict/i);
    expect(text).not.toMatch(/hire\/no-hire/i);
    expect(text).not.toMatch(/Candidate response recorded and evaluated/i);
    expect(text).not.toMatch(/Focus on explicit problem framing and trade-off justification/i);
  });
});
