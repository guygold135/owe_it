import { useCallback, useEffect, useState } from 'react';
import { Goal, Judge } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  stake: number;
  deadline: string;
  created_at: string;
  status: 'active' | 'completed' | 'failed';
  judge_name: string | null;
  judge_user_id?: string | null;
  is_private: boolean;
};

function mapRowToGoal(row: GoalRow): Goal {
  const judge: Judge = {
    id: row.judge_name ?? 'self',
    name: row.judge_name ?? 'You',
    avatar: '',
    isSelf: !row.judge_name,
  };

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    stake: row.stake,
    deadline: new Date(row.deadline),
    createdAt: new Date(row.created_at),
    status: row.status,
    judge,
    isPrivate: row.is_private,
  };
}

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();

  const loadGoals = useCallback(async () => {
    // Wait until we know auth state
    if (authLoading) return;

    if (!user) {
      setGoals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('goals')
      .select('id,title,description,stake,deadline,created_at,status,judge_name,is_private,user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading goals', error);
      toast.error('Could not load your goals.');
      setLoading(false);
      return;
    }

    setGoals((data as GoalRow[]).map(mapRowToGoal));
    setLoading(false);
  }, [authLoading, user]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  // Keep goals in sync when a judge resolves them
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`goals_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${user.id}` },
        () => {
          void loadGoals();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadGoals, user?.id]);

  const addGoal = async (goal: Goal) => {
    if (!user) {
      throw new Error('No user is signed in.');
    }

    const { error } = await supabase.from('goals').insert({
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

    if (error) {
      console.error('Error creating goal', error);
      toast.error('Could not create goal.');
      throw error;
    }

    // Social Pulse event (friends feed) — skip private goals
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
    await loadGoals();
  };

  const updateGoal = async (id: string, updates: Partial<Goal>) => {
    if (!user) {
      throw new Error('No user is signed in.');
    }

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

    const { data: beforeRows } = await supabase
      .from('goals')
      .select('status,title,stake,is_private')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    const beforeStatus = (beforeRows as any)?.status as GoalRow['status'] | undefined;
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

    // Social Pulse event when status changes (skip private goals)
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

    await loadGoals();
  };

  return { goals, loading, addGoal, updateGoal, loadGoals };
}
