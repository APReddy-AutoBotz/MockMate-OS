import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClearSpeakDashboard from '../clearspeak/ClearSpeakDashboard';

jest.mock('../../services/clearSpeakService', () => ({
  getProfile: jest.fn().mockResolvedValue({ role: 'general_corporate', practiceDuration: 3 }),
  getProgress: jest.fn().mockResolvedValue({ streak: 0, clarityTrend: [], totalSessionsCompleted: 0 }),
}));

jest.mock('../clearspeak/ClearSpeakSession', () => ({
  __esModule: true,
  default: ({ onCanonicalGroundedScore, grounding }: any) => (
    <div>
      <button onClick={() => onCanonicalGroundedScore?.(grounding.bridge.id)}>canonical score</button>
      <button>failed score</button>
    </div>
  ),
}));

const grounding = {
  snapshot: { id: '11111111-1111-4111-8111-111111111111' },
  bridge: { id: '22222222-2222-4222-8222-222222222222' },
} as any;

describe('Resume to ClearSpeak one-time grounding lifecycle', () => {
  it('notifies the application exactly once at canonical score completion', async () => {
    const onGroundingConsumed = jest.fn();
    render(
      <ClearSpeakDashboard
        grounding={grounding}
        onGroundingConsumed={onGroundingConsumed}
        onInterviewBridge={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText("Start today's practice")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Start today's practice"));
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

    await waitFor(() => expect(screen.getByText("Start today's practice")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Start today's practice"));
    fireEvent.click(screen.getByText('failed score'));
    expect(onGroundingConsumed).not.toHaveBeenCalled();
  });
});
