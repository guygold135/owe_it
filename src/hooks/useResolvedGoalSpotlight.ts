import { useEffect, useMemo, useRef, useState } from 'react';
import type { Goal } from '@/lib/types';

const SPOTLIGHT_MS = 5 * 60 * 1000;

/**
 * After a goal goes from active → completed/failed (including auto-expire), keep it in the spotlight
 * on the Dashboard for five minutes. Ignores goals already resolved when the session first loads.
 */
export function useResolvedGoalSpotlight(goals: Goal[]) {
  const prevStatusRef = useRef<Map<string, Goal['status']>>(new Map());
  const [spotlightSince, setSpotlightSince] = useState<Map<string, number>>(() => new Map());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const toSpotlight: string[] = [];
    for (const g of goals) {
      const was = prev.get(g.id);
      if ((g.status === 'completed' || g.status === 'failed') && was === 'active') {
        toSpotlight.push(g.id);
      }
    }
    const newPrev = new Map<string, Goal['status']>();
    goals.forEach((g) => newPrev.set(g.id, g.status));
    prevStatusRef.current = newPrev;

    if (toSpotlight.length === 0) return;

    const now = Date.now();
    setSpotlightSince((prevMap) => {
      const next = new Map(prevMap);
      for (const id of toSpotlight) {
        next.set(id, now);
      }
      return next;
    });
  }, [goals]);

  const spotlightGoals = useMemo(() => {
    const now = Date.now();
    return goals.filter((g) => {
      const t = spotlightSince.get(g.id);
      if (t == null) return false;
      if (now - t >= SPOTLIGHT_MS) return false;
      return g.status === 'completed' || g.status === 'failed';
    });
  }, [goals, spotlightSince, tick]);

  return spotlightGoals;
}
