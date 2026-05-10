import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Goal } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryKeys';
import { fetchUserGoals } from '@/lib/fetchers/tabData';
import { isTutorialCreatedGoal, unmarkTutorialCreatedGoal } from '@/lib/appTutorial';

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

  /** One-time migration: device-local tutorial IDs → DB so all sessions show the tutorial badge/delete affordance. */
  useEffect(() => {
    if (!userId || authLoading || query.isPending) return;
    const list = query.data ?? [];
    const pending = list.filter((g) => !g.createdDuringAppTutorial && isTutorialCreatedGoal(g.id));
    if (pending.length === 0) return;
    void (async () => {
      for (const g of pending) {
        const { error } = await supabase
          .from('goals')
          .update({ created_during_app_tutorial: true })
          .eq('id', g.id)
          .eq('user_id', userId);
        if (!error) unmarkTutorialCreatedGoal(g.id);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.goals(userId) });
    })();
  }, [userId, authLoading, query.isPending, query.data, queryClient]);

  const loadGoals = useCallback(async () => {
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.goals(userId) });
  }, [queryClient, userId]);

  const goals = query.data ?? [];

  const addGoal = async (goal: Goal): Promise<string | null> => {
    if (!user) {
      throw new Error('No user is signed in.');
    }

    const buildPayload = (opts?: { includeCurrency?: boolean; includeCharity?: boolean; includeTutorialFlag?: boolean }) => ({
      user_id: user.id,
      title: goal.title,
      description: goal.description,
      stake: goal.stake,
      ...(opts?.includeCurrency === false ? {} : { stake_currency: goal.stakeCurrency }),
      ...(opts?.includeCharity === false ? {} : { charity_id: goal.charityId ?? null }),
      deadline: goal.deadline.toISOString(),
      status: goal.status,
      judge_name: goal.judge?.isSelf ? null : goal.judge?.name,
      judge_user_id: goal.judge?.isSelf ? user.id : goal.judge?.id,
      is_private: goal.isPrivate,
      ...(opts?.includeTutorialFlag === false ? {} : goal.createdDuringAppTutorial ? { created_during_app_tutorial: true } : {}),
    });

    const insertWithCurrency = await supabase
      .from('goals')
      .insert(buildPayload({ includeCurrency: true, includeCharity: true }))
      .select('id')
      .maybeSingle();

    let error = insertWithCurrency.error;
    let createdGoalId = (insertWithCurrency.data as { id?: string } | null)?.id ?? null;
    if (error) {
      const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();
      if (message.includes('charity_id')) {
        const retry = await supabase
          .from('goals')
          .insert(buildPayload({ includeCurrency: true, includeCharity: false }))
          .select('id')
          .maybeSingle();
        error = retry.error;
        createdGoalId = (retry.data as { id?: string } | null)?.id ?? createdGoalId;
      } else if (message.includes('stake_currency')) {
        const retry = await supabase
          .from('goals')
          .insert(buildPayload({ includeCurrency: false, includeCharity: true }))
          .select('id')
          .maybeSingle();
        error = retry.error;
        createdGoalId = (retry.data as { id?: string } | null)?.id ?? createdGoalId;
      } else if (message.includes('created_during_app_tutorial')) {
        const retry = await supabase
          .from('goals')
          .insert(buildPayload({ includeCurrency: true, includeCharity: true, includeTutorialFlag: false }))
          .select('id')
          .maybeSingle();
        error = retry.error;
        createdGoalId = (retry.data as { id?: string } | null)?.id ?? createdGoalId;
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
        });
      } catch (e) {
        console.error('Error inserting pulse event', e);
      }
    }

    toast.success('Goal created.');
    await queryClient.invalidateQueries({ queryKey: queryKeys.goals(user.id) });
    return createdGoalId;
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

    type GoalSnapshotRow = {
      status: string;
      title: string;
      stake: number;
      is_private: boolean;
    };
    const before = beforeRows as GoalSnapshotRow | null;
    const beforeStatus = before?.status as 'active' | 'completed' | 'failed' | undefined;

    const payload: Record<string, unknown> = {};
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
    const beforeTitle = before?.title;
    const beforeStake = Number(before?.stake ?? 0);
    const beforeIsPrivate = Boolean(before?.is_private ?? false);

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
          });
        } catch (e) {
          console.error('Error inserting pulse event', e);
        }
      }
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.goals(user.id) });
  };

  const deleteGoal = async (id: string) => {
    if (!user) throw new Error('No user is signed in.');
    const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', user.id);
    if (error) {
      console.error('Error deleting goal', error);
      throw error;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.goals(user.id) });
  };

  return {
    goals,
    loading: query.isPending,
    addGoal,
    deleteGoal,
    updateGoal,
    loadGoals,
  };
}
