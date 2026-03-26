import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, AlertTriangle, User, Users, Lock, Eye, Calendar, Heart } from 'lucide-react';
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

type CharityOption = {
  id: string;
  name: string;
  short_description: string | null;
};

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

function CardStepFields({
  stake,
  stakeCurrency,
  recipientName,
}: {
  stake: number;
  stakeCurrency: string;
  recipientName: string | null;
}) {
  return (
    <div className="space-y-6 flex-1">
      <p className="text-sm text-muted-foreground">
        {recipientName ? (
          <>
            If you don’t complete your goal by the deadline, your card will be charged{' '}
            {formatStakeAmount(stake, stakeCurrency)} and the funds will be sent to{' '}
            <span className="font-medium text-foreground">{recipientName}</span>.
          </>
        ) : (
          <>
            Your card will be charged {formatStakeAmount(stake, stakeCurrency)} if you don’t complete your goal by the
            deadline.
          </>
        )}
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
  const deadlineInputRef = useRef<HTMLInputElement | null>(null);
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
  /** If you fail: platform, a friend with Connect, or a charity with Connect. */
  const [stakeRecipientMode, setStakeRecipientMode] = useState<'platform' | 'friend' | 'charity'>('platform');
  const [stakeRecipientFriendId, setStakeRecipientFriendId] = useState<string | null>(null);
  const [stakeCharityId, setStakeCharityId] = useState<string | null>(null);
  const [charities, setCharities] = useState<CharityOption[]>([]);
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
    if (stake === 0) {
      setStakeRecipientMode('platform');
      setStakeRecipientFriendId(null);
      setStakeCharityId(null);
    }
  }, [stake]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data, error } = await supabase
        .from('charities')
        .select('id, name, short_description')
        .eq('active', true)
        .eq('stake_payouts_ready', true)
        .order('name');
      if (error) {
        console.warn('Could not load charities (table may not exist yet):', error.message);
        setCharities([]);
        return;
      }
      setCharities((data ?? []) as CharityOption[]);
    })();
  }, [open]);

  const friendsEligibleForPayout = useMemo(
    () => friends.filter((f) => f.stakePayoutsReady),
    [friends],
  );

  /** Shown on card step / confirm — friend name or charity name, or null for platform. */
  const stakeDestinationDisplayName = useMemo(() => {
    if (stakeRecipientMode === 'charity' && stakeCharityId) {
      return charities.find((c) => c.id === stakeCharityId)?.name ?? null;
    }
    if (stakeRecipientMode === 'friend' && stakeRecipientFriendId) {
      return friends.find((f) => f.id === stakeRecipientFriendId)?.name ?? null;
    }
    return null;
  }, [stakeRecipientMode, stakeCharityId, stakeRecipientFriendId, charities, friends]);

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
        .select('id, display_name, avatar_url, stake_payouts_ready')
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
        stakePayoutsReady: !!p.stake_payouts_ready,
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
    setStakeRecipientMode('platform');
    setStakeRecipientFriendId(null);
    setStakeCharityId(null);
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
      if (stake > 0 && stakeRecipientMode === 'friend' && !stakeRecipientFriendId) return false;
      if (stake > 0 && stakeRecipientMode === 'charity' && !stakeCharityId) return false;
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
              stakeRecipientUserId:
                stake > 0 && stakeRecipientMode === 'friend' ? stakeRecipientFriendId : null,
              stakeCharityId: stake > 0 && stakeRecipientMode === 'charity' ? stakeCharityId : null,
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
        stakeRecipientUserId:
          stake > 0 && stakeRecipientMode === 'friend' ? stakeRecipientFriendId : undefined,
        stakeCharityId:
          stake > 0 && stakeRecipientMode === 'charity' ? stakeCharityId : undefined,
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
            className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[90vh] flex-col overflow-hidden border-t border-border bg-[#0f0f0f] rounded-t-[32px] h-[min(640px,90vh)]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
              {/* Header */}
              <div className="mb-3 flex shrink-0 items-center justify-between sm:mb-4">
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
              <div className="mb-3 flex shrink-0 gap-2 sm:mb-4">
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

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                      className="block w-full bg-muted rounded-2xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary font-display text-lg"
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
                      className="block w-full bg-muted rounded-2xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Deadline</label>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const el = deadlineInputRef.current;
                        if (!el) return;
                        // iOS Safari: opening can fail if the input is fully transparent.
                        // Prefer showPicker when available, else focus.
                        (el as any).showPicker?.();
                        el.focus();
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        const el = deadlineInputRef.current;
                        if (!el) return;
                        (el as any).showPicker?.();
                        el.focus();
                      }}
                      className={`relative w-full max-w-full bg-muted rounded-2xl [color-scheme:dark] ${
                        deadlineIssue ? 'ring-2 ring-inset ring-destructive' : 'focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary/40'
                      }`}
                    >
                      {/* Visible UI (works consistently on iOS Safari). */}
                      <div
                        className={`pointer-events-none flex items-center justify-between gap-3 w-full min-w-0 rounded-2xl pl-5 pr-4 py-4 font-display text-lg ${
                          deadline ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        <span className="truncate">
                          {deadline ? new Date(deadline).toLocaleString() : 'Select a deadline'}
                        </span>
                        <Calendar
                          className="w-5 h-5 shrink-0 text-primary"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </div>

                      {/* Native input kept for actual picking + validation/min. */}
                      <input
                        ref={deadlineInputRef}
                        type="datetime-local"
                        value={deadline}
                        min={minDeadlineInput}
                        onChange={e => setDeadline(e.target.value)}
                        aria-invalid={deadlineIssue ? true : undefined}
                        className="absolute inset-0 z-10 w-full max-w-full cursor-pointer bg-transparent text-transparent caret-transparent opacity-[0.01] appearance-none [color-scheme:dark]"
                      />
                    </div>
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

              {/* Step 1: Stake — amount first, then destination (only applies when stake &gt; 0) */}
              {step === 1 && (
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                    <div className="shrink-0 text-center">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Your stake</p>
                      <motion.div
                        key={stake}
                        initial={{ scale: 1 }}
                        animate={{ scale: [1, 1.03, 1] }}
                        transition={{ duration: 0.2 }}
                        className="text-4xl font-display font-extrabold text-primary tabular-nums tracking-tighter sm:text-5xl"
                      >
                        {formatStakeAmount(stake, stakeCurrency)}
                      </motion.div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {stake > 0 ? 'Charged only if you fail.' : 'Free goal — no charge.'}
                      </p>
                    </div>
                    <div className="grid shrink-0 grid-cols-4 gap-1.5">
                      {presetStakes.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => {
                            setStake(amount);
                            setCustomStakeInput('');
                          }}
                          className={`rounded-xl py-2 font-display text-[11px] font-bold transition-all sm:text-xs ${
                            customStakeInput === '' && stake === amount
                              ? 'bg-primary text-primary-foreground glow-primary'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {amount === 0 ? 'Free' : formatStakePresetAmount(amount, stakeCurrency)}
                        </button>
                      ))}
                    </div>
                    <div className="shrink-0 space-y-1">
                      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">Custom</label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-display text-muted-foreground">{stakeCurrency.toUpperCase()}</span>
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
                              rounded === Math.floor(rounded) ? rounded.toString() : rounded.toFixed(2),
                            );
                          }}
                          className={`min-w-0 flex-1 rounded-xl border bg-muted px-3 py-2 font-display text-sm font-semibold tabular-nums text-foreground [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary ${
                            customStakeError ? 'border-destructive ring-destructive' : 'border-transparent'
                          }`}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Min. {formatStakeAmount(STRIPE_MIN_DOLLARS, stakeCurrency)} for paid stakes
                      </p>
                    </div>

                    <div
                      className={`shrink-0 space-y-2 rounded-2xl border border-border bg-card/40 p-3 ${
                        stake === 0 ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          If you fail, send the stake to
                        </p>
                        {stake === 0 && (
                          <p className="text-[10px] text-muted-foreground/90">Select a paid stake above first.</p>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          disabled={stake === 0}
                          onClick={() => {
                            setStakeRecipientMode('platform');
                            setStakeRecipientFriendId(null);
                            setStakeCharityId(null);
                          }}
                          className={`rounded-lg py-2 px-0.5 font-display text-[11px] font-semibold leading-tight transition-colors sm:text-xs disabled:cursor-not-allowed disabled:opacity-80 ${
                            stake > 0 && stakeRecipientMode === 'platform'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          Platform
                        </button>
                        <button
                          type="button"
                          disabled={stake === 0}
                          onClick={() => {
                            setStakeRecipientMode('charity');
                            setStakeRecipientFriendId(null);
                          }}
                          className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-2 px-0.5 font-display text-[11px] font-semibold leading-tight transition-colors sm:text-xs disabled:cursor-not-allowed disabled:opacity-80 ${
                            stake > 0 && stakeRecipientMode === 'charity'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          <Heart className="h-3 w-3 shrink-0" aria-hidden />
                          Charity
                        </button>
                        <button
                          type="button"
                          disabled={stake === 0}
                          onClick={() => {
                            setStakeRecipientMode('friend');
                            setStakeCharityId(null);
                          }}
                          className={`rounded-lg py-2 px-0.5 font-display text-[11px] font-semibold leading-tight transition-colors sm:text-xs disabled:cursor-not-allowed disabled:opacity-80 ${
                            stake > 0 && stakeRecipientMode === 'friend'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          Friend
                        </button>
                      </div>

                      {stake > 0 && stakeRecipientMode === 'charity' && (
                        <div className="max-h-[22vh] space-y-1 overflow-y-auto pt-0.5">
                          {charities.length === 0 ? (
                            <p className="text-[10px] leading-snug text-muted-foreground">
                              No charities yet — add in DB or pick Platform / Friend.{' '}
                              <Link to="/settings" className="text-primary underline underline-offset-2">
                                Settings
                              </Link>
                            </p>
                          ) : (
                            <>
                              <p className="text-[10px] text-muted-foreground">Pick one</p>
                              <div className="space-y-1">
                                {charities.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setStakeCharityId(c.id)}
                                    className={`flex w-full flex-col gap-0 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                                      stakeCharityId === c.id
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border hover:border-muted-foreground/30'
                                    }`}
                                  >
                                    <span className="font-display text-xs font-semibold text-foreground">{c.name}</span>
                                    {c.short_description ? (
                                      <span className="line-clamp-1 text-[10px] text-muted-foreground">
                                        {c.short_description}
                                      </span>
                                    ) : null}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {stake > 0 && stakeRecipientMode === 'friend' && (
                        <div className="max-h-[22vh] space-y-1 overflow-y-auto pt-0.5">
                          {friendsEligibleForPayout.length === 0 ? (
                            <p className="text-[10px] leading-snug text-muted-foreground">
                              No friends with bank yet.{' '}
                              <Link to="/settings" className="text-primary underline underline-offset-2">
                                Settings
                              </Link>
                            </p>
                          ) : (
                            <>
                              <p className="text-[10px] text-muted-foreground">Pick one</p>
                              <div className="space-y-1">
                                {friendsEligibleForPayout.map((friend) => (
                                  <button
                                    key={friend.id}
                                    type="button"
                                    onClick={() => setStakeRecipientFriendId(friend.id)}
                                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                                      stakeRecipientFriendId === friend.id
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border hover:border-muted-foreground/30'
                                    }`}
                                  >
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                      {friend.name.charAt(0)}
                                    </div>
                                    <span className="font-display text-xs font-semibold text-foreground">
                                      {friend.name}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
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
                    <CardStepFields
                      stake={stake}
                      stakeCurrency={stakeCurrency}
                      recipientName={stakeDestinationDisplayName}
                    />
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
                    {stake > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-xs uppercase tracking-widest text-muted-foreground shrink-0">
                          If you fail
                        </span>
                        <span className="text-sm text-foreground text-right">
                          {stakeRecipientMode === 'platform'
                            ? 'Stake → Platform'
                            : stakeDestinationDisplayName
                              ? stakeRecipientMode === 'charity'
                                ? `Stake → ${stakeDestinationDisplayName} (charity)`
                                : `Stake → ${stakeDestinationDisplayName}`
                              : '—'}
                        </span>
                      </div>
                    )}
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
              </div>

              {/* Navigation: hide on card & confirm (those steps use Back + primary in a row) */}
              {step < 4 && step !== 3 && !(step === 2 && Boolean(judgeRequestId)) && (
                <div className="mt-4 flex shrink-0 gap-3 sm:mt-6">
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
