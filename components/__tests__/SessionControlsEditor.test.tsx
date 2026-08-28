import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SessionControls } from 'mockmate-shared';
import SessionControlsEditor from '../SessionControlsEditor';

const controls: SessionControls = {
  difficulty: 'intermediate',
  totalQuestions: 5,
  includeBehavioral: true,
  includeCoding: false,
  timePerQuestion: '90s',
  deliveryMode: 'exam',
  reasoningMode: 'classic_behavioral',
  sourceMode: 'question_bank',
};

describe('Session controls accessibility', () => {
  it('names each switch and activates it exactly once', () => {
    const onChange = jest.fn();
    render(<SessionControlsEditor controls={controls} onChange={onChange} />);

    const coachMode = screen.getByRole('switch', { name: 'Coach mode' });
    const codingQuestions = screen.getByRole('switch', { name: 'Coding questions' });
    expect(coachMode).toHaveAttribute('aria-checked', 'false');
    expect(codingQuestions).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(coachMode);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ deliveryMode: 'coach' }));
  });
});
