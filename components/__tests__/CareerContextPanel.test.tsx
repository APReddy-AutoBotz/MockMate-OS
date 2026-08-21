import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CareerContextPanel from '../CareerContextPanel';
import {
  applyItemDecision,
  fetchCareerContext,
  rebuildCareerContext,
  setPersonalizationPreference,
} from '../../services/careerContextService';

jest.mock('../../services/careerContextService', () => ({
  fetchCareerContext: jest.fn(),
  rebuildCareerContext: jest.fn(),
  applyItemDecision: jest.fn(),
  setPersonalizationPreference: jest.fn(),
}));

const context = (version: number) => ({
  success: true,
  state: {
    userId: '11111111-1111-4111-8111-111111111111',
    contextVersion: version,
    personalizationEnabled: false,
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
  activeItems: [],
  pendingItems: [],
  conflicts: [],
});

const contextWithItem = () => ({
  ...context(7),
  activeItems: [{
    id: '22222222-2222-4222-8222-222222222222',
    userId: '11111111-1111-4111-8111-111111111111',
    kind: 'skill',
    canonicalKey: 'skill:typescript',
    label: 'TypeScript',
    value: { type: 'string_list', values: ['TypeScript'] },
    source: {
      module: 'resume',
      recordId: 'resume-1',
      fieldPath: 'skills[0]',
      sourceRevision: '1',
      sourceHash: 'source-hash',
      capturedAt: '2026-08-10T00:00:00.000Z',
    },
    provenance: 'user_confirmed',
    status: 'active',
    sensitivity: 'standard',
    exactExcerpt: 'Built TypeScript services',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    userConfirmedAt: '2026-08-10T00:00:00.000Z',
  }],
});

describe('CareerContextPanel authority and fail-visible UX', () => {
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

  it('shows a retryable load error instead of an empty-context message', async () => {
    (fetchCareerContext as jest.Mock).mockRejectedValueOnce(new Error('Context service unavailable'));

    render(<CareerContextPanel onBack={jest.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load career context/i);
    expect(screen.queryByText(/no stored career context items found/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry loading/i })).toBeEnabled();
  });

  it('surfaces item and personalization mutation failures to the user', async () => {
    (fetchCareerContext as jest.Mock).mockResolvedValue(contextWithItem());
    (applyItemDecision as jest.Mock).mockRejectedValue(new Error('Version changed; refresh required'));
    (setPersonalizationPreference as jest.Mock).mockRejectedValue(new Error('Preference update unavailable'));

    render(<CareerContextPanel onBack={jest.fn()} />);
    expect(await screen.findByText('TypeScript')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /revoke typescript/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/version changed; refresh required/i);

    fireEvent.click(screen.getByRole('button', { name: /toggle practice evidence personalization/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/preference update unavailable/i));
  });
});
