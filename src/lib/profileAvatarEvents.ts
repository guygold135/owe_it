export const PROFILE_AVATAR_UPDATED_EVENT = 'oweit:profile-avatar-updated';

const storageKey = (userId: string) => `oweit_profile_avatar_${userId}`;

/** Read cached avatar URL synchronously (avoids header flash before fetch). */
export function readProfileAvatarFromStorage(userId: string | undefined): string | null {
  if (!userId || typeof window === 'undefined') return null;
  return window.localStorage.getItem(storageKey(userId));
}

export function writeProfileAvatarToStorage(userId: string, url: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const key = storageKey(userId);
  const trimmed = url?.trim();
  if (trimmed) window.localStorage.setItem(key, trimmed);
  else window.localStorage.removeItem(key);
}

export function dispatchProfileAvatarUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PROFILE_AVATAR_UPDATED_EVENT));
}
