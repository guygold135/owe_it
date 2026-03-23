import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchGoalsAsJudge } from '@/lib/fetchers/tabData';
import { dismissJudgeGoalNotice, loadDismissedJudgeGoalNoticeIds } from '@/lib/judgeGoalNoticeStorage';
import { cn } from '@/lib/utils';

type Notice = { id: string; goalTitle: string; creatorName: string };

const CATCH_UP_MS = 48 * 60 * 60 * 1000;

/**
 * When a friend finishes creating a goal and you are their judge, shows a persistent card (bottom-right, above nav)
 * until dismissed (X).
 */
export function JudgeGoalCreatedNoticeHost() {
  const { user } = useAuth();
  const userId = user?.id;
  const [notices, setNotices] = useState<Notice[]>([]);
  const dismissedRef = useRef(loadDismissedJudgeGoalNoticeIds());

  const addNotice = useCallback((n: Notice) => {
    setNotices((prev) => {
      if (dismissedRef.current.has(n.id)) return prev;
      if (prev.some((p) => p.id === n.id)) return prev;
      return [...prev, n];
    });
  }, []);

  const removeNotice = useCallback((id: string) => {
    dismissJudgeGoalNotice(id);
    dismissedRef.current.add(id);
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /** Recent goals where you’re judge (not creator) and not yet dismissed — e.g. after refresh. */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const dismissed = loadDismissedJudgeGoalNoticeIds();
      dismissedRef.current = dismissed;
      try {
        const goals = await fetchGoalsAsJudge(userId);
        if (cancelled) return;
        const cutoff = Date.now() - CATCH_UP_MS;
        for (const g of goals) {
          if (g.creatorId === userId) continue;
          if (g.createdAt.getTime() < cutoff) continue;
          if (dismissed.has(g.id)) continue;
          addNotice({ id: g.id, goalTitle: g.title, creatorName: g.creatorName });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, addNotice]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`judge_goal_created_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'goals',
          filter: `judge_user_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id?: string;
            user_id?: string;
            judge_user_id?: string;
            title?: string;
          };
          if (!row?.id || row.user_id === userId) return;

          let creatorName = 'Someone';
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', row.user_id!)
            .maybeSingle();
          if (profile?.display_name) creatorName = profile.display_name;

          addNotice({
            id: row.id,
            goalTitle: row.title ?? 'Goal',
            creatorName,
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, addNotice]);

  if (notices.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-20 right-4 z-[101] flex w-[min(100vw-2rem,22rem)] max-h-[min(40vh,calc(100vh-8rem))] flex-col gap-2 overflow-y-auto overscroll-contain pb-1"
      aria-live="polite"
    >
      {notices.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-background p-3 shadow-lg"
        >
          {/* Same filled success mark as Sonner toast (20×20) */}
          <svg
            viewBox="0 0 20 20"
            className="h-5 w-5 shrink-0 text-white"
            aria-hidden
          >
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
          <p className="min-w-0 flex-1 text-left text-sm leading-snug text-foreground">
            <span className="font-semibold">{n.creatorName}</span> finished creating their goal:{' '}
            <span className="font-display font-semibold">&ldquo;{n.goalTitle}&rdquo;</span>
          </p>
          <button
            type="button"
            onClick={() => removeNotice(n.id)}
            className={cn(
              'shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground',
            )}
            aria-label="Dismiss notification"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      ))}
    </div>
  );
}
