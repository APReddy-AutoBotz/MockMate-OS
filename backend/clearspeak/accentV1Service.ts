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
const label = 'Practice example — not a pronunciation benchmark.' as const;
export const PROMPTS_POOL = {
  word: [
    { id: '10000000-0000-4000-a000-000000000001', text: 'collaboration', tipUK: 'Silent terminal r: kuh-lab-uh-RAY-shun', tipUS: 'Clear rhotic r: kuh-lab-er-AY-shun' },
    { id: '10000000-0000-4000-a000-000000000011', text: 'methodology', tipUK: 'Short open o: meth-uh-DOL-uh-jee', tipUS: 'Unrounded vowel: meth-uh-DAH-luh-jee' },
    { id: '10000000-0000-4000-a000-000000000012', text: 'deliverables', tipUK: 'Crisp d and l: dih-LIV-ur-uh-buhlz', tipUS: 'Smooth transitions: duh-LIV-er-uh-buhlz' },
    { id: '10000000-0000-4000-a000-000000000013', text: 'infrastructure', tipUK: 'Non-rhotic ending: IN-fruh-struk-chuh', tipUS: 'Rhotic ending: IN-fruh-struk-cher' },
    { id: '10000000-0000-4000-a000-000000000014', text: 'stakeholders', tipUK: 'Broad o: STAYK-hohl-duhz', tipUS: 'Full r coloring: STAYK-hohl-derz' },
    { id: '10000000-0000-4000-a000-000000000015', text: 'prioritization', tipUK: 'Soft British t: pry-or-ih-ty-ZAY-shun', tipUS: 'Flapped t: pry-or-uh-tuh-ZAY-shun' },
    { id: '10000000-0000-4000-a000-000000000016', text: 'feasibility', tipUK: 'Precise syllables: fee-zuh-BIL-ih-tee', tipUS: 'Reduced vowel: fee-zuh-BIL-uh-dee' },
    { id: '10000000-0000-4000-a000-000000000017', text: 'architecture', tipUK: 'Non-rhotic ar and ture: AH-kih-tek-chuh', tipUS: 'Full rhotic r: AHR-kuh-tek-cher' },
    { id: '10000000-0000-4000-a000-000000000018', text: 'requirements', tipUK: 'Non-rhotic re-quire: rih-KWY-uh-muhnts', tipUS: 'Strong rhotic: ree-KWYR-muhnts' },
    { id: '10000000-0000-4000-a000-000000000019', text: 'optimization', tipUK: 'Sharp British t: op-tih-my-ZAY-shun', tipUS: 'Smooth transitions: ahp-tuh-muh-ZAY-shun' },
    { id: '10000000-0000-4000-a000-000000000020', text: 'benchmarking', tipUK: 'Non-rhotic ar: BENCH-mah-king', tipUS: 'Rhotic ar: BENCH-mahr-king' },
    { id: '10000000-0000-4000-a000-000000000021', text: 'scalability', tipUK: 'Crisp ending: skay-luh-BIL-ih-tee', tipUS: 'Fast flap: skay-luh-BIL-uh-dee' },
    { id: '10000000-0000-4000-a000-000000000022', text: 'quantitative', tipUK: 'True British t: KWON-tih-tuh-tiv', tipUS: 'Soft American t: KWAHN-tuh-tay-tiv' },
    { id: '10000000-0000-4000-a000-000000000023', text: 'governance', tipUK: 'Soft ending: GUHV-uh-nuhns', tipUS: 'Rhotic r: GUHV-er-nuhns' },
    { id: '10000000-0000-4000-a000-000000000024', text: 'specifications', tipUK: 'Light syllables: speh-sih-fih-KAY-shuhnz', tipUS: 'Standard: speh-suh-fuh-KAY-shuhnz' },
  ],
  phrase: [
    { id: '10000000-0000-4000-a000-000000000002', text: 'Could we review the next steps?', tipUK: 'Falling polite pitch at the end', tipUS: 'Slight rising intonation' },
    { id: '10000000-0000-4000-a000-000000000025', text: 'Let me walk you through the key findings.', tipUK: 'Long open vowel on walk (/wɔːk/)', tipUS: 'Open vowel on walk (/wɑːk/)' },
    { id: '10000000-0000-4000-a000-000000000026', text: 'Based on our current sprint velocity.', tipUK: 'Current with non-rhotic r sound', tipUS: 'Clear rhotic current (/ˈkɝː.ənt/)' },
    { id: '10000000-0000-4000-a000-000000000027', text: 'I recommend aligning on these requirements first.', tipUK: 'Requirements without hard r', tipUS: 'Rhotic requirements' },
    { id: '10000000-0000-4000-a000-000000000028', text: 'From an architectural standpoint.', tipUK: 'Non-rhotic architectural', tipUS: 'Rhotic architectural' },
    { id: '10000000-0000-4000-a000-000000000029', text: 'We observed a noticeable performance lift.', tipUK: 'Noticeable with true t sound', tipUS: 'Noticeable with flapped d sound' },
    { id: '10000000-0000-4000-a000-000000000030', text: 'Let us align with the core engineering group.', tipUK: 'Core without terminal r', tipUS: 'Core with clear terminal r' },
    { id: '10000000-0000-4000-a000-000000000031', text: 'To ensure seamless cross-functional delivery.', tipUK: 'Seamless with crisp sibilants', tipUS: 'Natural smooth cadence' },
    { id: '10000000-0000-4000-a000-000000000032', text: 'According to our quarterly business review.', tipUK: 'Quarterly with silent r', tipUS: 'Quarterly with both r sounds' },
    { id: '10000000-0000-4000-a000-000000000033', text: 'I would like to highlight two critical trade-offs.', tipUK: 'Critical with sharp plosive t', tipUS: 'Critical with soft flapped t' },
    { id: '10000000-0000-4000-a000-000000000034', text: 'This gives us a clear operational advantage.', tipUK: 'Clear (/klɪə/) without hard r', tipUS: 'Clear (/klɪr/) with rhotic r' },
    { id: '10000000-0000-4000-a000-000000000035', text: 'Before committing to the final implementation roadmap.', tipUK: 'Before without hard r', tipUS: 'Before with rhotic r' },
    { id: '10000000-0000-4000-a000-000000000036', text: 'We validated the acceptance criteria thoroughly.', tipUK: 'Criteria without final r', tipUS: 'Criteria with rhotic r' },
    { id: '10000000-0000-4000-a000-000000000037', text: 'Let us pause for any immediate questions.', tipUK: 'Pause with rounded vowel /pɔːz/', tipUS: 'Pause with open vowel /pɑːz/' },
    { id: '10000000-0000-4000-a000-000000000038', text: 'Moving forward with our recommended approach.', tipUK: 'Forward with non-rhotic r', tipUS: 'Forward with clear rhotic r' },
  ],
  sentence_reading: [
    { id: '10000000-0000-4000-a000-000000000003', text: 'The project team will share a clear update tomorrow morning.', tipUK: 'Clear and morning have non-rhotic r sounds.', tipUS: 'Clear and morning both articulate strong rhotic r.' },
    { id: '10000000-0000-4000-a000-000000000041', text: 'We prioritized these critical user stories to meet the quarterly milestone.', tipUK: 'Notice the sharp t in critical and quarterly.', tipUS: 'Notice the fast flap t in critical and quarterly.' },
    { id: '10000000-0000-4000-a000-000000000042', text: 'Our automated testing pipeline caught the regression before deployment.', tipUK: 'Caught has a deep rounded back vowel.', tipUS: 'Caught has an open unrounded American vowel.' },
    { id: '10000000-0000-4000-a000-000000000043', text: 'I collaborated closely with product managers to refine the business specifications.', tipUK: 'Managers ends in a soft non-rhotic uh sound.', tipUS: 'Managers ends in a distinct rhotic er sound.' },
    { id: '10000000-0000-4000-a000-000000000044', text: 'We analyzed system performance metrics to identify potential throughput bottlenecks.', tipUK: 'Performance has a silent r (/pəˈfɔː.məns/).', tipUS: 'Performance has a strong rhotic r (/pɚˈfɔːr.məns/).' },
    { id: '10000000-0000-4000-a000-000000000045', text: 'The stakeholders appreciated our transparent communication regarding project delivery dates.', tipUK: 'Dates and delivery have crisp, clear consonant attacks.', tipUS: 'Dates and delivery have a relaxed, connected cadence.' },
    { id: '10000000-0000-4000-a000-000000000046', text: 'I conducted user interviews to uncover the root cause behind drop-off rates.', tipUK: 'Interviews has a crisp t sound.', tipUS: 'Interviews often elides the t into an n-sound (innerviews).' },
    { id: '10000000-0000-4000-a000-000000000047', text: 'Our cross-functional agile rituals improved overall sprint predictability and team morale.', tipUK: 'Rituals has an aspirated British t.', tipUS: 'Rituals has an American soft flap.' },
    { id: '10000000-0000-4000-a000-000000000048', text: 'We established clear acceptance criteria before kicking off development on the banking module.', tipUK: 'Banking and criteria flow with even, neutral pitch.', tipUS: 'Banking and criteria use dynamic pitch movement.' },
    { id: '10000000-0000-4000-a000-000000000049', text: 'I regularly prepared detailed business requirement documents for senior leadership review.', tipUK: 'Prepared and documents have elegant non-rhotic phrasing.', tipUS: 'Prepared and documents feature full American r-coloring.' },
    { id: '10000000-0000-4000-a000-000000000050', text: 'By streamlining the onboarding funnel, we reduced friction and accelerated user conversion.', tipUK: 'Conversion (/kənˈvɜː.ʃən/) is non-rhotic.', tipUS: 'Conversion (/kənˈvɝː.ʒən/) is distinctly rhotic.' },
    { id: '10000000-0000-4000-a000-000000000051', text: 'We monitored error logs continuously to verify zero unexpected regressions after release.', tipUK: 'Error (/ˈer.ə/) has no final r sound.', tipUS: 'Error (/ˈer.ɚ/) has strong double r sounds.' },
    { id: '10000000-0000-4000-a000-000000000052', text: 'The engineering team demonstrated rapid adaptability when handling urgent production incidents.', tipUK: 'Rapid and adaptability have precise dental placement.', tipUS: 'Rapid and adaptability have connected American linkage.' },
    { id: '10000000-0000-4000-a000-000000000053', text: 'Effective stakeholder alignment requires active listening and proactive risk mitigation.', tipUK: 'Proactive has a pure British o sound.', tipUS: 'Proactive has an American diphthongal o sound.' },
    { id: '10000000-0000-4000-a000-000000000054', text: 'Our data-driven insights enabled the steering committee to make confident investment decisions.', tipUK: 'Data is pronounced DAY-tuh with a firm t.', tipUS: 'Data is pronounced DAY-duh with an alveolar tap.' },
  ],
  free_response: [
    { id: '10000000-0000-4000-a000-000000000004', text: 'Describe a recent challenge and how you approached it.', tipUK: 'Focus on measured, steady pacing and clean sentence stops.', tipUS: 'Focus on enthusiastic, forward-leaning intonation.' },
    { id: '10000000-0000-4000-a000-000000000061', text: 'Walk me through a project where you had to manage conflicting stakeholder priorities.', tipUK: 'Maintain a clear cadence and avoid rushed syllables.', tipUS: 'Maintain a warm, collaborative rhythm.' },
    { id: '10000000-0000-4000-a000-000000000062', text: 'Explain how you ensure high quality and clarity in your technical documentation.', tipUK: 'Emphasize key verbs with crisp British consonant clarity.', tipUS: 'Emphasize outcomes with natural American phrase stress.' },
    { id: '10000000-0000-4000-a000-000000000063', text: 'Tell me about a time you identified an operational bottleneck and how you resolved it.', tipUK: 'Articulate bottleneck with a true t sound.', tipUS: 'Articulate bottleneck with an easy flap.' },
    { id: '10000000-0000-4000-a000-000000000064', text: 'How do you handle disagreement during sprint planning or requirement sign-off?', tipUK: 'Keep your intonation calm, authoritative, and collected.', tipUS: 'Keep your intonation open, dynamic, and engaging.' },
  ],
} as const;

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

export function promptFor(profile: AccentProfileV1, mode: PracticeMode, promptIndex = 0, specificPromptId?: string): PracticePromptV1 {
  const pool = (PROMPTS_POOL as any)[mode] || PROMPTS_POOL.sentence_reading;
  const item = (specificPromptId ? pool.find((p: any) => p.id === specificPromptId) : null)
    || pool[Math.abs(promptIndex) % pool.length]
    || pool[0];
  const displayText = item.text;
  const canonical = JSON.stringify({ mode, profileId: profile.profileId, displayText, version: 1 });
  return { contractVersion: 'practice-prompt.v1', promptId: item.id, promptVersion: 1, mode,
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
  const practiceMode = (Object.entries(ids).find(([, promptId]) => promptId === attempt.prompt_id)?.[0] || 'word') as PracticeMode;
  return {
    ...attempt,
    practiceMode,
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
  const prompt = promptFor(profile, input.mode, 0, input.promptId);
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
  'promptIndex',
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
