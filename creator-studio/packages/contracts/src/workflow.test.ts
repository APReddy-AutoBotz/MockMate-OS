import { describe, expect, it } from 'vitest';
import { approvalMatchesArtifact, InvalidWorkflowTransition, invalidateDownstream, transitionStage } from './workflow';

describe('human-gated workflow', () => {
  it('allows a human to approve content', () => {
    expect(transitionStage('CONTENT_REVIEW', 'APPROVE_CONTENT', 'human')).toBe('CONTENT_APPROVED');
  });

  it('prevents a worker from approving content', () => {
    expect(() => transitionStage('CONTENT_REVIEW', 'APPROVE_CONTENT', 'worker')).toThrow(InvalidWorkflowTransition);
  });

  it('prevents stage skipping', () => {
    expect(() => transitionStage('CONTENT_REVIEW', 'START_VOICE', 'human')).toThrow(InvalidWorkflowTransition);
  });

  it('requires worker authority for generated-artifact readiness', () => {
    expect(() => transitionStage('SCRIPT_GENERATING', 'SCRIPT_READY', 'human')).toThrow(InvalidWorkflowTransition);
    expect(transitionStage('SCRIPT_GENERATING', 'SCRIPT_READY', 'worker')).toBe('SCRIPT_REVIEW');
  });
});

describe('immutable approval bindings', () => {
  const approval = {
    artifactId: '11111111-1111-1111-1111-111111111111', artifactVersion: 1,
    sha256: 'a'.repeat(64), reviewerId: '22222222-2222-2222-2222-222222222222',
    reviewedAt: '2026-08-13T00:00:00.000Z', decision: 'approved' as const
  };

  it('binds approval to the exact non-stale version and digest', () => {
    expect(approvalMatchesArtifact(approval, { id: approval.artifactId, kind: 'content', version: 1, sha256: approval.sha256, stale: false })).toBe(true);
    expect(approvalMatchesArtifact(approval, { id: approval.artifactId, kind: 'content', version: 2, sha256: approval.sha256, stale: false })).toBe(false);
    expect(approvalMatchesArtifact(approval, { id: approval.artifactId, kind: 'content', version: 1, sha256: approval.sha256, stale: true })).toBe(false);
  });

  it('invalidates every downstream kind only', () => {
    const artifacts = ['content', 'script', 'voice', 'final'].map((kind, index) => ({ id: String(index), kind: kind as 'content' | 'script' | 'voice' | 'final', version: 1, sha256: 'a'.repeat(64), stale: false }));
    expect(invalidateDownstream(artifacts, 'content').map((item) => item.stale)).toEqual([false, true, true, true]);
  });
});
