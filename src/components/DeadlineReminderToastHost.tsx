import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { TriangleAlert, X } from 'lucide-react';
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
  const temporaryHideRef = useRef<Set<string>>(new Set());
  const suppressNextPaymentFailedOnDismissRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    const onSuppress = (event: Event) => {
      const customEvent = event as CustomEvent<{ toastId?: string; notificationId?: string | null }>;
      const toastId =
        customEvent.detail?.toastId ??
        (customEvent.detail?.notificationId ? `payment_failed_${customEvent.detail.notificationId}` : null);
      if (!toastId) return;
      suppressNextPaymentFailedOnDismissRef.current.add(toastId);
    };
    window.addEventListener('suppress-payment-failed-toast-onDismiss', onSuppress as EventListener);
    return () => window.removeEventListener('suppress-payment-failed-toast-onDismiss', onSuppress as EventListener);
  }, []);

  useEffect(() => {
    const onPaymentFailedDismissed = (event: Event) => {
      const customEvent = event as CustomEvent<{ notificationId?: string | null }>;
      const notificationId = customEvent.detail?.notificationId ?? null;
      if (!notificationId) return;
      markDismissedLocally(notificationId);
    };
    window.addEventListener('payment-failed-dismissed', onPaymentFailedDismissed as EventListener);
    return () => window.removeEventListener('payment-failed-dismissed', onPaymentFailedDismissed as EventListener);
    // Intentionally no dependencies: `markDismissedLocally` is stable in practice for this component lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const showPaymentFailedToast = (row: { id: string; title?: string; body?: string; kind?: string; goalId?: string | null }) => {
    if (dismissedRef.current.has(row.id)) return;
    const isOwner = row.kind === 'payment_failed_goal_owner';
    const extractedGoalName =
      typeof row.body === 'string' ? row.body.match(/"([^"]+)"/)?.[1]?.trim() : null;
    const baseTitle = row.title ?? 'Stake transfer failed';
    const titleWithGoal =
      extractedGoalName && !baseTitle.toLowerCase().includes(extractedGoalName.toLowerCase())
        ? `${baseTitle} - ${extractedGoalName}`
        : baseTitle;
    const titlePrefix = 'Payment failed';
    const startsWithPrefix = titleWithGoal.toLowerCase().startsWith(titlePrefix.toLowerCase());
    const titleSuffixRaw = startsWithPrefix ? titleWithGoal.slice(titlePrefix.length) : titleWithGoal;
    const titleSuffix = titleSuffixRaw.replace(/\bfor an uncompleted goal\b/i, 'for uncompleted goal');

    const sonnerToastId = `payment_failed_${row.id}`;

    const toastTitleNode = startsWithPrefix ? (
      <span>
        <span className="font-extrabold text-warning">{titlePrefix}</span>
        <br />
        <span>{titleSuffix}</span>
      </span>
    ) : (
      <span className="font-extrabold text-warning">{titleWithGoal}</span>
    );

    const toastContent = (
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 text-left">{toastTitleNode}</div>
        <button
          type="button"
          aria-label="Dismiss notification"
          className="order-last shrink-0 self-start !h-8 !w-8 !rounded-lg !border-0 !bg-transparent !shadow-none p-1.5 text-muted-foreground transition-colors hover:!bg-muted hover:!text-foreground [&>svg]:!h-5 [&>svg]:!w-5"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.dispatchEvent(
              new CustomEvent('confirm-dismiss-payment-failed', {
                detail: {
                  notificationId: row.id,
                  goalId: row.goalId ?? null,
                  kind: row.kind ?? null,
                  title: titleWithGoal,
                },
              }),
            );
          }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    );

    const onDismiss = () => {
      // When user presses "Fix card", we temporarily hide the toast while the modal is open.
      // That should not count as an actual dismiss/read.
      if (temporaryHideRef.current.has(row.id)) {
        temporaryHideRef.current.delete(row.id);
        return;
      }

      // If the Retry modal confirmed dismiss, we already removed the toast and should not
      // open the confirmation again (or re-create it).
      if (suppressNextPaymentFailedOnDismissRef.current.has(sonnerToastId)) {
        suppressNextPaymentFailedOnDismissRef.current.delete(sonnerToastId);
        return;
      }

      // User clicked the toast close (X). Keep the toast visible until they confirm in the modal.
      window.dispatchEvent(
        new CustomEvent('confirm-dismiss-payment-failed', {
          detail: {
            notificationId: row.id,
            goalId: row.goalId ?? null,
            kind: row.kind ?? null,
            title: titleWithGoal,
          },
        }),
      );
    };

    toast.error(toastContent, {
      id: sonnerToastId,
      description: undefined,
      icon: <TriangleAlert className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden />,
      duration: Number.POSITIVE_INFINITY,
      closeButton: false,
      dismissible: false,
      action: isOwner
        ? {
            label: 'Fix card',
            onClick: () => {
              temporaryHideRef.current.add(row.id);
              toast.dismiss(sonnerToastId);
              const payload = {
                notificationId: row.id,
                goalId: row.goalId ?? null,
                kind: row.kind ?? null,
                title: titleWithGoal,
              };
              window.dispatchEvent(
                new CustomEvent('open-retry-payment-window', {
                  detail: payload,
                }),
              );
            },
          }
        : undefined,
      onDismiss,
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
        .in('kind', [
          'pulse_friend_congrats',
          'achievement_earned',
          'payment_failed_goal_owner',
          'payment_failed_goal_judge',
        ])
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
        } else if (row.kind === 'payment_failed_goal_owner' || row.kind === 'payment_failed_goal_judge') {
          showPaymentFailedToast({ id: row.id, title: row.title, body: row.body, kind: row.kind, goalId: row.goal_id });
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
          if (row.kind === 'payment_failed_goal_owner' || row.kind === 'payment_failed_goal_judge') {
            if (seenRef.current.has(row.id)) return;
            seenRef.current.add(row.id);
            showPaymentFailedToast({ id: row.id, title: row.title, body: row.body, kind: row.kind, goalId: row.goal_id });
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
              const goalRow = data as { title: string | null; stake: number | null; stake_currency: string | null } | null;
              const title = String(goalRow?.title ?? row.title ?? 'Goal');
              const stake = Number(goalRow?.stake ?? 0);
              const stakeCurrency = normalizeStakeCurrency(goalRow?.stake_currency);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resubscribe only when userId changes; toast helpers use refs
  }, [userId]);

  useEffect(() => {
    const onRetryWindowCancelled = (event: Event) => {
      const customEvent = event as CustomEvent<{
        notificationId?: string | null;
        goalId?: string | null;
        kind?: string | null;
        title?: string | null;
      }>;
      const notificationId = customEvent.detail?.notificationId ?? null;
      if (!notificationId) return;
      try {
        window.sessionStorage.removeItem('pending_retry_payment_toast_payload');
      } catch {
        // Ignore storage failures.
      }
      showPaymentFailedToast({
        id: notificationId,
        goalId: customEvent.detail?.goalId ?? null,
        kind: customEvent.detail?.kind ?? undefined,
        title: customEvent.detail?.title ?? undefined,
        body: '',
      });
    };

    window.addEventListener('retry-payment-window-cancelled', onRetryWindowCancelled as EventListener);
    return () => {
      window.removeEventListener('retry-payment-window-cancelled', onRetryWindowCancelled as EventListener);
    };
  }, []);

  return null;
}
