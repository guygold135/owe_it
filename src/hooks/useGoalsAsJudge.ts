import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { JudgeGoal } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryKeys';
import { fetchGoalsAsJudge } from '@/lib/fetchers/tabData';

export type { JudgeGoal } from '@/lib/types';

export function useGoalsAsJudge() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const query = useQuery({
    queryKey: queryKeys.goalsAsJudge(userId ?? ''),
    queryFn: async () => {
      try {
        return await fetchGoalsAsJudge(userId!);
      } catch (e) {
        console.error('Error loading goals as judge', e);
        toast.error('Could not load goals you judge.');
        return [] as JudgeGoal[];
      }
    },
    enabled: !!userId && !authLoading,
    retry: false,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`goals_as_judge_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals', filter: `judge_user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.goalsAsJudge(userId) });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const loadGoals = useCallback(async () => {
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.goalsAsJudge(userId) });
  }, [queryClient, userId]);

  const goals: JudgeGoal[] = query.data ?? [];

  return { goals, loading: query.isPending, loadGoals };
}
