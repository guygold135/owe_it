import { useEffect, useMemo, useState } from 'react';
import type { Goal } from '@/lib/types';

/** How long completed/failed goals stay on the Dashboard after resolution */
const RESOLVED_ON_DASHBOARD_MS = 5 * 60 * 1000;

/**
 * Active goals always show. Completed/failed show only for a short window after `resolvedAt`
 * (History keeps the full record).
 */
export function useDashboardVisibleContracts(goals: Goal[]) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    return goals.filter((g) => {
      if (g.status === 'active') return true;
      if (g.status === 'completed' || g.status === 'failed') {
        if (!g.resolvedAt) return false;
        return now - g.resolvedAt.getTime() < RESOLVED_ON_DASHBOARD_MS;
      }
      return false;
    });
  }, [goals, now]);
}
