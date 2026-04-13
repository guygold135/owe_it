export type AppTutorialPhase =
  | 'off'
  | 'welcome'
  | 'fab'
  | 'sheet_goal'
  | 'sheet_stake'
  | 'sheet_judge'
  | 'sheet_card'
  | 'sheet_confirm'
  | 'tab_goals'
  | 'tab_my_judges'
  | 'tab_pulse'
  | 'tab_friends'
  | 'tab_profile_menu';

/** Create-goal sheet step index (0–4) → tutorial phase for that screen. */
export const APP_TUTORIAL_SHEET_STEP_TO_PHASE: Record<
  number,
  'sheet_goal' | 'sheet_stake' | 'sheet_judge' | 'sheet_card' | 'sheet_confirm'
> = {
  0: 'sheet_goal',
  1: 'sheet_stake',
  2: 'sheet_judge',
  3: 'sheet_card',
  4: 'sheet_confirm',
};

export function isAppTutorialSheetPhase(p: AppTutorialPhase): boolean {
  return (
    p === 'sheet_goal' ||
    p === 'sheet_stake' ||
    p === 'sheet_judge' ||
    p === 'sheet_card' ||
    p === 'sheet_confirm'
  );
}

const TUTORIAL_GOAL_IDS_KEY = 'app_tutorial_goal_ids_v1';

function readTutorialGoalIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TUTORIAL_GOAL_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    return [];
  }
}

function writeTutorialGoalIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TUTORIAL_GOAL_IDS_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function markGoalAsTutorialCreated(goalId: string) {
  if (!goalId) return;
  const ids = readTutorialGoalIds();
  ids.push(goalId);
  writeTutorialGoalIds(ids);
}

export function isTutorialCreatedGoal(goalId: string): boolean {
  if (!goalId) return false;
  return readTutorialGoalIds().includes(goalId);
}

export function unmarkTutorialCreatedGoal(goalId: string) {
  if (!goalId) return;
  const ids = readTutorialGoalIds().filter((id) => id !== goalId);
  writeTutorialGoalIds(ids);
}
