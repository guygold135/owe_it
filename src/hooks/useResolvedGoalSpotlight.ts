import { useEffect, useMemo, useState } from 'react';
import type { Goal } from '@/lib/types';

const SPOTLIGHT_MS = 5 * 60 * 1000;

/**
 * Keep recently resolved goals (completed/failed) in the Dashboard spotlight for five minutes
 * based on their actual `resolvedAt` timestamp.
 */
export function useResolvedGoalSpotlight(goals: Goal[]) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const spotlightGoals = useMemo(() => {
    return goals.filter((g) => {
      if (g.status !== 'completed' && g.status !== 'failed') return false;
      if (!g.resolvedAt) return false;
      return now - g.resolvedAt.getTime() < SPOTLIGHT_MS;
    });
  }, [goals, now]);

  return spotlightGoals;
}
