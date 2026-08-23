import { clearLocalPracticeData } from './accountService';
import type { UserProfile } from '../types/ui';

export const LOCAL_PRACTICE_OWNER_KEY = 'mockmate_local_owner_uid';
const LOCAL_USER_PROFILE_KEY = 'mockmate_user_profile';

/** Parse browser-owned profile state without allowing malformed JSON to stall auth startup. */
export function readLocalUserProfile(): UserProfile | null {
  const raw = localStorage.getItem(LOCAL_USER_PROFILE_KEY);
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('invalid profile');
    const stringFields = ['name', 'targetRole', 'companyName', 'companyUrl', 'experienceLevel', 'primaryGoal'] as const;
    const sanitized: UserProfile = {};
    for (const field of stringFields) {
      const value = candidate[field];
      if (value === undefined) continue;
      if (typeof value !== 'string') throw new Error('invalid profile field');
      sanitized[field] = value;
    }
    if (candidate.pilot_user !== undefined) {
      if (typeof candidate.pilot_user !== 'boolean') throw new Error('invalid pilot flag');
      sanitized.pilot_user = candidate.pilot_user;
    }
    if (!sanitized.name?.trim()) throw new Error('profile name is required');
    return sanitized;
  } catch {
    localStorage.removeItem(LOCAL_USER_PROFILE_KEY);
    return null;
  }
}

/**
 * Bind browser-local practice data to the authenticated owner. Legacy data has
 * no owner marker and is cleared on first upgraded login rather than guessed.
 */
export function bindLocalPracticeDataOwner(userId: string): 'preserved' | 'cleared' {
  if (!userId) throw new Error('Authenticated user id is required for local data ownership');
  const currentOwner = localStorage.getItem(LOCAL_PRACTICE_OWNER_KEY);
  const outcome = currentOwner === userId ? 'preserved' : 'cleared';
  if (outcome === 'cleared') clearLocalPracticeData();
  localStorage.setItem(LOCAL_PRACTICE_OWNER_KEY, userId);
  return outcome;
}

/** Never present a logged-out UI or clear the current owner's data first. */
export async function clearLocalDataAfterConfirmedSignOut(
  signOutAction: () => Promise<unknown>,
): Promise<void> {
  await signOutAction();
  clearLocalPracticeData();
}

/** Keep irreversible server-deletion truth separate from best-effort sign-out. */
export async function deleteAppDataThenAttemptSignOut(
  deleteAction: () => Promise<{ success: boolean }>,
  signOutAction: () => Promise<unknown>,
): Promise<{ deleted: true; signedOut: boolean }> {
  const deletion = await deleteAction();
  if (!deletion.success) throw new Error('MockMate could not confirm app data deletion.');
  try {
    await signOutAction();
    return { deleted: true, signedOut: true };
  } catch {
    return { deleted: true, signedOut: false };
  }
}
