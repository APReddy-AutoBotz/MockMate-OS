import { clearLocalPracticeData } from './accountService';
import type { UserProfile } from '../types/ui';

export const LOCAL_PRACTICE_OWNER_KEY = 'mockmate_local_owner_uid';
const LOCAL_USER_PROFILE_KEY = 'mockmate_user_profile';
export type LocalPracticeOwnerBinding = 'preserved' | 'cleared' | 'storage_unavailable';

/** Parse browser-owned profile state without allowing malformed JSON to stall auth startup. */
export function readLocalUserProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_PROFILE_KEY);
    if (!raw) return null;
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
    try {
      localStorage.removeItem(LOCAL_USER_PROFILE_KEY);
    } catch {
      // Storage may be unavailable (privacy mode, quota, or browser policy).
    }
    return null;
  }
}

/**
 * Bind browser-local practice data to the authenticated owner. Legacy data has
 * no owner marker and is cleared on first upgraded login rather than guessed.
 */
export function bindLocalPracticeDataOwner(userId: string): LocalPracticeOwnerBinding {
  if (!userId) throw new Error('Authenticated user id is required for local data ownership');
  let currentOwner: string | null;
  try {
    currentOwner = localStorage.getItem(LOCAL_PRACTICE_OWNER_KEY);
  } catch {
    return 'storage_unavailable';
  }
  const outcome = currentOwner === userId ? 'preserved' : 'cleared';
  if (outcome === 'cleared' && !clearLocalPracticeData()) return 'storage_unavailable';
  try {
    localStorage.setItem(LOCAL_PRACTICE_OWNER_KEY, userId);
  } catch {
    return 'storage_unavailable';
  }
  return outcome;
}

/**
 * Sign out without destroying owner-bound practice data. React state is cleared
 * by the caller, while the owner marker lets the same user restore local
 * profile, journal, and recovery state on their next login. A different user
 * is still wiped by bindLocalPracticeDataOwner before any local data is read.
 */
export async function signOutPreservingLocalPracticeData(
  signOutAction: () => Promise<unknown>,
): Promise<void> {
  await signOutAction();
}

/** Keep irreversible server-deletion truth separate from best-effort sign-out. */
export async function deleteAppDataThenAttemptSignOut(
  deleteAction: () => Promise<{ success: boolean }>,
  signOutAction: () => Promise<unknown>,
): Promise<{ deleted: true; signedOut: boolean; localDataCleared: boolean }> {
  const deletion = await deleteAction();
  if (!deletion.success) throw new Error('MockMate could not confirm app data deletion.');
  const localDataCleared = clearLocalPracticeData();
  try {
    await signOutAction();
    return { deleted: true, signedOut: true, localDataCleared };
  } catch {
    return { deleted: true, signedOut: false, localDataCleared };
  }
}
