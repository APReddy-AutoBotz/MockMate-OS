import { describe, expect, it } from 'vitest';

import {
  CreateProjectInputSchema,
  TransitionInputSchema,
  approvalMatchesArtifact,
  invalidateDownstreamArtifacts,
  transitionStage,
  type ReviewableArtifact,
} from './workflow';

const contentId = '00000000-0000-4000-8000-000000000001';
const scriptId = '00000000-0000-4000-8000-000000000002';
const digestA = 'a'.repeat(64);
const digestB = 'b'.repeat(64);

const contentArtifact: ReviewableArtifact = {
  id: contentId,
  kind: 'content',
  version: 2,
  sha256: digestA,
  staleAt: null,
};

const scriptArtifact: ReviewableArtifact = {
  id: scriptId,
  kind: 'script',
  version: 1,
  sha256: digestB,
  staleAt: null,
};

describe('M1 workflow authority contracts', () => {
  it('allows a human to approve reviewed content', () => {
    expect(transitionStage('CONTENT_REVIEW', 'APPROVE_CONTENT', 'human')).toBe('CONTENT_APPROVED');
  });

  it('does not allow a worker to approve human-reviewed content', () => {
    expect(() => transitionStage('CONTENT_REVIEW', 'APPROVE_CONTENT', 'worker'))
      .toThrow('The requested workflow transition is not allowed.');
  });

  it('does not permit stage skipping', () => {
    expect(() => transitionStage('CONTENT_REVIEW', 'START_VOICE', 'human'))
      .toThrow('The requested workflow transition is not allowed.');
  });

  it('keeps artifact-ready transitions worker-only', () => {
    expect(transitionStage('SCRIPT_GENERATING', 'SCRIPT_READY', 'worker')).toBe('SCRIPT_REVIEW');
    expect(() => transitionStage('SCRIPT_GENERATING', 'SCRIPT_READY', 'human'))
      .toThrow('The requested workflow transition is not allowed.');
  });

  it('binds approval to the exact active artifact ID, version and digest', () => {
    expect(approvalMatchesArtifact({
      artifactId: contentId,
      artifactVersion: 2,
      sha256: digestA,
    }, contentArtifact)).toBe(true);

    expect(approvalMatchesArtifact({
      artifactId: contentId,
      artifactVersion: 1,
      sha256: digestA,
    }, contentArtifact)).toBe(false);

    expect(approvalMatchesArtifact({
      artifactId: contentId,
      artifactVersion: 2,
      sha256: digestB,
    }, contentArtifact)).toBe(false);
  });

  it('rejects an otherwise exact approval when the artifact is stale', () => {
    expect(approvalMatchesArtifact({
      artifactId: contentId,
      artifactVersion: 2,
      sha256: digestA,
    }, { ...contentArtifact, staleAt: '2026-08-13T08:00:00.000Z' })).toBe(false);
  });

  it('invalidates downstream artifacts without mutating evidence objects', () => {
    const original = [contentArtifact, scriptArtifact] as const;
    const invalidatedAt = '2026-08-13T08:00:00.000Z';
    const next = invalidateDownstreamArtifacts(original, 'content', invalidatedAt);

    expect(next[0]?.staleAt).toBeNull();
    expect(next[1]?.staleAt).toBe(invalidatedAt);
    expect(original[1]?.staleAt).toBeNull();
  });

  it('rejects client-supplied owner fields', () => {
    expect(CreateProjectInputSchema.safeParse({
      title: 'Controlled video',
      clientRequestId: '00000000-0000-4000-8000-000000000099',
      ownerId: '00000000-0000-4000-8000-000000000098',
    }).success).toBe(false);
  });

  it('requires exact artifact binding for approval events', () => {
    expect(TransitionInputSchema.safeParse({
      expectedStage: 'CONTENT_REVIEW',
      event: 'APPROVE_CONTENT',
      idempotencyKey: '00000000-0000-4000-8000-000000000097',
    }).success).toBe(false);
  });

  it('accepts a correctly bound approval command', () => {
    expect(TransitionInputSchema.safeParse({
      expectedStage: 'CONTENT_REVIEW',
      event: 'APPROVE_CONTENT',
      artifactId: contentId,
      artifactSha256: digestA,
      idempotencyKey: '00000000-0000-4000-8000-000000000096',
      notes: 'Reviewed by the owner.',
    }).success).toBe(true);
  });
});
