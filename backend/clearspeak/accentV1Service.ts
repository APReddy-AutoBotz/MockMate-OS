import crypto from 'crypto';
import type { AccentProfileV1, AccentScoreV1, PracticePromptV1 } from 'mockmate-shared';
import { ACCENT_PROFILES, getAccentProfile } from './accentProfiles';
import { REAL_SPEECH_PROVIDER_NOT_AUTHORIZED, unsupportedUserAudioResult } from './scoringAdapter';
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
export function promptFor(profile: AccentProfileV1, mode: PracticeMode): PracticePromptV1 {
  const displayText = fixtures[mode];
  const canonical = JSON.stringify({ mode, profileId: profile.profileId, displayText, version: 1 });
  return { contractVersion: 'practice-prompt.v1', promptId: ids[mode], promptVersion: 1, mode,
    profileId: profile.profileId, profileVersion: profile.profileVersion, referenceSetVersion: profile.referenceSetVersion,
    displayText, ...(mode === 'free_response' ? {} : { expectedText: displayText }),
    maxDurationMs: mode === 'free_response' ? 120000 : 45000,
    contentHash: crypto.createHash('sha256').update(canonical).digest('hex'), referenceLabel: label };
}

export const accentCatalog = () => ({ contractVersion: 'accent-profile-catalog.v1' as const, profiles: ACCENT_PROFILES,
  practiceModes: Object.keys(fixtures), fixture: true, retention: 'derived-results-only' as const });

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

const forbidden = ['provider', 'model', 'apiKey', 'key', 'retention', 'fixture', 'admin', 'scoringAdapter', 'scoringPolicy'];
export function rejectClientAuthority(body: any): void {
  if (!body || typeof body !== 'object' || forbidden.some(k => Object.prototype.hasOwnProperty.call(body, k))) throw new Error('client_authority_rejected');
}

type AttemptDisposition = { status: 'pending' | 'cancelled' | 'committed' | 'conflict' | 'missing' | 'limit' | 'invalid'; requestHash?: string; result?: AccentScoreV1; replayed?: boolean };

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

export async function submitAccentAttempt(userId: string, body: any, audio: Buffer, mimeType: string): Promise<{ score: AccentScoreV1; replayed: boolean; requestHash: string }> {
  const submissionCapability = body?.submissionCapability;
  if (typeof submissionCapability !== 'string' || !/^[a-f0-9]{64}$/.test(submissionCapability)) throw new Error('submission_authority_rejected');
  body = { ...body };
  delete body.submissionCapability;
  rejectClientAuthority(body);
  // This is a deliberate stop gate, not a provider fallback. V1 must remain
  // unavailable rather than silently invoking legacy/real speech scoring.
  if (!REAL_SPEECH_PROVIDER_NOT_AUTHORIZED) throw new Error('real_speech_provider_not_authorized');
  if (!supabaseAdmin) throw new Error('authoritative_persistence_unavailable');
  const normalizedMimeType = mimeType.split(';', 1)[0].trim().toLowerCase();
  if (!ACCENT_V1_MIMES.has(normalizedMimeType)) throw new Error('unsupported_audio_type');
  if (!audio.length || audio.length > ACCENT_V1_MAX_BYTES || !Number.isInteger(body.durationMs) || body.durationMs < 250 || body.durationMs > 120000) throw new Error('invalid_audio_evidence');
  if (typeof body.attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.attemptId)) throw new Error('invalid_attempt_id');
  const prompt = validatePromptSelector(body);
  if (body.durationMs > prompt.maxDurationMs) throw new Error('invalid_audio_evidence');
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ ...body, mimeType: normalizedMimeType, audioHash: crypto.createHash('sha256').update(audio).digest('hex') })).digest('hex');
  const prior = await supabaseAdmin.from('clearspeak_accent_attempts').select('*').eq('user_id', userId).eq('attempt_id', body.attemptId).maybeSingle();
  if (prior.error) throw prior.error;
  if (prior.data) {
    if (prior.data.request_hash !== requestHash) throw new Error('idempotency_conflict');
    return { score: prior.data.result, replayed: true, requestHash };
  }
  // Ordinary user bytes are never synthetic evidence. Until a speech scorer is
  // separately authorized, persist only a truthful null-score availability result.
  const score = unsupportedUserAudioResult(body.attemptId, prompt);
  const reserved = await lifecycleRpc('reserve_clearspeak_accent_attempt_v2', { p_user_id: userId, p_attempt_id: body.attemptId, p_request_hash: requestHash, p_capability_hash: capabilityHash(submissionCapability) });
  if (reserved.status === 'missing') throw new Error('submission_authority_rejected');
  if (reserved.status === 'conflict') throw new Error('idempotency_conflict');
  if (reserved.status === 'cancelled') throw new Error('submission_canceled');
  if (reserved.status === 'committed') {
    const status = await getAccentAttemptStatus(userId, body.attemptId);
    if (!status.result) throw new Error('authoritative_persistence_unavailable');
    return { score: status.result, replayed: true, requestHash };
  }
  const committed = await lifecycleRpc('commit_clearspeak_accent_attempt_v2', { p_user_id: userId, p_attempt_id: body.attemptId, p_request_hash: requestHash,
    p_capability_hash: capabilityHash(submissionCapability),
    p_attempt: { prompt_id: prompt.promptId, prompt_version: prompt.promptVersion, prompt_content_hash: prompt.contentHash,
      profile_id: prompt.profileId, profile_version: prompt.profileVersion, reference_set_version: prompt.referenceSetVersion,
      scoring_policy_version: score.scoringPolicyVersion, scoring_contract_version: score.contractVersion,
      evidence_provenance: score.evidenceProvenance, fixture: score.fixture, dimensions: score.dimensions, coaching: score.coaching,
      duration_ms: body.durationMs, mime_type: normalizedMimeType, result: score } });
  if (committed.status === 'cancelled') throw new Error('submission_canceled');
  if (committed.status === 'conflict') throw new Error('idempotency_conflict');
  if (committed.status !== 'committed' || !committed.result) throw new Error('authoritative_persistence_unavailable');
  return { score: committed.result, replayed: Boolean(committed.replayed), requestHash };
}
