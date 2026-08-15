import crypto from 'crypto';
import type { AccentProfileV1, AccentScoreV1, PracticePromptV1 } from 'mockmate-shared';
import type { AccentScoreV2 } from 'mockmate-shared/accent-evidence';
import { ACCENT_PROFILES, getAccentProfile } from './accentProfiles';
import { unsupportedUserAudioResult } from './scoringAdapter';
import {
  scoreWithGovernedAccentAdapter,
  type GovernedAccentScoringAdapterV1,
} from './realSpeechEvidenceService';
import { getRealSpeechExecutionAuthority, realSpeechScoringAvailable } from './realSpeechAuthority';
import { supabaseAdmin } from '../supabaseAdmin';

export const ACCENT_V1_MAX_BYTES = 5 * 1024 * 1024;
export const ACCENT_V1_MIMES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']);
const label = 'Synthetic CI fixture — not human- or provider-validated pronunciation.' as const;
const fixtures = {
  word: 'collaboration',
  phrase: 'Could we review the next steps?',
  sentence_reading: 'The project team will share a clear update tomorrow morning.',
  free_response: 'Describe a recent challenge and how you approached it.',
} as const;
const ids = {
  word: '10000000-0000-4000-a000-000000000001', phrase: '10000000-0000-4000-a000-000000000002',
  sentence_reading: '10000000-0000-4000-a000-000000000003', free_response: '10000000-0000-4000-a000-000000000004',
} as const;

export type PracticeMode = keyof typeof fixtures;
export type AccentAttemptScore = AccentScoreV1 | AccentScoreV2;
export type AccentAdapterDescriptor =
  | { status: 'unavailable'; adapterId: 'scoring-unavailable-v1' }
  | { status: 'authorized'; adapterId: string; adapterVersion: string };

export function promptFor(profile: AccentProfileV1, mode: PracticeMode): PracticePromptV1 {
  const displayText = fixtures[mode];
  const canonical = JSON.stringify({ mode, profileId: profile.profileId, displayText, version: 1 });
  return { contractVersion: 'practice-prompt.v1', promptId: ids[mode], promptVersion: 1, mode,
    profileId: profile.profileId, profileVersion: profile.profileVersion, referenceSetVersion: profile.referenceSetVersion,
    displayText, ...(mode === 'free_response' ? {} : { expectedText: displayText }),
    maxDurationMs: mode === 'free_response' ? 120000 : 45000,
    contentHash: crypto.createHash('sha256').update(canonical).digest('hex'), referenceLabel: label };
}

export const accentCatalog = () => ({
  contractVersion: 'accent-profile-catalog.v1' as const,
  profiles: ACCENT_PROFILES,
  practiceModes: Object.keys(fixtures),
  fixture: true,
  retention: 'derived-results-only' as const,
  realSpeechScoringAvailable: realSpeechScoringAvailable(),
});

export function accentAdapterDescriptorForScore(score: AccentAttemptScore): AccentAdapterDescriptor {
  if (score.contractVersion === 'accent-score.v2') {
    return {
      status: 'authorized',
      adapterId: score.evidenceLineage.adapterId,
      adapterVersion: score.evidenceLineage.adapterVersion,
    };
  }
  return { status: 'unavailable', adapterId: 'scoring-unavailable-v1' };
}

export function projectAccentHistoryAttempt(attempt: any) {
  return {
    ...attempt,
    fixture: attempt.fixture,
    evidenceProvenance: attempt.evidence_provenance,
    evidenceStatus: Object.fromEntries(Object.entries(attempt.result?.dimensions || {}).map(
      ([dimension, evidence]: [string, any]) => [dimension, evidence.evidenceStatus],
    )),
  };
}

export function validatePromptSelector(input: any): PracticePromptV1 {
  const profile = getAccentProfile(input?.profileId);
  if (!profile || profile.profileVersion !== input?.profileVersion) throw new Error('stale_or_unknown_profile');
  if (!Object.prototype.hasOwnProperty.call(fixtures, input?.mode)) throw new Error('unsupported_practice_mode');
  const prompt = promptFor(profile, input.mode);
  if (input.promptId !== prompt.promptId || input.promptVersion !== prompt.promptVersion || input.promptContentHash !== prompt.contentHash ||
      input.referenceSetVersion !== prompt.referenceSetVersion || input.scoringPolicyVersion !== profile.scoringPolicyVersion) {
    throw new Error('stale_or_mismatched_server_selector');
  }
  return prompt;
}

const allowedClientSelectorKeys = new Set([
  'attemptId',
  'durationMs',
  'mode',
  'profileId',
  'profileVersion',
  'promptId',
  'promptVersion',
  'promptContentHash',
  'referenceSetVersion',
  'scoringPolicyVersion',
]);
export function rejectClientAuthority(body: any): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('client_authority_rejected');
  if (Object.keys(body).some(key => !allowedClientSelectorKeys.has(key))) throw new Error('client_authority_rejected');
}

type AttemptDisposition = { status: 'pending' | 'cancelled' | 'committed' | 'conflict' | 'missing' | 'limit' | 'invalid'; requestHash?: string; result?: AccentAttemptScore; replayed?: boolean; executionLeaseExpiresAt?: string };

type SubmitAccentAttemptOptions = {
  /** Test-only/provider-integration seam. Route callers omit this so runtime
   * authority always comes from getAuthorizedRealSpeechAdapter(). */
  realSpeechAdapter?: GovernedAccentScoringAdapterV1 | null;
};

const capabilityHash = (capability: string) => crypto.createHash('sha256').update(capability).digest('hex');

async function lifecycleRpc(name: string, args: Record<string, unknown>): Promise<AttemptDisposition> {
  if (!supabaseAdmin) throw new Error('authoritative_persistence_unavailable');
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error || !data) throw new Error('authoritative_persistence_unavailable');
  return data as AttemptDisposition;
}

export async function issueAccentAttemptAuthority(userId: string, body: any): Promise<{ attemptId: string; capability: string; expiresAt: string }> {
  rejectClientAuthority(body);
  if (typeof body?.attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.attemptId)) throw new Error('invalid_attempt_id');
  const prompt = validatePromptSelector(body);
  const selectorHash = crypto.createHash('sha256').update(JSON.stringify({
    mode: prompt.mode, promptId: prompt.promptId, promptVersion: prompt.promptVersion,
    promptContentHash: prompt.contentHash, profileId: prompt.profileId, profileVersion: prompt.profileVersion,
    referenceSetVersion: prompt.referenceSetVersion, scoringPolicyVersion: body.scoringPolicyVersion,
  })).digest('hex');
  const capability = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const outcome = await lifecycleRpc('issue_clearspeak_accent_attempt_authority', {
    p_user_id: userId, p_attempt_id: body.attemptId, p_capability_hash: capabilityHash(capability), p_expires_at: expiresAt,
    p_selector_hash: selectorHash,
  });
  if (outcome.status === 'conflict') throw new Error('idempotency_conflict');
  if (outcome.status !== 'pending') throw new Error(outcome.status === 'limit' ? 'lifecycle_limit_reached' : 'submission_authority_rejected');
  return { attemptId: body.attemptId, capability, expiresAt };
}

export async function cancelAccentAttempt(userId: string, attemptId: string, capability: string): Promise<AttemptDisposition> {
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) throw new Error('invalid_attempt_id');
  if (!/^[a-f0-9]{64}$/.test(capability || '')) return { status: 'missing' };
  return lifecycleRpc('cancel_clearspeak_accent_attempt_v2', { p_user_id: userId, p_attempt_id: attemptId, p_capability_hash: capabilityHash(capability) });
}

export async function deleteAccentAttempt(userId: string, attemptId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) throw new Error('invalid_attempt_id');
  await lifecycleRpc('delete_clearspeak_accent_attempt', { p_user_id: userId, p_attempt_id: attemptId });
}

export async function getAccentAttemptStatus(userId: string, attemptId: string): Promise<AttemptDisposition> {
  if (!supabaseAdmin) throw new Error('authoritative_persistence_unavailable');
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) throw new Error('invalid_attempt_id');
  const lifecycle = await supabaseAdmin.from('clearspeak_accent_attempt_lifecycle').select('status,request_hash').eq('user_id', userId).eq('attempt_id', attemptId).maybeSingle();
  if (lifecycle.error) throw new Error('authoritative_persistence_unavailable');
  if (!lifecycle.data) return { status: 'missing' };
  if (lifecycle.data.status !== 'committed') return { status: lifecycle.data.status as AttemptDisposition['status'], requestHash: lifecycle.data.request_hash };
  const attempt = await supabaseAdmin.from('clearspeak_accent_attempts').select('result').eq('user_id', userId).eq('attempt_id', attemptId).maybeSingle();
  if (attempt.error || !attempt.data) throw new Error('authoritative_persistence_unavailable');
  return { status: 'committed', requestHash: lifecycle.data.request_hash, result: attempt.data.result };
}

export async function submitAccentAttempt(
  userId: string,
  body: any,
  audio: Buffer,
  mimeType: string,
  options?: SubmitAccentAttemptOptions,
): Promise<{ score: AccentAttemptScore; replayed: boolean; requestHash: string }> {
  const submissionCapability = body?.submissionCapability;
  if (typeof submissionCapability !== 'string' || !/^[a-f0-9]{64}$/.test(submissionCapability)) throw new Error('submission_authority_rejected');
  body = { ...body };
  delete body.submissionCapability;
  rejectClientAuthority(body);
  if (!supabaseAdmin) throw new Error('authoritative_persistence_unavailable');
  const normalizedMimeType = mimeType.split(';', 1)[0].trim().toLowerCase();
  if (!ACCENT_V1_MIMES.has(normalizedMimeType)) throw new Error('unsupported_audio_type');
  if (!audio.length || audio.length > ACCENT_V1_MAX_BYTES || !Number.isInteger(body.durationMs) || body.durationMs < 250 || body.durationMs > 120000) throw new Error('invalid_audio_evidence');
  if (typeof body.attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.attemptId)) throw new Error('invalid_attempt_id');
  const prompt = validatePromptSelector(body);
  if (body.durationMs > prompt.maxDurationMs) throw new Error('invalid_audio_evidence');

  const executionAuthority = getRealSpeechExecutionAuthority(prompt.profileId, options?.realSpeechAdapter);
  const requestIdentity: Record<string, unknown> = { ...body, mimeType: normalizedMimeType, audioHash: crypto.createHash('sha256').update(audio).digest('hex') };
  if (executionAuthority) {
    requestIdentity.realSpeechAuthority = {
      adapterId: executionAuthority.adapterId,
      adapterVersion: executionAuthority.adapterVersion,
      referenceSetVersion: executionAuthority.referenceSetVersion,
      scoringPolicyVersion: executionAuthority.scoringPolicyVersion,
    };
  }
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(requestIdentity)).digest('hex');

  const prior = await supabaseAdmin.from('clearspeak_accent_attempts').select('*').eq('user_id', userId).eq('attempt_id', body.attemptId).maybeSingle();
  if (prior.error) throw prior.error;
  if (prior.data) {
    if (prior.data.request_hash !== requestHash) throw new Error('idempotency_conflict');
    return { score: prior.data.result, replayed: true, requestHash };
  }

  // V1/provider-unavailable work keeps the already proven v2 lifecycle. Only an
  // authorized real-speech adapter uses the v3 execution lease, so today's path
  // and its expiry/recovery semantics remain unchanged.
  const reserveRpc = executionAuthority
    ? 'reserve_clearspeak_accent_attempt_v3'
    : 'reserve_clearspeak_accent_attempt_v2';
  const commitRpc = executionAuthority
    ? 'commit_clearspeak_accent_attempt_v3'
    : 'commit_clearspeak_accent_attempt_v2';
  const reserved = await lifecycleRpc(reserveRpc, {
    p_user_id: userId,
    p_attempt_id: body.attemptId,
    p_request_hash: requestHash,
    p_capability_hash: capabilityHash(submissionCapability),
  });
  if (reserved.status === 'missing') throw new Error('submission_authority_rejected');
  if (reserved.status === 'conflict') throw new Error('idempotency_conflict');
  if (reserved.status === 'cancelled') throw new Error('submission_canceled');
  if (reserved.status === 'committed') {
    const status = await getAccentAttemptStatus(userId, body.attemptId);
    if (!status.result) throw new Error('authoritative_persistence_unavailable');
    return { score: status.result, replayed: true, requestHash };
  }

  let score: AccentAttemptScore;
  if (executionAuthority) {
    try {
      score = (await scoreWithGovernedAccentAdapter({
        attemptId: body.attemptId,
        promptId: prompt.promptId,
        promptVersion: prompt.promptVersion,
        promptContentHash: prompt.contentHash,
        profileId: prompt.profileId,
        profileVersion: prompt.profileVersion,
        referenceSetVersion: executionAuthority.referenceSetVersion,
        durationMs: body.durationMs,
        mimeType: normalizedMimeType as 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/mpeg',
      }, audio, executionAuthority.adapter)).score;
    } catch {
      // Never turn a malformed/failed authorized scorer call into a synthetic or
      // guessed score. Keep the exact request recoverable under bounded authority.
      throw new Error('real_speech_evidence_unavailable');
    }
  } else {
    // Ordinary user bytes are never synthetic evidence. Until a real scorer is
    // separately authorized, persist only the existing truthful null-score V1.
    score = unsupportedUserAudioResult(body.attemptId, prompt);
  }

  const committed = await lifecycleRpc(commitRpc, {
    p_user_id: userId,
    p_attempt_id: body.attemptId,
    p_request_hash: requestHash,
    p_capability_hash: capabilityHash(submissionCapability),
    p_attempt: {
      prompt_id: prompt.promptId,
      prompt_version: prompt.promptVersion,
      prompt_content_hash: prompt.contentHash,
      profile_id: prompt.profileId,
      profile_version: prompt.profileVersion,
      reference_set_version: score.contractVersion === 'accent-score.v2' ? score.referenceSetVersion : prompt.referenceSetVersion,
      scoring_policy_version: score.scoringPolicyVersion,
      scoring_contract_version: score.contractVersion,
      evidence_provenance: score.evidenceProvenance,
      fixture: score.fixture,
      dimensions: score.dimensions,
      coaching: score.coaching,
      duration_ms: body.durationMs,
      mime_type: normalizedMimeType,
      result: score,
    },
  });
  if (committed.status === 'cancelled') throw new Error('submission_canceled');
  if (committed.status === 'conflict') throw new Error('idempotency_conflict');
  if (committed.status !== 'committed' || !committed.result) throw new Error('authoritative_persistence_unavailable');
  return { score: committed.result, replayed: Boolean(committed.replayed), requestHash };
}
