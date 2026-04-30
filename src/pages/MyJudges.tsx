import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import UserProfilePopover from '@/components/UserProfilePopover';
import { useGoalsAsJudge } from '@/hooks/useGoalsAsJudge';
import { useAuth } from '@/hooks/useAuth';
import { useDeadlineReminderTriggers } from '@/hooks/useDeadlineReminderTriggers';
import { useDeadlineLocalToasts } from '@/hooks/useDeadlineLocalToasts';
import { useAutoExpireGoals } from '@/hooks/useAutoExpireGoals';
import { JudgeGoalCard } from '@/components/JudgeGoalCard';
import { GoalsListSkeleton } from '@/components/PageSkeletons';
import { queryKeys } from '@/lib/queryKeys';

export default function MyJudges() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { goals, loading, loadGoals } = useGoalsAsJudge();
  useAutoExpireGoals(goals, loadGoals, { enabled: true, loading });

  const activeGoals = useMemo(
    () =>
      [...goals]
        .filter((g) => g.status === 'active')
        .sort((a, b) => (b.deadline?.getTime() ?? 0) - (a.deadline?.getTime() ?? 0)),
    [goals],
  );

  useDeadlineReminderTriggers(activeGoals);

  const deadlineLocalToastGoals = useMemo(
    () => activeGoals.map((g) => ({ id: g.id, deadline: g.deadline, title: g.title, stake: g.stake, stakeCurrency: g.stakeCurrency })),
    [activeGoals],
  );
  useDeadlineLocalToasts(deadlineLocalToastGoals);

  const handleGoalResolved = useCallback(async () => {
    await loadGoals();
    if (!user?.id) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.goals(user.id) });
  }, [loadGoals, queryClient, user?.id]);

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-12">
        <div className="min-w-0 flex-1">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-2 pr-4 text-base sm:text-xl font-display font-extrabold leading-snug tracking-tight text-balance text-foreground"
          >
            <span className="block whitespace-nowrap">Honest judgment builds real change.</span>
            <span className="block whitespace-nowrap">Be the judge they can trust.</span>
          </motion.h1>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6">
        <div className="space-y-4">
          {loading ? (
            <GoalsListSkeleton />
          ) : activeGoals.length === 0 ? (
            <div className="rounded-[20px] border border-border bg-card p-6 text-center">
              <p className="text-base font-display font-semibold text-foreground">No goals to judge</p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                When a friend picks you as their judge, their active goal will appear here so you can mark it
                completed or not.
              </p>
            </div>
          ) : (
            activeGoals.map((goal) => <JudgeGoalCard key={goal.id} goal={goal} onResolved={handleGoalResolved} />)
          )}
        </div>
      </div>
    </div>
  );
}
