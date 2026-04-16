import { useMemo } from 'react';
import { motion } from 'framer-motion';
import UserProfilePopover from '@/components/UserProfilePopover';
import { useGoalsAsJudge } from '@/hooks/useGoalsAsJudge';
import { useDeadlineReminderTriggers } from '@/hooks/useDeadlineReminderTriggers';
import { useDeadlineLocalToasts } from '@/hooks/useDeadlineLocalToasts';
import { useAutoExpireGoals } from '@/hooks/useAutoExpireGoals';
import { JudgeGoalCard } from '@/components/JudgeGoalCard';
import { GoalsListSkeleton } from '@/components/PageSkeletons';

export default function MyJudges() {
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

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-12">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-2 pr-2 text-xl font-display font-extrabold leading-snug tracking-tight text-balance text-foreground"
          >
            Be the judge they can trust.
            <br />
            Honest judgment builds real change.
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
            activeGoals.map((goal) => <JudgeGoalCard key={goal.id} goal={goal} onResolved={loadGoals} />)
          )}
        </div>
      </div>
    </div>
  );
}
