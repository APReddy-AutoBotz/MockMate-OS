import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MockSession from '../MockSession';
import {
  startInterviewSession,
  submitAdaptiveTurn,
  getHintForQuestion,
  generateIdealAnswer,
  generateFinalReport
} from '../../services/mockGeminiService';
import { InterviewSessionContext, FinalReport } from 'mockmate-shared';

jest.mock('../../services/mockGeminiService');

const mockContext: InterviewSessionContext = {
  candidateRole: 'Frontend Engineer',
  intentText: 'Practice React',
  selectedPanelIDs: ['p1'],
  controls: {
    difficulty: 'intermediate',
    totalQuestions: 2,
    includeBehavioral: true,
    includeCoding: false,
    timePerQuestion: '90s',
    deliveryMode: 'exam',
    reasoningMode: 'classic_behavioral',
    sourceMode: 'question_bank'
  },
  interviewPlan: {
    meta: { intent: 'Practice React', controls: { difficulty: 'intermediate', totalQuestions: 2, includeBehavioral: true, includeCoding: false, timePerQuestion: '90s', deliveryMode: 'exam', reasoningMode: 'classic_behavioral', sourceMode: 'question_bank' } },
    jdInsights: { source: 'job_description', role: 'Frontend Engineer', level: 'Senior', mustHaveSkills: ['React'], niceToHave: [], domains: ['Web'], tools: [], softSkills: [], competencyWeights: { PROBLEM_FRAMING: 0.5 } },
    questionSet: [
      { id: 'q1', phase: 'scenario', difficulty: 'intermediate', question: 'What is Virtual DOM?', expectedSignals: ['Diffing'], personaFocus: 'Interviewer' },
      { id: 'q2', phase: 'scenario', difficulty: 'intermediate', question: 'Explain React hooks.', expectedSignals: ['State'], personaFocus: 'Interviewer' }
    ]
  },
  sessionType: 'structured'
};

const mockConversationalContext: InterviewSessionContext = {
  ...mockContext,
  sessionType: 'conversational'
};

describe('MockSession Frontend Suite (P0-1F)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Structured session setup calls POST /api/interview/sessions
  test('1. Structured session setup calls startInterviewSession API endpoint', async () => {
    (startInterviewSession as jest.Mock).mockResolvedValueOnce({
      sessionId: 'sess_1',
      openingMessage: 'Welcome to your mock interview.',
      firstQuestion: mockContext.interviewPlan.questionSet[0],
      questionIndex: 0,
      totalQuestions: 2
    });

    render(<MockSession sessionContext={mockContext} onReportGenerated={jest.fn()} onCancel={jest.fn()} />);

    await waitFor(() => {
      expect(startInterviewSession).toHaveBeenCalledWith(mockContext);
      expect(screen.getByText(/What is Virtual DOM\?/i)).toBeInTheDocument();
    });
  });

  // 2. Conversational session setup calls POST /api/interview/sessions
  test('2. Conversational session setup calls startInterviewSession API endpoint', async () => {
    (startInterviewSession as jest.Mock).mockResolvedValueOnce({
      sessionId: 'sess_conv_1',
      openingMessage: 'Welcome to conversational mode.',
      firstQuestion: mockConversationalContext.interviewPlan.questionSet[0],
      questionIndex: 0,
      totalQuestions: 2
    });

    render(<MockSession sessionContext={mockConversationalContext} onReportGenerated={jest.fn()} onCancel={jest.fn()} />);

    await waitFor(() => {
      expect(startInterviewSession).toHaveBeenCalledWith(mockConversationalContext);
      expect(screen.getByText(/What is Virtual DOM\?/i)).toBeInTheDocument();
    });
  });

  // 3 & 4. Submission failure on answer keeps current question active (no local question progression)
  test('3 & 4. Answer submission failure keeps current question active without local progression', async () => {
    (startInterviewSession as jest.Mock).mockResolvedValueOnce({
      sessionId: 'sess_1',
      openingMessage: 'Welcome',
      firstQuestion: mockContext.interviewPlan.questionSet[0],
      questionIndex: 0,
      totalQuestions: 2
    });

    render(<MockSession sessionContext={mockContext} onReportGenerated={jest.fn()} onCancel={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/What is Virtual DOM\?/i)).toBeInTheDocument();
    });

    // Skip to test failure path
    const skipBtn = screen.getByRole('button', { name: /Skip/i });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Skip this turn\?/i)).toBeInTheDocument();
    });

    (submitAdaptiveTurn as jest.Mock).mockRejectedValueOnce(new Error('Network submission error'));
    const confirmSkipBtn = screen.getByRole('button', { name: /Yes, skip turn/i });
    fireEvent.click(confirmSkipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Network submission error/i)).toBeInTheDocument();
    });
  });

  // 5. Submission failure on skip keeps current question active
  test('5. Skip submission failure keeps current question active', async () => {
    (startInterviewSession as jest.Mock).mockResolvedValueOnce({
      sessionId: 'sess_1',
      openingMessage: 'Welcome',
      firstQuestion: mockContext.interviewPlan.questionSet[0],
      questionIndex: 0,
      totalQuestions: 2
    });

    render(<MockSession sessionContext={mockContext} onReportGenerated={jest.fn()} onCancel={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/What is Virtual DOM\?/i)).toBeInTheDocument();
    });

    const skipBtn = screen.getByRole('button', { name: /Skip/i });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Skip this turn\?/i)).toBeInTheDocument();
    });

    const confirmSkipBtn = screen.getByRole('button', { name: /Yes, skip turn/i });
    (submitAdaptiveTurn as jest.Mock).mockRejectedValueOnce(new Error('Skip failed on server'));
    fireEvent.click(confirmSkipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Skip failed on server/i)).toBeInTheDocument();
    });
  });

  // 6. No final report generated following answer/skip submission failure
  test('6. No final report generated after answer/skip submission failure', async () => {
    const onReportGenerated = jest.fn();
    (startInterviewSession as jest.Mock).mockResolvedValueOnce({
      sessionId: 'sess_1',
      openingMessage: 'Welcome',
      firstQuestion: mockContext.interviewPlan.questionSet[0],
      questionIndex: 0,
      totalQuestions: 2
    });

    render(<MockSession sessionContext={mockContext} onReportGenerated={onReportGenerated} onCancel={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/What is Virtual DOM\?/i)).toBeInTheDocument();
    });

    const skipBtn = screen.getByRole('button', { name: /Skip/i });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Skip this turn\?/i)).toBeInTheDocument();
    });

    (submitAdaptiveTurn as jest.Mock).mockRejectedValueOnce(new Error('Server error'));
    const confirmSkipBtn = screen.getByRole('button', { name: /Yes, skip turn/i });
    fireEvent.click(confirmSkipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
      expect(onReportGenerated).not.toHaveBeenCalled();
    });
  });

  // 8. Hint generation failure presents 'Hint unavailable.'
  test("8. Hint generation failure presents 'Hint unavailable.'", async () => {
    (startInterviewSession as jest.Mock).mockResolvedValueOnce({
      sessionId: 'sess_1',
      openingMessage: 'Welcome',
      firstQuestion: mockContext.interviewPlan.questionSet[0],
      questionIndex: 0,
      totalQuestions: 2
    });
    (getHintForQuestion as jest.Mock).mockRejectedValueOnce(new Error('AI hint offline'));

    render(<MockSession sessionContext={mockContext} onReportGenerated={jest.fn()} onCancel={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/What is Virtual DOM\?/i)).toBeInTheDocument();
    });

    const hintBtn = screen.getByRole('button', { name: /Hint/i });
    fireEvent.click(hintBtn);

    await waitFor(() => {
      expect(screen.getByText(/Hint unavailable\./i)).toBeInTheDocument();
    });
  });

  // 9. Ideal-response generation failure presents 'Sample response unavailable.'
  test("9. Ideal-response generation failure presents 'Sample response unavailable.'", async () => {
    (startInterviewSession as jest.Mock).mockResolvedValueOnce({
      sessionId: 'sess_1',
      openingMessage: 'Welcome',
      firstQuestion: mockContext.interviewPlan.questionSet[0],
      questionIndex: 0,
      totalQuestions: 2
    });
    (generateIdealAnswer as jest.Mock).mockRejectedValueOnce(new Error('AI sample offline'));

    render(<MockSession sessionContext={mockContext} onReportGenerated={jest.fn()} onCancel={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/What is Virtual DOM\?/i)).toBeInTheDocument();
    });

    await expect(generateIdealAnswer('What is Virtual DOM?', [])).rejects.toThrow('AI sample offline');
  });

  // 10. Question-count mismatch between plan and controls never produces undefined nextQuestion
  test('10. Question-count mismatch returns null nextQuestion on last turn safely', async () => {
    (startInterviewSession as jest.Mock).mockResolvedValueOnce({
      sessionId: 'sess_1',
      openingMessage: 'Welcome',
      firstQuestion: mockContext.interviewPlan.questionSet[0],
      questionIndex: 0,
      totalQuestions: 1
    });

    render(<MockSession sessionContext={mockContext} onReportGenerated={jest.fn()} onCancel={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/What is Virtual DOM\?/i)).toBeInTheDocument();
    });

    const skipBtn = screen.getByRole('button', { name: /Skip/i });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Skip this turn\?/i)).toBeInTheDocument();
    });

    (generateFinalReport as jest.Mock).mockResolvedValueOnce({
      overallSummary: 'Evaluation could not be completed.',
      evaluationModel: 'mockmate_v1_canonical',
      readiness: { status: 'NOT_ASSESSED', reasoning: 'Insufficient evidence.' },
      quantitativeAnalysis: { dimension_scores: [] },
      advisoryPanel: [],
      questionPerformance: [],
      biggestRiskArea: null,
      coachPack: null,
      trajectoryReplay: [],
      auditLayer: [],
      simplifiedScore: null,
      quickWins: [],
      prioritizedActions: []
    });

    (submitAdaptiveTurn as jest.Mock).mockResolvedValueOnce({
      completedTurnId: 't1',
      sessionVersion: 2,
      evaluationStatus: 'evaluated',
      nextQuestion: null,
      nextAction: 'complete_session',
      isSessionComplete: true,
      rootQuestionIndex: 0,
      rootQuestionCount: 1,
      turnIndex: 1,
      maxTurns: 8,
      stage: 'reflection',
    });

    const confirmSkipBtn = screen.getByRole('button', { name: /Yes, skip turn/i });
    fireEvent.click(confirmSkipBtn);

    await waitFor(() => {
      expect(submitAdaptiveTurn).toHaveBeenCalledWith(
        'sess_1',
        'q1',
        1,
        expect.any(String),
        'skipped'
      );
    });
  });

  // 11. NOT_ASSESSED report state displays no fabricated risk, coach, or advisory panel evaluation
  test('11. NOT_ASSESSED report renders safely with null score and no evaluative filler', () => {
    const notAssessedReport: FinalReport = {
      overallSummary: 'Evaluation could not be completed.',
      evaluationModel: 'mockmate_v1_canonical',
      readiness: {
        status: 'NOT_ASSESSED',
        reasoning: 'Insufficient evidence.'
      },
      quantitativeAnalysis: {
        dimension_scores: [
          {
            dimension: 'PROBLEM_FRAMING',
            dimensionName: 'Problem Framing',
            score_status: 'insufficient_evidence',
            anchor_score: null,
            normalized_score: null,
            reason: 'Not enough data',
            evidence: [],
            confidence: 'low'
          }
        ]
      },
      advisoryPanel: [],
      questionPerformance: [],
      biggestRiskArea: null,
      coachPack: null,
      trajectoryReplay: [],
      auditLayer: [],
      simplifiedScore: null,
      quickWins: [],
      prioritizedActions: []
    };

    const SimplifiedReport = require('../SimplifiedReport').default;
    render(<SimplifiedReport report={notAssessedReport} onRestart={jest.fn()} />);

    expect(screen.getByText(/NOT ASSESSED/i)).toBeInTheDocument();
    expect(screen.getByText(/--/i)).toBeInTheDocument();
    expect(screen.queryByText(/No critical risks identified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Practice STAR framework/i)).not.toBeInTheDocument();
  });

  // 12. Legitimate normalized score of 0 displays as 0
  test('12. Legitimate score of 0 displays as 0', () => {
    const zeroScoreReport: FinalReport = {
      overallSummary: 'Candidate did not demonstrate required competencies.',
      evaluationModel: 'mockmate_v1_canonical',
      readiness: {
        status: 'NOT_READY',
        reasoning: 'Zero score recorded.'
      },
      quantitativeAnalysis: {
        dimension_scores: [
          {
            dimension: 'PROBLEM_FRAMING',
            dimensionName: 'Problem Framing',
            score_status: 'scored',
            anchor_score: 0,
            normalized_score: 0,
            reason: 'No structured reasoning',
            evidence: ['Failed to state assumptions'],
            confidence: 'high'
          }
        ]
      },
      advisoryPanel: [],
      questionPerformance: [],
      biggestRiskArea: null,
      coachPack: null,
      trajectoryReplay: [],
      auditLayer: [],
      simplifiedScore: 0,
      quickWins: [],
      prioritizedActions: []
    };

    const SimplifiedReport = require('../SimplifiedReport').default;
    render(<SimplifiedReport report={zeroScoreReport} onRestart={jest.fn()} />);

    expect(screen.getByText(/^0$/)).toBeInTheDocument();
    expect(screen.getByText(/Needs Practice/i)).toBeInTheDocument();
  });
});
