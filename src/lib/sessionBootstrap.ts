/** ISO time at first module load (before React). Pending judge requests older than this are abandoned after refresh. */
export const SESSION_BOOTSTRAP_AT_ISO = new Date().toISOString();

/**
 * Supabase clears `window.location.hash` during auth client init before React runs.
 * We persist recovery intent here (imported in main.tsx before App → before createClient).
 */
const PASSWORD_RECOVERY_SESSION_KEY = 'oweit:password-recovery-pending';

function capturePasswordRecoveryFromUrl(): void {
  if (typeof window === 'undefined') return;
  const { hash, search } = window.location;
  if (hash.includes('type=recovery') || search.includes('type=recovery')) {
    try {
      sessionStorage.setItem(PASSWORD_RECOVERY_SESSION_KEY, '1');
    } catch {
      /* quota / private mode */
    }
  }
}

capturePasswordRecoveryFromUrl();

export function hasPendingPasswordRecoveryFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(PASSWORD_RECOVERY_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearPendingPasswordRecoveryFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PASSWORD_RECOVERY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
