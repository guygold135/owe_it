import { useEffect, useRef } from 'react';
import { Goal } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { resolveGoalDirect } from '@/lib/resolveGoalDirect';

/**
 * When an active goal's deadline has passed, automatically resolve it as **failed**
 * (uncompleted): capture stake via Stripe when applicable, insert pulse for friends, etc.
 *
 * Runs when the user loads goals they **own** (Dashboard) or **judge** (My Judges).
 * Server still authorizes: only judge (any time) or owner (only when expired) can fail.
 */
export function useAutoExpireGoals(
  goals: Goal[],
  loadGoals: () => Promise<void>,
  options: { enabled: boolean; loading: boolean }
) {
  const { user } = useAuth();
  const { enabled, loading } = options;
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled || loading || !user?.id) return;

    const now = Date.now();
    const expiredActive = goals.filter(
      (g) => g.status === 'active' && g.deadline.getTime() <= now
    );
    if (expiredActive.length === 0 || runningRef.current) return;

    runningRef.current = true;
    void (async () => {
      try {
        for (const g of expiredActive) {
          const result = await resolveGoalDirect({ goalId: g.id, outcome: 'failed' });
          if (!result.success) {
            // Race: another tab or judge may have resolved it already.
            if (result.error?.toLowerCase().includes('already resolved')) continue;
            console.error('[auto-expire] goal', g.id, result.error);
          }
        }
        await loadGoals();
      } finally {
        runningRef.current = false;
      }
    })();
  }, [enabled, loading, goals, user?.id, loadGoals]);
}
