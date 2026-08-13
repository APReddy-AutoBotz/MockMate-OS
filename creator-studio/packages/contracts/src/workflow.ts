import { z } from 'zod';

export const WorkflowStageSchema = z.enum([
  'CONTENT_REVIEW', 'CONTENT_APPROVED',
  'SCRIPT_GENERATING', 'SCRIPT_REVIEW', 'SCRIPT_APPROVED',
  'VOICE_GENERATING', 'VOICE_REVIEW', 'VOICE_APPROVED',
  'AVATAR_GENERATING', 'AVATAR_REVIEW', 'AVATAR_APPROVED',
  'EDIT_GENERATING', 'EDIT_REVIEW', 'EDIT_APPROVED',
  'FINAL_RENDERING', 'FINAL_REVIEW', 'FINAL_APPROVED'
]);
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;
export const WORKFLOW_STAGES = WorkflowStageSchema.options;

export const ActorKindSchema = z.enum(['human', 'worker']);
export type ActorKind = z.infer<typeof ActorKindSchema>;

export const WorkflowEventSchema = z.enum([
  'APPROVE_CONTENT', 'START_SCRIPT', 'SCRIPT_READY', 'APPROVE_SCRIPT',
  'START_VOICE', 'VOICE_READY', 'APPROVE_VOICE',
  'START_AVATAR', 'AVATAR_READY', 'APPROVE_AVATAR',
  'START_EDIT', 'EDIT_READY', 'APPROVE_EDIT',
  'START_FINAL', 'FINAL_READY', 'APPROVE_FINAL'
]);
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

type Rule = Readonly<{ from: WorkflowStage; event: WorkflowEvent; to: WorkflowStage; actor: ActorKind }>;

export const TRANSITION_RULES: readonly Rule[] = [
  { from: 'CONTENT_REVIEW', event: 'APPROVE_CONTENT', to: 'CONTENT_APPROVED', actor: 'human' },
  { from: 'CONTENT_APPROVED', event: 'START_SCRIPT', to: 'SCRIPT_GENERATING', actor: 'human' },
  { from: 'SCRIPT_GENERATING', event: 'SCRIPT_READY', to: 'SCRIPT_REVIEW', actor: 'worker' },
  { from: 'SCRIPT_REVIEW', event: 'APPROVE_SCRIPT', to: 'SCRIPT_APPROVED', actor: 'human' },
  { from: 'SCRIPT_APPROVED', event: 'START_VOICE', to: 'VOICE_GENERATING', actor: 'human' },
  { from: 'VOICE_GENERATING', event: 'VOICE_READY', to: 'VOICE_REVIEW', actor: 'worker' },
  { from: 'VOICE_REVIEW', event: 'APPROVE_VOICE', to: 'VOICE_APPROVED', actor: 'human' },
  { from: 'VOICE_APPROVED', event: 'START_AVATAR', to: 'AVATAR_GENERATING', actor: 'human' },
  { from: 'AVATAR_GENERATING', event: 'AVATAR_READY', to: 'AVATAR_REVIEW', actor: 'worker' },
  { from: 'AVATAR_REVIEW', event: 'APPROVE_AVATAR', to: 'AVATAR_APPROVED', actor: 'human' },
  { from: 'AVATAR_APPROVED', event: 'START_EDIT', to: 'EDIT_GENERATING', actor: 'human' },
  { from: 'EDIT_GENERATING', event: 'EDIT_READY', to: 'EDIT_REVIEW', actor: 'worker' },
  { from: 'EDIT_REVIEW', event: 'APPROVE_EDIT', to: 'EDIT_APPROVED', actor: 'human' },
  { from: 'EDIT_APPROVED', event: 'START_FINAL', to: 'FINAL_RENDERING', actor: 'human' },
  { from: 'FINAL_RENDERING', event: 'FINAL_READY', to: 'FINAL_REVIEW', actor: 'worker' },
  { from: 'FINAL_REVIEW', event: 'APPROVE_FINAL', to: 'FINAL_APPROVED', actor: 'human' }
] as const;

export class InvalidWorkflowTransition extends Error {
  readonly code = 'INVALID_WORKFLOW_TRANSITION';
  constructor() { super('The requested workflow transition is not allowed.'); }
}

export function transitionStage(current: WorkflowStage, event: WorkflowEvent, actor: ActorKind): WorkflowStage {
  const rule = TRANSITION_RULES.find(item => item.from === current && item.event === event && item.actor === actor);
  if (!rule) throw new InvalidWorkflowTransition();
  return rule.to;
}

export const ApprovalBindingSchema = z.object({
  artifactId: z.string().uuid(),
  artifactVersion: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewerId: z.string().uuid(),
  reviewedAt: z.string().datetime(),
  decision: z.literal('approved')
}).strict();

export type ApprovalBinding = z.infer<typeof ApprovalBindingSchema>;

export type ArtifactSnapshot = Readonly<{
  id: string;
  kind: 'content' | 'script' | 'voice' | 'avatar' | 'edit' | 'final';
  version: number;
  sha256: string;
  stale: boolean;
}>;

export function approvalMatchesArtifact(approval: ApprovalBinding, artifact: ArtifactSnapshot): boolean {
  return !artifact.stale
    && approval.artifactId === artifact.id
    && approval.artifactVersion === artifact.version
    && approval.sha256 === artifact.sha256;
}

const downstreamKinds: ArtifactSnapshot['kind'][] = ['content', 'script', 'voice', 'avatar', 'edit', 'final'];

export function invalidateDownstream(
  artifacts: readonly ArtifactSnapshot[],
  revisedKind: ArtifactSnapshot['kind']
): ArtifactSnapshot[] {
  const boundary = downstreamKinds.indexOf(revisedKind);
  return artifacts.map((artifact) => downstreamKinds.indexOf(artifact.kind) > boundary
    ? { ...artifact, stale: true }
    : artifact);
}
