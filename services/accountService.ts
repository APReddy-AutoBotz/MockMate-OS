import { AccountDeletionResponseSchema } from 'mockmate-shared';
import { apiClient } from './apiClient';

export async function deleteMyData(): Promise<void> {
  await apiClient.delete('me/data', AccountDeletionResponseSchema);
}

export function clearLocalPracticeData() {
  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('mockmate_')) keysToRemove.push(key);
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}
