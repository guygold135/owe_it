import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGoals } from '@/hooks/useGoals';
import { useDeadlineReminderTriggers } from '@/hooks/useDeadlineReminderTriggers';
import { useDeadlineLocalToasts } from '@/hooks/useDeadlineLocalToasts';
import { useAutoExpireGoals } from '@/hooks/useAutoExpireGoals';
import { useDashboardVisibleContracts } from '@/hooks/useDashboardVisibleContracts';
import { useResolvedGoalSpotlight } from '@/hooks/useResolvedGoalSpotlight';
import { StakeCard } from '@/components/StakeCard';
import { ResolvedGoalSpotlight } from '@/components/ResolvedGoalSpotlight';
import { DollarSign, Target, Trophy } from 'lucide-react';
import UserProfilePopover from '@/components/UserProfilePopover';
import { DashboardStatsSkeleton, GoalsListSkeleton } from '@/components/PageSkeletons';
import { convertStakeAmount, formatStakeAmount } from '@/lib/currency';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';

export default function Dashboard() {
  const { goals, loading, loadGoals } = useGoals();
  const { currency: selectedCurrency } = useStakeCurrencyPreference();
  useAutoExpireGoals(goals, loadGoals, { enabled: true, loading });
  const activeGoals = goals.filter(g => g.status === 'active');
  useDeadlineReminderTriggers(activeGoals);
  const deadlineLocalToastGoals = useMemo(
    () =>
      goals
        .filter((g) => g.status === 'active')
        .map((g) => ({ id: g.id, deadline: g.deadline, title: g.title, stake: g.stake, stakeCurrency: g.stakeCurrency })),
    [goals],
  );
  useDeadlineLocalToasts(deadlineLocalToastGoals);
  const totalAtRisk = activeGoals.reduce(
    (sum, g) => sum + convertStakeAmount(g.stake, g.stakeCurrency, selectedCurrency),
    0,
  );
  const watchingJudges = activeGoals.filter(g => !g.judge.isSelf).length;
  const completed = goals.filter(g => g.status === 'completed').length;
  const spotlightGoals = useResolvedGoalSpotlight(goals);
  const contractGoals = useDashboardVisibleContracts(goals);
  const sortedContractGoals = useMemo(
    () =>
      [...contractGoals].sort((a, b) => {
        const aActive = a.status === 'active' ? 1 : 0;
        const bActive = b.status === 'active' ? 1 : 0;
        if (bActive !== aActive) return bActive - aActive;
        return (b.deadline?.getTime() ?? 0) - (a.deadline?.getTime() ?? 0);
      }),
    [contractGoals],
  );

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-display font-extrabold text-foreground mt-2 tracking-tight"
          >
            Put your money where<br />your ambition is.
          </motion.h1>
        </div>
        <UserProfilePopover />
      </div>

      {loading ? (
        <>
          <DashboardStatsSkeleton />
          <div className="px-6">
            <div className="h-8 w-36 bg-muted/60 animate-pulse rounded mb-4" />
            <GoalsListSkeleton />
          </div>
        </>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-6 p-6 rounded-[24px] bg-card border border-border mb-8"
          >
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-display font-extrabold text-primary tabular-nums">
                  {formatStakeAmount(totalAtRisk, selectedCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">At Risk</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-2">
                  <Target className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-display font-extrabold text-foreground tabular-nums">{activeGoals.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Active</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-2">
                  <Trophy className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-display font-extrabold text-foreground tabular-nums">{completed}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Completed</p>
              </div>
            </div>
            {totalAtRisk > 0 && (
              <p className="text-center text-xs text-muted-foreground mt-4">
                {watchingJudges > 0
                  ? watchingJudges === 1
                    ? '1 judge is watching.'
                    : `${watchingJudges} judges are watching.`
                  : ''}
              </p>
            )}
          </motion.div>

          <div className="px-6">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Active Contracts</h2>
            <ResolvedGoalSpotlight goals={spotlightGoals} />
            <div className="space-y-4">
              {sortedContractGoals.map((goal) => (
                <StakeCard key={goal.id} goal={goal} />
              ))}
              {sortedContractGoals.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-muted-foreground">No active contracts.</p>
                  <p className="text-sm text-muted-foreground mt-1">Tap + to create your first goal.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
