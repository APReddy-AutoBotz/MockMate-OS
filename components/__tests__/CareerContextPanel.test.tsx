import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CareerContextPanel from '../CareerContextPanel';
import { fetchCareerContext, rebuildCareerContext } from '../../services/careerContextService';

jest.mock('../../services/careerContextService', () => ({
  fetchCareerContext: jest.fn(),
  rebuildCareerContext: jest.fn(),
  applyItemDecision: jest.fn(),
  setPersonalizationPreference: jest.fn(),
}));

const context = (version: number) => ({
  success: true,
  state: { userId: '11111111-1111-4111-8111-111111111111', contextVersion: version, personalizationEnabled: false, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' },
  activeItems: [],
  pendingItems: [],
  conflicts: [],
});

describe('CareerContextPanel rebuild authority', () => {
  beforeEach(() => jest.clearAllMocks());

  it('performs the authoritative rebuild mutation once before refreshing persisted state', async () => {
    (fetchCareerContext as jest.Mock)
      .mockResolvedValueOnce(context(1))
      .mockResolvedValueOnce(context(2));
    let resolveRebuild!: () => void;
    (rebuildCareerContext as jest.Mock).mockImplementation(() => new Promise<void>(resolve => { resolveRebuild = resolve; }));

    render(<CareerContextPanel onBack={jest.fn()} />);
    await screen.findByText('v1');
    const button = screen.getByRole('button', { name: 'Rebuild Context' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(rebuildCareerContext).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(fetchCareerContext).toHaveBeenCalledTimes(1);
    resolveRebuild();
    await waitFor(() => expect(fetchCareerContext).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('v2')).toBeInTheDocument();
  });

  it('shows rebuild failures and does not present a refreshed success state', async () => {
    (fetchCareerContext as jest.Mock).mockResolvedValue(context(3));
    (rebuildCareerContext as jest.Mock).mockRejectedValue(new Error('Authoritative persistence unavailable'));

    render(<CareerContextPanel onBack={jest.fn()} />);
    await screen.findByText('v3');
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild Context' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Authoritative persistence unavailable');
    expect(fetchCareerContext).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Rebuild Context' })).toBeEnabled();
  });
});
