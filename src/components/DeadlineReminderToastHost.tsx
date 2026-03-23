import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  buildDeadlineToastDescription,
  deadlineToastId,
  isDeadlineWarningDismissed,
  showDeadlineWarningToast,
  type DeadlineReminderKind,
} from '@/lib/deadlineToast';
import { formatStakeAmount, normalizeStakeCurrency } from '@/lib/currency';

/**
 * Shows Sonner toasts when a deadline reminder row is inserted for the current user
 * (Realtime; works when the other party triggered the RPC).
 */
export function DeadlineReminderToastHost() {
  const { user } = useAuth();
  const userId = user?.id;
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    seenRef.current.clear();

    const channel = supabase
      .channel(`in_app_notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          void (async () => {
          const row = payload.new as {
            id?: string;
            kind?: string;
            title?: string;
            body?: string;
            goal_id?: string | null;
          };
          if (!row?.id || !row.kind?.startsWith('deadline_')) return;
          if (seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);
          const kind = row.kind as DeadlineReminderKind;
          if (kind !== 'deadline_24h' && kind !== 'deadline_6h') return;
          const goalKey = row.goal_id ?? row.id;
          const toastId = deadlineToastId(kind, goalKey!);
          if (isDeadlineWarningDismissed(toastId)) return;

          let descriptionNode: string | ReturnType<typeof buildDeadlineToastDescription> = row.body ?? '';
          try {
            if (row.goal_id) {
              const { data } = await supabase
                .from('goals')
                .select('title,stake,stake_currency')
                .eq('id', row.goal_id)
                .maybeSingle();
              const title = String((data as any)?.title ?? row.title ?? 'Goal');
              const stake = Number((data as any)?.stake ?? 0);
              const stakeCurrency = normalizeStakeCurrency((data as any)?.stake_currency);
              const stakeFormatted = stake > 0 ? formatStakeAmount(stake, stakeCurrency) : null;
              descriptionNode = buildDeadlineToastDescription({ title, kind, stakeFormatted });
            }
          } catch (e) {
            console.warn('Could not enrich deadline reminder toast', e);
          }

          showDeadlineWarningToast({
            id: toastId,
            title: row.title ?? 'Deadline reminder',
            description: descriptionNode,
            kind,
          });
          })();
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('in_app_notifications realtime:', err?.message ?? status);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
