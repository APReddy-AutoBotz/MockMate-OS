import { AccountDeletionResponse, AccountDeletionResponseSchema } from 'mockmate-shared';
import { apiClient } from './apiClient';

export async function deleteMyData(): Promise<AccountDeletionResponse> {
  const result = await apiClient.delete('me/data', AccountDeletionResponseSchema);
  if (result.success) {
    // Server deletion is the authority. Browser cleanup is best-effort and
    // must never turn a confirmed deletion into a reported server failure.
    clearLocalPracticeData();
  }
  return result;
}

export function clearLocalPracticeData(): boolean {
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('mockmate_')) keysToRemove.push(key);
    }
    for (const key of keysToRemove) localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn('MockMate browser data could not be cleared.', error);
    return false;
  }
}
