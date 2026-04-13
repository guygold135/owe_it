import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGoals } from '@/hooks/useGoals';
import { useDeadlineReminderTriggers } from '@/hooks/useDeadlineReminderTriggers';
import { useDeadlineLocalToasts } from '@/hooks/useDeadlineLocalToasts';
import { useAutoExpireGoals } from '@/hooks/useAutoExpireGoals';
import { useDashboardVisibleContracts } from '@/hooks/useDashboardVisibleContracts';
import { useResolvedGoalSpotlight } from '@/hooks/useResolvedGoalSpotlight';
import { StakeCard } from '@/components/StakeCard';
import { ResolvedGoalSpotlight } from '@/components/ResolvedGoalSpotlight';
import { DollarSign, Trophy } from 'lucide-react';
import UserProfilePopover from '@/components/UserProfilePopover';
import { DashboardStatsSkeleton, GoalsListSkeleton } from '@/components/PageSkeletons';
import { convertStakeAmount, formatStakeAmount } from '@/lib/currency';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { unmarkTutorialCreatedGoal } from '@/lib/appTutorial';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Dashboard() {
  const { goals, loading, loadGoals, deleteGoal } = useGoals();
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
  const [tutorialDeleteGoalId, setTutorialDeleteGoalId] = useState<string | null>(null);
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
                <div className="w-10 h-10 mx-auto rounded-2xl bg-orange-500/10 flex items-center justify-center mb-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="icon icon-tabler icons-tabler-outline icon-tabler-flame w-5 h-5 text-orange-400"
                  >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235" />
                  </svg>
                </div>
                <p className="text-2xl font-display font-extrabold text-orange-400 tabular-nums">{activeGoals.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Active</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center mb-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-2xl font-display font-extrabold text-amber-400 tabular-nums">{completed}</p>
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
                <StakeCard
                  key={goal.id}
                  goal={goal}
                  tutorialCreated={Boolean(goal.createdDuringAppTutorial)}
                  onDeleteTutorialGoal={(goalId) => setTutorialDeleteGoalId(goalId)}
                />
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
      <AlertDialog open={tutorialDeleteGoalId !== null} onOpenChange={(o) => !o && setTutorialDeleteGoalId(null)}>
        <AlertDialogContent className="max-w-md rounded-2xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete tutorial goal?</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-muted-foreground">
              This goal is deletable only because it was created during the tutorial. Future goals are real commitment
              contracts and cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-display font-semibold mt-0">Keep goal</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-display font-bold"
              onClick={async () => {
                if (!tutorialDeleteGoalId) return;
                try {
                  await deleteGoal(tutorialDeleteGoalId);
                  unmarkTutorialCreatedGoal(tutorialDeleteGoalId);
                } finally {
                  setTutorialDeleteGoalId(null);
                }
              }}
            >
              Yes, delete tutorial goal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
