const STORAGE_KEY = 'oweit-dismissed-judge-goal-notices';

export function loadDismissedJudgeGoalNoticeIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function dismissJudgeGoalNotice(goalId: string): void {
  const s = loadDismissedJudgeGoalNoticeIds();
  s.add(goalId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
}
