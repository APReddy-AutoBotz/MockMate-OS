import { ClearSpeakProfile, ClearSpeakSessionScore, CareerContextItemDraft } from 'mockmate-shared';
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

export function buildClearSpeakContextItems(input: ClearSpeakAdapterInput): CareerContextItemDraft[] {
  const { profile, sessionRecordId, sessionScore, practicedWords, topicTag, revision = 'v1' } = input;
  const items: CareerContextItemDraft[] = [];

  // 1. Profile Role
  if (profile?.role) {
    items.push({
      kind: 'target_role',
      canonicalKey: 'clearspeak.profile.role',
      label: 'ClearSpeak Target Role',
      value: { type: 'text', text: profile.role },
      source: {
        module: 'clearspeak',
        recordId: profile.userId || 'profile',
        fieldPath: 'role',
        sourceRevision: revision,
        sourceHash: computeHash(profile.role),
        capturedAt: new Date().toISOString(),
      },
      exactExcerpt: profile.role,
      provenance: 'user_confirmed',
      status: 'active',
      sensitivity: 'standard',
    });
  }

  // 2. Profile Goal & Audience Context
  if (profile?.goal) {
    items.push({
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
        capturedAt: new Date().toISOString(),
      },
      exactExcerpt: profile.goal,
      provenance: 'user_confirmed',
      status: 'active',
      sensitivity: 'standard',
    });
  }

  if (profile?.audienceContext) {
    items.push({
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
        capturedAt: new Date().toISOString(),
      },
      exactExcerpt: profile.audienceContext,
      provenance: 'user_confirmed',
      status: 'active',
      sensitivity: 'standard',
    });
  }

  // 3. Practiced Vocabulary (from practiced_words, NOT raw transcript/audio)
  if (practicedWords && practicedWords.length > 0 && sessionRecordId) {
    const cleanWords = practicedWords.map(w => w.trim()).filter(Boolean);
    if (cleanWords.length > 0) {
      items.push({
        kind: 'practiced_vocabulary',
        canonicalKey: 'clearspeak.practiced_vocab',
        label: `Practiced Vocabulary (${topicTag || 'General'})`,
        value: { type: 'string_list', values: cleanWords },
        source: {
          module: 'clearspeak',
          recordId: sessionRecordId,
          fieldPath: 'practicedWords',
          sourceRevision: revision,
          sourceHash: computeHash(cleanWords.join(',')),
          capturedAt: new Date().toISOString(),
        },
        exactExcerpt: cleanWords.join(', '),
        provenance: 'system_observed',
        status: 'active',
        sensitivity: 'standard',
      });
    }
  }

  // 4. Speech Delivery Score (practice_metric - NEVER enters clearspeak_to_interview projection)
  if (sessionScore && sessionRecordId) {
    items.push({
      kind: 'practice_metric',
      canonicalKey: 'clearspeak.delivery_composite_score',
      label: 'ClearSpeak Delivery Practice Score',
      value: {
        type: 'metric',
        metric: 'clearspeak_composite',
        value: sessionScore.composite,
        scale: '100',
        measuredAt: new Date().toISOString(),
      },
      source: {
        module: 'clearspeak',
        recordId: sessionRecordId,
        fieldPath: 'score.composite',
        sourceRevision: revision,
        sourceHash: computeHash(String(sessionScore.composite)),
        capturedAt: new Date().toISOString(),
      },
      exactExcerpt: `Pacing: ${sessionScore.pacing}, Clarity: ${sessionScore.clarity}`,
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
    });
  }

  return items;
}
