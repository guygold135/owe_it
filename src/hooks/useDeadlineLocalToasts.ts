import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  buildDeadlineToastDescription,
  deadlineDismissStorageKey,
  deadlineToastId,
  isDeadlineWarningDismissed,
  showDeadlineWarningToast,
} from '@/lib/deadlineToast';
import { formatStakeAmount } from '@/lib/currency';

const MS_6H = 6 * 60 * 60 * 1000;
const MS_24H = 24 * 60 * 60 * 1000;
const TICK_MS = 1000;

type GoalSlice = { id: string; deadline: Date; title: string; stake: number; stakeCurrency: string };

/**
 * When an active goal’s time left is under 24h or 6h, show a Sonner toast until the user
 * dismisses it (localStorage). Survives refresh; thresholds reset if the deadline moves
 * out of the window again.
 */
export function useDeadlineLocalToasts(goals: GoalSlice[]) {
  const goalsRef = useRef(goals);
  goalsRef.current = goals;
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const g of goalsRef.current) {
        const ms = g.deadline.getTime() - now;
        const id24 = deadlineToastId('deadline_24h', g.id);
        const id6 = deadlineToastId('deadline_6h', g.id);

        if (ms <= 0) continue;

        if (ms > MS_24H) {
          try {
            localStorage.removeItem(deadlineDismissStorageKey(id24));
            localStorage.removeItem(deadlineDismissStorageKey(id6));
          } catch {
            /* ignore */
          }
          shownRef.current.delete(id24);
          shownRef.current.delete(id6);
          continue;
        }

        if (ms > MS_6H) {
          try {
            localStorage.removeItem(deadlineDismissStorageKey(id6));
          } catch {
            /* ignore */
          }
          shownRef.current.delete(id6);
        }

        if (ms <= MS_6H) {
          if (isDeadlineWarningDismissed(id6)) continue;
          if (shownRef.current.has(id6)) continue;
          shownRef.current.add(id6);
          toast.dismiss(id24);
          showDeadlineWarningToast({
            id: id6,
            title: 'Urgent — deadline very soon',
            description: buildDeadlineToastDescription({
              title: g.title,
              kind: 'deadline_6h',
              stakeFormatted: g.stake > 0 ? formatStakeAmount(g.stake, g.stakeCurrency) : null,
            }),
            kind: 'deadline_6h',
          });
          continue;
        }

        if (ms <= MS_24H) {
          if (isDeadlineWarningDismissed(id24)) continue;
          if (shownRef.current.has(id24)) continue;
          shownRef.current.add(id24);
          showDeadlineWarningToast({
            id: id24,
            title: 'Due soon',
            description: buildDeadlineToastDescription({
              title: g.title,
              kind: 'deadline_24h',
              stakeFormatted: g.stake > 0 ? formatStakeAmount(g.stake, g.stakeCurrency) : null,
            }),
            kind: 'deadline_24h',
          });
        }
      }
    };

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);
}
