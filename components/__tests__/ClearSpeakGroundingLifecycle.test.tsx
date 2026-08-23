import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClearSpeakDashboard from '../clearspeak/ClearSpeakDashboard';
import { getCapabilities, getProfile, getProgress } from '../../services/clearSpeakService';

jest.mock('../../services/clearSpeakService', () => ({
  getProfile: jest.fn().mockResolvedValue({ role: 'general_corporate', practiceDuration: 3 }),
  getProgress: jest.fn().mockResolvedValue({ streak: 0, clarityTrend: [], totalSessionsCompleted: 0 }),
  getCapabilities: jest.fn().mockResolvedValue({
    standardSessionScoringAvailable: true,
    scoreEvidenceBasis: 'transcript_timing_heuristic',
    pronunciationAssessmentAvailable: false,
  }),
}));

jest.mock('../clearspeak/ClearSpeakSession', () => ({
  __esModule: true,
  default: ({ onCanonicalGroundedScore, onScoreCommitStateChange, grounding }: any) => (
    <div>
      {grounding && <button onClick={() => onCanonicalGroundedScore?.(grounding.bridge.id)}>canonical score</button>}
      <button>failed score</button>
      <button onClick={() => onScoreCommitStateChange?.(true)}>start score commit</button>
      <button onClick={() => onScoreCommitStateChange?.(false)}>finish score commit</button>
    </div>
  ),
}));

const grounding = {
  snapshot: { id: '11111111-1111-4111-8111-111111111111' },
  bridge: { id: '22222222-2222-4222-8222-222222222222' },
} as any;

describe('Resume to ClearSpeak one-time grounding lifecycle', () => {
  beforeEach(() => {
    (getProfile as jest.Mock).mockResolvedValue({ role: 'general_corporate', practiceDuration: 3 });
    (getProgress as jest.Mock).mockResolvedValue({ streak: 0, clarityTrend: [], totalSessionsCompleted: 0, scoreEvidenceBasis: null });
    (getCapabilities as jest.Mock).mockResolvedValue({
      standardSessionScoringAvailable: true,
      scoreEvidenceBasis: 'transcript_timing_heuristic',
      pronunciationAssessmentAvailable: false,
    });
  });

  it('notifies the application exactly once at canonical score completion', async () => {
    const onGroundingConsumed = jest.fn();
    render(
      <ClearSpeakDashboard
        grounding={grounding}
        onGroundingConsumed={onGroundingConsumed}
        onInterviewBridge={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText("Start today's scored practice")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Start today's scored practice"));
    fireEvent.click(screen.getByText('canonical score'));
    fireEvent.click(screen.getByText('canonical score'));

    expect(onGroundingConsumed).toHaveBeenCalledTimes(1);
    expect(onGroundingConsumed).toHaveBeenCalledWith(grounding.bridge.id);
  });

  it('does not clear valid authority for an incomplete or failed score', async () => {
    const onGroundingConsumed = jest.fn();
    render(
      <ClearSpeakDashboard
        grounding={grounding}
        onGroundingConsumed={onGroundingConsumed}
        onInterviewBridge={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText("Start today's scored practice")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Start today's scored practice"));
    fireEvent.click(screen.getByText('failed score'));
    expect(onGroundingConsumed).not.toHaveBeenCalled();
  });

  it('disables scored practice without consuming quota while retaining reference-style practice', async () => {
    (getCapabilities as jest.Mock).mockResolvedValue({
      standardSessionScoringAvailable: false,
      scoreEvidenceBasis: null,
      pronunciationAssessmentAvailable: false,
    });

    render(<ClearSpeakDashboard onInterviewBridge={jest.fn()} />);

    const disabledAction = await screen.findByRole('button', { name: 'Scored practice temporarily unavailable' });
    expect(disabledAction).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Practice UK / US reference styles' })).toBeEnabled();
    expect(screen.getByText(/No quota or progress will be changed/i)).toBeInTheDocument();
  });

  it('shows a retryable load error instead of impersonating first-time onboarding', async () => {
    (getProfile as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable'));
    render(<ClearSpeakDashboard onInterviewBridge={jest.fn()} />);

    expect(await screen.findByText('Speaking practice did not load')).toBeInTheDocument();
    expect(screen.getByText('Network unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('forwards score commit state so App can block global navigation', async () => {
    const onScoreCommitStateChange = jest.fn();
    render(
      <ClearSpeakDashboard
        onInterviewBridge={jest.fn()}
        onScoreCommitStateChange={onScoreCommitStateChange}
      />,
    );

    fireEvent.click(await screen.findByText("Start today's scored practice"));
    fireEvent.click(screen.getByText('start score commit'));
    fireEvent.click(screen.getByText('finish score commit'));
    expect(onScoreCommitStateChange.mock.calls).toEqual([[true], [false]]);
  });
});
