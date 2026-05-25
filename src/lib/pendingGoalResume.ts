const PENDING_GOAL_RESUME_KEY = 'oweit:pending-goal-resume';
const WATCHING_JUDGE_REQUEST_KEY = 'oweit:watching-judge-request';

export function storePendingGoalResume(requestId: string): void {
  if (typeof window === 'undefined' || !requestId.trim()) return;
  try {
    localStorage.setItem(PENDING_GOAL_RESUME_KEY, requestId.trim());
  } catch {
    /* ignore */
  }
}

export function peekPendingGoalResume(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(PENDING_GOAL_RESUME_KEY);
  } catch {
    return null;
  }
}

export function consumePendingGoalResume(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(PENDING_GOAL_RESUME_KEY);
    if (!value) return null;
    localStorage.removeItem(PENDING_GOAL_RESUME_KEY);
    return value;
  } catch {
    return null;
  }
}

export function clearPendingGoalResume(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_GOAL_RESUME_KEY);
  } catch {
    /* ignore */
  }
}

export function setWatchingJudgeRequest(requestId: string): void {
  if (typeof window === 'undefined' || !requestId.trim()) return;
  try {
    sessionStorage.setItem(WATCHING_JUDGE_REQUEST_KEY, requestId.trim());
  } catch {
    /* ignore */
  }
}

export function clearWatchingJudgeRequest(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(WATCHING_JUDGE_REQUEST_KEY);
  } catch {
    /* ignore */
  }
}

export function peekWatchingJudgeRequest(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(WATCHING_JUDGE_REQUEST_KEY);
  } catch {
    return null;
  }
}

export function resumeGoalRequestSearchParam(): string | null {
  if (typeof window === 'undefined') return null;
  try {
  const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('resumeGoalRequest')?.trim();
    if (fromQuery) return fromQuery;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash.includes('?')) return null;
    const hashQuery = hash.slice(hash.indexOf('?') + 1);
    return new URLSearchParams(hashQuery).get('resumeGoalRequest')?.trim() ?? null;
  } catch {
    return null;
  }
}

export function clearResumeGoalRequestFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('resumeGoalRequest');
    const hash = url.hash.replace(/^#/, '');
    if (hash.includes('?')) {
      const [hashPath, hashQuery] = hash.split('?');
      const params = new URLSearchParams(hashQuery);
      params.delete('resumeGoalRequest');
      const nextQuery = params.toString();
      url.hash = nextQuery ? `#${hashPath}?${nextQuery}` : hashPath ? `#${hashPath}` : '';
    }
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* ignore */
  }
}

export type GoalDraftPayload = {
  title?: string;
  description?: string;
  stake?: number;
  stakeCurrency?: string;
  deadline?: string;
  isPrivate?: boolean;
  charityId?: string;
};

export function parseGoalDraftPayload(raw: unknown): GoalDraftPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  return {
    title: typeof p.title === 'string' ? p.title : undefined,
    description: typeof p.description === 'string' ? p.description : undefined,
    stake: typeof p.stake === 'number' ? p.stake : Number(p.stake ?? 0),
    stakeCurrency: typeof p.stakeCurrency === 'string' ? p.stakeCurrency : undefined,
    deadline: typeof p.deadline === 'string' ? p.deadline : undefined,
    isPrivate: Boolean(p.isPrivate),
    charityId: typeof p.charityId === 'string' ? p.charityId : undefined,
  };
}
