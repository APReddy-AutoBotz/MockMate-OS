import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionBuilder from '../SessionBuilder';

const jdInsights = {
  source: 'question_bank',
  mustHaveSkills: ['Communication'],
  niceToHave: [],
  domains: [],
  tools: [],
  softSkills: [],
};

describe('Interview plan provenance', () => {
  it('discloses a server-returned provider-free plan and labels its source correctly', () => {
    render(
      <SessionBuilder
        jdInsights={jdInsights}
        planSource="deterministic_fallback"
        sourceMode="job_description"
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/standard question plan in use/i);
    expect(screen.getByText('Question bank')).toBeInTheDocument();
    expect(screen.queryByText('JD analysis')).not.toBeInTheDocument();
  });

  it('uses the selected question-bank source for a provider plan without fallback copy', () => {
    render(
      <SessionBuilder
        jdInsights={{ ...jdInsights, source: 'job_description' }}
        planSource="provider"
        sourceMode="question_bank"
      />,
    );

    expect(screen.getByText('Question bank')).toBeInTheDocument();
    expect(screen.queryByText(/standard question plan in use/i)).not.toBeInTheDocument();
  });
});
