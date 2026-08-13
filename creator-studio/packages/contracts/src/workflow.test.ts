import { describe, expect, it } from 'vitest';
import { InvalidWorkflowTransition, transitionStage } from './workflow';

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
