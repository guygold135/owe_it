import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { peekWatchingJudgeRequest } from '@/lib/pendingGoalResume';

const RESUME_EVENT = 'oweit:resume-goal-request';

export function dispatchResumeGoalRequest(requestId: string) {
  window.dispatchEvent(new CustomEvent(RESUME_EVENT, { detail: { requestId } }));
}

/**
 * Shows a toast when a judge accepts while the requester left goal creation.
 * Includes a button to reopen the create sheet on the payment step.
 */
export function JudgeAcceptedNoticeHost() {
  const { user } = useAuth();
  const userId = user?.id;
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    seenRef.current.clear();

    const showToast = (row: {
      id: string;
      title?: string;
      body?: string;
      judge_request_id?: string | null;
    }) => {
      const requestId = row.judge_request_id ?? null;
      if (!requestId) return;
      if (seenRef.current.has(row.id)) return;
      if (peekWatchingJudgeRequest() === requestId) return;
      seenRef.current.add(row.id);

      toast.success(row.title ?? 'Judge accepted your request', {
        id: `judge_request_accepted_${row.id}`,
        description: row.body,
        duration: Number.POSITIVE_INFINITY,
        closeButton: true,
        icon: <Users className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden />,
        action: {
          label: 'Continue setup',
          onClick: () => {
            dispatchResumeGoalRequest(requestId);
            void supabase
              .from('in_app_notifications')
              .update({ read_at: new Date().toISOString() })
              .eq('id', row.id)
              .eq('user_id', userId);
          },
        },
        onDismiss: () => {
          void supabase
            .from('in_app_notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('id', row.id)
            .eq('user_id', userId);
        },
      });
    };

    void (async () => {
      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('id,kind,title,body,judge_request_id')
        .eq('user_id', userId)
        .eq('kind', 'judge_request_accepted')
        .is('read_at', null)
        .order('created_at', { ascending: true })
        .limit(10);
      if (error) {
        console.warn('Could not load judge accepted notifications', error);
        return;
      }
      for (const row of data ?? []) {
        if (!row?.id) continue;
        showToast(row);
      }
    })();

    const channel = supabase
      .channel(`judge_request_accepted_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            kind?: string;
            title?: string;
            body?: string;
            judge_request_id?: string | null;
          };
          if (row.kind !== 'judge_request_accepted' || !row.id) return;
          showToast(row);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}

export function useResumeGoalRequestListener(onResume: (requestId: string) => void) {
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ requestId?: string }>;
      const requestId = custom.detail?.requestId?.trim();
      if (!requestId) return;
      onResume(requestId);
    };
    window.addEventListener(RESUME_EVENT, handler as EventListener);
    return () => window.removeEventListener(RESUME_EVENT, handler as EventListener);
  }, [onResume]);
}
