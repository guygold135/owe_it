import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Goal } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryKeys';
import { fetchUserGoals } from '@/lib/fetchers/tabData';

export function useGoals() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const userId = user?.id;

  const query = useQuery({
    queryKey: queryKeys.goals(userId ?? ''),
    queryFn: async () => {
      try {
        return await fetchUserGoals(userId!);
      } catch (e) {
        console.error('Error loading goals', e);
        toast.error('Could not load your goals.');
        return [] as Goal[];
      }
    },
    enabled: !!userId && !authLoading,
    retry: false,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`goals_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.goals(userId) });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const loadGoals = useCallback(async () => {
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.goals(userId) });
  }, [queryClient, userId]);

  const goals = query.data ?? [];

  const addGoal = async (goal: Goal) => {
    if (!user) {
      throw new Error('No user is signed in.');
    }

    const insertWithCurrency = await supabase.from('goals').insert({
      user_id: user.id,
      title: goal.title,
      description: goal.description,
      stake: goal.stake,
      stake_currency: goal.stakeCurrency,
      charity_id: goal.charityId ?? null,
      deadline: goal.deadline.toISOString(),
      status: goal.status,
      judge_name: goal.judge?.isSelf ? null : goal.judge?.name,
      judge_user_id: goal.judge?.isSelf ? user.id : goal.judge?.id,
      is_private: goal.isPrivate,
    });

    let error = insertWithCurrency.error;
    if (error) {
      const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();
      if (message.includes('charity_id')) {
        const retry = await supabase.from('goals').insert({
          user_id: user.id,
          title: goal.title,
          description: goal.description,
          stake: goal.stake,
          stake_currency: goal.stakeCurrency,
          deadline: goal.deadline.toISOString(),
          status: goal.status,
          judge_name: goal.judge?.isSelf ? null : goal.judge?.name,
          judge_user_id: goal.judge?.isSelf ? user.id : goal.judge?.id,
          is_private: goal.isPrivate,
        });
        error = retry.error;
      } else if (message.includes('stake_currency')) {
        const retry = await supabase.from('goals').insert({
          user_id: user.id,
          title: goal.title,
          description: goal.description,
          stake: goal.stake,
          deadline: goal.deadline.toISOString(),
          status: goal.status,
          judge_name: goal.judge?.isSelf ? null : goal.judge?.name,
          judge_user_id: goal.judge?.isSelf ? user.id : goal.judge?.id,
          is_private: goal.isPrivate,
        });
        error = retry.error;
      }
    }

    if (error) {
      console.error('Error creating goal', error);
      toast.error('Could not create goal.');
      throw error;
    }

    if (!goal.isPrivate) {
      try {
        const action = goal.stake > 0 ? 'staked' : 'created';
        await supabase.from('pulse_events').insert({
          user_id: user.id,
          action,
          goal_title: goal.title,
          stake: goal.stake,
        } as any);
      } catch (e) {
        console.error('Error inserting pulse event', e);
      }
    }

    toast.success('Goal created.');
    await queryClient.invalidateQueries({ queryKey: queryKeys.goals(user.id) });
  };

  const updateGoal = async (id: string, updates: Partial<Goal>) => {
    if (!user) {
      throw new Error('No user is signed in.');
    }

    const { data: beforeRows } = await supabase
      .from('goals')
      .select('status,title,stake,is_private')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    const beforeStatus = (beforeRows as any)?.status as 'active' | 'completed' | 'failed' | undefined;

    const payload: any = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.stake !== undefined) payload.stake = updates.stake;
    if (updates.deadline !== undefined) payload.deadline = updates.deadline.toISOString();
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.judge !== undefined) {
      payload.judge_name = updates.judge.isSelf ? null : updates.judge.name;
    }
    if (updates.isPrivate !== undefined) payload.is_private = updates.isPrivate;

    if (
      updates.status &&
      (updates.status === 'completed' || updates.status === 'failed') &&
      beforeStatus === 'active'
    ) {
      payload.resolved_at = new Date().toISOString();
      payload.resolved_by = user.id;
    }
    const beforeTitle = (beforeRows as any)?.title as string | undefined;
    const beforeStake = Number((beforeRows as any)?.stake ?? 0);
    const beforeIsPrivate = Boolean((beforeRows as any)?.is_private ?? false);

    const { error } = await supabase
      .from('goals')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating goal', error);
      throw error;
    }

    const isPrivateNow = updates.isPrivate ?? beforeIsPrivate;
    if (!isPrivateNow && updates.status && updates.status !== beforeStatus) {
      const action = updates.status === 'completed' ? 'completed' : updates.status === 'failed' ? 'failed' : null;
      if (action) {
        try {
          await supabase.from('pulse_events').insert({
            user_id: user.id,
            action,
            goal_title: updates.title ?? beforeTitle ?? 'Goal',
            stake: updates.stake ?? beforeStake ?? 0,
          } as any);
        } catch (e) {
          console.error('Error inserting pulse event', e);
        }
      }
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.goals(user.id) });
  };

  return {
    goals,
    loading: query.isPending,
    addGoal,
    updateGoal,
    loadGoals,
  };
}
