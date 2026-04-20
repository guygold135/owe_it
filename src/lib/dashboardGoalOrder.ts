const key = (userId: string) => `oweit_dashboard_goal_order:${userId}`;

/** Parse goal id list from localStorage or Supabase `jsonb`. */
export function parseGoalOrderIdsPayload(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string')) return null;
  return raw as string[];
}

/** Keep server order for ids that still exist; append new contract goals at the end. */
export function mergeServerGoalOrderWithContracts(serverIds: string[], contractIds: string[]): string[] {
  const allowed = new Set(contractIds);
  const head = serverIds.filter((id) => allowed.has(id));
  const tail = contractIds.filter((id) => !head.includes(id));
  return [...head, ...tail];
}

export function loadDashboardGoalOrder(userId: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

export function saveDashboardGoalOrder(userId: string, orderedIds: string[]) {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(orderedIds));
  } catch {
    // ignore quota / private mode
  }
}

/** Apply saved order; keep any new goal ids at the end in `fallbackOrder`. */
export function mergeGoalIdsWithSavedOrder(
  fallbackOrder: string[],
  userId: string | undefined,
): string[] {
  if (fallbackOrder.length === 0) return [];
  if (!userId) return fallbackOrder;
  const saved = loadDashboardGoalOrder(userId);
  if (!saved?.length) return fallbackOrder;
  const allowed = new Set(fallbackOrder);
  const head = saved.filter((id) => allowed.has(id));
  const tail = fallbackOrder.filter((id) => !head.includes(id));
  return [...head, ...tail];
}
