import { AccentRealSpeechPolicyV1 } from 'mockmate-shared/accent-evidence';
import {
  getAuthorizedRealSpeechAdapter,
  type GovernedAccentScoringAdapterV1,
} from './realSpeechEvidenceService';

export type AccentProfileId = 'en-GB-general-v1' | 'en-US-general-v1';

const REFERENCE_SET_BY_PROFILE: Readonly<Record<AccentProfileId, string>> = Object.freeze({
  'en-GB-general-v1': 'uk-general-reference.v1',
  'en-US-general-v1': 'us-general-reference.v1',
});

export interface RealSpeechExecutionAuthorityV1 {
  adapter: GovernedAccentScoringAdapterV1;
  adapterId: string;
  adapterVersion: string;
  referenceSetVersion: string;
  scoringPolicyVersion: typeof AccentRealSpeechPolicyV1.scoringPolicyVersion;
}

export const realSpeechReferenceSetFor = (profileId: AccentProfileId): string => {
  const referenceSetVersion = REFERENCE_SET_BY_PROFILE[profileId];
  if (!referenceSetVersion) throw new Error('unsupported_real_speech_profile');
  return referenceSetVersion;
};

export const getRealSpeechExecutionAuthority = (
  profileId: AccentProfileId,
  adapterOverride?: GovernedAccentScoringAdapterV1 | null,
): RealSpeechExecutionAuthorityV1 | null => {
  const adapter = adapterOverride === undefined ? getAuthorizedRealSpeechAdapter() : adapterOverride;
  if (!adapter) return null;
  return Object.freeze({
    adapter,
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    referenceSetVersion: realSpeechReferenceSetFor(profileId),
    scoringPolicyVersion: AccentRealSpeechPolicyV1.scoringPolicyVersion,
  });
};

export const realSpeechScoringAvailable = (): boolean => getAuthorizedRealSpeechAdapter() !== null;
