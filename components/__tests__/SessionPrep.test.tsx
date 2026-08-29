import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { InterviewSetupDraft, SessionControls } from 'mockmate-shared';
import * as mockGeminiService from '../../services/mockGeminiService';
import SessionPrep from '../SessionPrep';

jest.mock('../../services/mockGeminiService', () => ({
  calibrateIntent: jest.fn(),
  generateInterviewPlan: jest.fn(),
}));
jest.mock('../../services/audioService', () => ({
  audioService: { playStart: jest.fn(), playEnd: jest.fn(), playConfirm: jest.fn() },
}));
jest.mock('../PanelSelector', () => ({ __esModule: true, default: () => <div>Panel selector</div> }));
jest.mock('../SessionControlsEditor', () => ({ __esModule: true, default: () => <div>Session controls</div> }));
jest.mock('../SessionBuilder', () => ({ __esModule: true, default: () => <div>Your interview plan</div> }));

const controls: SessionControls = {
  difficulty: 'intermediate',
  totalQuestions: 5,
  includeBehavioral: true,
  includeCoding: false,
  timePerQuestion: '90s',
  deliveryMode: 'exam',
  reasoningMode: 'classic_behavioral',
  sourceMode: 'job_description',
};

const draft = {
  candidateRole: 'Product manager',
  intentText: 'Practice product management interviews',
  selectedPanelIDs: ['p1'],
  sessionType: 'structured',
  controls,
} as InterviewSetupDraft;

const mockedService = mockGeminiService as jest.Mocked<typeof mockGeminiService>;

describe('Interview plan authority failures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedService.calibrateIntent.mockResolvedValue({
      recommendedRole: 'Product manager',
      recommendedPanelIDs: ['p1'],
      matchReasons: {},
      fallbackUsed: false,
    });
  });

  it('fails closed and offers retry instead of minting a browser fallback plan', async () => {
    mockedService.generateInterviewPlan.mockRejectedValue(new Error('provider unavailable'));
    render(<SessionPrep draft={draft} onContextReady={jest.fn()} onGoBack={jest.fn()} />);

    const generate = await screen.findByRole('button', { name: 'Generate Practice Plan' });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not generate an authoritative interview plan/i);
    expect(screen.queryByText('Your interview plan')).not.toBeInTheDocument();
    expect(generate).toBeEnabled();
  });
});
