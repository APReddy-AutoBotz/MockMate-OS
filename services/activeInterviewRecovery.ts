import { z } from 'zod';

const ACTIVE_INTERVIEW_KEY = 'mockmate_active_interview';
const MAX_REFERENCE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

const ActiveInterviewReferenceSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1),
  savedAt: z.number().int().positive(),
}).strict();

export function saveActiveInterviewReference(sessionId: string): void {
  localStorage.setItem(ACTIVE_INTERVIEW_KEY, JSON.stringify({
    version: 1,
    sessionId,
    savedAt: Date.now(),
  }));
}

export function readActiveInterviewReference(): { sessionId: string } | null {
  try {
    const parsed = ActiveInterviewReferenceSchema.safeParse(JSON.parse(localStorage.getItem(ACTIVE_INTERVIEW_KEY) || 'null'));
    const age = parsed.success ? Date.now() - parsed.data.savedAt : Number.POSITIVE_INFINITY;
    if (!parsed.success || age > MAX_REFERENCE_AGE_MS || age < -MAX_FUTURE_CLOCK_SKEW_MS) {
      clearActiveInterviewReference();
      return null;
    }
    return { sessionId: parsed.data.sessionId };
  } catch {
    clearActiveInterviewReference();
    return null;
  }
}

export function clearActiveInterviewReference(): void {
  localStorage.removeItem(ACTIVE_INTERVIEW_KEY);
}
