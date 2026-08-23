import { ClearSpeakProfile, ClearSpeakSessionScore, CareerContextItemDraft } from 'mockmate-shared';
import { AccentScoreV2Schema, type AccentScoreV2 } from 'mockmate-shared/accent-evidence';
import crypto from 'crypto';

export interface ClearSpeakAdapterInput {
  profile?: ClearSpeakProfile | null;
  sessionRecordId?: string;
  sessionScore?: ClearSpeakSessionScore | null;
  practicedWords?: string[];
  topicTag?: string;
  revision?: string;
}

export interface AccentEvidenceAdapterInput {
  attemptId: string;
  result: unknown;
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

  // 3. Practiced Vocabulary (from practiced_words, NOT raw transcript/audio).
  // Ordinary ClearSpeak session metadata is submitted by the browser. Until it
  // is bound to a server-generated artifact it must not be represented as a
  // system observation, even though the score itself is server-derived.
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
        provenance: 'user_edited',
        status: 'active',
        sensitivity: 'standard',
      });
    }
  }

  // 4. Legacy Speech Delivery Score (practice_metric - NEVER enters
  // clearspeak_to_interview projection). This remains for legacy browser source
  // compatibility only; P0-5 Accent evidence below never creates a composite.
  if (
    sessionScore &&
    sessionRecordId &&
    sessionScore.evidenceBasis === 'transcript_timing_heuristic' &&
    sessionScore.pronunciationAssessed === false
  ) {
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
      exactExcerpt: `Pace: ${sessionScore.pacing}, transcript match: ${sessionScore.clarity}, pause timing: ${sessionScore.rhythm}`,
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
    });
  }

  return items;
}

/**
 * Convert a persisted P0-5 real-speech Accent result into bounded Career
 * Context development priorities. Only strict AccentScoreV2 real-user scored
 * evidence with evidence-grounded coaching is accepted. V1 results (including
 * synthetic fixtures), evaluated-unscored V2 results, raw audio/transcripts,
 * dimension scores, and any aggregate/native-ness claim are intentionally not
 * represented in Career Context.
 */
export function buildAccentEvidenceContextItems(input: AccentEvidenceAdapterInput): CareerContextItemDraft[] {
  const parsed = AccentScoreV2Schema.safeParse(input.result);
  if (!parsed.success) return [];

  const result: AccentScoreV2 = parsed.data;
  if (
    result.attemptId !== input.attemptId ||
    result.fixture ||
    result.evidenceProvenance !== 'user_recording_scored' ||
    result.coaching.length === 0
  ) {
    return [];
  }

  const firstPriorityByDimension = new Map<string, { coaching: AccentScoreV2['coaching'][number]; index: number }>();
  for (const [index, coaching] of result.coaching.entries()) {
    if (!firstPriorityByDimension.has(coaching.dimension)) {
      firstPriorityByDimension.set(coaching.dimension, { coaching, index });
    }
  }

  const revision = [
    result.scoringPolicyVersion,
    result.evidenceLineage.adapterId,
    result.evidenceLineage.adapterVersion,
  ].join(':');

  return [...firstPriorityByDimension.values()].map(({ coaching, index }) => {
    const dimension = result.dimensions[coaching.dimension];
    // AccentScoreV2Schema already guarantees coaching belongs to a scored
    // dimension and that every coaching evidenceRef is present in that dimension.
    const sourceHash = computeHash(JSON.stringify({
      action: coaching.action,
      dimension: coaching.dimension,
      evidenceRefs: coaching.evidenceRefs,
      evidenceSha256: result.evidenceLineage.evidenceSha256,
      confidence: dimension.confidence,
    }));

    return {
      kind: 'development_priority' as const,
      canonicalKey: `clearspeak.accent.development.${coaching.dimension}`,
      label: `ClearSpeak ${coaching.dimension.replace(/([A-Z])/g, ' $1')} Practice Priority`,
      value: { type: 'text' as const, text: coaching.action },
      source: {
        module: 'clearspeak' as const,
        recordId: input.attemptId,
        fieldPath: `result.coaching.${index}.${coaching.dimension}`,
        sourceRevision: revision,
        sourceHash,
        capturedAt: new Date().toISOString(),
      },
      exactExcerpt: coaching.action,
      provenance: 'system_observed' as const,
      status: 'active' as const,
      sensitivity: 'standard' as const,
    };
  });
}
