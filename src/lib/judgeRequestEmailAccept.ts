const PENDING_JUDGE_ACCEPT_KEY = 'oweit:pending-judge-accept';
export const JUDGE_INVITE_REQUEST_QUERY_PARAM = 'judgeInviteRequestId';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Supabase magic links put tokens in the hash — wait before sending the user to /auth. */
export function urlHasAuthCallbackHash(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash;
  return (
    hash.includes('access_token=') ||
    hash.includes('refresh_token=') ||
    hash.includes('type=magiclink') ||
    hash.includes('type=signup')
  );
}

export function storePendingJudgeAccept(requestId: string): void {
  if (typeof window === 'undefined' || !requestId.trim()) return;
  try {
    sessionStorage.setItem(PENDING_JUDGE_ACCEPT_KEY, requestId.trim());
  } catch {
    /* ignore */
  }
}

export function consumePendingJudgeAccept(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = sessionStorage.getItem(PENDING_JUDGE_ACCEPT_KEY);
    if (!value) return null;
    sessionStorage.removeItem(PENDING_JUDGE_ACCEPT_KEY);
    return value;
  } catch {
    return null;
  }
}

export function peekPendingJudgeAccept(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(PENDING_JUDGE_ACCEPT_KEY);
  } catch {
    return null;
  }
}

function tryStoreJudgeInviteRequestId(raw: string | null | undefined): boolean {
  const id = raw?.trim();
  if (!id || !UUID_RE.test(id)) return false;
  storePendingJudgeAccept(id);
  return true;
}

/** Run before Supabase auth clears the URL hash (import from sessionBootstrap). */
export function captureJudgeInviteFromUrl(): void {
  if (typeof window === 'undefined') return;

  const searchParams = new URLSearchParams(window.location.search);
  if (tryStoreJudgeInviteRequestId(searchParams.get(JUDGE_INVITE_REQUEST_QUERY_PARAM))) return;

  const pathMatch = window.location.pathname.match(/\/judge-invite\/([^/]+)/i);
  if (tryStoreJudgeInviteRequestId(pathMatch?.[1])) return;

  const hash = window.location.hash.replace(/^#/, '');
  if (hash.includes('?')) {
    const hashQuery = hash.slice(hash.indexOf('?') + 1);
    const hashParams = new URLSearchParams(hashQuery);
    if (tryStoreJudgeInviteRequestId(hashParams.get(JUDGE_INVITE_REQUEST_QUERY_PARAM))) return;
  }

  const hashPathMatch = hash.match(/^\/?judge-invite\/([^/?]+)/i);
  tryStoreJudgeInviteRequestId(hashPathMatch?.[1]);
}

export function clearJudgeInviteRequestFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(JUDGE_INVITE_REQUEST_QUERY_PARAM);
    const hash = url.hash.replace(/^#/, '');
    if (hash.includes('?')) {
      const [hashPath, hashQuery] = hash.split('?');
      const params = new URLSearchParams(hashQuery);
      params.delete(JUDGE_INVITE_REQUEST_QUERY_PARAM);
      const nextQuery = params.toString();
      url.hash = nextQuery ? `#${hashPath}?${nextQuery}` : hashPath ? `#${hashPath}` : '';
    }
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* ignore */
  }
}

export function buildJudgeInviteLandingUrl(appUrl: string, requestId: string): string {
  const base = appUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ [JUDGE_INVITE_REQUEST_QUERY_PARAM]: requestId });
  return `${base}/?${params.toString()}`;
}

export function buildJudgeInvitePathUrl(appUrl: string, requestId: string): string {
  return `${appUrl.replace(/\/$/, '')}/judge-invite/${requestId}`;
}

captureJudgeInviteFromUrl();
