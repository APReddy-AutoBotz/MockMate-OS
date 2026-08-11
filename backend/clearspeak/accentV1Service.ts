import crypto from 'crypto';
import type { AccentProfileV1, AccentScoreV1, PracticePromptV1 } from 'mockmate-shared';
import { ACCENT_PROFILES, getAccentProfile } from './accentProfiles';
import { deterministicSyntheticAdapter } from './scoringAdapter';
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

export async function submitAccentAttempt(userId: string, body: any, audio: Buffer, mimeType: string): Promise<{ score: AccentScoreV1; replayed: boolean }> {
  rejectClientAuthority(body);
  if (!supabaseAdmin) throw new Error('authoritative_persistence_unavailable');
  if (!ACCENT_V1_MIMES.has(mimeType)) throw new Error('unsupported_audio_type');
  if (!audio.length || audio.length > ACCENT_V1_MAX_BYTES || !Number.isInteger(body.durationMs) || body.durationMs < 250 || body.durationMs > 120000) throw new Error('invalid_audio_evidence');
  if (typeof body.attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.attemptId)) throw new Error('invalid_attempt_id');
  const prompt = validatePromptSelector(body);
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ ...body, mimeType, audioHash: crypto.createHash('sha256').update(audio).digest('hex') })).digest('hex');
  const prior = await supabaseAdmin.from('clearspeak_accent_attempts').select('*').eq('user_id', userId).eq('attempt_id', body.attemptId).maybeSingle();
  if (prior.error) throw prior.error;
  if (prior.data) {
    if (prior.data.request_hash !== requestHash) throw new Error('idempotency_conflict');
    return { score: prior.data.result, replayed: true };
  }
  const score = await deterministicSyntheticAdapter.score({ attemptId: body.attemptId, prompt, audio, mimeType: mimeType as any });
  const inserted = await supabaseAdmin.from('clearspeak_accent_attempts').insert({ user_id: userId, attempt_id: body.attemptId, request_hash: requestHash,
    prompt_id: prompt.promptId, prompt_version: prompt.promptVersion, prompt_content_hash: prompt.contentHash, profile_id: prompt.profileId,
    profile_version: prompt.profileVersion, reference_set_version: prompt.referenceSetVersion, scoring_policy_version: score.scoringPolicyVersion,
    scoring_contract_version: score.contractVersion, fixture: true, dimensions: score.dimensions, coaching: score.coaching,
    duration_ms: body.durationMs, mime_type: mimeType, result: score }).select('*').single();
  if (inserted.error) throw inserted.error;
  return { score, replayed: false };
}
