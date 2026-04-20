import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
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
 * Subscribes to `in_app_notifications` for the signed-in user and shows Sonner toasts for:
 * - Friend celebration messages from Pulse (`pulse_friend_congrats`)
 * - Goal deadline reminders (`deadline_*`)
 */
export function DeadlineReminderToastHost() {
  const { user } = useAuth();
  const userId = user?.id;
  const seenRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Set<string>>(new Set());

  const dismissedStorageKey = userId ? `in_app_notification_dismissed:${userId}` : null;

  useEffect(() => {
    dismissedRef.current.clear();
    if (!dismissedStorageKey) return;
    try {
      const raw = localStorage.getItem(dismissedStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      dismissedRef.current = new Set(parsed.filter((v): v is string => typeof v === 'string'));
    } catch {
      // Ignore malformed or unavailable storage.
    }
  }, [dismissedStorageKey]);

  const markDismissedLocally = (notificationId: string) => {
    dismissedRef.current.add(notificationId);
    if (!dismissedStorageKey) return;
    try {
      localStorage.setItem(dismissedStorageKey, JSON.stringify(Array.from(dismissedRef.current).slice(-300)));
    } catch {
      // Ignore storage write failures.
    }
  };

  const showPulseCongratsToast = (row: { id: string; title?: string; body?: string }) => {
    if (dismissedRef.current.has(row.id)) return;
    toast.success(row.title ?? 'Your friend is celebrating you!', {
      id: `pulse_friend_congrats_${row.id}`,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-foreground"
          aria-hidden
        >
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </svg>
      ),
      description: row.body,
      /** Stays until the close (X) control is used; Sonner skips auto-dismiss when duration is Infinity. */
      duration: Number.POSITIVE_INFINITY,
      closeButton: true,
      closeButtonAriaLabel: 'Dismiss message',
      onDismiss: () => {
        markDismissedLocally(row.id);
        void supabase
          .from('in_app_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('user_id', userId ?? '')
          .then(({ error }) => {
            if (error) {
              console.warn('Could not mark notification as read', error);
            }
          });
      },
    });
  };

  const showAchievementToast = (row: { id: string; title?: string; body?: string }) => {
    if (dismissedRef.current.has(row.id)) return;
    toast.success(row.title ?? 'Achievement unlocked!', {
      id: `achievement_earned_${row.id}`,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-foreground"
          aria-hidden
        >
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </svg>
      ),
      description: row.body,
      duration: Number.POSITIVE_INFINITY,
      closeButton: true,
      closeButtonAriaLabel: 'Dismiss message',
      onDismiss: () => {
        markDismissedLocally(row.id);
        void supabase
          .from('in_app_notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('user_id', userId ?? '')
          .then(({ error }) => {
            if (error) {
              console.warn('Could not mark notification as read', error);
            }
          });
      },
    });
  };

  useEffect(() => {
    if (!userId) return;
    seenRef.current.clear();

    void (async () => {
      // Show undismissed congratulation messages that were inserted while the user was offline.
      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('id,kind,title,body,goal_id')
        .eq('user_id', userId)
        .in('kind', ['pulse_friend_congrats', 'achievement_earned'])
        .is('read_at', null)
        .order('created_at', { ascending: true })
        .limit(20);
      if (error) {
        console.warn('Could not load pending congratulations', error);
        return;
      }
      for (const row of data ?? []) {
        if (!row?.id) continue;
        if (seenRef.current.has(row.id)) continue;
        seenRef.current.add(row.id);
        if (row.kind === 'achievement_earned') {
          showAchievementToast({ id: row.id, title: row.title, body: row.body });
        } else {
          showPulseCongratsToast({ id: row.id, title: row.title, body: row.body });
        }
      }
    })();

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
          if (!row?.id || !row.kind) return;

          if (row.kind === 'pulse_friend_congrats') {
            if (seenRef.current.has(row.id)) return;
            seenRef.current.add(row.id);
            showPulseCongratsToast({ id: row.id, title: row.title, body: row.body });
            return;
          }
          if (row.kind === 'achievement_earned') {
            if (seenRef.current.has(row.id)) return;
            seenRef.current.add(row.id);
            showAchievementToast({ id: row.id, title: row.title, body: row.body });
            return;
          }

          if (!row.kind.startsWith('deadline_')) return;
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
