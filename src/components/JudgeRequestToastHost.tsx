import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFriendsData } from '@/hooks/useFriendsData';
import { queryKeys } from '@/lib/queryKeys';
import { JudgeRequestInviteCard } from '@/components/ui/judge-request-invite';
import { judgeRequestDescriptionLine, judgeRequestPayloadLines } from '@/lib/judgeRequestUi';
import type { FriendsBundle } from '@/lib/fetchers/tabData';
import { cn } from '@/lib/utils';

/** Space between judge stack and Sonner anchor (px). */
const JUDGE_TO_SONNER_GAP_PX = 12;

/**
 * Pending judge requests as stacked bottom-right cards (same corner/feel as Sonner toasts), on every route.
 */
export function JudgeRequestToastHost() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { judgeRequests, refetch } = useFriendsData();
  const [busyId, setBusyId] = useState<string | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const setInsetPx = (px: number) => {
      root.style.setProperty('--oweit-judge-stack-inset', `${px}px`);
    };
    const clearInset = () => {
      root.style.removeProperty('--oweit-judge-stack-inset');
    };

    if (judgeRequests.length === 0) {
      clearInset();
      return;
    }
    const el = stackRef.current;
    if (!el) {
      clearInset();
      return;
    }
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      setInsetPx(h > 0 ? h + JUDGE_TO_SONNER_GAP_PX : 0);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearInset();
    };
  }, [judgeRequests.length]);

  const invalidate = useCallback(() => {
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.friends(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.goalsAsJudge(userId) });
  }, [queryClient, userId]);

  /** Drop the toast immediately on confirm; refetch restores if RPC fails. */
  const optimisticRemoveJudgeRequest = useCallback(
    (id: string) => {
      if (!userId) return;
      queryClient.setQueryData<FriendsBundle>(queryKeys.friends(userId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          judgeRequests: prev.judgeRequests.filter((r) => r.id !== id),
        };
      });
    },
    [queryClient, userId],
  );

  const accept = useCallback(
    async (id: string) => {
      optimisticRemoveJudgeRequest(id);
      setBusyId(id);
      const { error } = await supabase.rpc('accept_judge_request', { p_request_id: id });
      setBusyId(null);
      if (error) {
        console.error('Accept judge request error', error);
        void refetch();
        return;
      }
      invalidate();
      void refetch();
    },
    [invalidate, optimisticRemoveJudgeRequest, refetch],
  );

  const ignore = useCallback(
    async (id: string) => {
      optimisticRemoveJudgeRequest(id);
      setBusyId(id);
      const { error } = await supabase.rpc('ignore_judge_request', { p_request_id: id });
      setBusyId(null);
      if (error) {
        console.error('Ignore judge request error', error);
        void refetch();
        return;
      }
      invalidate();
      void refetch();
    },
    [invalidate, optimisticRemoveJudgeRequest, refetch],
  );

  /** Same idea as CreateGoalSheet’s poll fallback: Realtime can miss events depending on project settings. */
  useEffect(() => {
    if (!userId) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    const id = window.setInterval(tick, 8000);
    return () => window.clearInterval(id);
  }, [userId, refetch]);

  /**
   * No column filter: RLS limits which rows you receive; filtered subscriptions can fail for UUID/UPDATE
   * unless replica identity + publication are perfect. Any visible change → refresh pending requests.
   */
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`judge_requests_invalidate_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'judge_requests' },
        () => {
          invalidate();
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' && err) {
          console.warn('Judge request realtime channel error', err);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, invalidate]);

  return (
    <div
      ref={stackRef}
      className={cn(
        'pointer-events-none fixed bottom-20 right-4 z-[100] flex max-h-[min(70vh,calc(100vh-8rem))] w-[min(100vw-2rem,22rem)] flex-col gap-2 overflow-y-auto overscroll-contain pb-1',
        judgeRequests.length === 0 && 'hidden',
      )}
      aria-live="polite"
      aria-hidden={judgeRequests.length === 0}
    >
      {judgeRequests.map((r) => {
        const requesterName = r.requesterProfile?.display_name || 'Friend';
        const { title, deadlineFormatted, stakeFormatted, charitySummary, visibility } = judgeRequestPayloadLines(
          r.goal_payload,
        );
        const description = judgeRequestDescriptionLine(r);
        const timeLine = `Invited ${formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}`;

        return (
          <div key={r.id} className="pointer-events-auto shrink-0">
            <JudgeRequestInviteCard
              appearance="toast"
              requesterName={requesterName}
              requesterAvatarUrl={r.requesterProfile?.avatar_url}
              goalTitle={title}
              visibility={visibility}
              deadlineFormatted={deadlineFormatted}
              stakeFormatted={stakeFormatted}
              charitySummary={charitySummary}
              description={description}
              timeLine={timeLine}
              busy={busyId === r.id}
              onAccept={() => accept(r.id)}
              onIgnore={() => ignore(r.id)}
              className="max-w-none"
            />
          </div>
        );
      })}
    </div>
  );
}

