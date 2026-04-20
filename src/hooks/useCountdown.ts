import { useEffect, useMemo, useState } from 'react';
import type { Goal } from '@/lib/types';

/** `within6h` / `within24h` drive copy + styling; `none` is normal countdown. */
export type DeadlineUrgency = 'none' | 'within24h' | 'within6h';

/** Same urgency window as goal cards / deadline toasts (active, not yet expired). */
export function getDeadlineUrgencyForDate(deadline: Date): DeadlineUrgency {
  const diff = Math.max(0, deadline.getTime() - Date.now());
  if (diff === 0) return 'none';
  if (diff < 6 * 60 * 60 * 1000) return 'within6h';
  if (diff < 24 * 60 * 60 * 1000) return 'within24h';
  return 'none';
}

export function goalHasSoonDeadline(g: Goal | undefined): boolean {
  if (!g || g.status !== 'active' || !g.deadline) return false;
  const u = getDeadlineUrgencyForDate(g.deadline);
  return u === 'within6h' || u === 'within24h';
}

/** Recomputes every second so the warning stays in sync with countdown UIs. */
export function useCategoryHasSoonDeadline(goalIds: string[], contractGoalById: Map<string, Goal>): boolean {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const idsKey = goalIds.join(',');
  return useMemo(() => {
    void tick;
    if (!idsKey) return false;
    for (const id of idsKey.split(',')) {
      if (goalHasSoonDeadline(contractGoalById.get(id))) return true;
    }
    return false;
  }, [tick, idsKey, contractGoalById]);
}

export function useCountdown(deadline: Date) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(deadline));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(deadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return timeLeft;
}

function getTimeLeft(deadline: Date) {
  const diff = Math.max(0, deadline.getTime() - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const within6h = diff < 6 * 60 * 60 * 1000;
  const within24h = diff < 24 * 60 * 60 * 1000;
  let urgency: DeadlineUrgency = 'none';
  if (within6h) urgency = 'within6h';
  else if (within24h) urgency = 'within24h';
  const isUrgent = within6h;
  const isExpired = diff === 0;

  return { days, hours, minutes, seconds, isUrgent, isExpired, totalMs: diff, urgency };
}
