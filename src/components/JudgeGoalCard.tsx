import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCountdown } from '@/hooks/useCountdown';
import { Lock, User, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { JudgeGoal } from '@/hooks/useGoalsAsJudge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HoldToConfirmButton } from '@/components/ui/hold-to-confirm-button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { resolveGoalDirect } from '@/lib/resolveGoalDirect';
import { SuccessMorphIcon } from '@/components/ui/animated-state-icons';
import { formatStakeAmount } from '@/lib/currency';

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

/** Match `PublishButton` / Create goal sign step — success visible before refetch removes the card. */
const RESOLVE_SUCCESS_HOLD_MS = 1400;

type JudgeGoalCardProps = {
  goal: JudgeGoal;
  onResolved?: () => void;
};

export function JudgeGoalCard({ goal, onResolved }: JudgeGoalCardProps) {
  const { user } = useAuth();
  const { days, hours, minutes, seconds, isUrgent, isExpired, urgency } = useCountdown(goal.deadline);
  const [confirmOutcome, setConfirmOutcome] = useState<'completed' | 'failed' | null>(null);
  /** Shown inside the alert dialog after confirm (same window as title/buttons). */
  const [resolveDialogPhase, setResolveDialogPhase] = useState<'idle' | 'loading' | 'success'>('idle');
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isBusy = confirmOutcome !== null;

  const borderClass =
    goal.status === 'active'
      ? isUrgent
        ? 'animate-pulse-border-warning'
        : 'animate-pulse-border'
      : 'border-border';

  const accentColor = isUrgent ? 'text-warning' : 'text-primary';
  const dotColor =
    goal.status === 'completed'
      ? 'bg-primary'
      : goal.status === 'failed'
        ? 'bg-warning'
        : isUrgent
          ? 'bg-warning'
          : 'bg-primary';

  const timePart = `${days > 0 ? `${days}D ` : ''}${hours}H ${minutes}M ${seconds}S`;
  const statusLabel =
    goal.status === 'active' && !isExpired
      ? urgency === 'within6h'
        ? `Urgent · ${timePart}`
        : urgency === 'within24h'
          ? `Due soon · ${timePart}`
          : timePart
      : goal.status === 'completed'
        ? 'Completed'
        : goal.status === 'failed'
          ? 'Uncompleted'
          : 'Expired';

  const statusLabelClass =
    goal.status === 'completed'
      ? 'text-emerald-500'
      : goal.status === 'failed'
        ? 'text-warning'
        : goal.status === 'active' && !isExpired && urgency === 'within6h'
          ? 'text-warning'
          : goal.status === 'active' && !isExpired && urgency === 'within24h'
            ? 'text-amber-500'
            : 'text-muted-foreground';

  const handleResolve = async (outcome: 'completed' | 'failed') => {
    if (goal.status !== 'active' || !user?.id || isExpired) return;
    setResolveDialogPhase('loading');
    try {
      const result = await resolveGoalDirect({ goalId: goal.id, outcome });
      if (!result.success) {
        toast.error(result.error ?? 'Could not resolve goal.');
        setResolveDialogPhase('idle');
        return;
      }

      setResolveDialogPhase('success');
      await new Promise((r) => setTimeout(r, RESOLVE_SUCCESS_HOLD_MS));
      await onResolved?.();
      if (mountedRef.current) {
        setConfirmOutcome(null);
        setResolveDialogPhase('idle');
      }
    } catch (err) {
      console.error('Resolve error', err);
      toast.error('Something went wrong.');
      setResolveDialogPhase('idle');
    }
  };

  const confirmTitle =
    confirmOutcome === 'completed'
      ? 'Mark this goal as completed?'
      : confirmOutcome === 'failed'
        ? 'Mark this goal as not completed?'
        : '';

  const confirmDescription =
    confirmOutcome === 'completed'
      ? goal.stake > 0
        ? `You’re confirming "${goal.creatorName}" completed "${goal.title}". Their stake hold will be released. This can’t be undone.`
        : `You’re confirming "${goal.creatorName}" completed "${goal.title}". This can’t be undone.`
      : confirmOutcome === 'failed'
        ? goal.stake > 0
          ? `You’re saying "${goal.creatorName}" did not complete "${goal.title}". Their stake (${formatStakeAmount(goal.stake, goal.stakeCurrency)}) will be charged. This can’t be undone.`
          : `You’re saying "${goal.creatorName}" did not complete "${goal.title}". This can’t be undone.`
        : '';

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
      className={`p-5 rounded-[24px] bg-card border ${borderClass} relative overflow-hidden`}
    >
      {/* Top row: status / timer or Completed/Uncompleted */}
      <div className="flex justify-between items-start">
        <span
          className={`text-xs tracking-widest uppercase tabular-nums font-medium ${statusLabelClass}`}
        >
          {statusLabel}
        </span>
        <div className="flex items-center gap-2">
          {goal.isPrivate && <Lock className="w-3 h-3 text-muted-foreground" />}
          <div
            className={`h-2 w-2 rounded-full ${dotColor} ${goal.status === 'active' ? 'animate-pulse' : ''}`}
          />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-xl font-display font-bold mt-2 tracking-tight text-foreground text-balance">
        {goal.title}
      </h3>

      {/* Stake amount */}
      {goal.stake > 0 && (
        <div
          className={`mt-2 text-3xl font-display font-extrabold tabular-nums ${accentColor}`}
        >
          {formatStakeAmount(goal.stake, goal.stakeCurrency)}
        </div>
      )}

      {/* Creator + judge actions */}
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Goal by</span>
          <Avatar className="h-8 w-8">
            <AvatarImage src={goal.creatorAvatar || ''} alt={goal.creatorName} className="object-cover" />
            <AvatarFallback className="text-xs font-display font-bold text-muted-foreground">
              {goal.creatorName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-foreground">{goal.creatorName}</span>
        </div>

        {goal.status === 'active' && !isExpired && (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              className="h-10 flex-1 rounded-xl border-emerald-500/50 font-display font-bold text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600"
              disabled={isBusy}
              onClick={() => setConfirmOutcome('completed')}
            >
              <>
                <Trophy className="w-4 h-4 mr-1" />
                Completed
              </>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 flex-1 rounded-xl border-amber-500/50 font-display font-bold text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
              disabled={isBusy}
              onClick={() => setConfirmOutcome('failed')}
            >
              <>
                <X className="w-4 h-4 mr-1" />
                Uncompleted
              </>
            </Button>
          </div>
        )}
      </div>

      {goal.status === 'active' && goal.stake > 0 && (
        <div
          className={`absolute inset-0 pointer-events-none rounded-[24px] ${isUrgent ? 'shadow-[inset_0_1px_2px_rgba(255,140,50,0.1)]' : 'shadow-[inset_0_1px_2px_rgba(100,255,150,0.08)]'}`}
        />
      )}
    </motion.div>

    <AlertDialog
      open={confirmOutcome !== null}
      onOpenChange={(open) => {
        if (!open) {
          if (resolveDialogPhase === 'loading' || resolveDialogPhase === 'success') return;
          setConfirmOutcome(null);
          setResolveDialogPhase('idle');
        }
      }}
    >
      <AlertDialogContent className="z-[200] max-w-md rounded-2xl border-border sm:rounded-2xl">
        {resolveDialogPhase === 'idle' ? (
          <>
            <AlertDialogHeader className="text-center sm:text-center">
              <AlertDialogTitle className="font-display">{confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription className="text-center text-muted-foreground">
                {confirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {goal.stake > 0 && (
              <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground/80">
                Hold to accept
              </p>
            )}
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel className="mt-0 rounded-xl font-display font-semibold">Cancel</AlertDialogCancel>
              {goal.stake > 0 ? (
                <HoldToConfirmButton
                  className={
                    confirmOutcome === 'failed'
                      ? 'rounded-xl font-display font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : 'rounded-xl font-display font-bold'
                  }
                  idleLabel={confirmOutcome === 'completed' ? 'Yes, completed' : 'Yes, not completed'}
                  holdingLabel="Sure?"
                  onConfirm={() => {
                    const o = confirmOutcome;
                    if (o) return handleResolve(o);
                  }}
                />
              ) : (
                <Button
                  className={
                    confirmOutcome === 'failed'
                      ? 'rounded-xl font-display font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : 'rounded-xl font-display font-bold'
                  }
                  onClick={() => {
                    const o = confirmOutcome;
                    if (o) return handleResolve(o);
                  }}
                >
                  {confirmOutcome === 'completed' ? 'Yes, completed' : 'Yes, not completed'}
                </Button>
              )}
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader className="sr-only">
              <AlertDialogTitle>
                {resolveDialogPhase === 'loading' ? 'Resolving goal' : 'Goal updated'}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div
              className="flex flex-col items-center justify-center gap-4 py-6 sm:py-8"
              aria-live="polite"
            >
              <SuccessMorphIcon
                phase={resolveDialogPhase === 'loading' ? 'loading' : 'success'}
                size={56}
                className="text-primary"
              />
              <p className="text-center text-sm text-muted-foreground">
                {resolveDialogPhase === 'loading' ? 'Resolving goal…' : 'You’re all set!'}
              </p>
            </div>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
