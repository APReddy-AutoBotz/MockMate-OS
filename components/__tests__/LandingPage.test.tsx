import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LandingPage from '../LandingPage';

describe('public landing content', () => {
  it('describes the real product without invented metrics or beta access language', () => {
    const onGetStarted = jest.fn();
    const onOpenPrivacy = jest.fn();

    const { container } = render(
      <LandingPage
        onGetStarted={onGetStarted}
        onOpenPrivacy={onOpenPrivacy}
        onOpenTerms={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: /practice the parts of job hunting/i })).toBeInTheDocument();
    expect(screen.getByText(/available to every signed-in user/i)).toBeInTheDocument();
    expect(screen.getByText(/mockmate never invents a speech score/i)).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/controlled beta|approved tester|100% private|readiness index/i);
    expect(container).not.toHaveTextContent(/68\s*→\s*89|84%|88%|82%|180\+?\s*wpm/i);

    fireEvent.click(screen.getAllByRole('button', { name: /start free practice/i })[0]);
    expect(onGetStarted).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole('button', { name: /read the privacy policy/i })[0]);
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
  });
});
