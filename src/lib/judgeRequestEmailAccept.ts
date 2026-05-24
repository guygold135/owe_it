const PENDING_JUDGE_ACCEPT_KEY = 'oweit:pending-judge-accept';

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
