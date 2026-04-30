import { useMemo } from 'react';
import type { Goal } from '@/lib/types';

/**
 * Dashboard contract cards show active goals only.
 * Resolved outcomes are handled by the dedicated spotlight/history UIs.
 */
export function useDashboardVisibleContracts(goals: Goal[]) {
  return useMemo(() => {
    return goals.filter((g) => g.status === 'active');
  }, [goals]);
}
