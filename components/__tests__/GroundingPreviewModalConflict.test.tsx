import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import GroundingPreviewModal from '../GroundingPreviewModal';

const contextItem = (id: string, label: string) => ({
  id,
  userId: '11111111-1111-4111-8111-111111111111',
  kind: 'target_role',
  canonicalKey: 'resume.target_role',
  label,
  value: { type: 'text', text: label },
  source: { module: 'resume', recordId: 'resume-1', fieldPath: 'role', sourceRevision: 'v1', sourceHash: id, capturedAt: '2026-08-10T00:00:00Z' },
  exactExcerpt: label,
  provenance: 'user_confirmed',
  status: 'active',
  sensitivity: 'standard',
  createdAt: '2026-08-10T00:00:00Z',
  updatedAt: '2026-08-10T00:00:00Z',
} as const);

describe('GroundingPreviewModal conflict authority', () => {
  it('submits the actual winner-only payload used by a grounded launch', () => {
    const onConfirm = jest.fn();
    const winner = contextItem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Platform Engineer');
    const rejected = contextItem('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Security Engineer');
    render(<GroundingPreviewModal
      purpose="resume_to_interview"
      items={[winner, rejected] as any}
      conflicts={[{
        canonicalKey: 'resume.target_role',
        competingItemIds: [winner.id, rejected.id],
        descriptions: [winner.label, rejected.label],
        requiresUserChoice: true,
      }]}
      onConfirm={onConfirm}
      onSkip={jest.fn()}
      onClose={jest.fn()}
    />);

    fireEvent.click(screen.getByRole('radio', { name: winner.label }));
    fireEvent.click(screen.getByRole('button', { name: /continue with selected context/i }));

    expect(onConfirm).toHaveBeenCalledWith(
      [winner.id],
      'one_time',
      { 'resume.target_role': winner.id },
    );
  });
});
