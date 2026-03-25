import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, AlertTriangle, User, Users, Lock, Eye } from 'lucide-react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useGoals } from '@/hooks/useGoals';
import { useAuth } from '@/hooks/useAuth';
import { Goal, Judge, Friend } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { stripePromise } from '@/lib/stripe';
import { toast } from 'sonner';
import { formatStakeAmount, USD_TO_CURRENCY_RATE } from '@/lib/currency';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { useShortDeadlineTesting } from '@/hooks/useShortDeadlineTesting';
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
import { PublishButton, type PublishPhase } from '@/components/ui/publish-button';
import { SuccessMorphIcon } from '@/components/ui/animated-state-icons';

const steps = ['goal', 'stake', 'judge', 'card', 'confirm'] as const;

const USD_BASE_PRESET_STAKES = [0, 10, 25, 50, 75, 100, 150, 200] as const;
const STRIPE_MIN_DOLLARS = 1; // App minimum stake for paid goals
/** Minimum time between "now" and deadline (must be strictly after this window). */
const MIN_DEADLINE_LEAD_MS = 24 * 60 * 60 * 1000;

function toDatetimeLocalString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDeadlineValidationError(
  deadlineDate: Date | null,
  hasValue: boolean,
  allowShortDeadlines: boolean,
  now = Date.now(),
): string | null {
  if (!hasValue) return null;
  if (!deadlineDate || Number.isNaN(deadlineDate.getTime())) return 'Please set a valid deadline.';
  if (deadlineDate.getTime() <= now) return 'Choose a deadline in the future.';
  if (!allowShortDeadlines && deadlineDate.getTime() <= now + MIN_DEADLINE_LEAD_MS) {
    return 'Deadline must be more than 1 day from now.';
  }
  return null;
}

type CloseConfirmKind = 'judge-wait' | 'card' | 'sign';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#e2e8f0',
      '::placeholder': { color: '#94a3b8' },
    },
    invalid: {
      color: '#f87171',
    },
  },
};

function formatStakePresetAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getPowerOfTenPresetMultiplier(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  // Choose nearest by linear distance to 1x / 10x / 100x / 1000x ...
  // Example: rate 3.7 is closer to 1 than 10 => keep base presets.
  const candidates = [1, 10, 100, 1000, 10000];
  let best = 1;
  let bestDiff = Math.abs(rate - 1);
  for (const c of candidates) {
    const diff = Math.abs(rate - c);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best;
}

function buildPresetStakesForCurrency(currency: string): number[] {
  const rate = USD_TO_CURRENCY_RATE[currency as keyof typeof USD_TO_CURRENCY_RATE] ?? 1;
  const multiplier = getPowerOfTenPresetMultiplier(rate);
  return USD_BASE_PRESET_STAKES.map((usdAmount) => usdAmount * multiplier);
}

function CardStepFields({ stake, stakeCurrency }: { stake: number; stakeCurrency: string }) {
  return (
    <div className="space-y-6 flex-1">
      <p className="text-sm text-muted-foreground">
        Your card will be charged {formatStakeAmount(stake, stakeCurrency)} if you don’t complete your goal by the
        deadline.
      </p>

      <div className="p-4 bg-muted rounded-2xl">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>
    </div>
  );
}

function CardStepContinueButton({ onPaymentMethodReady }: { onPaymentMethodReady: (pmId: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();

  const handleContinue = async () => {
    if (!stripe || !elements) {
      toast.error('Payment system is still loading. Please wait a moment and try again.');
      return;
    }
    const cardEl = elements.getElement(CardElement);
    if (!cardEl) {
      toast.error('Please enter your card details.');
      return;
    }

    try {
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardEl,
      });

      if (error) {
        toast.error(error.message ?? 'Could not add card.');
        return;
      }
      if (!paymentMethod?.id) {
        toast.error('Something went wrong saving your card. Please try again.');
        return;
      }
      onPaymentMethodReady(paymentMethod.id);
    } catch (err: any) {
      console.error('Stripe error', err);
      toast.error(err?.message ?? 'Something went wrong saving your card.');
    }
  };

  return (
    <button
      type="button"
      onClick={handleContinue}
      className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Continue <ChevronRight className="w-4 h-4" />
    </button>
  );
}

export function CreateGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addGoal, loadGoals, goals } = useGoals();
  const { user } = useAuth();
  const { currency: stakeCurrency } = useStakeCurrencyPreference();
  const { enabled: allowShortDeadlines } = useShortDeadlineTesting();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stake, setStake] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [judge, setJudge] = useState<Judge | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [customStakeError, setCustomStakeError] = useState(false);
  const [customStakeInput, setCustomStakeInput] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [judgeRequestId, setJudgeRequestId] = useState<string | null>(null);
  const [waitingJudgeName, setWaitingJudgeName] = useState<string | null>(null);
  const [confirmCloseKind, setConfirmCloseKind] = useState<CloseConfirmKind | null>(null);
  /** Full-sheet overlay on sign step: spinner until API done, then success morph. */
  const [signOverlayPhase, setSignOverlayPhase] = useState<'idle' | 'loading' | 'success'>('idle');
  const judgeRequestIdRef = useRef<string | null>(null);
  const stakeRef = useRef(stake);
  /** judge-wait dialog: full sheet close (X/backdrop) vs return to judge picker (Back button) */
  const judgeWaitDismissRef = useRef<'sheet' | 'back-to-picker'>('sheet');

  useEffect(() => {
    judgeRequestIdRef.current = judgeRequestId;
  }, [judgeRequestId]);

  useEffect(() => {
    stakeRef.current = stake;
  }, [stake]);

  useEffect(() => {
    if (step !== 4) setSignOverlayPhase('idle');
  }, [step]);

  const deadlineDate = useMemo(() => {
    if (!deadline) return null;
    const d = new Date(deadline);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [deadline]);

  const deadlineIssue = useMemo(
    () => getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines),
    [deadline, deadlineDate, allowShortDeadlines],
  );

  /** Earliest `datetime-local` value (now + 1 day + 1min, rounded) so the native picker matches validation. */
  const minDeadlineInput = useMemo(() => {
    const minLeadMs = allowShortDeadlines ? 60 * 1000 : MIN_DEADLINE_LEAD_MS + 60 * 1000;
    const d = new Date(Date.now() + minLeadMs);
    d.setSeconds(0, 0);
    return toDatetimeLocalString(d);
  }, [open, deadline, allowShortDeadlines]);

  /** Same title as another active goal (same account), case-insensitive, trimmed */
  const duplicateActiveTitle = useMemo(() => {
    const t = title.trim().toLowerCase();
    if (!t) return false;
    return goals.some((g) => g.status === 'active' && g.title.trim().toLowerCase() === t);
  }, [title, goals]);

  const presetStakes = useMemo(
    () => buildPresetStakesForCurrency(stakeCurrency),
    [stakeCurrency],
  );

  useEffect(() => {
    const loadFriends = async () => {
      if (!user?.id) return;
      const { data: edges, error: edgesError } = await supabase
        .from('friendships')
        .select('friend_user_id')
        .eq('user_id', user.id);

      if (edgesError) {
        console.error('Error loading friendships', edgesError);
        setFriends([]);
        return;
      }

      const friendIds = (edges ?? []).map((e: any) => e.friend_user_id).filter(Boolean);
      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', friendIds);

      if (profilesError) {
        console.error('Error loading friend profiles', profilesError);
        setFriends([]);
        return;
      }

      const mapped = (profiles ?? []).map((p: any) => ({
        id: p.id,
        name: p.display_name ?? 'Friend',
        avatar: p.avatar_url ?? '',
        activeGoals: 0,
        completedGoals: 0,
        totalStaked: 0,
      }));
      mapped.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
      setFriends(mapped);
    };

    loadFriends();
  }, [user?.id]);

  useEffect(() => {
    if (!judgeRequestId) return;

    /**
     * Poll: never clear state on !data — that races realtime and tears down the channel before
     * UPDATE/DELETE events arrive (accept used to be UPDATE+DELETE in one tx; poll saw the row gone first).
     * Unfiltered postgres_changes + client filter: filtered UUID subscriptions are unreliable in Supabase.
     */
    const poll = window.setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('judge_requests')
          .select('status')
          .eq('id', judgeRequestId)
          .maybeSingle();
        if (error) return;
        if (!data) return;
        const status = (data as { status?: string })?.status;
        if (status === 'accepted') {
          setJudgeRequestId(null);
          setWaitingJudgeName(null);
          setStep(stakeRef.current > 0 ? 3 : 4);
          return;
        }
        if (status === 'ignored') {
          setJudgeRequestId(null);
          setWaitingJudgeName(null);
          toast.error('Judge request was ignored.');
          return;
        }
        if (status === 'cancelled') {
          setJudgeRequestId(null);
          setWaitingJudgeName(null);
        }
      } catch {
        // ignore
      }
    }, 1500);

    const channel = supabase
      .channel(`judge_request_${judgeRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'judge_requests',
        },
        (payload) => {
          const row = payload.new as { id?: string; status?: string };
          if (row.id !== judgeRequestIdRef.current) return;
          const status = row.status;
          if (status === 'accepted') {
            setJudgeRequestId(null);
            setWaitingJudgeName(null);
            setStep(stakeRef.current > 0 ? 3 : 4);
            return;
          }
          if (status === 'ignored') {
            setJudgeRequestId(null);
            setWaitingJudgeName(null);
            toast.error('Judge request was ignored.');
            return;
          }
          if (status === 'cancelled') {
            setJudgeRequestId(null);
            setWaitingJudgeName(null);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'judge_requests',
        },
        (payload) => {
          const oldRow = payload.old as { id?: string; status?: string } | undefined;
          if (oldRow?.id !== judgeRequestIdRef.current) return;
          if (oldRow.status === 'accepted') {
            setJudgeRequestId(null);
            setWaitingJudgeName(null);
            setStep(stakeRef.current > 0 ? 3 : 4);
            return;
          }
          if (oldRow.status === 'pending') {
            setJudgeRequestId(null);
            setWaitingJudgeName(null);
            // e.g. cancel_pending_judge_requests_before_cutoff DELETE — silent
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' && err) {
          console.warn('Judge request realtime channel error', err);
        }
      });

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [judgeRequestId]);

  const reset = () => {
    setStep(0); setTitle(''); setDescription(''); setStake(0);
    setDeadline(''); setJudge(null); setIsPrivate(false);
    setPaymentMethodId(null); setCustomStakeInput(''); setCustomStakeError(false);
    setJudgeRequestId(null); setWaitingJudgeName(null);
    setConfirmCloseKind(null);
    setSignOverlayPhase('idle');
  };

  /** Closing the sheet = abandoning goal creation → cancel pending judge request for the judge */
  useEffect(() => {
    if (open) return;
    const pendingId = judgeRequestIdRef.current;
    if (pendingId) {
      void supabase.rpc('cancel_judge_request', { p_request_id: pendingId }).then(({ error }) => {
        if (error) console.error('Cancel judge request on close', error);
      });
    }
    reset();
  }, [open]);

  const handleClose = () => {
    onClose();
  };

  /** Close / backdrop: confirm first on judge wait, card step, or sign step */
  const requestClose = () => {
    if (confirmCloseKind !== null) return;
    if (judgeRequestId) {
      judgeWaitDismissRef.current = 'sheet';
      setConfirmCloseKind('judge-wait');
      return;
    }
    if (step === 3) {
      setConfirmCloseKind('card');
      return;
    }
    if (step === 4) {
      setConfirmCloseKind('sign');
      return;
    }
    onClose();
  };

  const confirmCloseDialog = () => {
    if (confirmCloseKind === 'judge-wait' && judgeWaitDismissRef.current === 'back-to-picker') {
      flushSync(() => setConfirmCloseKind(null));
      const id = judgeRequestIdRef.current;
      if (id) {
        void supabase.rpc('cancel_judge_request', { p_request_id: id }).then(({ error }) => {
          if (error) console.error('Cancel judge request error', error);
        });
      }
      setJudgeRequestId(null);
      setWaitingJudgeName(null);
      return;
    }
    flushSync(() => setConfirmCloseKind(null));
    onClose();
  };

  const canNext = () => {
    if (step === 0) {
      return title.length > 0 && deadline.length > 0 && !duplicateActiveTitle && !deadlineIssue;
    }
    if (step === 1) {
      if (customStakeInput.trim() !== '' && customStakeError) return false;
      return true;
    }
    if (step === 2) return judge !== null; // Judge step
    if (step === 3) return true; // Card step: "Continue" handles validation
    return true;
  };

  const goNext = () => {
    if (step === 0) {
      const err = getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines);
      if (err) {
        toast.error(err);
        return;
      }
      const t = title.trim().toLowerCase();
      if (goals.some((g) => g.status === 'active' && g.title.trim().toLowerCase() === t)) {
        toast.error('You already have an active goal with this name. Use a different title.');
        return;
      }
    }
    if (step === 1) {
      const raw = customStakeInput.trim();
      if (raw !== '') {
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 0 || (num > 0 && num < STRIPE_MIN_DOLLARS)) {
          setCustomStakeError(true);
          return;
        }
        setCustomStakeError(false);
      }
      // After stake, always choose judge next
      setStep(2);
      return;
    }
    // After judge: go to card only if stake > 0, otherwise skip to confirm
    if (step === 2) {
      if (judge && !judge.isSelf) {
        // Send judge request and wait for acceptance
        (async () => {
          if (!user?.id) return;
          const deadlineErr = getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines);
          if (deadlineErr) {
            toast.error(deadlineErr);
            return;
          }
          try {
            setWaitingJudgeName(judge.name);
            const payload = {
              title,
              description,
              stake,
              stakeCurrency,
              deadline: deadlineDate.toISOString(),
              isPrivate,
            };
            const { data, error } = await supabase.rpc('create_judge_request', {
              p_judge_user_id: judge.id,
              p_goal_payload: payload as any,
            });
            if (error) {
              console.error('Error creating judge request', error);
              toast.error(error.message ?? 'Could not send judge request.');
              setWaitingJudgeName(null);
              return;
            }
            setJudgeRequestId(data as any);
          } catch (e: any) {
            console.error('Unexpected judge request error', e);
            toast.error(e?.message ?? 'Could not send judge request.');
            setWaitingJudgeName(null);
          }
        })();
        return;
      }

      setStep(stake > 0 ? 3 : 4);
      return;
    }
    setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step === 4) {
      setStep(stake > 0 ? 3 : 2);
      return;
    }
    // From card go back to judge
    if (step === 3) {
      setStep(2);
      return;
    }
    setStep((s) => s - 1);
  };

  const performSign = async () => {
    const signDeadlineErr = getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines);
    if (signDeadlineErr) {
      toast.error(signDeadlineErr);
      throw new Error(signDeadlineErr);
    }

    const amountInCents = Math.round(stake * 100);

    if (stake === 0) {
      const newGoal: Goal = {
        id: Date.now().toString(),
        title,
        description,
        stake: 0,
        stakeCurrency,
        deadline: new Date(deadline),
        createdAt: new Date(),
        resolvedAt: null,
        status: 'active',
        judge: judge!,
        isPrivate,
      };
      await addGoal(newGoal);
      return;
    }

    if (!paymentMethodId || !user?.id) {
      toast.error('Payment method or user missing.');
      throw new Error('Payment method or user missing.');
    }

    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: {
        paymentMethodId,
        userId: user.id,
        goalTitle: title,
        description,
        deadline: new Date(deadline).toISOString(),
        judgeName: judge?.isSelf ? null : judge?.name,
        judgeUserId: judge?.isSelf ? user.id : judge?.id,
        isPrivate,
        amount: amountInCents,
        currency: stakeCurrency,
      },
    });

    if (error) {
      console.error('Error charging card', error);
      toast.error(data?.error ?? 'Could not save payment method. Goal was not created.');
      throw new Error('checkout');
    }

    const payload = data as { success?: boolean; error?: string; goalId?: string };
    if (!payload?.success) {
      toast.error(payload?.error ?? 'Could not prepare payment for later charge. Goal was not created.');
      throw new Error('payment failed');
    }

    // Best effort: make sure currency is persisted on the created goal, even if
    // edge function deployment lags behind frontend changes.
    if (payload.goalId) {
      const { error: currencyError } = await supabase
        .from('goals')
        .update({ stake_currency: stakeCurrency })
        .eq('id', payload.goalId)
        .eq('user_id', user.id);
      if (currencyError) {
        const message = String((currencyError as { message?: unknown })?.message ?? '').toLowerCase();
        if (!message.includes('stake_currency')) {
          console.error('Error saving goal currency', currencyError);
        }
      }
    }

    try {
      if (!isPrivate) {
        await supabase.from('pulse_events').insert({
          user_id: user.id,
          action: stake > 0 ? 'staked' : 'created',
          goal_title: title,
          stake,
        } as any);
      }
    } catch (e) {
      console.error('Error inserting pulse event', e);
    }
    await loadGoals();
    toast.success('Goal created. Card will be charged only if the goal is uncompleted.');
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={requestClose}
          />
          <AlertDialog
            open={confirmCloseKind !== null}
            onOpenChange={(next) => {
              if (!next) setConfirmCloseKind(null);
            }}
          >
            <AlertDialogContent className="max-w-md mx-4 rounded-2xl border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">
                  {confirmCloseKind === 'judge-wait' && 'Cancel this judge request?'}
                  {confirmCloseKind === 'card' && 'Leave card details?'}
                  {confirmCloseKind === 'sign' && 'Leave before signing?'}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-left text-muted-foreground">
                  {confirmCloseKind === 'judge-wait' && (
                    <>
                      {waitingJudgeName
                        ? `${waitingJudgeName} hasn’t responded yet. `
                        : 'Your friend hasn’t responded yet. '}
                      If you leave now, the request will be cancelled and they won’t see it anymore.
                    </>
                  )}
                  {confirmCloseKind === 'card' && (
                    <>
                      Your card will be charged only if you complete the goal by the deadline—but you haven’t finished this step yet.
                      If you leave now, you’ll need to add your payment method again to create this goal.
                    </>
                  )}
                  {confirmCloseKind === 'sign' && (
                    <>
                      You haven’t signed the contract yet. If you leave now, this goal won’t be created and you’ll lose this
                      progress.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-0">
                <AlertDialogCancel className="rounded-xl font-display font-semibold mt-0">
                  {confirmCloseKind === 'judge-wait' && 'Keep waiting'}
                  {confirmCloseKind === 'card' && 'Keep card step'}
                  {confirmCloseKind === 'sign' && 'Keep signing'}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmCloseDialog}
                  className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-display font-bold"
                >
                  {confirmCloseKind === 'judge-wait' && 'Yes, cancel request'}
                  {confirmCloseKind === 'card' && 'Yes, leave'}
                  {confirmCloseKind === 'sign' && 'Yes, leave'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f] border-t border-border rounded-t-[32px] h-[640px] max-h-[90vh] overflow-y-visible overflow-x-hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="p-6 h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display font-bold text-foreground">
                  {step === 0 && 'Define Your Goal'}
                  {step === 1 && 'Set Your Stake'}
                  {step === 2 && 'Choose Your Judge'}
                  {step === 3 && 'Card details'}
                  {step === 4 && 'Sign the Contract'}
                </h2>
                <button
                  type="button"
                  onClick={requestClose}
                  className="p-2 rounded-xl hover:bg-muted transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Step indicators */}
              <div className="flex gap-2 mb-6">
                {steps.map((_, i) => {
                  const isCompleted = i <= step;
                  return (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        isCompleted ? 'bg-emerald-400' : 'bg-emerald-400/20'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Step 0: Goal */}
              {step === 0 && (
                <div className="flex flex-col gap-5 flex-1">
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Goal Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g., Finish Portfolio"
                      className="block w-full bg-muted rounded-2xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-display text-lg"
                    />
                    {duplicateActiveTitle && (
                      <p className="text-xs text-destructive mt-2">
                        You already have an active goal with this name. Choose a different title to continue.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Description (optional)</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="What exactly needs to get done?"
                      rows={3}
                      className="block w-full bg-muted rounded-2xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Deadline</label>
                    <input
                      type="datetime-local"
                      value={deadline}
                      min={minDeadlineInput}
                      onChange={e => setDeadline(e.target.value)}
                      aria-invalid={deadlineIssue ? true : undefined}
                      className={`block w-full min-w-0 bg-muted rounded-2xl pl-5 pr-12 py-4 text-foreground font-display text-lg focus:outline-none focus:ring-2 [color-scheme:dark] ${
                        deadlineIssue ? 'ring-2 ring-destructive focus:ring-destructive' : 'focus:ring-primary'
                      }`}
                    />
                    {deadlineIssue && (
                      <p className="text-xs text-destructive mt-2">{deadlineIssue}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted rounded-2xl">
                    <div className="flex items-center gap-3">
                      {isPrivate ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm text-foreground">{isPrivate ? 'Private goal' : 'Visible to friends'}</span>
                    </div>
                    <button
                      onClick={() => setIsPrivate(!isPrivate)}
                      className={`w-12 h-7 rounded-full transition-colors relative ${isPrivate ? 'bg-primary' : 'bg-border'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-foreground absolute top-1 transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 1: Stake */}
              {step === 1 && (
                <div className="space-y-5 flex-1">
                  <div className="text-center py-4">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Your Stake</p>
                    <motion.div
                      key={stake}
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 0.2 }}
                      className="text-6xl font-display font-extrabold text-primary tabular-nums tracking-tighter"
                    >
                      {formatStakeAmount(stake, stakeCurrency)}
                    </motion.div>
                    <p className="text-sm text-muted-foreground mt-4">
                      Put money on the line!
                      <br />
                      If you fail, this amount will be charged.
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {presetStakes.map(amount => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => {
                          setStake(amount);
                          setCustomStakeInput('');
                        }}
                        className={`py-3 rounded-2xl font-display font-bold text-sm transition-all ${
                          customStakeInput === '' && stake === amount
                            ? 'bg-primary text-primary-foreground glow-primary'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {amount === 0 ? 'Free' : formatStakePresetAmount(amount, stakeCurrency)}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-widest text-muted-foreground block">
                      Or custom amount
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-display">{stakeCurrency.toUpperCase()}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={customStakeInput || (presetStakes.includes(stake) ? '' : stake.toString())}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomStakeInput(v);
                          if (v === '') {
                            setCustomStakeError(false);
                            setStake(0);
                            return;
                          }
                          // Allow only digits and at most one dot
                          const numericPattern = /^\d*\.?\d*$/;
                          if (!numericPattern.test(v)) {
                            setCustomStakeError(true);
                            return;
                          }
                          setCustomStakeError(false);
                          const num = Number(v);
                          if (num >= 0) {
                            if (num === 0 || num >= STRIPE_MIN_DOLLARS) {
                              setStake(Math.round(num * 100) / 100);
                            }
                          }
                        }}
                        onBlur={() => {
                          const raw = customStakeInput.trim();
                          if (raw === '') return;
                          if (customStakeError) return;
                          const num = parseFloat(raw);
                          if (Number.isNaN(num) || num < 0) {
                            setCustomStakeInput('');
                            setStake(0);
                            return;
                          }
                          if (num > 0 && num < STRIPE_MIN_DOLLARS) {
                            toast.error(
                              `Minimum charge is ${formatStakeAmount(STRIPE_MIN_DOLLARS, stakeCurrency)} (Stripe requirement).`,
                            );
                            setCustomStakeInput('');
                            setStake(0);
                            return;
                          }
                          const rounded = Math.round(num * 100) / 100;
                          setStake(rounded);
                          setCustomStakeInput(
                            rounded === Math.floor(rounded) ? rounded.toString() : rounded.toFixed(2)
                          );
                        }}
                        className={`flex-1 bg-muted rounded-2xl px-4 py-3 text-foreground font-display font-semibold tabular-nums placeholder:text-muted-foreground focus:outline-none focus:ring-2 [color-scheme:dark] border ${
                          customStakeError ? 'border-destructive ring-destructive' : 'border-transparent focus:ring-primary'
                        }`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Minimum {formatStakeAmount(STRIPE_MIN_DOLLARS, stakeCurrency)} for a stake.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Judge */}
              {step === 2 && (
                <div className="flex min-h-0 flex-1 flex-col">
                  {judgeRequestId && (
                    <>
                      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                          <Users className="h-5 w-5 text-emerald-400" />
                        </div>
                        <p className="font-display font-semibold text-sm text-foreground">
                          waiting for {waitingJudgeName ?? 'your friend'} to accept
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          They’ll see your goal details and can accept or ignore.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirmCloseKind !== null) return;
                          judgeWaitDismissRef.current = 'back-to-picker';
                          setConfirmCloseKind('judge-wait');
                        }}
                        className="mt-auto w-full shrink-0 py-3 rounded-2xl bg-muted font-display font-semibold text-muted-foreground"
                      >
                        Back
                      </button>
                    </>
                  )}

                  {!judgeRequestId && (
                    <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto">
                      {/* Self judge option */}
                      <button
                        onClick={() => setJudge({ id: 'self', name: 'You', avatar: '', isSelf: true })}
                        className={`w-full p-5 rounded-[20px] border text-left transition-all ${
                          judge?.isSelf ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                            <User className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-display font-semibold text-foreground">Judge Yourself</h4>
                            <div className="flex items-center gap-1 mt-1">
                              <AlertTriangle className="w-3 h-3 text-warning" />
                              <span className="text-xs text-warning">
                                Lower success rate — don't open the door to fool yourself
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      <p className="text-xs uppercase tracking-widest text-muted-foreground pt-2">Your Friends</p>

                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        {friends.map(friend => (
                          <button
                            key={friend.id}
                            onClick={() => setJudge({ id: friend.id, name: friend.name, avatar: '', isSelf: false })}
                            className={`w-full p-5 rounded-[20px] border text-left transition-all ${
                              judge?.id === friend.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center font-display font-bold text-muted-foreground">
                                {friend.name.charAt(0)}
                              </div>
                              <div>
                                <h4 className="font-display font-semibold text-foreground">{friend.name}</h4>
                                <span className="text-xs text-muted-foreground">{friend.completedGoals} judgments made</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Card details (only when stake > 0) */}
              {step === 3 && stripePromise && (
                <Elements stripe={stripePromise}>
                  <div className="flex flex-col flex-1 min-h-0">
                    <CardStepFields stake={stake} stakeCurrency={stakeCurrency} />
                    <div className="flex gap-3 mt-8">
                      <button
                        type="button"
                        onClick={goBack}
                        className="flex-1 py-4 rounded-2xl bg-muted text-muted-foreground font-display font-semibold"
                      >
                        Back
                      </button>
                      <CardStepContinueButton
                        onPaymentMethodReady={(id) => {
                          setPaymentMethodId(id);
                          setStep(4);
                        }}
                      />
                    </div>
                  </div>
                </Elements>
              )}

              {/* Step 4: Confirm */}
              {step === 4 && (
                <div className="relative flex min-h-0 flex-1 flex-col">
                  {signOverlayPhase !== 'idle' && (
                    <div
                      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-2xl bg-background/90 px-6 backdrop-blur-md"
                      aria-live="polite"
                    >
                      <SuccessMorphIcon
                        phase={signOverlayPhase === 'loading' ? 'loading' : 'success'}
                        size={56}
                        className="text-primary"
                      />
                      <p className="text-center text-sm text-muted-foreground">
                        {signOverlayPhase === 'loading' ? 'Creating your goal…' : 'You’re all set!'}
                      </p>
                    </div>
                  )}
                  <div className="shrink-0 rounded-[24px] bg-muted p-6 space-y-4">
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Goal</span>
                      <span className="text-sm text-foreground font-medium">{title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Deadline</span>
                      <span className="text-sm text-foreground tabular-nums">{new Date(deadline).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Stake</span>
                      <span
                        className={
                          stake === 0
                            ? 'text-sm text-foreground font-medium'
                            : 'text-sm text-primary font-display font-bold tabular-nums'
                        }
                      >
                        {formatStakeAmount(stake, stakeCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Judge</span>
                      <span className="text-sm text-foreground">{judge?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Visibility</span>
                      <span className="text-sm text-foreground">{isPrivate ? 'Private' : 'Public'}</span>
                    </div>
                  </div>

                  <div className="mt-auto flex shrink-0 gap-3 pt-6">
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex-1 rounded-2xl bg-muted py-4 font-display font-semibold text-muted-foreground"
                    >
                      Back
                    </button>
                    <PublishButton
                      progressStyle="fill"
                      holdDuration={2000}
                      progressTickMs={30}
                      labels={{
                        idle: 'Create goal',
                        holding: 'Sure?',
                      }}
                      onBeforeHold={() => {
                        const err = getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines);
                        if (err) {
                          toast.error(err);
                          return false;
                        }
                        return true;
                      }}
                      onPublish={performSign}
                      onSuccess={handleClose}
                      onPhaseChange={(p: PublishPhase) => {
                        if (p === 'publishing') setSignOverlayPhase('loading');
                        else if (p === 'success') setSignOverlayPhase('success');
                        else setSignOverlayPhase('idle');
                      }}
                      className="min-w-0 flex-1"
                    />
                  </div>
                </div>
              )}

              {/* Navigation: hide on card & confirm (those steps use Back + primary in a row) */}
              {step < 4 && step !== 3 && !(step === 2 && Boolean(judgeRequestId)) && (
                <div className="flex gap-3 mt-8">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex-1 py-4 rounded-2xl bg-muted text-muted-foreground font-display font-semibold"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => canNext() && goNext()}
                    disabled={!canNext()}
                    className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
