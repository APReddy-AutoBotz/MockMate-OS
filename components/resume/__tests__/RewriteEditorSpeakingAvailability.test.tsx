import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RewriteEditorScreen from '../RewriteEditorScreen';

jest.mock('../../../services/apiClient', () => ({
  apiClient: { post: jest.fn() },
  ApiError: class ApiError extends Error { status = 500; },
}));

const resumeData = {
  basics: { name: 'Asha', email: '', phone: '', location: '', links: [] },
  summary: 'Platform engineer focused on reliable delivery.',
  skills: [],
  experience: [],
  education: [],
  projects: [],
} as any;

describe('Resume speaking-practice capability gate', () => {
  it('does not expose the grounded handoff when scored delivery is unavailable', () => {
    render(
      <RewriteEditorScreen
        resumeData={resumeData}
        jdText=""
        onProceed={jest.fn()}
        onBack={jest.fn()}
        onSpeakBridge={jest.fn()}
        speakingPracticeAvailable={false}
      />,
    );

    expect(screen.queryByRole('button', { name: /practice speaking/i })).not.toBeInTheDocument();
  });

  it('exposes the handoff only when available and passes the current summary', () => {
    const onSpeakBridge = jest.fn();
    render(
      <RewriteEditorScreen
        resumeData={resumeData}
        jdText=""
        onProceed={jest.fn()}
        onBack={jest.fn()}
        onSpeakBridge={onSpeakBridge}
        speakingPracticeAvailable
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /practice speaking/i }));
    expect(onSpeakBridge).toHaveBeenCalledTimes(1);
    expect(onSpeakBridge).toHaveBeenCalledWith(resumeData.summary);
  });
});
