import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import GrowthDashboard, { journalScoreLabel } from '../GrowthDashboard';
import { getSessionHistory } from '../../services/storageService';

jest.mock('../../services/storageService', () => ({ getSessionHistory: jest.fn() }));
jest.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

describe('GrowthDashboard score truth', () => {
  it('renders an explicit unscored state instead of null /100', () => {
    (getSessionHistory as jest.Mock).mockReturnValue([{
      id: 'interview_unscored',
      timestamp: Date.now(),
      role: 'Engineer',
      avgScore: null,
      readinessStatus: 'NOT_ASSESSED',
      biggestRisk: 'No scored risk',
      sessionType: 'structured',
      fullReport: {},
    }]);

    render(<GrowthDashboard onBack={jest.fn()} onViewReport={jest.fn()} />);

    expect(screen.getByText('Not scored')).toBeInTheDocument();
    expect(screen.queryByText(/null\s*\/100/i)).not.toBeInTheDocument();
    expect(journalScoreLabel(null)).toBe('Not scored');
  });
});
