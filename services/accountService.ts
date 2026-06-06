import { apiRoute } from './apiBase';
import { getAccessToken } from './supabaseClient';

export async function deleteMyData(): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Please sign in before deleting your data.');
  }

  const res = await fetch(apiRoute('/me/data'), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Could not delete your data.');
  }
}

export function clearLocalPracticeData() {
  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('mockmate_')) keysToRemove.push(key);
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}
