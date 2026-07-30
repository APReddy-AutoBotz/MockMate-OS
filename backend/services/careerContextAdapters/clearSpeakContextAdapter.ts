import { ClearSpeakProfile, ClearSpeakSessionScore, CareerContextItem } from 'mockmate-shared';
import crypto from 'crypto';

export interface ClearSpeakAdapterInput {
  profile?: ClearSpeakProfile | null;
  sessionRecordId?: string;
  sessionScore?: ClearSpeakSessionScore | null;
  practicedWords?: string[];
  topicTag?: string;
  revision?: string;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export function buildClearSpeakContextItems(input: ClearSpeakAdapterInput): CareerContextItem[] {
  const { profile, sessionRecordId, sessionScore, practicedWords, topicTag, revision = 'v1' } = input;
  const items: CareerContextItem[] = [];
  const capturedAt = new Date().toISOString();

  // 1. Profile Role
  if (profile?.role) {
    const sourceHash = computeHash(profile.role);
    items.push({
      id: `ctx_cs_profile_${profile.userId || 'user'}_role`,
      kind: 'target_role',
      canonicalKey: 'clearspeak.profile.role',
      label: 'ClearSpeak Target Role',
      value: { type: 'text', text: profile.role },
      source: {
        module: 'clearspeak',
        recordId: profile.userId || 'profile',
        fieldPath: 'role',
        sourceRevision: revision,
        sourceHash,
        capturedAt,
      },
      exactExcerpt: profile.role,
      provenance: 'user_confirmed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  }

  // 2. Profile Goal & Audience Context
  if (profile?.goal) {
    items.push({
      id: `ctx_cs_profile_${profile.userId || 'user'}_goal`,
      kind: 'communication_goal',
      canonicalKey: 'clearspeak.profile.goal',
      label: 'ClearSpeak Goal',
      value: { type: 'text', text: profile.goal },
      source: {
        module: 'clearspeak',
        recordId: profile.userId || 'profile',
        fieldPath: 'goal',
        sourceRevision: revision,
        sourceHash: computeHash(profile.goal),
        capturedAt,
      },
      exactExcerpt: profile.goal,
      provenance: 'user_confirmed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  }

  if (profile?.audienceContext) {
    items.push({
      id: `ctx_cs_profile_${profile.userId || 'user'}_audience`,
      kind: 'audience_context',
      canonicalKey: 'clearspeak.profile.audience',
      label: 'Target Audience Context',
      value: { type: 'text', text: profile.audienceContext },
      source: {
        module: 'clearspeak',
        recordId: profile.userId || 'profile',
        fieldPath: 'audienceContext',
        sourceRevision: revision,
        sourceHash: computeHash(profile.audienceContext),
        capturedAt,
      },
      exactExcerpt: profile.audienceContext,
      provenance: 'user_confirmed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  }

  // 3. Practiced Vocabulary
  if (practicedWords && practicedWords.length > 0 && sessionRecordId) {
    items.push({
      id: `ctx_cs_sess_${sessionRecordId}_vocab`,
      kind: 'practiced_vocabulary',
      canonicalKey: 'clearspeak.practiced_vocab',
      label: `Practiced Vocabulary (${topicTag || 'General'})`,
      value: { type: 'string_list', values: practicedWords },
      source: {
        module: 'clearspeak',
        recordId: sessionRecordId,
        fieldPath: 'practicedWords',
        sourceRevision: revision,
        sourceHash: computeHash(practicedWords.join(',')),
        capturedAt,
      },
      exactExcerpt: practicedWords.join(', '),
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  }

  // 4. Speech Delivery Score (practice_metric - NEVER converted to Interview technical score or Resume claim)
  if (sessionScore && sessionRecordId) {
    items.push({
      id: `ctx_cs_sess_${sessionRecordId}_metric`,
      kind: 'practice_metric',
      canonicalKey: 'clearspeak.delivery_composite_score',
      label: 'ClearSpeak Delivery Practice Score',
      value: {
        type: 'metric',
        metric: 'clearspeak_composite',
        value: sessionScore.composite,
        scale: '100',
        measuredAt: capturedAt,
      },
      source: {
        module: 'clearspeak',
        recordId: sessionRecordId,
        fieldPath: 'score.composite',
        sourceRevision: revision,
        sourceHash: computeHash(String(sessionScore.composite)),
        capturedAt,
      },
      exactExcerpt: `Pacing: ${sessionScore.pacing}, Clarity: ${sessionScore.clarity}`,
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  }

  return items;
}
