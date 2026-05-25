/** ISO time at first module load (before React). Pending judge requests older than this are abandoned after refresh. */
export const SESSION_BOOTSTRAP_AT_ISO = new Date().toISOString();

import '@/lib/judgeRequestEmailAccept';

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

/** Supabase redirects errors in the hash (#error=...&error_code=...) before the client clears it. */
const AUTH_REDIRECT_ERROR_KEY = 'oweit:auth-redirect-error-json';

function captureAuthRedirectErrorFromUrl(): void {
  if (typeof window === 'undefined') return;
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!rawHash.includes('error=')) return;
  const params = new URLSearchParams(rawHash);
  const error = params.get('error') ?? '';
  const errorCode = params.get('error_code') ?? '';
  const errorDescription = params.get('error_description') ?? '';
  if (!error && !errorCode && !errorDescription) return;
  try {
    sessionStorage.setItem(
      AUTH_REDIRECT_ERROR_KEY,
      JSON.stringify({ error, errorCode, errorDescription }),
    );
  } catch {
    /* ignore */
  }
}

captureAuthRedirectErrorFromUrl();

export type AuthRedirectErrorPayload = {
  error: string;
  errorCode: string;
  errorDescription: string;
};

/** Read once (e.g. on /auth) and clear — captured before Supabase strips the hash. */
export function consumeAuthRedirectError(): AuthRedirectErrorPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_REDIRECT_ERROR_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(AUTH_REDIRECT_ERROR_KEY);
    return JSON.parse(raw) as AuthRedirectErrorPayload;
  } catch {
    return null;
  }
}

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
