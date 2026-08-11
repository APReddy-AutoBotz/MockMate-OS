import type { AccentProfileV1 } from 'mockmate-shared';

const safety = 'A learner-selected communication style target; not a measure of correctness, identity, nationality, class, or native-ness.';

export const ACCENT_PROFILES: readonly AccentProfileV1[] = Object.freeze([
  Object.freeze({ contractVersion: 'accent-profile.v1', profileId: 'en-GB-general-v1', profileVersion: 1, locale: 'en-GB', displayName: 'General UK English', description: 'Practise toward a contemporary general UK reference style.', referenceSetVersion: 'synthetic-reference.v1', scoringPolicyVersion: 'synthetic-policy.v1', safetyStatement: safety }),
  Object.freeze({ contractVersion: 'accent-profile.v1', profileId: 'en-US-general-v1', profileVersion: 1, locale: 'en-US', displayName: 'General US English', description: 'Practise toward a contemporary general US reference style.', referenceSetVersion: 'synthetic-reference.v1', scoringPolicyVersion: 'synthetic-policy.v1', safetyStatement: safety }),
]);

export const getAccentProfile = (id: string) => ACCENT_PROFILES.find(profile => profile.profileId === id);
