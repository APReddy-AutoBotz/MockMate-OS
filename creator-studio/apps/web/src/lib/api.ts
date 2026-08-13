import { z } from 'zod';

export const SaveArtifactRequest = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(['content', 'script']),
  text: z.string().trim().min(1).max(100_000),
  idempotencyKey: z.string().min(8).max(160)
}).strict();

export const ReviewRequest = z.object({
  projectId: z.string().uuid(), artifactId: z.string().uuid(),
  artifactVersion: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(['approved', 'revision_requested']), notes: z.string().max(4000).optional(),
  idempotencyKey: z.string().min(8).max(160)
}).strict();
